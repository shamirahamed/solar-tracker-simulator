from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import pandas as pd
import pvlib


AXIS_TILT = 0.0
AXIS_AZIMUTH = 0.0  # north-south tracker axis
CROSS_AXIS_TILT = 0.0
ALBEDO = 0.2


def _safe_series_value(series, ts, default=0.0):
    try:
        value = series.loc[ts]
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def _safe_tracking_value(df, ts, column: str, default=0.0):
    try:
        value = df.loc[ts, column]
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def _derive_dni(ghi: float, dhi: float, apparent_zenith: float) -> float:
    """
    Derive DNI from GHI and DHI using the beam-on-horizontal decomposition:
        DNI = (GHI - DHI) / cos(zenith)

    Clamps to [0, 1400] W/m² and returns 0 when zenith >= 89°.
    """
    if apparent_zenith >= 89.0:
        return 0.0
    cos_zen = math.cos(math.radians(apparent_zenith))
    if cos_zen < 0.017:   # ~89°
        return 0.0
    return max(0.0, min(1400.0, (ghi - dhi) / cos_zen))


def get_tracker_day_profile(
    latitude: float,
    longitude: float,
    timezone: str,
    date: str,
    panel_width: float,
    row_spacing: float,
    max_angle: float,
    weather_override: Optional[Dict[str, Dict[str, float]]] = None,
    soiling_loss: float = 0.0,
) -> List[Dict[str, Any]]:
    """
    Compute 1-minute tracker day profile.

    Parameters
    ----------
    weather_override
        Hourly weather from Open-Meteo as returned by fetch_hourly_weather().
        If provided, real GHI/BHI/DHI/temp replaces the clear-sky model.
        Interpolation to 1-minute resolution is done here.
    soiling_loss
        Fractional irradiance loss due to dust/soiling (0 = none, 0.05 = 5 %).
    """
    gcr = panel_width / row_spacing if row_spacing > 0 else 0.3
    location = pvlib.location.Location(latitude, longitude, tz=timezone)

    start = pd.Timestamp(f"{date} 00:00:00", tz=timezone)
    end = start + pd.Timedelta(days=1) - pd.Timedelta(minutes=1)
    times = pd.date_range(start=start, end=end, freq="1min")

    solar_position = location.get_solarposition(times)
    clearsky = location.get_clearsky(times, model="ineichen", solar_position=solar_position)

    dni_extra = pvlib.irradiance.get_extra_radiation(times)
    relative_airmass = pvlib.atmosphere.get_relative_airmass(
        solar_position["apparent_zenith"]
    )

    tracking_ideal = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=AXIS_TILT,
        axis_azimuth=AXIS_AZIMUTH,
        max_angle=90,
        backtrack=False,
        gcr=gcr,
        cross_axis_tilt=CROSS_AXIS_TILT,
    )

    tracking_limited = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=AXIS_TILT,
        axis_azimuth=AXIS_AZIMUTH,
        max_angle=max_angle,
        backtrack=False,
        gcr=gcr,
        cross_axis_tilt=CROSS_AXIS_TILT,
    )

    tracking_backtracking = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=AXIS_TILT,
        axis_azimuth=AXIS_AZIMUTH,
        max_angle=max_angle,
        backtrack=True,
        gcr=gcr,
        cross_axis_tilt=CROSS_AXIS_TILT,
    )

    # pvlib-validated projected solar zenith angle — sign gives shadow direction:
    #   positive → shadow falls East  (morning, sun in East)
    #   negative → shadow falls West  (afternoon, sun in West)
    _proj_zenith_series = pvlib.shading.projected_solar_zenith_angle(
        solar_zenith=solar_position["apparent_zenith"],
        solar_azimuth=solar_position["azimuth"],
        axis_tilt=AXIS_TILT,
        axis_azimuth=AXIS_AZIMUTH,
    )

    # Fixed-panel tilt/azimuth (latitude tilt, equator-facing)
    _fixed_tilt = abs(latitude)
    _fixed_azimuth = 180.0 if latitude >= 0 else 0.0

    # ── Build per-minute irradiance series ──────────────────────────────
    if weather_override is not None:
        from app.services.weather import interpolate_to_minutes
        minute_weather = interpolate_to_minutes(weather_override, times)
    else:
        minute_weather = {}

    soiling_factor = max(0.0, 1.0 - soiling_loss)

    if minute_weather:
        # Build pandas Series from the interpolated weather data
        ghi_arr = pd.Series(index=times, dtype=float)
        dhi_arr = pd.Series(index=times, dtype=float)
        bhi_arr = pd.Series(index=times, dtype=float)
        tmp_arr = pd.Series(index=times, dtype=float)

        for ts in times:
            w = minute_weather.get(ts)
            if w is not None:
                ghi_arr[ts] = w["ghi"]
                dhi_arr[ts] = w["dhi"]
                bhi_arr[ts] = w["bhi"]
                tmp_arr[ts] = w["temp"]
            else:
                ghi_arr[ts] = _safe_series_value(clearsky["ghi"], ts, 0.0)
                dhi_arr[ts] = _safe_series_value(clearsky["dhi"], ts, 0.0)
                bhi_arr[ts] = 0.0
                tmp_arr[ts] = 20.0

        ghi_arr = ghi_arr.clip(lower=0.0) * soiling_factor
        dhi_arr = dhi_arr.clip(lower=0.0) * soiling_factor
        bhi_arr = bhi_arr.clip(lower=0.0) * soiling_factor
        tmp_arr = tmp_arr.fillna(20.0)

        # Vectorised fixed-panel POA using real-weather DNI derived per row
        # DNI is derived in the per-row loop below for accuracy
        _poa_fixed_series = None   # will compute per-row
        weather_active = True
    else:
        ghi_arr = clearsky["ghi"] * soiling_factor
        dhi_arr = clearsky["dhi"] * soiling_factor
        bhi_arr = None   # not needed; we have full clearsky DNI
        tmp_arr = pd.Series(20.0, index=times)

        _poa_fixed_cs = pvlib.irradiance.get_total_irradiance(
            surface_tilt=_fixed_tilt,
            surface_azimuth=_fixed_azimuth,
            dni=clearsky["dni"] * soiling_factor,
            ghi=ghi_arr,
            dhi=dhi_arr,
            solar_zenith=solar_position["apparent_zenith"],
            solar_azimuth=solar_position["azimuth"],
            dni_extra=dni_extra,
            airmass=relative_airmass,
            albedo=ALBEDO,
            model="haydavies",
        )["poa_global"].fillna(0.0).clip(lower=0.0)
        _poa_fixed_series = _poa_fixed_cs
        weather_active = False

    # ── Per-minute data loop ─────────────────────────────────────────────
    data: List[Dict[str, Any]] = []

    for ts in times:
        app_zen = _safe_series_value(solar_position["apparent_zenith"], ts, 180.0)
        sun_az  = _safe_series_value(solar_position["azimuth"], ts, 180.0)

        g_ghi = float(ghi_arr.loc[ts]) if not pd.isna(ghi_arr.loc[ts]) else 0.0
        g_dhi = float(dhi_arr.loc[ts]) if not pd.isna(dhi_arr.loc[ts]) else 0.0
        g_airmass = _safe_series_value(relative_airmass, ts, 0.0)
        g_dni_extra = _safe_series_value(dni_extra, ts, 0.0)
        g_temp = float(tmp_arr.loc[ts]) if not pd.isna(tmp_arr.loc[ts]) else 20.0

        if weather_active:
            # Derive DNI from GHI and DHI (BHI available as cross-check)
            g_dni = _derive_dni(g_ghi, g_dhi, app_zen)

            # Per-row fixed-panel POA using real-weather irradiance
            try:
                poa_fixed_val = float(
                    pvlib.irradiance.get_total_irradiance(
                        surface_tilt=_fixed_tilt,
                        surface_azimuth=_fixed_azimuth,
                        dni=g_dni,
                        ghi=g_ghi,
                        dhi=g_dhi,
                        solar_zenith=app_zen,
                        solar_azimuth=sun_az,
                        dni_extra=g_dni_extra,
                        airmass=g_airmass if g_airmass > 0 else None,
                        albedo=ALBEDO,
                        model="haydavies",
                    ).get("poa_global", 0.0)
                )
                poa_fixed_val = max(0.0, poa_fixed_val)
            except Exception:
                poa_fixed_val = 0.0
        else:
            g_dni = _safe_series_value(clearsky["dni"] * soiling_factor, ts, 0.0)
            poa_fixed_val = _safe_series_value(_poa_fixed_series, ts, 0.0)

        data.append(
            {
                "timestamp": ts.isoformat(),
                "sun_elevation": round(
                    _safe_series_value(solar_position["apparent_elevation"], ts, 0.0), 4
                ),
                "sun_azimuth": round(sun_az, 4),
                "apparent_zenith": app_zen,
                "ghi": g_ghi,
                "dni": g_dni,
                "dhi": g_dhi,
                "dni_extra": g_dni_extra,
                "airmass": g_airmass,
                "temp": round(g_temp, 2),
                "ideal_tracker_angle": round(
                    _safe_tracking_value(tracking_ideal, ts, "tracker_theta", 0.0), 4
                ),
                "limited_tracker_angle": round(
                    _safe_tracking_value(tracking_limited, ts, "tracker_theta", 0.0), 4
                ),
                "backtracking_angle": round(
                    _safe_tracking_value(tracking_backtracking, ts, "tracker_theta", 0.0), 4
                ),
                "limited_surface_tilt": _safe_tracking_value(
                    tracking_limited, ts, "surface_tilt", 0.0
                ),
                "limited_surface_azimuth": _safe_tracking_value(
                    tracking_limited, ts, "surface_azimuth", 180.0
                ),
                "backtracking_surface_tilt": _safe_tracking_value(
                    tracking_backtracking, ts, "surface_tilt", 0.0
                ),
                "backtracking_surface_azimuth": _safe_tracking_value(
                    tracking_backtracking, ts, "surface_azimuth", 180.0
                ),
                "irradiance_fixed": round(poa_fixed_val, 4),
                # pvlib-validated shadow direction (sign = East/West)
                "projected_solar_zenith": round(
                    _safe_series_value(_proj_zenith_series, ts, 0.0), 4
                ),
                # clear-sky GHI always stored for comparison chart
                "clearsky_ghi": round(
                    _safe_series_value(clearsky["ghi"], ts, 0.0), 4
                ),
            }
        )

    return data

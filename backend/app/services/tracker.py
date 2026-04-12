from __future__ import annotations

from typing import List, Dict, Any

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


def get_tracker_day_profile(
    latitude: float,
    longitude: float,
    timezone: str,
    date: str,
    panel_width: float,
    row_spacing: float,
    max_angle: float,
) -> List[Dict[str, Any]]:
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

    # Fixed-panel POA irradiance (baseline for irradiance comparison chart)
    _fixed_tilt = abs(latitude)
    _fixed_azimuth = 180.0 if latitude >= 0 else 0.0

    _poa_fixed_series = pvlib.irradiance.get_total_irradiance(
        surface_tilt=_fixed_tilt,
        surface_azimuth=_fixed_azimuth,
        dni=clearsky["dni"],
        ghi=clearsky["ghi"],
        dhi=clearsky["dhi"],
        solar_zenith=solar_position["apparent_zenith"],
        solar_azimuth=solar_position["azimuth"],
        dni_extra=dni_extra,
        airmass=relative_airmass,
        albedo=ALBEDO,
        model="haydavies",
    )["poa_global"].fillna(0.0).clip(lower=0.0)

    data: List[Dict[str, Any]] = []

    for ts in times:
        data.append(
            {
                "timestamp": ts.isoformat(),
                "sun_elevation": round(
                    _safe_series_value(solar_position["apparent_elevation"], ts, 0.0), 4
                ),
                "sun_azimuth": round(
                    _safe_series_value(solar_position["azimuth"], ts, 0.0), 4
                ),
                "apparent_zenith": _safe_series_value(
                    solar_position["apparent_zenith"], ts, 180.0
                ),
                "ghi": _safe_series_value(clearsky["ghi"], ts, 0.0),
                "dni": _safe_series_value(clearsky["dni"], ts, 0.0),
                "dhi": _safe_series_value(clearsky["dhi"], ts, 0.0),
                "dni_extra": _safe_series_value(dni_extra, ts, 0.0),
                "airmass": _safe_series_value(relative_airmass, ts, 0.0),
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
                "irradiance_fixed": round(_safe_series_value(_poa_fixed_series, ts, 0.0), 4),
            }
        )

    return data
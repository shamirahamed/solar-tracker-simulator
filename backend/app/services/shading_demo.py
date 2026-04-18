from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

import pandas as pd
import pvlib

AXIS_TILT = 0.0
AXIS_AZIMUTH = 0.0
CROSS_AXIS_TILT = 0.0
SURFACE_TO_AXIS_OFFSET = 0.10
ALBEDO = 0.2
TRANSPOSITION_MODEL = "haydavies"

# Temperature derating (NOCT model)
# T_cell = T_ambient + (NOCT - 20) / 800 * G_poa
# Power factor = 1 + TEMP_COEFF * (T_cell - 25)
NOCT = 45.0          # nominal operating cell temperature (°C)
TEMP_COEFF = -0.004  # power temperature coefficient (%/°C), typical c-Si


def _ground_shadow_length(
    sun_elevation: float,
    tracker_angle: float,
    panel_width: float,
    tracker_height: float,
) -> float:
    if sun_elevation <= 0:
        return 0.0

    projected_half_height = 0.5 * panel_width * math.sin(math.radians(abs(tracker_angle)))
    effective_top_height = max(0.0, tracker_height + projected_half_height)

    tan_elev = math.tan(math.radians(sun_elevation))
    if tan_elev <= 0:
        return 0.0

    return effective_top_height / tan_elev


def _shaded_fraction(
    solar_zenith: float,
    solar_azimuth: float,
    tracker_angle: float,
    panel_width: float,
    row_spacing: float,
) -> float:
    if solar_zenith >= 90 or panel_width <= 0 or row_spacing <= 0:
        return 0.0

    try:
        projected = pvlib.shading.projected_solar_zenith_angle(
            solar_zenith=solar_zenith,
            solar_azimuth=solar_azimuth,
            axis_tilt=AXIS_TILT,
            axis_azimuth=AXIS_AZIMUTH,
        )

        if pd.isna(projected):
            return 0.0

        projected = float(projected)

        if projected >= 0:
            shaded_row_rotation = tracker_angle
            shading_row_rotation = tracker_angle
        else:
            shaded_row_rotation = -tracker_angle
            shading_row_rotation = -tracker_angle

        shaded_fraction = pvlib.shading.shaded_fraction1d(
            solar_zenith=solar_zenith,
            solar_azimuth=solar_azimuth,
            axis_azimuth=AXIS_AZIMUTH,
            shaded_row_rotation=shaded_row_rotation,
            shading_row_rotation=shading_row_rotation,
            collector_width=panel_width,
            pitch=row_spacing,
            axis_tilt=AXIS_TILT,
            surface_to_axis_offset=SURFACE_TO_AXIS_OFFSET,
            cross_axis_slope=CROSS_AXIS_TILT,
        )

        if pd.isna(shaded_fraction):
            return 0.0

        return max(0.0, min(1.0, float(shaded_fraction)))
    except Exception:
        return 0.0


def _poa_components(
    surface_tilt: float,
    surface_azimuth: float,
    solar_zenith: float,
    solar_azimuth: float,
    dni: float,
    ghi: float,
    dhi: float,
    dni_extra: float,
    airmass: float,
) -> Dict[str, float]:
    poa = pvlib.irradiance.get_total_irradiance(
        surface_tilt=surface_tilt,
        surface_azimuth=surface_azimuth,
        solar_zenith=solar_zenith,
        solar_azimuth=solar_azimuth,
        dni=dni,
        ghi=ghi,
        dhi=dhi,
        dni_extra=dni_extra,
        airmass=airmass if airmass > 0 else None,
        albedo=ALBEDO,
        model=TRANSPOSITION_MODEL,
    )

    result: Dict[str, float] = {}
    for key in [
        "poa_global",
        "poa_direct",
        "poa_diffuse",
        "poa_sky_diffuse",
        "poa_ground_diffuse",
    ]:
        try:
            result[key] = float(poa.get(key, 0.0))
        except Exception:
            result[key] = 0.0

    return result


def _mode_results(
    row: Dict[str, Any],
    tracker_angle_key: str,
    surface_tilt_key: str,
    surface_azimuth_key: str,
    panel_width: float,
    tracker_height: float,
    row_spacing: float,
    panel_area: float,
    panel_efficiency: float,
    t_ambient: float = 20.0,
) -> Tuple[float, bool, float, float, float]:
    solar_zenith = float(row["apparent_zenith"])
    solar_azimuth = float(row["sun_azimuth"])
    sun_elevation = float(row["sun_elevation"])

    tracker_angle = float(row[tracker_angle_key])
    surface_tilt = float(row[surface_tilt_key])
    surface_azimuth = float(row[surface_azimuth_key])

    shadow_length = _ground_shadow_length(
        sun_elevation=sun_elevation,
        tracker_angle=tracker_angle,
        panel_width=panel_width,
        tracker_height=tracker_height,
    )

    shaded_fraction = _shaded_fraction(
        solar_zenith=solar_zenith,
        solar_azimuth=solar_azimuth,
        tracker_angle=tracker_angle,
        panel_width=panel_width,
        row_spacing=row_spacing,
    )
    shaded = shaded_fraction > 0.0001

    try:
        poa = _poa_components(
            surface_tilt=surface_tilt,
            surface_azimuth=surface_azimuth,
            solar_zenith=solar_zenith,
            solar_azimuth=solar_azimuth,
            dni=float(row["dni"]),
            ghi=float(row["ghi"]),
            dhi=float(row["dhi"]),
            dni_extra=float(row["dni_extra"]),
            airmass=float(row["airmass"]),
        )
    except Exception:
        poa = {
            "poa_global": 0.0,
            "poa_direct": 0.0,
            "poa_sky_diffuse": 0.0,
            "poa_ground_diffuse": 0.0,
        }

    poa_global = max(0.0, poa.get("poa_global", 0.0))

    # Apply shading penalty to total POA
    poa_after_shading = max(0.0, poa_global * (1 - shaded_fraction))

    # pvlib-validated cell temperature (NOCT/SAM model)
    try:
        t_cell = float(pvlib.temperature.noct_sam(
            poa_global=poa_after_shading,
            temp_air=t_ambient,
            wind_speed=max(0.1, float(row.get("wind_speed", 1.0))),
            noct=NOCT,
            module_efficiency=panel_efficiency,
        ))
    except Exception:
        t_cell = t_ambient + (NOCT - 20.0) / 800.0 * poa_after_shading

    temp_factor = max(0.0, 1.0 + TEMP_COEFF * (t_cell - 25.0))
    power = poa_after_shading * panel_area * panel_efficiency * temp_factor

    return shadow_length, shaded, shaded_fraction * 100.0, poa_after_shading, power, t_cell


def run_full_simulation(
    tracker_data: List[Dict[str, Any]],
    panel_width: float,
    panel_height: float,
    tracker_height: float,
    row_spacing: float,
    panel_efficiency: float,
    backtracking_enabled: bool,
) -> List[Dict[str, Any]]:
    panel_area = panel_width * panel_height
    results: List[Dict[str, Any]] = []

    for row in tracker_data:
        t_night = float(row.get("temp", 20.0))
        if float(row["sun_elevation"]) <= 0:
            shadow_length_without = 0.0
            shaded_without = False
            shading_percent_without = 0.0
            irradiance_without_backtracking = 0.0
            power_without_backtracking = 0.0
            cell_temp_nobt = t_night

            shadow_length_with = 0.0
            shaded_with = False
            shading_percent_with = 0.0
            irradiance_with_backtracking = 0.0
            power_with_backtracking = 0.0
            cell_temp_bt = t_night

            irradiance_raw = 0.0
            irradiance_fixed = 0.0
            power_fixed_val = 0.0
        else:
            t_amb = float(row.get("temp", 20.0))

            (
                shadow_length_without,
                shaded_without,
                shading_percent_without,
                irradiance_without_backtracking,
                power_without_backtracking,
                cell_temp_nobt,
            ) = _mode_results(
                row=row,
                tracker_angle_key="limited_tracker_angle",
                surface_tilt_key="limited_surface_tilt",
                surface_azimuth_key="limited_surface_azimuth",
                panel_width=panel_width,
                tracker_height=tracker_height,
                row_spacing=row_spacing,
                panel_area=panel_area,
                panel_efficiency=panel_efficiency,
                t_ambient=t_amb,
            )

            # Raw BT result (keep these for display / charts)
            (
                shadow_length_with,
                shaded_with,
                shading_percent_with,
                irradiance_with_backtracking,
                power_with_backtracking,
                cell_temp_bt,
            ) = _mode_results(
                row=row,
                tracker_angle_key="backtracking_angle",
                surface_tilt_key="backtracking_surface_tilt",
                surface_azimuth_key="backtracking_surface_azimuth",
                panel_width=panel_width,
                tracker_height=tracker_height,
                row_spacing=row_spacing,
                panel_area=panel_area,
                panel_efficiency=panel_efficiency,
                t_ambient=t_amb,
            )

            # Fixed panel — pvlib temperature + derating for fair comparison
            irradiance_fixed_val = max(0.0, float(row.get("irradiance_fixed", 0.0)))
            try:
                t_cell_fixed = float(pvlib.temperature.noct_sam(
                    poa_global=irradiance_fixed_val,
                    temp_air=t_amb,
                    wind_speed=max(0.1, float(row.get("wind_speed", 1.0))),
                    noct=NOCT,
                    module_efficiency=panel_efficiency,
                ))
                tf_fixed = max(0.0, 1.0 + TEMP_COEFF * (t_cell_fixed - 25.0))
            except Exception:
                tf_fixed = 1.0
            power_fixed_val = irradiance_fixed_val * panel_area * panel_efficiency * tf_fixed

            # BT irradiance and power are kept as-is from the backtracking calculation.
            # BT avoids shading by rotating to a shallower angle — its POA may differ
            # from No BT even when shading_percent_with is zero.

            irradiance_raw = max(0.0, float(row["ghi"]))
            irradiance_fixed = max(0.0, float(row.get("irradiance_fixed", 0.0)))

        if backtracking_enabled:
            selected_shadow_length = shadow_length_with
            selected_shaded = shaded_with
            selected_shading_percent = shading_percent_with
            selected_power = power_with_backtracking
        else:
            selected_shadow_length = shadow_length_without
            selected_shaded = shaded_without
            selected_shading_percent = shading_percent_without
            selected_power = power_without_backtracking

        results.append(
            {
                "timestamp": row["timestamp"],
                "sun_elevation": round(float(row["sun_elevation"]), 4),
                "sun_azimuth": round(float(row["sun_azimuth"]), 4),
                "ideal_tracker_angle": round(float(row["ideal_tracker_angle"]), 4),
                "limited_tracker_angle": round(float(row["limited_tracker_angle"]), 4),
                "backtracking_angle": round(float(row["backtracking_angle"]), 4),
                "shadow_length_without_backtracking": round(shadow_length_without, 3),
                "shadow_length_with_backtracking": round(shadow_length_with, 3),
                "shaded_without_backtracking": shaded_without,
                "shaded_with_backtracking": shaded_with,
                "shading_percent_without_backtracking": round(shading_percent_without, 2),
                "shading_percent_with_backtracking": round(shading_percent_with, 2),
                "irradiance_fixed": round(irradiance_fixed, 2),
                "irradiance_raw": round(irradiance_raw, 2),
                "irradiance_without_backtracking": round(irradiance_without_backtracking, 2),
                "irradiance_with_backtracking": round(irradiance_with_backtracking, 2),
                "power_without_backtracking": round(power_without_backtracking, 2),
                "power_with_backtracking": round(power_with_backtracking, 2),
                "selected_shadow_length": round(selected_shadow_length, 3),
                "selected_shaded": selected_shaded,
                "selected_shading_percent": round(selected_shading_percent, 2),
                "selected_power": round(selected_power, 2),
                # v1.2 — pvlib-validated extras
                "power_fixed": round(power_fixed_val, 2),
                "temp": round(float(row.get("temp", 20.0)), 2),
                "cell_temp": round(cell_temp_bt, 2),
                "clearsky_ghi": round(float(row.get("clearsky_ghi", 0.0)), 2),
                "projected_solar_zenith": round(float(row.get("projected_solar_zenith", 0.0)), 4),
                "wind_speed":    round(float(row.get("wind_speed", 1.0)), 2),
                "cloud_cover":  round(float(row.get("cloud_cover", 0.0)), 1),
                "wind_stow":    bool(row.get("wind_stow", False)),
                "precipitation": round(float(row.get("precipitation", 0.0)), 3),
                "humidity":      round(float(row.get("humidity",      50.0)), 1),
                "dew_point":     round(float(row.get("dew_point",     10.0)), 2),
            }
        )

    return results
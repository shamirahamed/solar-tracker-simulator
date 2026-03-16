import math


def _compute_shadow_and_shading(
    sun_elevation: float,
    tracker_angle: float,
    panel_width: float,
    row_spacing: float,
):
    # Ignore unrealistic near-horizon spikes
    if sun_elevation <= 5:
        return 0.0, False, 0.0

    # Simplified side-view geometry
    effective_height = panel_width * math.sin(math.radians(abs(tracker_angle)))

    if effective_height <= 0:
        return 0.0, False, 0.0

    shadow_length = effective_height / math.tan(math.radians(sun_elevation))

    if shadow_length > row_spacing:
        overlap = shadow_length - row_spacing
        shading_percent = min((overlap / panel_width) * 100, 100)
        return shadow_length, True, shading_percent

    return shadow_length, False, 0.0


def run_full_simulation(
    tracker_data,
    panel_width: float,
    panel_height: float,
    row_spacing: float,
    panel_efficiency: float,
    backtracking_enabled: bool,
):
    panel_area = panel_width * panel_height
    results = []

    for row in tracker_data:
        elevation = row["sun_elevation"]
        limited_angle = row["limited_tracker_angle"]
        backtracking_angle = row["backtracking_angle"]

        if elevation <= 0:
            irradiance_raw = 0.0
            irradiance_without_backtracking = 0.0
            irradiance_with_backtracking = 0.0
            power_without_backtracking = 0.0
            power_with_backtracking = 0.0

            shadow_length_without = 0.0
            shadow_length_with = 0.0
            shaded_without = False
            shaded_with = False
            shading_percent_without = 0.0
            shading_percent_with = 0.0
        else:
            shadow_length_without, shaded_without, shading_percent_without = _compute_shadow_and_shading(
                sun_elevation=elevation,
                tracker_angle=limited_angle,
                panel_width=panel_width,
                row_spacing=row_spacing,
            )

            shadow_length_with, shaded_with, shading_percent_with = _compute_shadow_and_shading(
                sun_elevation=elevation,
                tracker_angle=backtracking_angle,
                panel_width=panel_width,
                row_spacing=row_spacing,
            )

            irradiance_raw = max(0.0, 1000 * math.sin(math.radians(elevation)))

            incidence_without = elevation - limited_angle
            irradiance_without_backtracking = max(
                0.0,
                irradiance_raw * math.cos(math.radians(incidence_without)),
            )

            incidence_with = elevation - backtracking_angle
            irradiance_with_backtracking = max(
                0.0,
                irradiance_raw * math.cos(math.radians(incidence_with)),
            )

            power_without_backtracking = (
                irradiance_without_backtracking * panel_area * panel_efficiency
            )
            power_without_backtracking *= (1 - shading_percent_without / 100)

            power_with_backtracking = (
                irradiance_with_backtracking * panel_area * panel_efficiency
            )
            power_with_backtracking *= (1 - shading_percent_with / 100)

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
                **row,
                "shadow_length_without_backtracking": round(shadow_length_without, 3),
                "shadow_length_with_backtracking": round(shadow_length_with, 3),
                "shaded_without_backtracking": shaded_without,
                "shaded_with_backtracking": shaded_with,
                "shading_percent_without_backtracking": round(shading_percent_without, 2),
                "shading_percent_with_backtracking": round(shading_percent_with, 2),
                "irradiance_raw": round(irradiance_raw, 2),
                "irradiance_without_backtracking": round(irradiance_without_backtracking, 2),
                "irradiance_with_backtracking": round(irradiance_with_backtracking, 2),
                "power_without_backtracking": round(power_without_backtracking, 2),
                "power_with_backtracking": round(power_with_backtracking, 2),
                "selected_shadow_length": round(selected_shadow_length, 3),
                "selected_shaded": selected_shaded,
                "selected_shading_percent": round(selected_shading_percent, 2),
                "selected_power": round(selected_power, 2),
            }
        )

    return results

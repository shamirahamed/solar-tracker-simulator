import math


def run_full_simulation(
    tracker_data,
    panel_width: float,
    panel_height: float,
    row_spacing: float,
    panel_efficiency: float,
):
    panel_area = panel_width * panel_height
    results = []

    for row in tracker_data:
        elevation = row["sun_elevation"]
        limited_angle = row["limited_tracker_angle"]
        backtracking_angle = row["backtracking_angle"]

        # --- Shadow / shading ---
        if elevation <= 0:
            shadow_length = 0.0
            shaded = False
            shading_percent = 0.0
        else:
            elevation_rad = math.radians(elevation)
            shadow_length = panel_height / math.tan(elevation_rad)

            if shadow_length > row_spacing:
                shaded = True
                overlap = shadow_length - row_spacing
                shading_percent = min((overlap / panel_width) * 100, 100)
            else:
                shaded = False
                shading_percent = 0.0

        # --- Irradiance / power ---
        if elevation <= 0:
            irradiance_raw = 0.0
            irradiance_without_backtracking = 0.0
            irradiance_with_backtracking = 0.0
            power_without_backtracking = 0.0
            power_with_backtracking = 0.0
        else:
            # Simple clear-sky irradiance model
            irradiance_raw = max(0.0, 1000 * math.sin(math.radians(elevation)))

            # Cosine loss for limited tracking
            incidence_without = elevation - limited_angle
            irradiance_without_backtracking = max(
                0.0,
                irradiance_raw * math.cos(math.radians(incidence_without))
            )

            # Cosine loss for backtracking
            incidence_with = elevation - backtracking_angle
            irradiance_with_backtracking = max(
                0.0,
                irradiance_raw * math.cos(math.radians(incidence_with))
            )

            power_without_backtracking = (
                irradiance_without_backtracking * panel_area * panel_efficiency
            )

            power_with_backtracking = (
                irradiance_with_backtracking * panel_area * panel_efficiency
            )

            # Apply shading loss only to no-backtracking case
            power_without_backtracking = power_without_backtracking * (1 - shading_percent / 100)

        results.append(
            {
                **row,
                "shadow_length": round(shadow_length, 3),
                "shaded": shaded,
                "shading_percent": round(shading_percent, 2),
                "irradiance_raw": round(irradiance_raw, 2),
                "irradiance_without_backtracking": round(irradiance_without_backtracking, 2),
                "irradiance_with_backtracking": round(irradiance_with_backtracking, 2),
                "power_without_backtracking": round(power_without_backtracking, 2),
                "power_with_backtracking": round(power_with_backtracking, 2),
            }
        )

    return results
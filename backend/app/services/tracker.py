import pandas as pd
import pvlib


def get_tracker_day_profile(
    latitude: float,
    longitude: float,
    timezone: str,
    date: str,
    panel_width: float,
    row_spacing: float,
    max_angle: float,
):
    gcr = panel_width / row_spacing

    start = pd.Timestamp(f"{date} 00:00:00", tz=timezone)
    times = pd.date_range(start=start, periods=1440, freq="1min")

    solar_position = pvlib.solarposition.get_solarposition(
        time=times,
        latitude=latitude,
        longitude=longitude,
    )

    tracking_ideal = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=0,
        axis_azimuth=0,
        max_angle=90,
        backtrack=False,
        gcr=gcr,
    )

    tracking_limited = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=0,
        axis_azimuth=0,
        max_angle=max_angle,
        backtrack=False,
        gcr=gcr,
    )

    tracking_backtracking = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=0,
        axis_azimuth=0,
        max_angle=max_angle,
        backtrack=True,
        gcr=gcr,
    )

    data = []

    for ts in times:
        sun_elevation = float(solar_position.loc[ts, "apparent_elevation"])
        sun_azimuth = float(solar_position.loc[ts, "azimuth"])

        ideal_theta = tracking_ideal.loc[ts, "tracker_theta"]
        limited_theta = tracking_limited.loc[ts, "tracker_theta"]
        backtracking_theta = tracking_backtracking.loc[ts, "tracker_theta"]

        ideal_tracker_angle = 0.0 if pd.isna(ideal_theta) else float(ideal_theta)
        limited_tracker_angle = 0.0 if pd.isna(limited_theta) else float(limited_theta)
        backtracking_angle = 0.0 if pd.isna(backtracking_theta) else float(backtracking_theta)

        data.append(
            {
                "timestamp": ts.isoformat(),
                "sun_elevation": round(sun_elevation, 4),
                "sun_azimuth": round(sun_azimuth, 4),
                "ideal_tracker_angle": round(ideal_tracker_angle, 4),
                "limited_tracker_angle": round(limited_tracker_angle, 4),
                "backtracking_angle": round(backtracking_angle, 4),
            }
        )

    return data
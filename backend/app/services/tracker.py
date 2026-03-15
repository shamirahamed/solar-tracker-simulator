import pandas as pd
import pvlib


def get_tracker_day_profile(
    latitude: float,
    longitude: float,
    timezone: str,
    date: str,
    gcr: float,
    max_angle: float,
    backtracking: bool,
):
    start = pd.Timestamp(f"{date} 00:00:00", tz=timezone)
    times = pd.date_range(start=start, periods=1440, freq="1min")

    solar_position = pvlib.solarposition.get_solarposition(
        time=times,
        latitude=latitude,
        longitude=longitude,
    )

    # 1) Ideal tracking angle: use a very high max angle so it behaves like
    # full theoretical sun-following rotation (practically close to ±90).
    tracking_ideal = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=0,
        axis_azimuth=0,
        max_angle=90,
        backtrack=False,
        gcr=gcr,
    )

    # 2) Limited tracking angle: same tracking logic, but restricted by user max_angle
    tracking_limited = pvlib.tracking.singleaxis(
        apparent_zenith=solar_position["apparent_zenith"],
        apparent_azimuth=solar_position["azimuth"],
        axis_tilt=0,
        axis_azimuth=0,
        max_angle=max_angle,
        backtrack=False,
        gcr=gcr,
    )

    # 3) Backtracking angle: restricted by user max_angle and backtracking rule
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
        computed_backtracking_angle = 0.0 if pd.isna(backtracking_theta) else float(backtracking_theta)

        # If backtracking is disabled by input, return limited angle as the effective backtracking angle.
        # This keeps output always populated and easy to compare.
        backtracking_angle = (
            computed_backtracking_angle if backtracking else limited_tracker_angle
        )

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

    return {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": timezone,
        "date": date,
        "interval_minutes": 1,
        "total_points": len(data),
        "data": data,
    }
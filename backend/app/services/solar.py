import pandas as pd
import pvlib


def get_solar_position(latitude: float, longitude: float, timestamp: str):
    times = pd.DatetimeIndex([timestamp])
    solar_position = pvlib.solarposition.get_solarposition(
        time=times,
        latitude=latitude,
        longitude=longitude
    )

    row = solar_position.iloc[0]

    return {
        "timestamp": timestamp,
        "apparent_zenith": float(row["apparent_zenith"]),
        "zenith": float(row["zenith"]),
        "apparent_elevation": float(row["apparent_elevation"]),
        "elevation": float(row["elevation"]),
        "azimuth": float(row["azimuth"])
    }


def get_full_day_solar_profile(latitude: float, longitude: float, date: str):
    start = pd.Timestamp(f"{date} 00:00:00")
    times = pd.date_range(start=start, periods=1440, freq="1min")

    solar_position = pvlib.solarposition.get_solarposition(
        time=times,
        latitude=latitude,
        longitude=longitude
    )

    data = []
    for ts, row in solar_position.iterrows():
        data.append({
            "timestamp": ts.isoformat(),
            "apparent_zenith": float(row["apparent_zenith"]),
            "zenith": float(row["zenith"]),
            "apparent_elevation": float(row["apparent_elevation"]),
            "elevation": float(row["elevation"]),
            "azimuth": float(row["azimuth"])
        })

    return {
        "latitude": latitude,
        "longitude": longitude,
        "date": date,
        "interval_minutes": 1,
        "total_points": len(data),
        "data": data
    }
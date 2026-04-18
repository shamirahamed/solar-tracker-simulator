from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import date as dt_date, timedelta
from typing import Any, Dict

import pandas as pd

_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_ARCHIVE_URL  = "https://archive-api.open-meteo.com/v1/archive"

# Open-Meteo variables:
#   shortwave_radiation  = GHI (W/m²)
#   diffuse_radiation    = DHI (W/m²)
#   direct_radiation     = BHI = DNI * cos(zenith)  (W/m²)
#   temperature_2m       = ambient temperature (°C)
_VARIABLES = "shortwave_radiation,diffuse_radiation,direct_radiation,temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,relative_humidity_2m,dew_point_2m"


def _choose_url(date_str: str) -> str:
    """Use the archive API for dates > 5 days ago; forecast for recent/future."""
    try:
        target = dt_date.fromisoformat(date_str)
        delta = (dt_date.today() - target).days
        return _ARCHIVE_URL if delta > 5 else _FORECAST_URL
    except ValueError:
        return _FORECAST_URL


def fetch_hourly_weather(
    latitude: float, longitude: float, date: str
) -> Dict[str, Dict[str, float]]:
    """
    Fetch hourly GHI, BHI, DHI and 2m temperature from Open-Meteo.

    Returns a dict keyed by hour timestamp string (e.g. "2024-06-15T00:00")
    with values {ghi, bhi, dhi, temp}.  BHI = direct beam on horizontal
    (= DNI * cos zenith); the caller must derive DNI using the solar zenith.
    """
    url = _choose_url(date)

    # Fetch ±1 day in UTC so any local timezone is fully covered (UTC+14 to UTC-12).
    try:
        _d = dt_date.fromisoformat(date)
        start_date = (_d - timedelta(days=1)).isoformat()
        end_date   = (_d + timedelta(days=1)).isoformat()
    except ValueError:
        start_date = end_date = date

    # Build URL manually — urllib.parse.urlencode encodes commas as %2C but
    # Open-Meteo requires literal commas in the `hourly` parameter list.
    base = urllib.parse.urlencode({
        "latitude":   latitude,
        "longitude":  longitude,
        "start_date": start_date,
        "end_date":   end_date,
        "timezone":   "UTC",
    })
    full_url = f"{url}?{base}&hourly={_VARIABLES}"

    req = urllib.request.Request(full_url, headers={"User-Agent": "solar-tracker-simulator/1.2"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode())

    # Validate API response — Open-Meteo returns {"error": true, "reason": "..."} on failure
    if payload.get("error"):
        raise ValueError(f"Open-Meteo API error: {payload.get('reason', 'unknown')}")

    hourly   = payload.get("hourly", {})
    times    = hourly.get("time", [])
    ghi_list = hourly.get("shortwave_radiation", [])
    dhi_list = hourly.get("diffuse_radiation", [])
    bhi_list = hourly.get("direct_radiation", [])
    tmp_list = hourly.get("temperature_2m", [])
    wsp_list = hourly.get("wind_speed_10m", [])
    wdr_list = hourly.get("wind_direction_10m", [])
    cld_list = hourly.get("cloud_cover", [])
    prc_list = hourly.get("precipitation", [])
    hum_list = hourly.get("relative_humidity_2m", [])
    dew_list = hourly.get("dew_point_2m", [])

    def _safe(lst: list, i: int, default: float = 0.0) -> float:
        try:
            v = lst[i]
            return float(v) if v is not None else default
        except (IndexError, TypeError, ValueError):
            return default

    result: Dict[str, Dict[str, float]] = {}
    for i, t in enumerate(times):
        result[t] = {
            "ghi":  max(0.0, _safe(ghi_list, i)),
            "bhi":  max(0.0, _safe(bhi_list, i)),
            "dhi":  max(0.0, _safe(dhi_list, i)),
            "temp": _safe(tmp_list, i, 20.0),
            "wind_speed": max(0.0, _safe(wsp_list, i, 1.0)),
            "wind_dir":   _safe(wdr_list, i, 0.0),
            "cloud_cover": max(0.0, min(100.0, _safe(cld_list, i, 0.0))),
            "precipitation": max(0.0, _safe(prc_list, i, 0.0)),
            "humidity":   max(0.0, min(100.0, _safe(hum_list, i, 50.0))),
            "dew_point":  _safe(dew_list, i, 10.0),
        }

    return result


def interpolate_to_minutes(
    hourly_data: Dict[str, Dict[str, float]],
    times: pd.DatetimeIndex,
) -> Dict[Any, Dict[str, float]]:
    """
    Linearly interpolate hourly Open-Meteo data onto the 1-minute `times` index.

    Returns a dict keyed by Timestamp (matching entries in `times`) with
    the same keys as the input hourly_data values.
    """
    if not hourly_data:
        return {}

    rows = []
    for t_str, vals in hourly_data.items():
        # Open-Meteo returns strings like "2024-06-15T00:00" (UTC)
        ts = pd.Timestamp(t_str, tz="UTC")
        rows.append({"time": ts, **vals})

    if not rows:
        return {}

    df = pd.DataFrame(rows).set_index("time").sort_index()

    # Match timezone of the target times index
    target_tz = times.tz
    if target_tz is not None:
        df.index = df.index.tz_convert(target_tz)
    else:
        df.index = df.index.tz_localize(None)

    # Add the target minute-resolution timestamps then interpolate
    combined = df.index.union(times)
    df_interp = df.reindex(combined).interpolate(method="time")

    # Irradiance can't be negative
    for col in ("ghi", "bhi", "dhi"):
        if col in df_interp.columns:
            df_interp[col] = df_interp[col].clip(lower=0.0)

    if "wind_speed" in df_interp.columns:
        df_interp["wind_speed"] = df_interp["wind_speed"].clip(lower=0.0)
    if "cloud_cover" in df_interp.columns:
        df_interp["cloud_cover"] = df_interp["cloud_cover"].clip(lower=0.0, upper=100.0)
    if "precipitation" in df_interp.columns:
        df_interp["precipitation"] = df_interp["precipitation"].clip(lower=0.0)
    if "humidity" in df_interp.columns:
        df_interp["humidity"] = df_interp["humidity"].clip(lower=0.0, upper=100.0)
    # dew_point can be negative — no clip needed

    df_min = df_interp.reindex(times)

    def _nan_safe(val: Any, default: float) -> float:
        try:
            f = float(val)
            return default if pd.isna(f) else f
        except (TypeError, ValueError):
            return default

    result: Dict[Any, Dict[str, float]] = {}
    for ts, row in df_min.iterrows():
        result[ts] = {
            "ghi":  max(0.0, _nan_safe(row.get("ghi"),  0.0)),
            "bhi":  max(0.0, _nan_safe(row.get("bhi"),  0.0)),
            "dhi":  max(0.0, _nan_safe(row.get("dhi"),  0.0)),
            "temp": _nan_safe(row.get("temp"), 20.0),
            "wind_speed":  max(0.0, _nan_safe(row.get("wind_speed"), 1.0)),
            "wind_dir":    _nan_safe(row.get("wind_dir"), 0.0),
            "cloud_cover": max(0.0, min(100.0, _nan_safe(row.get("cloud_cover"), 0.0))),
            "precipitation": max(0.0, _nan_safe(row.get("precipitation"), 0.0)),
            "humidity":   max(0.0, min(100.0, _nan_safe(row.get("humidity"),   50.0))),
            "dew_point":  _nan_safe(row.get("dew_point"), 10.0),
        }

    return result

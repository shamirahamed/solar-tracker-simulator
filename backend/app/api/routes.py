import csv
import io
from typing import Dict, List

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models import SimulationRequest, SimulationResponse
from app.services.shading_demo import run_full_simulation
from app.services.tracker import get_tracker_day_profile

router = APIRouter(prefix="/api/v1")

CSV_FIELDS = [
    "timestamp",
    "sun_elevation",
    "sun_azimuth",
    "ideal_tracker_angle",
    "limited_tracker_angle",
    "backtracking_angle",
    "shadow_length_without_backtracking",
    "shadow_length_with_backtracking",
    "shaded_without_backtracking",
    "shaded_with_backtracking",
    "shading_percent_without_backtracking",
    "shading_percent_with_backtracking",
    "irradiance_raw",
    "irradiance_fixed",
    "irradiance_without_backtracking",
    "irradiance_with_backtracking",
    "power_without_backtracking",
    "power_with_backtracking",
    "selected_shadow_length",
    "selected_shaded",
    "selected_shading_percent",
    "selected_power",
]


@router.get("/health")
def health():
    return {"status": "ok"}


def _fetch_weather(payload: SimulationRequest):
    """Fetch hourly weather from Open-Meteo; returns (data_dict, source_label)."""
    try:
        from app.services.weather import fetch_hourly_weather, _choose_url, _ARCHIVE_URL
        data = fetch_hourly_weather(payload.latitude, payload.longitude, payload.date)
        source = (
            "Open-Meteo (archive)"
            if _choose_url(payload.date) == _ARCHIVE_URL
            else "Open-Meteo (forecast)"
        )
        return data, source
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Weather fetch failed, using clearsky: %s", exc)
        return None, "clearsky (ineichen) — weather fetch failed"


def _build_simulation_rows(payload: SimulationRequest):
    """Returns (simulation_rows, weather_source_label)."""
    weather_data = None
    weather_source = "clearsky (ineichen)"

    if payload.use_real_weather:
        weather_data, weather_source = _fetch_weather(payload)

    tracker_data = get_tracker_day_profile(
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone=payload.timezone,
        date=payload.date,
        panel_width=payload.panel_width,
        row_spacing=payload.row_spacing,
        max_angle=payload.max_angle,
        weather_override=weather_data,
        soiling_loss=payload.soiling_loss,
    )

    rows = run_full_simulation(
        tracker_data=tracker_data,
        panel_width=payload.panel_width,
        panel_height=payload.panel_height,
        tracker_height=payload.tracker_height,
        row_spacing=payload.row_spacing,
        panel_efficiency=payload.panel_efficiency,
        backtracking_enabled=payload.backtracking,
    )
    return rows, weather_source


def _build_response(payload: SimulationRequest) -> Dict:
    simulation_data, weather_source = _build_simulation_rows(payload)
    interval_hours = 1.0 / 60.0

    daily_energy_without_backtracking = (
        sum(row["power_without_backtracking"] for row in simulation_data) * interval_hours / 1000.0
    )
    daily_energy_with_backtracking = (
        sum(row["power_with_backtracking"] for row in simulation_data) * interval_hours / 1000.0
    )

    if daily_energy_without_backtracking > 0:
        daily_energy_gain_percent = (
            (daily_energy_with_backtracking - daily_energy_without_backtracking)
            / daily_energy_without_backtracking
        ) * 100.0
    else:
        daily_energy_gain_percent = 0.0

    daily_irr_fixed = sum(row.get("irradiance_fixed", 0.0) for row in simulation_data) * interval_hours
    daily_irr_no_bt = sum(row.get("irradiance_without_backtracking", 0.0) for row in simulation_data) * interval_hours
    daily_irr_bt    = sum(row.get("irradiance_with_backtracking", 0.0) for row in simulation_data) * interval_hours

    gain_bt_vs_fixed = (
        (daily_irr_bt - daily_irr_fixed) / daily_irr_fixed * 100.0
        if daily_irr_fixed > 0 else 0.0
    )
    gain_bt_vs_no_bt = (
        (daily_irr_bt - daily_irr_no_bt) / daily_irr_no_bt * 100.0
        if daily_irr_no_bt > 0 else 0.0
    )

    panel_area = payload.panel_width * payload.panel_height
    daily_energy_fixed = round(
        daily_irr_fixed * panel_area * payload.panel_efficiency / 1000.0, 3
    )

    return {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "timezone": payload.timezone,
        "date": payload.date,
        "interval_minutes": 1,
        "total_points": len(simulation_data),
        "daily_energy_without_backtracking": round(daily_energy_without_backtracking, 3),
        "daily_energy_with_backtracking": round(daily_energy_with_backtracking, 3),
        "daily_energy_gain_percent": round(daily_energy_gain_percent, 2),
        "daily_irradiance_fixed":      round(daily_irr_fixed, 1),
        "daily_irradiance_no_bt":      round(daily_irr_no_bt, 1),
        "daily_irradiance_bt":         round(daily_irr_bt, 1),
        "irradiance_gain_bt_vs_fixed": round(gain_bt_vs_fixed, 2),
        "irradiance_gain_bt_vs_no_bt": round(gain_bt_vs_no_bt, 2),
        "weather_source": weather_source,
        "daily_energy_fixed": daily_energy_fixed,
        "data": simulation_data,
    }


@router.post("/simulate/day", response_model=SimulationResponse)
def simulate_day(payload: SimulationRequest):
    return _build_response(payload)


@router.post("/simulate/day.csv")
def simulate_day_csv(payload: SimulationRequest):
    simulation_data, _ = _build_simulation_rows(payload)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
    writer.writeheader()
    writer.writerows(simulation_data)
    output.seek(0)

    filename = f"simulation_{payload.date}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


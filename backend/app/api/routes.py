import io
import csv

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.app.models import SimulationRequest, SimulationResponse
from backend.app.services.tracker import get_tracker_day_profile
from backend.app.services.simulation import run_full_simulation


router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/simulate/day", response_model=SimulationResponse)
def simulate_day(payload: SimulationRequest):

    # Step 1 – tracker angles
    tracker_data = get_tracker_day_profile(
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone=payload.timezone,
        date=payload.date,
        panel_width=payload.panel_width,
        row_spacing=payload.row_spacing,
        max_angle=payload.max_angle,
    )

    # Step 2 – full simulation (shadow + power)
    simulation_data = run_full_simulation(
        tracker_data,
        panel_width=payload.panel_width,
        panel_height=payload.panel_height,
        row_spacing=payload.row_spacing,
        panel_efficiency=payload.panel_efficiency,
    )

    return {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "timezone": payload.timezone,
        "date": payload.date,
        "interval_minutes": 1,
        "total_points": len(simulation_data),
        "data": simulation_data,
    }


@router.post("/simulate/day.csv")
def simulate_day_csv(payload: SimulationRequest):

    tracker_data = get_tracker_day_profile(
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone=payload.timezone,
        date=payload.date,
        panel_width=payload.panel_width,
        row_spacing=payload.row_spacing,
        max_angle=payload.max_angle,
    )

    simulation_data = run_full_simulation(
        tracker_data,
        panel_width=payload.panel_width,
        panel_height=payload.panel_height,
        row_spacing=payload.row_spacing,
        panel_efficiency=payload.panel_efficiency,
    )

    output = io.StringIO()

    writer = csv.DictWriter(
        output,
        fieldnames=[
            "timestamp",
            "sun_elevation",
            "sun_azimuth",
            "ideal_tracker_angle",
            "limited_tracker_angle",
            "backtracking_angle",
            "shadow_length",
            "shaded",
            "shading_percent",
            "irradiance_raw",
            "irradiance_without_backtracking",
            "irradiance_with_backtracking",
            "power_without_backtracking",
            "power_with_backtracking",
        ],
    )

    writer.writeheader()
    writer.writerows(simulation_data)

    output.seek(0)

    filename = f"simulation_{payload.date}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
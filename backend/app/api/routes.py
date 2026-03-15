import io
import csv
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.app.models import SimulationRequest, SimulationResponse
from backend.app.services.tracker import get_tracker_day_profile

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/simulate/day", response_model=SimulationResponse)
def simulate_day(payload: SimulationRequest):
    return get_tracker_day_profile(
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone=payload.timezone,
        date=payload.date,
        gcr=payload.gcr,
        max_angle=payload.max_angle,
        backtracking=payload.backtracking,
    )


@router.post("/simulate/day.csv")
def simulate_day_csv(payload: SimulationRequest):
    result = get_tracker_day_profile(
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone=payload.timezone,
        date=payload.date,
        gcr=payload.gcr,
        max_angle=payload.max_angle,
        backtracking=payload.backtracking,
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
        ],
    )

    writer.writeheader()
    writer.writerows(result["data"])
    output.seek(0)

    filename = f"simulation_{payload.date}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
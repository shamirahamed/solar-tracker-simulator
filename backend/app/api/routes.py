from fastapi import APIRouter
from backend.app.services.solar import get_solar_position, get_full_day_solar_profile

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/solar-position")
def solar_position(latitude: float, longitude: float, timestamp: str):
    return get_solar_position(latitude, longitude, timestamp)


@router.get("/solar-profile")
def solar_profile(latitude: float, longitude: float, date: str):
    return get_full_day_solar_profile(latitude, longitude, date)
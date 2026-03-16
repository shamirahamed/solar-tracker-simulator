from typing import List
from pydantic import BaseModel


class SimulationRequest(BaseModel):
    latitude: float
    longitude: float
    timezone: str
    date: str

    panel_width: float
    panel_height: float
    row_spacing: float
    panel_efficiency: float

    max_angle: float
    backtracking: bool


class SimulationPoint(BaseModel):
    timestamp: str
    sun_elevation: float
    sun_azimuth: float

    ideal_tracker_angle: float
    limited_tracker_angle: float
    backtracking_angle: float

    shadow_length: float
    shaded: bool
    shading_percent: float

    irradiance_raw: float
    irradiance_without_backtracking: float
    irradiance_with_backtracking: float

    power_without_backtracking: float
    power_with_backtracking: float


class SimulationResponse(BaseModel):
    latitude: float
    longitude: float
    timezone: str
    date: str
    interval_minutes: int
    total_points: int
    data: List[SimulationPoint]
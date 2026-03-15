from typing import List
from pydantic import BaseModel, Field


class SimulationRequest(BaseModel):
    latitude: float = Field(..., description="Latitude in decimal degrees")
    longitude: float = Field(..., description="Longitude in decimal degrees")
    timezone: str = Field(..., description="Timezone, e.g. Europe/Dublin")
    date: str = Field(..., description="Simulation date in YYYY-MM-DD format")
    gcr: float = Field(..., gt=0, lt=1, description="Ground Coverage Ratio")
    max_angle: float = Field(..., gt=0, le=90, description="Maximum tracker angle")
    backtracking: bool = Field(..., description="Enable or disable backtracking")


class SimulationPoint(BaseModel):
    timestamp: str
    sun_elevation: float
    sun_azimuth: float
    ideal_tracker_angle: float
    limited_tracker_angle: float
    backtracking_angle: float


class SimulationResponse(BaseModel):
    latitude: float
    longitude: float
    timezone: str
    date: str
    interval_minutes: int
    total_points: int
    data: List[SimulationPoint]
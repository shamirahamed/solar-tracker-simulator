from typing import List

from pydantic import BaseModel, Field


class SimulationRequest(BaseModel):
    latitude: float
    longitude: float
    timezone: str
    date: str

    panel_width: float = Field(..., gt=0)
    panel_height: float = Field(..., gt=0)
    tracker_height: float = Field(..., ge=0)
    row_spacing: float = Field(..., gt=0)
    panel_efficiency: float = Field(..., gt=0, le=1)

    max_angle: float = Field(..., gt=0, le=90)
    backtracking: bool = True


class SimulationPoint(BaseModel):
    timestamp: str
    sun_elevation: float
    sun_azimuth: float

    ideal_tracker_angle: float
    limited_tracker_angle: float
    backtracking_angle: float

    shadow_length_without_backtracking: float
    shadow_length_with_backtracking: float

    shaded_without_backtracking: bool
    shaded_with_backtracking: bool

    shading_percent_without_backtracking: float
    shading_percent_with_backtracking: float

    irradiance_raw: float
    irradiance_without_backtracking: float
    irradiance_with_backtracking: float

    power_without_backtracking: float
    power_with_backtracking: float

    selected_shadow_length: float
    selected_shaded: bool
    selected_shading_percent: float
    selected_power: float


class SimulationResponse(BaseModel):
    latitude: float
    longitude: float
    timezone: str
    date: str
    interval_minutes: int
    total_points: int

    daily_energy_without_backtracking: float
    daily_energy_with_backtracking: float
    daily_energy_gain_percent: float

    data: List[SimulationPoint]

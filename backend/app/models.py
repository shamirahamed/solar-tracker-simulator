from typing import Any, Dict, List, Optional

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

    # v1.2 additions
    use_real_weather: bool = False
    soiling_loss: float = Field(default=0.0, ge=0, le=0.5)
    wind_stow_speed: float = Field(default=15.0, ge=0)

    # v1.2 browser-fetch: frontend fetches Open-Meteo and passes hourly data
    # directly, bypassing the server-side outbound request (avoids Render 429).
    # Keys are hour timestamp strings ("2024-06-15T00:00") mapping to
    # {ghi, bhi, dhi, temp, wind_speed, wind_dir, cloud_cover, precipitation, humidity, dew_point}.
    weather_data: Optional[Dict[str, Any]] = None

    # v1.3 bifacial support
    # 0.0 = monofacial (no rear gain), 0.65–0.80 = typical bifacial modules
    bifaciality: float = Field(default=0.0, ge=0.0, le=1.0)


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

    irradiance_fixed: float
    irradiance_raw: float
    irradiance_without_backtracking: float
    irradiance_with_backtracking: float

    power_without_backtracking: float
    power_with_backtracking: float

    selected_shadow_length: float
    selected_shaded: bool
    selected_shading_percent: float
    selected_power: float

    # v1.2 — pvlib-validated extras
    power_fixed: float = 0.0
    temp: float = 20.0
    # v1.3
    power_bifacial: float = 0.0
    cell_temp: float = 20.0
    clearsky_ghi: float = 0.0
    projected_solar_zenith: float = 0.0
    wind_speed:    float = 1.0
    cloud_cover:   float = 0.0
    wind_stow:     bool  = False
    precipitation: float = 0.0
    humidity:      float = 50.0
    dew_point:     float = 10.0


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

    daily_irradiance_fixed: float
    daily_irradiance_no_bt: float
    daily_irradiance_bt: float
    irradiance_gain_bt_vs_fixed: float
    irradiance_gain_bt_vs_no_bt: float

    # v1.2 additions
    weather_source: str = "clearsky (ineichen)"
    daily_energy_fixed: float = 0.0

    # v1.3
    daily_energy_bifacial: float = 0.0

    data: List[SimulationPoint]

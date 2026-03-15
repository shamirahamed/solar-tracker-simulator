# Shading API Update

Update the repository shamirahamed/solar-tracker-simulator.

Current status:
- FastAPI backend working
- Tracker simulation API implemented
- CSV export working
- Minimal frontend chart implemented

Simulation output currently includes:
- timestamp
- sun_elevation
- sun_azimuth
- ideal_tracker_angle
- limited_tracker_angle
- backtracking_angle

## Next Task

Add a shading API.

Endpoints:
POST /api/v1/shading/day  
POST /api/v1/shading/day.csv

### Fields per minute
- shadow_length
- shaded
- shading_percent

### Implementation notes
- Put shading logic in `backend/app/services/shading.py`
- Update `routes.py`
- Update `models.py`
- Keep tracker API unchanged

### Frontend
Update frontend to add a chart showing:
- shading_percent

### Requirements
- modular code
- CSV export support
- compatible with existing simulation structure
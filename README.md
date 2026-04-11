# Solar Tracker Simulator

A web-based single-axis solar tracker simulator with minute-level daily simulation, 2D animation, irradiance comparison, shading analysis, and PDF/CSV export.

---

## Live Demo

Frontend is a static HTML/JS app.  
Backend is a Python FastAPI server deployed on Render.

Set your API URL in the Settings panel inside the app.

---

## Features

- Single-axis tracker simulation at 1-minute resolution (1440 points/day)
- Tracker angle: Ideal, Limited (max angle), and Backtracking modes
- Inter-row shading estimation using pvlib
- Irradiance comparison: Fixed panel vs Tracker No BT vs Tracker BT
- Daily irradiance totals and gain % in summary cards
- 2D animated tracker and shadow canvas with play/pause
- Charts: Tracker Angle, Solar Position, Inter-row Shadowing, Irradiance
- PDF report export (jsPDF)
- CSV data export
- Mobile responsive

---

## Project Structure

```
backend/
  app/
    main.py               FastAPI entry point
    models.py             Request and response models
    api/
      routes.py           API endpoints
    services/
      solar.py            Solar position calculations
      tracker.py          Single-axis tracking + fixed panel irradiance
      shading.py          Row shading and shadow geometry
      shading_demo.py     Full simulation orchestration

frontend/
  index.html              Main UI
  styles.css              Layout and responsive design
  app.js                  API calls, charts, canvas animation, PDF export
```

---

## API

### POST `/api/v1/simulate/day`

Request body:

```json
{
  "latitude": 53.3498,
  "longitude": -6.2603,
  "timezone": "Europe/Dublin",
  "date": "2026-03-09",
  "panel_width": 2.0,
  "panel_height": 1.1,
  "tracker_height": 1.5,
  "row_spacing": 5.5,
  "panel_efficiency": 0.20,
  "max_angle": 60,
  "backtracking": true
}
```

Response includes 1440 per-minute data points and summary fields:

```
daily_irradiance_fixed       Wh/m² — fixed panel at latitude tilt
daily_irradiance_no_bt       Wh/m² — tracker without backtracking
daily_irradiance_bt          Wh/m² — tracker with backtracking
irradiance_gain_bt_vs_fixed  % gain of BT tracker vs fixed panel
irradiance_gain_bt_vs_no_bt  % gain of BT tracker vs no-BT tracker
```

Per-minute data fields include:

```
timestamp, sun_elevation, sun_azimuth
ideal_tracker_angle, limited_tracker_angle, backtracking_angle
shadow_length_without_backtracking, shadow_length_with_backtracking
shading_percent_without_backtracking, shading_percent_with_backtracking
irradiance_fixed, irradiance_without_backtracking, irradiance_with_backtracking
power_without_backtracking, power_with_backtracking
```

### POST `/api/v1/simulate/day.csv`

Same request body. Returns a CSV file download.

### GET `/api/v1/health`

Returns `{"status": "ok"}`.

---

## Backend Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Requirements: Python 3.10+, pvlib, fastapi, uvicorn, pandas, pydantic

---

## Frontend Setup

No build step required. Open `frontend/index.html` in a browser.

Set the API Base URL in the Settings panel to point to your backend.

---

## Calculation Notes

- Solar position: pvlib `get_solarposition`
- Clear-sky irradiance: pvlib Ineichen model
- Tracker angles: pvlib `singleaxis`
- Fixed panel: latitude tilt, south-facing (north-facing for southern hemisphere)
- POA irradiance: pvlib `get_total_irradiance`, Hay-Davies model
- Row shading: pvlib `shaded_fraction1d`
- GCR = panel width / row spacing

---

## Versions

| Version | Status |
|---|---|
| v1.0 | Stable — power comparison, 2D animation, PDF/CSV |
| v1.1 | Current — irradiance comparison (Fixed / No BT / BT) |

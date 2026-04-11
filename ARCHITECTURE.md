# Architecture

## Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, pvlib, pandas, pydantic |
| Frontend | HTML, CSS, JavaScript, Chart.js, jsPDF |
| Deployment | Render (backend), static file (frontend) |

---

## Project Structure

```
backend/
  requirements.txt
  app/
    main.py               FastAPI app entry point, CORS config
    models.py             SimulationRequest, SimulationPoint, SimulationResponse
    api/
      routes.py           POST /simulate/day, POST /simulate/day.csv, GET /health
    services/
      solar.py            Solar position (pvlib solarposition)
      tracker.py          Single-axis tracking angles + fixed-panel POA irradiance
      shading.py          Ground shadow geometry, row shading fraction
      shading_demo.py     Full simulation loop: combines tracker + shading + POA

frontend/
  index.html              UI layout, form inputs, chart canvases, KPI cards
  styles.css              Responsive layout, light theme, mobile breakpoints
  app.js                  Simulation fetch, Chart.js charts, 2D canvas animation,
                          PDF export (jsPDF), CSV download, timezone search
```

---

## Simulation Flow

```
SimulationRequest (latitude, longitude, timezone, date, panel geometry, max_angle, backtracking)
    │
    ▼
tracker.py — get_tracker_day_profile()
    ├── pvlib solarposition (1440 minutes)
    ├── pvlib clear-sky irradiance (Ineichen)
    ├── pvlib singleaxis tracking: Ideal, Limited, Backtracking
    └── pvlib get_total_irradiance: fixed panel at latitude tilt (Hay-Davies)
    │
    ▼  List[Dict] — 1440 rows with angles, GHI/DNI/DHI, irradiance_fixed
    │
    ▼
shading_demo.py — run_full_simulation()
    ├── Ground shadow length per tracker angle
    ├── Row shading fraction (pvlib shaded_fraction1d)
    ├── POA irradiance per mode (Hay-Davies transposition)
    │     ├── No BT: limited tracker angle + shading penalty
    │     └── BT: backtracking angle + shading penalty
    └── Pass-through irradiance_fixed from tracker data
    │
    ▼  List[Dict] — 1440 rows with full simulation fields
    │
    ▼
routes.py — _build_response()
    ├── Daily irradiance totals (Wh/m²): fixed, no_bt, bt
    ├── Gain %: bt vs fixed, bt vs no_bt
    └── SimulationResponse (Pydantic validated)
```

---

## Key Models

### SimulationRequest
```
latitude, longitude, timezone, date
panel_width, panel_height, tracker_height, row_spacing
panel_efficiency, max_angle, backtracking
```

### SimulationPoint (per-minute)
```
timestamp, sun_elevation, sun_azimuth
ideal_tracker_angle, limited_tracker_angle, backtracking_angle
shadow_length_without_backtracking, shadow_length_with_backtracking
shaded_without_backtracking, shaded_with_backtracking
shading_percent_without_backtracking, shading_percent_with_backtracking
irradiance_fixed
irradiance_raw, irradiance_without_backtracking, irradiance_with_backtracking
power_without_backtracking, power_with_backtracking
selected_shadow_length, selected_shaded, selected_shading_percent, selected_power
```

### SimulationResponse (summary)
```
latitude, longitude, timezone, date, interval_minutes, total_points
daily_energy_without_backtracking, daily_energy_with_backtracking, daily_energy_gain_percent
daily_irradiance_fixed, daily_irradiance_no_bt, daily_irradiance_bt
irradiance_gain_bt_vs_fixed, irradiance_gain_bt_vs_no_bt
data: List[SimulationPoint]
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/simulate/day` | Full day simulation (JSON) |
| POST | `/api/v1/simulate/day.csv` | Full day simulation (CSV download) |

---

## Frontend Modules (app.js)

| Function | Purpose |
|---|---|
| `runSimulation()` | POST to API, update all UI |
| `buildCharts()` | Render 4 Chart.js charts |
| `draw2DScene()` | Canvas tracker animation frame |
| `updateSummary()` | Populate KPI cards |
| `downloadPdf()` | Generate and save PDF report |
| `downloadCsv()` | Trigger CSV download |

---

## GCR

```
GCR = panel_width / row_spacing
```

Used for: backtracking angle calculation, row shading fraction.  
Typical values: 0.30 – 0.45

---

## Irradiance Comparison (v1.1)

Three series compared on the chart and in daily summary:

| Series | Description |
|---|---|
| Fixed panel | Panel at latitude tilt, south-facing. No tracking. |
| Tracker No BT | POA after shading, limited tracker angle (no backtracking) |
| Tracker BT | POA after shading, backtracking tracker angle |

Fixed panel irradiance is computed vectorized in `tracker.py` using pvlib `get_total_irradiance` with `model="haydavies"`.

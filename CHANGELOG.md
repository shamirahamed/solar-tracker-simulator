# Changelog

## v1.1 (2026-04-12)

### Changed
- Replaced Power Output chart with Irradiance Comparison chart
  - Three lines: Fixed panel / Tracker No BT / Tracker BT (W/m²)
- Updated KPI cards to show daily irradiance (Wh/m²) instead of energy (kWh)
- Updated PDF report metrics: irradiance totals and gain % instead of energy
- Updated comparison summary sentence in PDF to show BT vs Fixed and BT vs No-BT gain

### Added
- Fixed-panel POA irradiance baseline in `tracker.py`
  - Panel at latitude tilt, south-facing (north-facing for southern hemisphere)
  - Computed vectorized using pvlib Hay-Davies model
- `irradiance_fixed` field in per-minute simulation data
- API response summary fields:
  - `daily_irradiance_fixed` (Wh/m²)
  - `daily_irradiance_no_bt` (Wh/m²)
  - `daily_irradiance_bt` (Wh/m²)
  - `irradiance_gain_bt_vs_fixed` (%)
  - `irradiance_gain_bt_vs_no_bt` (%)

### Fixed
- Removed duplicate `simulate_day` route in `routes.py` that caused a FastAPI conflict

---

## v1.0 (2026-03-27)

### Features
- Single-axis solar tracker simulation at 1-minute resolution (1440 points/day)
- Tracker angle modes: Ideal, Limited (max angle), Backtracking
- Inter-row shading estimation using pvlib `shaded_fraction1d`
- POA irradiance calculation using pvlib Hay-Davies transposition model
- Power output estimation: POA × panel area × efficiency
- 2D animated tracker and shadow canvas with play/pause/slider
- Charts: Tracker Angle, Solar Position, Inter-row Shadowing, Power Output
- Daily energy summary (kWh) with BT vs No-BT gain percentage
- PDF report export using jsPDF
- CSV data export
- Mobile responsive layout
- Timezone search and browser timezone detection
- Geolocation support
- Settings panel for custom API URL

# Solar Tracker Simulator Architecture

## Overview
The Solar Tracker Simulator is a web-based tool that simulates the behavior of a single-axis solar tracker over one day with minute-level resolution.

The simulator calculates solar position, tracker rotation, backtracking, shading, and estimated power output.

---

## System Components

### Backend
Technology:
- Python
- FastAPI
- pvlib
- pandas
- numpy

Responsibilities:
- Solar position calculation
- Tracker rotation calculation
- Backtracking using GCR
- Shading estimation
- Irradiance calculation
- Power estimation
- API responses for simulation results

Project structure:

backend/app/

main.py  
Entry point for FastAPI server

models.py  
Data models for API requests and responses

api/routes.py  
API endpoints

services/

solar.py  
Solar position calculations

tracker.py  
Single-axis tracking calculations

shading.py  
Row shading and shadow calculations

power.py  
Power estimation logic

---

### Frontend
Technology:
- HTML
- CSS
- JavaScript
- Canvas (2D animation)
- Chart.js

Responsibilities:
- Input parameters
- Send simulation requests to backend
- Animate tracker behavior
- Display simulation data
- Show charts and timeline

Project structure:

frontend/

index.html  
Main user interface

styles.css  
Layout and responsive design

app.js  
API calls, animation logic, charts

---

## Simulation Type

Single-axis solar tracker

Simulation resolution:
1 minute

Total data points per simulation:
1440

---

## Input Parameters

Latitude  
Longitude  
Date  
GCR (Ground Coverage Ratio)  
Maximum tracker rotation angle  
Backtracking enabled / disabled

---

## Calculation Flow

Location + Time  
→ Solar position (elevation, azimuth)

Solar angles  
→ Tracker rotation angle

Tracker rotation + GCR  
→ Backtracking adjustment

Tracker geometry  
→ Shadow length and shading

Irradiance on panel  
→ Estimated power output

## Ground Coverage Ratio (GCR)

Ground Coverage Ratio (GCR) is a key parameter used in solar tracker simulations to represent the spacing between rows of solar panels.

Definition:

GCR = Panel Width / Row Spacing

Where:

Panel Width  
The width of the solar panel row measured perpendicular to the tracker axis.

Row Spacing  
The distance between two adjacent tracker rows.

Example:

Panel width = 2.2 m  
Row spacing = 6 m  

GCR = 2.2 / 6 = 0.37

Typical GCR values in solar plants:

0.30 – 0.45

Lower GCR
→ Larger spacing between rows  
→ Less shading  
→ Higher land usage

Higher GCR
→ Rows closer together  
→ More shading risk  
→ Better land utilization

In this simulator, GCR is used for:

- Backtracking calculations
- Row shading estimation
- Tracker angle adjustment to avoid inter-row shading
---

## Main API

POST /api/v1/simulate/day

Request example:

{
  "latitude": 53.3498,
  "longitude": -6.2603,
  "date": "2026-03-09",
  "gcr": 0.4,
  "max_angle": 60,
  "backtracking": true
}

Response:

1440 rows of simulation data including:

timestamp  
sun_elevation  
sun_azimuth  
tracker_angle  
backtracking_angle  
shadow_length  
shaded  
power

---

## Frontend Workflow

User inputs parameters  
→ Frontend sends API request  
→ Backend runs simulation  
→ Frontend receives daily dataset  
→ Canvas animation visualizes tracker motion  
→ Charts display simulation trends  
→ Time slider allows timeline navigation

---

## Future Enhancements

Multi-day simulation  
Weather data integration  
3D visualization  
CSV / PDF export  
ESP32 hardware integration for real tracker control
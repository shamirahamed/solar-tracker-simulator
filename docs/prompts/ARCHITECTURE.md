# Solar Tracker Simulator – System Architecture

This document explains the internal architecture and data flow of the solar tracker simulator.

---

# System Overview

The simulator calculates the behavior of a **single axis solar tracker** for a full day.

Resolution:
1 minute (1440 data points)

The system simulates:

Solar Position → Tracker Angle → Shading → Power Output

---

# Core Simulation Flow

Step 1  
Solar position calculation

Inputs:

latitude  
longitude  
timezone  
date  

Using pvlib:

pvlib.solarposition.get_solarposition()

Outputs:

sun_elevation  
sun_azimuth  

---

Step 2  
Tracker rotation calculation

Using pvlib:

pvlib.tracking.singleaxis()

Outputs:

ideal_tracker_angle  
limited_tracker_angle  
backtracking_angle  

Definitions:

ideal_tracker_angle  
Tracker perfectly follows sun with no mechanical limits.

limited_tracker_angle  
Tracker rotation limited by mechanical constraint.

backtracking_angle  
Tracker angle adjusted to prevent row-to-row shading.

---

Step 3  
Shading calculation

Inputs:

sun_elevation  
tracker_angle  
gcr (ground coverage ratio)

Outputs:

shadow_length  
shaded  
shading_percent  

Purpose:

Estimate shading between tracker rows.

---

Step 4  
Power estimation

Inputs:

sun_elevation  
tracker_angle  
irradiance

Outputs:

irradiance  
power  

Purpose:

Estimate approximate solar power generation.

---

# Backend Architecture

Backend framework:

FastAPI

Folder structure:

backend/app/

main.py  
models.py  

api/
routes.py  

services/

solar.py  
tracker.py  
shading.py  
power.py  

Each service contains one simulation module.

---

# API Design

API prefix

/api/v1/

Endpoints:

Tracker simulation

POST /simulate/day  
POST /simulate/day.csv

Shading simulation

POST /shading/day  
POST /shading/day.csv

Power simulation

POST /power/day  
POST /power/day.csv

---

# Data Resolution

Simulation frequency

1 minute

Total rows per simulation

1440

Example output row:

timestamp  
sun_elevation  
sun_azimuth  
ideal_tracker_angle  
limited_tracker_angle  
backtracking_angle  
shadow_length  
shaded  
shading_percent  
power  

---

# Frontend Architecture

Frontend stack:

HTML  
CSS  
JavaScript  
Chart.js  

Current structure:

frontend/

index.html  
styles.css  
app.js  

---

# Frontend Data Flow

User inputs simulation parameters

↓

Frontend sends API request

↓

Backend calculates day simulation

↓

Frontend receives JSON

↓

Charts and UI update

---

# Planned Frontend Features

Tracker angle chart  
Shading chart  
Power chart  
Simulation summary cards  
Time slider  
2D solar tracker animation  

---

# Future Expansion

Weather API integration  
Multiple tracker rows simulation  
ESP32 tracker control API  
PDF report generation  
3D visualization
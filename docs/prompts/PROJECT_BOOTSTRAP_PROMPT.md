# Solar Tracker Simulator – AI Bootstrap Context

This repository contains a solar tracker simulation platform.

## Technology Stack

Backend
- Python
- FastAPI
- pvlib (solar position and tracker calculations)

Frontend
- HTML
- CSS
- JavaScript
- Chart.js for visualization

Development Environment
- GitHub Codespaces

Repository
- https://github.com/shamirahamed/solar-tracker-simulator

---

# Project Purpose

The goal of this project is to simulate the behavior of a **single-axis solar tracker system**.

The simulator calculates solar position, tracker rotation, shading effects, and estimated power generation.

The simulation operates at **1-minute resolution for a full day (1440 points)**.

---

# Current Features

Backend API:
- solar position calculation
- tracker rotation calculation
- CSV export

Frontend:
- input form
- tracker angle chart
- CSV download

Tracker output fields:

timestamp  
sun_elevation  
sun_azimuth  
ideal_tracker_angle  
limited_tracker_angle  
backtracking_angle  

---

# Planned Features

Next APIs to implement:

### Shading API

Endpoints

POST /api/v1/shading/day  
POST /api/v1/shading/day.csv

Fields

shadow_length  
shaded  
shading_percent  

---

### Power API

Endpoints

POST /api/v1/power/day  
POST /api/v1/power/day.csv

Fields

irradiance  
power  

---

### Final Simulation API

POST /api/v1/simulate/day  
POST /api/v1/simulate/day.csv

Fields

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

# Backend Structure

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

---

# Frontend Structure

frontend/

index.html  
styles.css  
app.js  

---

# Frontend Goals

Future UI features:

- tracker chart
- shading chart
- power chart
- summary cards
- time slider
- 2D tracker animation

---

# Simulation Inputs

latitude  
longitude  
timezone  
date  
gcr  
max_angle  
backtracking  

---

# Development Guidelines

- keep services modular
- keep API routes clean
- support CSV export for every API
- maintain JSON API compatibility
- frontend should consume backend APIs

---

# Expected Development Workflow

1. developer updates code
2. code pushed to GitHub
3. AI tools read repository
4. AI generates improvements
5. developer tests in Codespaces
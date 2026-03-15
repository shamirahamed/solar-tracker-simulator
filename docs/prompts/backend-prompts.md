# Backend Development Prompt

You are helping build the backend for a Solar Tracker Simulator.

Tech stack:
- Python
- FastAPI
- pvlib
- pandas
- numpy

Project structure:

backend/app/
  main.py
  models.py
  api/routes.py
  services/
    solar.py
    tracker.py
    shading.py
    power.py

Simulation inputs:

latitude  
longitude  
timezone  
date  
gcr  
max_angle  
backtracking  

Simulation flow:

Location + Time
→ Solar position (pvlib)
→ Tracker rotation (single axis)
→ Backtracking using GCR
→ Shadow length
→ Irradiance
→ Power estimation

Output dataset:

timestamp
sun_elevation
sun_azimuth
tracker_angle
backtracking_angle
shadow_length
shaded
power

Goal:
Generate FastAPI endpoints and service logic following this architecture.

Rules:
- Keep calculations inside services
- Keep routes clean
- Return JSON-friendly responses
- Use pvlib where possible
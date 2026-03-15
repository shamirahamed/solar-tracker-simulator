# Frontend Development Prompt

You are building the frontend for a Solar Tracker Simulator.

Technology:
- HTML
- CSS
- JavaScript
- Canvas (2D animation)
- Chart.js

Frontend folder:

frontend/
  index.html
  styles.css
  app.js

Frontend responsibilities:

User inputs:
- latitude
- longitude
- timezone
- date
- gcr
- max tracker angle
- backtracking

Workflow:

User inputs parameters
→ send API request
→ receive 1440 simulation points
→ animate tracker motion
→ display charts

Visualizations:

2D canvas animation
- sun position
- tracker rotation
- row shading

Charts:

- Sun elevation
- Tracker angle
- Power output

Rules:

- keep UI simple
- use responsive layout
- separate animation logic from API calls
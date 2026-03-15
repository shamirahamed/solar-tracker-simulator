# Solar Tracker Simulator – Mathematical Model

This document explains the mathematical basis used in the solar tracker simulator.

---

# 1. Solar Position Calculation

Solar position determines the location of the sun relative to the earth.

The simulator uses the pvlib library.

Function used:

pvlib.solarposition.get_solarposition()

Inputs

latitude  
longitude  
date  
timezone  

Outputs

sun_elevation (degrees)  
sun_azimuth (degrees)  

Definitions

sun_elevation  
Angle of the sun above the horizon.

sun_azimuth  
Compass direction of the sun measured clockwise from north.

---

# 2. Tracker Rotation Model

Tracker rotation follows the sun position.

Function used

pvlib.tracking.singleaxis()

Inputs

apparent_zenith  
apparent_azimuth  
axis_tilt  
axis_azimuth  
max_angle  
gcr  
backtrack  

Outputs

tracker_theta

This value represents the tracker rotation angle.

---

# 3. Ideal Tracker Angle

Ideal tracking assumes no mechanical limits.

tracker_angle = tracker_theta

Range

-90° to +90°

---

# 4. Limited Tracker Angle

Real trackers have mechanical limits.

limited_tracker_angle = clamp(tracker_theta, -max_angle, +max_angle)

Example

max_angle = 60°

tracker_angle cannot exceed ±60°

---

# 5. Backtracking Model

Backtracking prevents shading between tracker rows.

It adjusts the tracker angle when the sun is low.

Inputs

sun elevation  
tracker rotation  
GCR  

Definition

GCR = module_width / row_spacing

Higher GCR means trackers are closer together.

Backtracking reduces tilt to prevent row-to-row shadow overlap.

---

# 6. Shadow Length Estimation

Shadow length depends on sun elevation.

Basic formula

shadow_length = module_height / tan(sun_elevation)

Where

sun_elevation is measured in radians.

Low sun elevation produces long shadows.

---

# 7. Shading Percentage

Shading occurs when shadow length exceeds row spacing.

If

shadow_length > row_spacing

then shading occurs.

Shading percentage can be approximated as

shading_percent = shadow_length / row_spacing

Limited to a maximum of 100%.

---

# 8. Irradiance Model

Solar irradiance can be estimated using clear sky models.

Example model

I = I0 × sin(sun_elevation)

Where

I0 = maximum irradiance

Typical clear sky value

I0 ≈ 1000 W/m²

---

# 9. Power Estimation

Power output depends on irradiance and panel efficiency.

Basic formula

power = irradiance × panel_area × efficiency

Example

panel_area = 2 m²  
efficiency = 0.20  

power = irradiance × 2 × 0.20

---

# 10. Simulation Resolution

Simulation frequency

1 minute

Total samples per day

1440

Each output row represents the system state at one minute.

---

# 11. Example Output Row

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

# 12. Model Limitations

This simulator uses simplified models.

Assumptions

clear sky conditions  
no terrain shading  
uniform panel rows  
constant panel efficiency  

Future versions may include

weather API  
cloud cover  
temperature effects  
multiple tracker rows  
3D shading simulation
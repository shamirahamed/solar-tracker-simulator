# Simulator Logic Prompt

You are designing a solar tracker simulator.

System type:
Single-axis tracker

Simulation resolution:
1 minute for 1 day (1440 points)

Inputs:

latitude
longitude
timezone
date
gcr
max_angle
backtracking

Calculation flow:

Solar position
→ tracker rotation
→ backtracking
→ shading
→ irradiance
→ power

Goal:

Generate accurate simulation logic for a solar tracker system.
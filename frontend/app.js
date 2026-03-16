const API_BASE = "https://organic-space-eureka-6rrg9vx496r2r5qx-8000.app.github.dev/api/v1";

const form = document.getElementById("simulation-form");
const downloadCsvBtn = document.getElementById("download-csv");
const preview = document.getElementById("preview");

const anglesCtx = document.getElementById("anglesChart").getContext("2d");
const sunCtx = document.getElementById("sunChart").getContext("2d");
const shadingCtx = document.getElementById("shadingChart").getContext("2d");
const powerCtx = document.getElementById("powerChart").getContext("2d");

let anglesChart = null;
let sunChart = null;
let shadingChart = null;
let powerChart = null;

function getPayload() {
  return {
    latitude: parseFloat(document.getElementById("latitude").value),
    longitude: parseFloat(document.getElementById("longitude").value),
    timezone: document.getElementById("timezone").value,
    date: document.getElementById("date").value,
    panel_width: parseFloat(document.getElementById("panel_width").value),
    panel_height: parseFloat(document.getElementById("panel_height").value),
    row_spacing: parseFloat(document.getElementById("row_spacing").value),
    panel_efficiency: parseFloat(document.getElementById("panel_efficiency").value),
    max_angle: parseFloat(document.getElementById("max_angle").value),
    backtracking: document.getElementById("backtracking").checked
  };
}

function formatTimeLabel(timestamp) {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function updateSummary(data) {
  const maxIdeal = Math.max(...data.map(d => d.ideal_tracker_angle));
  const maxLimited = Math.max(...data.map(d => d.limited_tracker_angle));
  const maxBack = Math.max(...data.map(d => d.backtracking_angle));
  const maxSun = Math.max(...data.map(d => d.sun_elevation));
  const maxAzimuth = Math.max(...data.map(d => d.sun_azimuth));
  const maxShadow = Math.max(...data.map(d => d.shadow_length));
  const maxShading = Math.max(...data.map(d => d.shading_percent));
  const maxPower = Math.max(...data.map(d => d.power_with_backtracking));

  document.getElementById("maxIdeal").textContent = maxIdeal.toFixed(1) + "°";
  document.getElementById("maxLimited").textContent = maxLimited.toFixed(1) + "°";
  document.getElementById("maxBacktracking").textContent = maxBack.toFixed(1) + "°";
  document.getElementById("maxSun").textContent = maxSun.toFixed(1) + "°";
  document.getElementById("maxAzimuth").textContent = maxAzimuth.toFixed(1) + "°";
  document.getElementById("maxShadow").textContent = maxShadow.toFixed(2) + " m";
  document.getElementById("maxShading").textContent = maxShading.toFixed(1) + "%";
  document.getElementById("maxPower").textContent = maxPower.toFixed(1) + " W";
}

function destroyCharts() {
  if (anglesChart) anglesChart.destroy();
  if (sunChart) sunChart.destroy();
  if (shadingChart) shadingChart.destroy();
  if (powerChart) powerChart.destroy();
}

function buildCharts(data) {
  const labels = data.map(row => formatTimeLabel(row.timestamp));

  const ideal = data.map(row => row.ideal_tracker_angle);
  const limited = data.map(row => row.limited_tracker_angle);
  const backtracking = data.map(row => row.backtracking_angle);

  const sunElevation = data.map(row => row.sun_elevation);
  const sunAzimuth = data.map(row => row.sun_azimuth);

  const shadowLength = data.map(row => row.shadow_length);
  const shadingPercent = data.map(row => row.shading_percent);

  const powerWithout = data.map(row => row.power_without_backtracking);
  const powerWith = data.map(row => row.power_with_backtracking);

  destroyCharts();

  anglesChart = new Chart(anglesCtx, {
    type: "line",
    data: { labels, datasets: [
      { label: "Ideal Tracker Angle", data: ideal, borderWidth: 1.5, pointRadius: 0 },
      { label: "Limited Tracker Angle", data: limited, borderWidth: 1.5, pointRadius: 0 },
      { label: "Backtracking Angle", data: backtracking, borderWidth: 1.5, pointRadius: 0 }
    ]},
    options: { responsive: true, interaction: { mode: "index", intersect: false },
      scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: "Angle (deg)" } } } }
  });

  sunChart = new Chart(sunCtx, {
    type: "line",
    data: { labels, datasets: [
      { label: "Sun Elevation", data: sunElevation, borderWidth: 1.5, pointRadius: 0 },
      { label: "Sun Azimuth", data: sunAzimuth, borderWidth: 1.5, pointRadius: 0 }
    ]},
    options: { responsive: true, interaction: { mode: "index", intersect: false },
      scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: "Sun Angle (deg)" } } } }
  });

  shadingChart = new Chart(shadingCtx, {
    type: "line",
    data: { labels, datasets: [
      { label: "Shadow Length", data: shadowLength, borderWidth: 1.5, pointRadius: 0, yAxisID: "y" },
      { label: "Shading %", data: shadingPercent, borderWidth: 1.5, pointRadius: 0, yAxisID: "y1" }
    ]},
    options: { responsive: true, interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { type: "linear", position: "left", title: { display: true, text: "Shadow Length (m)" } },
        y1: { type: "linear", position: "right", title: { display: true, text: "Shading (%)" }, grid: { drawOnChartArea: false } }
      } }
  });

  powerChart = new Chart(powerCtx, {
    type: "line",
    data: { labels, datasets: [
      { label: "Power Without Backtracking", data: powerWithout, borderWidth: 1.5, pointRadius: 0 },
      { label: "Power With Backtracking", data: powerWith, borderWidth: 1.5, pointRadius: 0 }
    ]},
    options: { responsive: true, interaction: { mode: "index", intersect: false },
      scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: "Power (W)" } } } }
  });
}

async function runSimulation() {
  const payload = getPayload();
  preview.textContent = "Loading simulation...";

  try {
    const response = await fetch(`${API_BASE}/simulate/day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      preview.textContent = `API Error:\n${errorText}`;
      return;
    }

    const result = await response.json();

    preview.textContent = JSON.stringify(
      {
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone,
        date: result.date,
        total_points: result.total_points,
        first_row: result.data[0],
        midday_row: result.data[720]
      },
      null,
      2
    );

    updateSummary(result.data);
    buildCharts(result.data);

  } catch (error) {
    preview.textContent = `Request failed:\n${error.message}`;
  }
}

async function downloadCsv() {
  const payload = getPayload();

  try {
    const response = await fetch(`${API_BASE}/simulate/day.csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      preview.textContent = `CSV Error:\n${errorText}`;
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulation_${payload.date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    preview.textContent = `CSV download failed:\n${error.message}`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSimulation();
});

downloadCsvBtn.addEventListener("click", async () => {
  await downloadCsv();
});

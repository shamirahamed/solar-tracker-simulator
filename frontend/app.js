const API_BASE = "https://organic-space-eureka-6rrg9vx496r2r5qx-8000.app.github.dev/api/v1";
const form = document.getElementById("simulation-form");
const downloadCsvBtn = document.getElementById("download-csv");
const getLocationBtn = document.getElementById("getLocation");
const preview = document.getElementById("preview");

const anglesCtx = document.getElementById("anglesChart").getContext("2d");
const sunCtx = document.getElementById("sunChart").getContext("2d");
const shadingCtx = document.getElementById("shadingChart").getContext("2d");
const powerCtx = document.getElementById("powerChart").getContext("2d");

let anglesChart = null;
let sunChart = null;
let shadingChart = null;
let powerChart = null;

function showPopup(message, type = "info", timeout = 4000) {
  const el = document.getElementById("statusPopup");
  if (!el) return;

  el.textContent = message;
  el.className = `status-popup ${type}`;

  setTimeout(() => {
    el.className = "status-popup hidden";
  }, timeout);
}

function loadTimezones() {
  const tzSelect = document.getElementById("timezone");
  tzSelect.innerHTML = "";

  let timezones = [];
  if (typeof Intl.supportedValuesOf === "function") {
    timezones = Intl.supportedValuesOf("timeZone");
  } else {
    timezones = [
      "UTC",
      "Europe/Dublin",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Singapore",
      "Asia/Tokyo",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Australia/Sydney"
    ];
  }

  timezones.forEach(tz => {
    const option = document.createElement("option");
    option.value = tz;
    option.textContent = tz;
    tzSelect.appendChild(option);
  });

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (browserTz && timezones.includes(browserTz)) {
    tzSelect.value = browserTz;
  } else if (timezones.includes("Europe/Dublin")) {
    tzSelect.value = "Europe/Dublin";
  }
}

function restoreSavedInputs() {
  const saved = localStorage.getItem("solarInputs");
  if (!saved) return;

  const data = JSON.parse(saved);
  Object.keys(data).forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;

    if (el.type === "checkbox") {
      el.checked = !!data[key];
    } else {
      el.value = data[key];
    }
  });
}

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

function updateSummary(result) {
  const data = result.data;

  document.getElementById("maxIdeal").textContent =
    Math.max(...data.map(d => d.ideal_tracker_angle)).toFixed(1) + "°";

  document.getElementById("maxLimited").textContent =
    Math.max(...data.map(d => d.limited_tracker_angle)).toFixed(1) + "°";

  document.getElementById("maxBacktracking").textContent =
    Math.max(...data.map(d => d.backtracking_angle)).toFixed(1) + "°";

  document.getElementById("maxSun").textContent =
    Math.max(...data.map(d => d.sun_elevation)).toFixed(1) + "°";

  document.getElementById("maxAzimuth").textContent =
    Math.max(...data.map(d => d.sun_azimuth)).toFixed(1) + "°";

  document.getElementById("maxShadowWithout").textContent =
    Math.max(...data.map(d => d.shadow_length_without_backtracking)).toFixed(2) + " m";

  document.getElementById("maxShadowWith").textContent =
    Math.max(...data.map(d => d.shadow_length_with_backtracking)).toFixed(2) + " m";

  document.getElementById("maxPowerWithout").textContent =
    Math.max(...data.map(d => d.power_without_backtracking)).toFixed(1) + " W";

  document.getElementById("maxPowerWith").textContent =
    Math.max(...data.map(d => d.power_with_backtracking)).toFixed(1) + " W";

  document.getElementById("energyNo").textContent =
    result.daily_energy_without_backtracking.toFixed(3) + " kWh";

  document.getElementById("energyBt").textContent =
    result.daily_energy_with_backtracking.toFixed(3) + " kWh";

  document.getElementById("energyGain").textContent =
    result.daily_energy_gain_percent.toFixed(2) + "%";
}

function destroyCharts() {
  if (anglesChart) anglesChart.destroy();
  if (sunChart) sunChart.destroy();
  if (shadingChart) shadingChart.destroy();
  if (powerChart) powerChart.destroy();
}

function chartBaseOptions(yText) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        align: "start",
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 8,
          font: { size: 11 }
        }
      }
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 12 }
      },
      y: {
        title: {
          display: true,
          text: yText
        }
      }
    }
  };
}

function buildCharts(data) {
  const labels = data.map(row => formatTimeLabel(row.timestamp));

  destroyCharts();

  anglesChart = new Chart(anglesCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ideal Tracker Angle", data: data.map(r => r.ideal_tracker_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Limited Tracker Angle", data: data.map(r => r.limited_tracker_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Backtracking Angle", data: data.map(r => r.backtracking_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
      ]
    },
    options: chartBaseOptions("Angle (deg)")
  });

  sunChart = new Chart(sunCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Sun Elevation", data: data.map(r => r.sun_elevation), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Sun Azimuth", data: data.map(r => r.sun_azimuth), borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
      ]
    },
    options: chartBaseOptions("Sun Angle (deg)")
  });

  shadingChart = new Chart(shadingCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Shadow Without Backtracking",
          data: data.map(r => r.shadow_length_without_backtracking),
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          yAxisID: "y"
        },
        {
          label: "Shadow With Backtracking",
          data: data.map(r => r.shadow_length_with_backtracking),
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          yAxisID: "y"
        },
        {
          label: "Shading % Without Backtracking",
          data: data.map(r => r.shading_percent_without_backtracking),
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          yAxisID: "y1"
        },
        {
          label: "Shading % With Backtracking",
          data: data.map(r => r.shading_percent_with_backtracking),
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 8,
            font: { size: 11 }
          }
        }
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 12 }
        },
        y: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Shadow Length (m)" }
        },
        y1: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Shading (%)" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  powerChart = new Chart(powerCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Power Without Backtracking", data: data.map(r => r.power_without_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Power With Backtracking", data: data.map(r => r.power_with_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
      ]
    },
    options: chartBaseOptions("Power (W)")
  });
}

async function runSimulation() {
  const payload = getPayload();
  localStorage.setItem("solarInputs", JSON.stringify(payload));
  preview.textContent = "Loading simulation...";
  showPopup("Running simulation...", "info", 2000);

  try {
    const response = await fetch(`${API_BASE}/simulate/day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();

      if (response.status === 429) {
        showPopup("Server limit reached. Please try again later.", "error");
      } else if (response.status >= 500) {
        showPopup("Simulation server error. Please try later.", "error");
      } else {
        showPopup("API request failed. Check inputs or API URL.", "error");
      }

      preview.textContent = `API Error:\n${text}`;
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
        daily_energy_without_backtracking: result.daily_energy_without_backtracking,
        daily_energy_with_backtracking: result.daily_energy_with_backtracking,
        daily_energy_gain_percent: result.daily_energy_gain_percent,
        first_row: result.data[0],
        midday_row: result.data[720]
      },
      null,
      2
    );

    updateSummary(result);
    buildCharts(result.data);
    showPopup("Simulation completed successfully.", "success");
  } catch (error) {
    showPopup("Unable to connect to simulation server.", "error");
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
      if (response.status === 429) {
        showPopup("CSV request limit reached. Please try later.", "error");
      } else {
        showPopup("CSV download failed.", "error");
      }
      preview.textContent = `CSV Error:\n${await response.text()}`;
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
    showPopup("CSV downloaded successfully.", "success");
  } catch (error) {
    showPopup("CSV download failed. Server may be unavailable.", "error");
    preview.textContent = `CSV download failed:\n${error.message}`;
  }
}

function setupLocationButton() {
  getLocationBtn.addEventListener("click", function () {
    if (!navigator.geolocation) {
      showPopup("Geolocation is not supported on this browser.", "error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        document.getElementById("latitude").value = position.coords.latitude.toFixed(4);
        document.getElementById("longitude").value = position.coords.longitude.toFixed(4);
        showPopup("Location detected successfully.", "success");
      },
      function () {
        showPopup("Unable to retrieve location.", "error");
      }
    );
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSimulation();
});

downloadCsvBtn.addEventListener("click", async () => {
  await downloadCsv();
});

window.onload = function () {
  loadTimezones();
  restoreSavedInputs();
  setupLocationButton();
};

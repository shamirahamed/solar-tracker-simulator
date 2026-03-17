const API_BASE = "https://organic-space-eureka-6rrg9vx496r2r5qx-8000.app.github.dev/api/v1";


let form;
let downloadCsvBtn;
let preview;

let timezoneSelect;
let locationBtn;
let latitudeInput;
let longitudeInput;

let anglesCtx;
let sunCtx;
let shadingCtx;
let powerCtx;

let anglesChart = null;
let sunChart = null;
let shadingChart = null;
let powerChart = null;

function populateTimezoneDropdown() {
  if (!timezoneSelect) return;

  timezoneSelect.innerHTML = "";

  let timezones = [];

  if (typeof Intl.supportedValuesOf === "function") {
    timezones = Intl.supportedValuesOf("timeZone");
    timezones.sort();
  } else {
    timezones = [
      "UTC",
      "Africa/Cairo",
      "Africa/Johannesburg",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/New_York",
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Australia/Sydney",
      "Europe/Berlin",
      "Europe/Dublin",
      "Europe/London",
      "Europe/Paris",
      "Pacific/Auckland"
    ];
  }

  timezones.forEach((tz) => {
    const option = document.createElement("option");
    option.value = tz;
    option.textContent = tz;
    timezoneSelect.appendChild(option);
  });
}

function setBrowserTimezone() {
  if (!timezoneSelect) return;

  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const exists = Array.from(timezoneSelect.options).some(
    (option) => option.value === browserTimezone
  );

  if (exists) {
    timezoneSelect.value = browserTimezone;
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    if (preview) preview.textContent = "Geolocation is not supported by this browser.";
    return;
  }

  if (preview) preview.textContent = "Getting location...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(6);
      const lon = position.coords.longitude.toFixed(6);

      if (latitudeInput) latitudeInput.value = lat;
      if (longitudeInput) longitudeInput.value = lon;

      setBrowserTimezone();

      if (preview) {
        preview.textContent =
          `Location detected successfully.\nLatitude: ${lat}\nLongitude: ${lon}\nTimezone: ${timezoneSelect ? timezoneSelect.value : ""}`;
      }
    },
    (error) => {
      if (preview) {
        preview.textContent = `Location error:\n${error.message}`;
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
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

function buildCharts(data) {
  const labels = data.map(row => formatTimeLabel(row.timestamp));

  destroyCharts();

  anglesChart = new Chart(anglesCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ideal Tracker Angle", data: data.map(r => r.ideal_tracker_angle), borderWidth: 1.5, pointRadius: 0 },
        { label: "Limited Tracker Angle", data: data.map(r => r.limited_tracker_angle), borderWidth: 1.5, pointRadius: 0 },
        { label: "Backtracking Angle", data: data.map(r => r.backtracking_angle), borderWidth: 1.5, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 8,
            font: { size: 8 }
          }
        }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { title: { display: true, text: "Angle (deg)" } }
      }
    }
  });

  sunChart = new Chart(sunCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Sun Elevation", data: data.map(r => r.sun_elevation), borderWidth: 1.5, pointRadius: 0 },
        { label: "Sun Azimuth", data: data.map(r => r.sun_azimuth), borderWidth: 1.5, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 8,
            font: { size: 8 }
          }
        }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { title: { display: true, text: "Sun Angle (deg)" } }
      }
    }
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
          yAxisID: "y"
        },
        {
          label: "Shadow With Backtracking",
          data: data.map(r => r.shadow_length_with_backtracking),
          borderWidth: 1.5,
          pointRadius: 0,
          yAxisID: "y"
        },
        {
          label: "Shading % Without Backtracking",
          data: data.map(r => r.shading_percent_without_backtracking),
          borderWidth: 1.5,
          pointRadius: 0,
          yAxisID: "y1"
        },
        {
          label: "Shading % With Backtracking",
          data: data.map(r => r.shading_percent_with_backtracking),
          borderWidth: 1.5,
          pointRadius: 0,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 8,
            font: { size: 8 }
          }
        }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
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
        { label: "Power Without Backtracking", data: data.map(r => r.power_without_backtracking), borderWidth: 1.5, pointRadius: 0 },
        { label: "Power With Backtracking", data: data.map(r => r.power_with_backtracking), borderWidth: 1.5, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 8,
            font: { size: 8 }
          }
        }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { title: { display: true, text: "Power (W)" } }
      }
    }
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
      preview.textContent = `API Error:\n${await response.text()}`;
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
  } catch (error) {
    preview.textContent = `CSV download failed:\n${error.message}`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  form = document.getElementById("simulation-form");
  downloadCsvBtn = document.getElementById("download-csv");
  preview = document.getElementById("preview");

  timezoneSelect = document.getElementById("timezone");
  locationBtn = document.getElementById("locationBtn");
  latitudeInput = document.getElementById("latitude");
  longitudeInput = document.getElementById("longitude");

  const anglesCanvas = document.getElementById("anglesChart");
  const sunCanvas = document.getElementById("sunChart");
  const shadingCanvas = document.getElementById("shadingChart");
  const powerCanvas = document.getElementById("powerChart");

  if (anglesCanvas) anglesCtx = anglesCanvas.getContext("2d");
  if (sunCanvas) sunCtx = sunCanvas.getContext("2d");
  if (shadingCanvas) shadingCtx = shadingCanvas.getContext("2d");
  if (powerCanvas) powerCtx = powerCanvas.getContext("2d");

  populateTimezoneDropdown();
  setBrowserTimezone();

  if (locationBtn) {
    locationBtn.addEventListener("click", useMyLocation);
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await runSimulation();
    });
  }

  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener("click", async () => {
      await downloadCsv();
    });
  }
});
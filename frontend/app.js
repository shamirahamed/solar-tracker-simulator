
const DEFAULT_API_BASE = "https://YOUR-8000-URL.app.github.dev/api/v1";
let API_BASE = DEFAULT_API_BASE;

const form = document.getElementById("simulation-form");
const downloadCsvBtn = document.getElementById("download-csv");
const getLocationBtn = document.getElementById("getLocation");
const preview = document.getElementById("preview");

const apiUrlInput = document.getElementById("api_url");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const saveApiBtn = document.getElementById("save-api-url");
const resetApiBtn = document.getElementById("reset-api-url");
const closeSettingsBtn = document.getElementById("close-settings");

const anglesCtx = document.getElementById("anglesChart")?.getContext("2d");
const sunCtx = document.getElementById("sunChart")?.getContext("2d");
const shadingCtx = document.getElementById("shadingChart")?.getContext("2d");
const powerCtx = document.getElementById("powerChart")?.getContext("2d");

const trackerCanvas = document.getElementById("tracker2dCanvas");
const tracker2dCtx = trackerCanvas?.getContext("2d");
const timeSlider = document.getElementById("timeSlider");
const timeLabel = document.getElementById("timeLabel");
const play2dBtn = document.getElementById("play2d");
const pause2dBtn = document.getElementById("pause2d");

let anglesChart = null;
let sunChart = null;
let shadingChart = null;
let powerChart = null;

let latestSimulationData = [];
let playTimer = null;

function showPopup(message, type = "info", timeout = 4500) {
  const el = document.getElementById("statusPopup");
  if (!el) return;
  el.textContent = message;
  el.className = `status-popup ${type}`;
  setTimeout(() => {
    el.className = "status-popup hidden";
  }, timeout);
}

function initApiBase() {
  const savedApi = localStorage.getItem("api_url");
  API_BASE = savedApi || DEFAULT_API_BASE;
  if (apiUrlInput) apiUrlInput.value = API_BASE;
}

function openSettings() {
  if (settingsPanel) settingsPanel.classList.remove("hidden");
}

function closeSettings() {
  if (settingsPanel) settingsPanel.classList.add("hidden");
}

function setupSettingsButtons() {
  if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", closeSettings);

  if (saveApiBtn) {
    saveApiBtn.addEventListener("click", () => {
      const value = apiUrlInput?.value?.trim();
      if (!value) {
        showPopup("Please enter a valid API URL in Settings.", "error");
        return;
      }
      API_BASE = value;
      localStorage.setItem("api_url", value);
      showPopup("API URL saved successfully.", "success");
      closeSettings();
    });
  }

  if (resetApiBtn) {
    resetApiBtn.addEventListener("click", () => {
      API_BASE = DEFAULT_API_BASE;
      if (apiUrlInput) apiUrlInput.value = DEFAULT_API_BASE;
      localStorage.removeItem("api_url");
      showPopup("API URL reset to default.", "success");
    });
  }
}

function loadTimezones() {
  const tzSelect = document.getElementById("timezone");
  if (!tzSelect) return;

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

  timezones.forEach((tz) => {
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
  Object.keys(data).forEach((key) => {
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
    tracker_height: parseFloat(document.getElementById("tracker_height").value),
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
  const data = result.data || [];

  document.getElementById("maxIdeal").textContent =
    Math.max(...data.map((d) => d.ideal_tracker_angle), 0).toFixed(1) + "°";
  document.getElementById("maxLimited").textContent =
    Math.max(...data.map((d) => d.limited_tracker_angle), 0).toFixed(1) + "°";
  document.getElementById("maxBacktracking").textContent =
    Math.max(...data.map((d) => d.backtracking_angle), 0).toFixed(1) + "°";
  document.getElementById("maxSun").textContent =
    Math.max(...data.map((d) => d.sun_elevation), 0).toFixed(1) + "°";
  document.getElementById("maxAzimuth").textContent =
    Math.max(...data.map((d) => d.sun_azimuth), 0).toFixed(1) + "°";
  document.getElementById("maxShadowWithout").textContent =
    Math.max(...data.map((d) => d.shadow_length_without_backtracking), 0).toFixed(2) + " m";
  document.getElementById("maxShadowWith").textContent =
    Math.max(...data.map((d) => d.shadow_length_with_backtracking), 0).toFixed(2) + " m";
  document.getElementById("maxPowerWithout").textContent =
    Math.max(...data.map((d) => d.power_without_backtracking), 0).toFixed(1) + " W";
  document.getElementById("maxPowerWith").textContent =
    Math.max(...data.map((d) => d.power_with_backtracking), 0).toFixed(1) + " W";

  document.getElementById("energyNo").textContent =
    Number(result.daily_energy_without_backtracking || 0).toFixed(3) + " kWh";
  document.getElementById("energyBt").textContent =
    Number(result.daily_energy_with_backtracking || 0).toFixed(3) + " kWh";
  document.getElementById("energyGain").textContent =
    Number(result.daily_energy_gain_percent || 0).toFixed(2) + "%";
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
      x: { ticks: { maxTicksLimit: 12 } },
      y: { title: { display: true, text: yText } }
    }
  };
}

function buildCharts(data) {
  if (!anglesCtx || !sunCtx || !shadingCtx || !powerCtx) return;

  const labels = data.map((row) => formatTimeLabel(row.timestamp));
  destroyCharts();

  anglesChart = new Chart(anglesCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ideal Tracker Angle", data: data.map((r) => r.ideal_tracker_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Limited Tracker Angle", data: data.map((r) => r.limited_tracker_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Backtracking Angle", data: data.map((r) => r.backtracking_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
      ]
    },
    options: chartBaseOptions("Angle (deg)")
  });

  sunChart = new Chart(sunCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Sun Elevation", data: data.map((r) => r.sun_elevation), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Sun Azimuth", data: data.map((r) => r.sun_azimuth), borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
      ]
    },
    options: chartBaseOptions("Sun Angle (deg)")
  });

  shadingChart = new Chart(shadingCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Shadow Without Backtracking", data: data.map((r) => r.shadow_length_without_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: "y" },
        { label: "Shadow With Backtracking", data: data.map((r) => r.shadow_length_with_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: "y" },
        { label: "Shading % Without Backtracking", data: data.map((r) => r.shading_percent_without_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: "y1" },
        { label: "Shading % With Backtracking", data: data.map((r) => r.shading_percent_with_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: "y1" }
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
          labels: { boxWidth: 12, boxHeight: 12, padding: 8, font: { size: 11 } }
        }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { type: "linear", position: "left", title: { display: true, text: "Shadow Length (m)" } },
        y1: { type: "linear", position: "right", title: { display: true, text: "Shading (%)" }, grid: { drawOnChartArea: false } }
      }
    }
  });

  powerChart = new Chart(powerCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Power Without Backtracking", data: data.map((r) => r.power_without_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
        { label: "Power With Backtracking", data: data.map((r) => r.power_with_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
      ]
    },
    options: chartBaseOptions("Power (W)")
  });
}

function resizeTrackerCanvas() {
  if (!trackerCanvas || !tracker2dCtx) return null;

  const wrap = document.querySelector(".tracker-canvas-wrap");
  if (!wrap) return null;

  const dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();

  trackerCanvas.width = Math.floor(rect.width * dpr);
  trackerCanvas.height = Math.floor(rect.height * dpr);
  trackerCanvas.style.width = `${rect.width}px`;
  trackerCanvas.style.height = `${rect.height}px`;

  tracker2dCtx.setTransform(1, 0, 0, 1, 0, 0);
  tracker2dCtx.scale(dpr, dpr);

  return { width: rect.width, height: rect.height };
}

function drawPanelAt(ctx, pivotX, pivotY, angleRad, panelLength, color, label, groundY) {
  const x1 = pivotX - Math.cos(angleRad) * panelLength / 2;
  const y1 = pivotY - Math.sin(angleRad) * panelLength / 2;
  const x2 = pivotX + Math.cos(angleRad) * panelLength / 2;
  const y2 = pivotY + Math.sin(angleRad) * panelLength / 2;

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pivotX, groundY);
  ctx.lineTo(pivotX, pivotY);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.fillText(label, pivotX - 22, pivotY - 10);
}

function draw2DScene(row) {
  if (!trackerCanvas || !tracker2dCtx) return;

  const size = resizeTrackerCanvas();
  if (!size) return;

  const width = size.width;
  const height = size.height;
  const ctx = tracker2dCtx;

  ctx.clearRect(0, 0, width, height);
  ctx.font = width < 500 ? "12px Arial" : "14px Arial";

  const groundY = Math.floor(height * 0.78);

  ctx.strokeStyle = "#444";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, groundY);
  ctx.lineTo(width - 20, groundY);
  ctx.stroke();
  ctx.fillStyle = "#475569";
  ctx.fillText("Ground", 24, groundY - 8);

  const trackerHeightM = parseFloat(document.getElementById("tracker_height").value) || 1.5;
  const rowSpacingM = parseFloat(document.getElementById("row_spacing").value) || 5.5;
  const panelWidthM = parseFloat(document.getElementById("panel_width").value) || 2;

  const mastHeightPx = Math.max(35, trackerHeightM * (width < 500 ? 24 : 32));
  const spacingPx = Math.max(90, rowSpacingM * (width < 500 ? 14 : 20));
  const panelLength = Math.min(width < 500 ? 90 : 130, Math.max(70, panelWidthM * (width < 500 ? 28 : 45)));

  const centerX = width / 2;
  const mast1X = centerX - spacingPx / 2;
  const mast2X = centerX + spacingPx / 2;
  const centerLineX = (mast1X + mast2X) / 2;
  const pivotY = groundY - mastHeightPx;

  const useBacktracking = document.getElementById("backtracking").checked;
  const trackerAngle = useBacktracking
    ? (row?.backtracking_angle || 0)
    : (row?.limited_tracker_angle || 0);
  const angleRad = -(trackerAngle * Math.PI / 180);

  drawPanelAt(ctx, mast1X, pivotY, angleRad, panelLength, "#2563eb", "Panel A", groundY);
  drawPanelAt(ctx, mast2X, pivotY, angleRad, panelLength, "#1d4ed8", "Panel B", groundY);

  const elevation = Math.max(0, row?.sun_elevation || 0);
  const azimuth = row?.sun_azimuth || 180;
  const hasSun = elevation > 0;

  if (hasSun) {
    const minX = width * 0.15;
    const maxX = width * 0.85;
    const azNorm = Math.max(0, Math.min(1, (azimuth - 90) / 180));
    const sunX = minX + azNorm * (maxX - minX);

    const elNorm = Math.max(0, Math.min(1, elevation / 90));
    const sunY = groundY - 80 - elNorm * (width < 500 ? 140 : 200);

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(sunX, sunY, width < 500 ? 10 : 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#92400e";
    ctx.fillText("Sun", sunX - 10, sunY - 14);

    //ctx.strokeStyle = "orange";
    //ctx.lineWidth = 2;
    //ctx.beginPath();
    //ctx.moveTo(sunX, sunY);
    //ctx.lineTo(centerLineX, pivotY);
    //ctx.stroke();

    const shadowLen = useBacktracking
      ? (row?.shadow_length_with_backtracking || 0)
      : (row?.shadow_length_without_backtracking || 0);

    const shadowPx = shadowLen * (width < 500 ? 12 : 18);
    const sunOnLeft = sunX < centerLineX;

    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(centerLineX, groundY);
    if (sunOnLeft) {
      ctx.lineTo(centerLineX + shadowPx, groundY);
    } else {
      ctx.lineTo(centerLineX - shadowPx, groundY);
    }
    ctx.stroke();

    if (sunOnLeft && centerLineX + shadowPx > mast2X - panelLength / 2) {
      ctx.fillStyle = "rgba(220, 38, 38, 0.12)";
      ctx.fillRect(mast2X - panelLength / 2 - 6, pivotY - 16, panelLength + 12, 30);
      ctx.fillStyle = "#b91c1c";
      ctx.fillText("Shading", mast2X - 24, pivotY - 22);
    }

    if (!sunOnLeft && centerLineX - shadowPx < mast1X + panelLength / 2) {
      ctx.fillStyle = "rgba(220, 38, 38, 0.12)";
      ctx.fillRect(mast1X - panelLength / 2 - 6, pivotY - 16, panelLength + 12, 30);
      ctx.fillStyle = "#b91c1c";
      ctx.fillText("Shading", mast1X - 24, pivotY - 22);
    }
  } else {
    ctx.fillStyle = "#475569";
    ctx.fillText("Night / No Sun", width - 120, 28);
  }

  ctx.fillStyle = "#000";
  ctx.font = width < 500 ? "11px Arial" : "13px Arial";
  ctx.fillText("Time: " + formatTimeLabel(row?.timestamp || new Date().toISOString()), 20, 24);
  ctx.fillText("Sun Elevation: " + Number(elevation).toFixed(1) + "°", 20, 42);
  ctx.fillText("Tracker Angle: " + Number(trackerAngle).toFixed(1) + "°", 20, 60);

  const shownShadow = useBacktracking
    ? (row?.shadow_length_with_backtracking || 0)
    : (row?.shadow_length_without_backtracking || 0);

  ctx.fillText("Shadow: " + Number(shownShadow).toFixed(2) + " m", 20, 78);
  ctx.fillText("Tracker Height: " + trackerHeightM.toFixed(2) + " m", 20, 96);
  ctx.fillText("Row Spacing: " + rowSpacingM.toFixed(2) + " m", 20, 114);
}

function update2DFrame(index) {
  if (!latestSimulationData.length) return;
  const clamped = Math.max(0, Math.min(index, latestSimulationData.length - 1));
  timeSlider.value = clamped;
  const row = latestSimulationData[clamped];
  if (timeLabel) timeLabel.textContent = formatTimeLabel(row.timestamp);
  draw2DScene(row);
}

function setup2DControls() {
  if (!timeSlider || !play2dBtn || !pause2dBtn) return;

  timeSlider.addEventListener("input", () => {
    update2DFrame(parseInt(timeSlider.value, 10));
  });

  play2dBtn.addEventListener("click", () => {
    if (!latestSimulationData.length) return;
    if (playTimer) clearInterval(playTimer);

    playTimer = setInterval(() => {
      let next = parseInt(timeSlider.value, 10) + 1;
      if (next >= latestSimulationData.length) next = 0;
      update2DFrame(next);
    }, 150);
  });

  pause2dBtn.addEventListener("click", () => {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
  });

  window.addEventListener("resize", () => {
    update2DFrame(parseInt(timeSlider.value, 10) || 0);
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
        showPopup("Simulation server error. Please check API URL in Settings or try again later.", "error");
      } else {
        showPopup("API connection failed. Please modify or update API URL in Settings.", "error");
      }

      preview.textContent = `API Error:
${text}`;
      openSettings();
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
        first_row: result.data?.[0] || null,
        midday_row: result.data?.[720] || null
      },
      null,
      2
    );

    updateSummary(result);
    buildCharts(result.data || []);
    latestSimulationData = result.data || [];
    if (timeSlider) timeSlider.max = Math.max(0, latestSimulationData.length - 1);
    update2DFrame(Math.min(720, Math.max(0, latestSimulationData.length - 1)));
    showPopup("Simulation completed successfully.", "success");
  } catch (error) {
    showPopup("Unable to connect to API. Please modify or update API URL in Settings.", "error");
    preview.textContent = `Request failed:
${error.message}`;
    openSettings();
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
      showPopup("CSV download failed. Please verify API URL in Settings.", "error");
      preview.textContent = `CSV Error:
${await response.text()}`;
      openSettings();
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
    showPopup("CSV download failed. Please verify API URL in Settings.", "error");
    preview.textContent = `CSV download failed:
${error.message}`;
    openSettings();
  }
}

function setupLocationButton() {
  if (!getLocationBtn) return;

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

window.onload = function () {
  initApiBase();
  loadTimezones();
  restoreSavedInputs();
  setupSettingsButtons();
  setupLocationButton();
  setup2DControls();
};
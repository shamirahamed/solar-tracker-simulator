const AUTO_API_BASE =
  window.location.hostname.includes("app.github.dev")
    ? `${window.location.protocol}//${window.location.hostname.replace(/-\d+\./, "-8000.")}/api/v1`
    : "http://localhost:8000/api/v1";

const DEFAULT_API_BASE = "https://organic-space-eureka-6rrg9vx496r2r5qx-8000.app.github.dev/api/v1";
let API_BASE = localStorage.getItem("api_url") || AUTO_API_BASE || DEFAULT_API_BASE;
let allTimezones = [];

const form = document.getElementById("simulation-form");
const downloadCsvBtn = document.getElementById("download-csv");
const downloadPdfBtn = document.getElementById("download-pdf");
const getLocationBtn = document.getElementById("getLocation");
const preview = document.getElementById("preview");

const apiUrlInput = document.getElementById("api_url");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const saveApiBtn = document.getElementById("save-api-url");
const resetApiBtn = document.getElementById("reset-api-url");
const closeSettingsBtn = document.getElementById("close-settings");

const aboutBtn = document.getElementById("aboutBtn");
const aboutPanel = document.getElementById("aboutPanel");
const closeAboutBtn = document.getElementById("close-about");

const locationPreview = document.getElementById("locationPreview");
const locationText = document.getElementById("locationText");
const mapLink = document.getElementById("mapLink");

const scenarioText = document.getElementById("scenarioText");
const badgeMode = document.getElementById("badgeMode");
const badgeShading = document.getElementById("badgeShading");
const badgeScale = document.getElementById("badgeScale");
const badgeApi = document.getElementById("badgeApi");

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
let latestSimulationResult = null;
let latestSimulationData = [];
let playTimer = null;

const MAX_SHADOW_CHART_DISPLAY_M = 40;
const MAX_SHADOW_2D_DISPLAY_M = 18;
const MIN_SHADING_VISUAL_PERCENT = 0.2;

function showPopup(message, type = "info", timeout = 3200) {
  const el = document.getElementById("statusPopup");
  if (!el) return;
  el.textContent = message;
  el.className = `status-popup ${type}`;
  setTimeout(() => {
    el.className = "status-popup hidden";
  }, timeout);
}

function setBadge(el, text, klass) {
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${klass}`;
}

function initApiBase() {
  const savedApi = localStorage.getItem("api_url");
  API_BASE = savedApi || AUTO_API_BASE || DEFAULT_API_BASE;
  if (apiUrlInput) apiUrlInput.value = API_BASE;
}

function openSettings() {
  settingsPanel?.classList.remove("hidden");
  aboutPanel?.classList.add("hidden");
}

function closeSettings() {
  settingsPanel?.classList.add("hidden");
}

function openAbout() {
  aboutPanel?.classList.remove("hidden");
  settingsPanel?.classList.add("hidden");
}

function closeAbout() {
  aboutPanel?.classList.add("hidden");
}

function setupTopButtons() {
  settingsBtn?.addEventListener("click", openSettings);
  closeSettingsBtn?.addEventListener("click", closeSettings);
  aboutBtn?.addEventListener("click", openAbout);
  closeAboutBtn?.addEventListener("click", closeAbout);

  saveApiBtn?.addEventListener("click", () => {
    const value = apiUrlInput?.value?.trim();
    if (!value) {
      showPopup("Please enter a valid API URL.", "error");
      return;
    }
    API_BASE = value;
    localStorage.setItem("api_url", value);
    setBadge(badgeApi, "API: Custom URL", "badge-blue");
    showPopup("API URL saved.", "success");
    closeSettings();
  });

  resetApiBtn?.addEventListener("click", () => {
    API_BASE = AUTO_API_BASE || DEFAULT_API_BASE;
    if (apiUrlInput) apiUrlInput.value = API_BASE;
    localStorage.removeItem("api_url");
    setBadge(badgeApi, "API: Default URL", "badge-gray");
    showPopup("API URL reset.", "success");
  });
}

function renderTimezoneOptions(list) {
  const tzSelect = document.getElementById("timezone");
  if (!tzSelect) return;
  const current = tzSelect.value;
  tzSelect.innerHTML = "";
  list.forEach((tz) => {
    const option = document.createElement("option");
    option.value = tz;
    option.textContent = tz;
    tzSelect.appendChild(option);
  });
  if (list.includes(current)) tzSelect.value = current;
}

function loadTimezones() {
  const tzSelect = document.getElementById("timezone");
  if (!tzSelect) return;

  if (typeof Intl.supportedValuesOf === "function") {
    allTimezones = Intl.supportedValuesOf("timeZone");
  } else {
    allTimezones = [
      "UTC", "Europe/Dublin", "Europe/London", "Europe/Paris", "Europe/Berlin",
      "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "Australia/Sydney"
    ];
  }

  renderTimezoneOptions(allTimezones);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  tzSelect.value = allTimezones.includes(browserTz) ? browserTz : "Europe/Dublin";
}

function setupTimezoneSearch() {
  const searchEl = document.getElementById("timezoneSearch");
  const refEl = document.getElementById("timezoneRef");
  if (!searchEl) return;
  if (refEl) refEl.href = "https://en.wikipedia.org/wiki/List_of_tz_database_time_zones";

  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    const filtered = allTimezones.filter((tz) => tz.toLowerCase().replace(/_/g, " ").includes(q));
    renderTimezoneOptions(filtered.length ? filtered : allTimezones);
  });
}

function restoreSavedInputs() {
  const saved = localStorage.getItem("solarInputs");
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    Object.keys(data).forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!data[key];
      else el.value = data[key];
    });
  } catch (_) {}
}

function setDefaultDate() {
  const dateEl = document.getElementById("date");
  if (!dateEl || dateEl.value) return;
  const now = new Date();
  dateEl.value = now.toISOString().slice(0, 10);
}

function updateLocationPreviewFromInputs() {
  const lat = document.getElementById("latitude")?.value?.trim();
  const lon = document.getElementById("longitude")?.value?.trim();
  if (!lat || !lon || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
    locationPreview?.classList.add("hidden");
    return;
  }

  if (locationPreview && locationText && mapLink) {
    locationText.textContent = `📍 Location: ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
    mapLink.href = `https://maps.google.com/?q=${lat},${lon}`;
    locationPreview.classList.remove("hidden");
  }
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
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function calculateSunTimes(data) {
  let sunrise = null;
  let sunset = null;
  data.forEach((row) => {
    const elevation = Number(row.sun_elevation || 0);
    if (elevation > 0 && !sunrise) sunrise = row.timestamp;
    if (elevation > 0) sunset = row.timestamp;
  });
  return { sunrise, sunset };
}

function calculateGcr() {
  const panelWidth = parseFloat(document.getElementById("panel_width").value) || 0;
  const rowSpacing = parseFloat(document.getElementById("row_spacing").value) || 1;
  const ratio = rowSpacing > 0 ? panelWidth / rowSpacing : 0;
  return { ratio, percent: ratio * 100 };
}

function clampShadowForDisplay(value, maxDisplay = MAX_SHADOW_CHART_DISPLAY_M) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, maxDisplay);
}

function formatShadowMetric(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "--";
  if (n > 9999) return `${n.toExponential(2)} m`;
  if (n > 999) return `${Math.round(n)} m`;
  return `${n.toFixed(2)} m`;
}

function updateScenarioHeader() {
  const p = getPayload();
  scenarioText.textContent = `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)} | ${p.timezone} | ${p.date} | ${p.backtracking ? "Backtracking ON" : "Backtracking OFF"}`;
}

function updateSummary(result) {
  const data = result.data || [];
  const maxVal = (key) => Math.max(...data.map((d) => Number(d[key] || 0)), 0);

  document.getElementById("maxIdeal").textContent = `${maxVal("ideal_tracker_angle").toFixed(1)}°`;
  document.getElementById("maxLimited").textContent = `${maxVal("limited_tracker_angle").toFixed(1)}°`;
  document.getElementById("maxBacktracking").textContent = `${maxVal("backtracking_angle").toFixed(1)}°`;
  document.getElementById("maxSun").textContent = `${maxVal("sun_elevation").toFixed(1)}°`;
  document.getElementById("maxAzimuth").textContent = `${maxVal("sun_azimuth").toFixed(1)}°`;
  document.getElementById("maxShadowWithout").textContent = formatShadowMetric(maxVal("shadow_length_without_backtracking"));
  document.getElementById("maxShadowWith").textContent = formatShadowMetric(maxVal("shadow_length_with_backtracking"));
  document.getElementById("maxPowerWithout").textContent = `${maxVal("power_without_backtracking").toFixed(1)} W`;
  document.getElementById("maxPowerWith").textContent = `${maxVal("power_with_backtracking").toFixed(1)} W`;
  document.getElementById("maxShadingNoBt").textContent = `${maxVal("shading_percent_without_backtracking").toFixed(2)}%`;
  document.getElementById("maxShadingBt").textContent = `${maxVal("shading_percent_with_backtracking").toFixed(2)}%`;
  document.getElementById("energyNo").textContent = `${Number(result.daily_energy_without_backtracking || 0).toFixed(3)} kWh`;
  document.getElementById("energyBt").textContent = `${Number(result.daily_energy_with_backtracking || 0).toFixed(3)} kWh`;
  document.getElementById("energyGain").textContent = `${Number(result.daily_energy_gain_percent || 0).toFixed(2)}%`;

  const sunTimes = calculateSunTimes(data);
  document.getElementById("sunCycle").textContent = `${sunTimes.sunrise ? formatTimeLabel(sunTimes.sunrise) : "--"} / ${sunTimes.sunset ? formatTimeLabel(sunTimes.sunset) : "--"}`;

  const gcr = calculateGcr();
  document.getElementById("gcrValue").textContent = `${gcr.ratio.toFixed(3)} (${gcr.percent.toFixed(1)}%)`;
}

function destroyCharts() {
  anglesChart?.destroy();
  sunChart?.destroy();
  shadingChart?.destroy();
  powerChart?.destroy();
}

function compactLegendOptions() {
  return {
    position: "bottom",
    align: "start",
    labels: {
      boxWidth: 10,
      boxHeight: 10,
      padding: 6,
      font: { size: 10 }
    }
  };
}

function chartBaseOptions(yText) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: compactLegendOptions() },
    scales: {
      x: { ticks: { maxTicksLimit: 12, font: { size: 10 } } },
      y: {
        title: { display: true, text: yText, font: { size: 11 } },
        ticks: { font: { size: 10 } }
      }
    }
  };
}

function buildCharts(data) {
  if (!anglesCtx || !sunCtx || !shadingCtx || !powerCtx) return;
  destroyCharts();
  const labels = data.map((row) => formatTimeLabel(row.timestamp));

  anglesChart = new Chart(anglesCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ideal", data: data.map((r) => r.ideal_tracker_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        { label: "Limited", data: data.map((r) => r.limited_tracker_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        { label: "Backtracking", data: data.map((r) => r.backtracking_angle), borderWidth: 1.5, pointRadius: 0, tension: 0.22 }
      ]
    },
    options: chartBaseOptions("Angle (deg)")
  });

  sunChart = new Chart(sunCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Elevation", data: data.map((r) => r.sun_elevation), borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        { label: "Azimuth", data: data.map((r) => r.sun_azimuth), borderWidth: 1.5, pointRadius: 0, tension: 0.22 }
      ]
    },
    options: chartBaseOptions("Sun Angle (deg)")
  });

  const shadowNoBtDisplay = data.map((r) => clampShadowForDisplay(r.shadow_length_without_backtracking));
  const shadowBtDisplay = data.map((r) => clampShadowForDisplay(r.shadow_length_with_backtracking));

  const maxShadowLen = Math.max(...shadowNoBtDisplay, ...shadowBtDisplay, 1);
  const maxShadingPercent = Math.max(
    ...data.map((r) => Number(r.shading_percent_without_backtracking || 0)),
    ...data.map((r) => Number(r.shading_percent_with_backtracking || 0)),
    1
  );

  shadingChart = new Chart(shadingCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Shadow No BT", data: shadowNoBtDisplay, borderWidth: 2, pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "Shadow BT", data: shadowBtDisplay, borderWidth: 2, pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "Shading % No BT", data: data.map((r) => r.shading_percent_without_backtracking), borderWidth: 2, borderDash: [6, 5], pointRadius: 0, tension: 0.18, yAxisID: "y1" },
        { label: "Shading % BT", data: data.map((r) => r.shading_percent_with_backtracking), borderWidth: 2, borderDash: [6, 5], pointRadius: 0, tension: 0.18, yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: compactLegendOptions() },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          min: 0,
          max: Math.max(5, Math.ceil(maxShadowLen * 1.15)),
          title: { display: true, text: "Shadow Length (scaled)", font: { size: 11 } },
          ticks: { font: { size: 10 } }
        },
        y1: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          min: 0,
          max: Math.max(5, Math.ceil(maxShadingPercent + 1)),
          title: { display: true, text: "Shading (%)", font: { size: 11 } },
          ticks: { font: { size: 10 } },
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
        { label: "Power No BT", data: data.map((r) => r.power_without_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        { label: "Power BT", data: data.map((r) => r.power_with_backtracking), borderWidth: 1.5, pointRadius: 0, tension: 0.22 }
      ]
    },
    options: chartBaseOptions("Power (W)")
  });
}

function resizeTrackerCanvas() {
  if (!trackerCanvas || !tracker2dCtx) return null;
  const wrap = document.querySelector(".tracker-canvas-wrap");
  if (!wrap) return null;

  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
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
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pivotX, groundY);
  ctx.lineTo(pivotX, pivotY);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = "12px Arial";
  ctx.fillText(label, pivotX - 18, pivotY - 12);

  return { leftX: Math.min(x1, x2), rightX: Math.max(x1, x2) };
}

function drawSunIcon(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(245,158,11,0.60)";
  ctx.lineWidth = 1.25;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
    ctx.lineTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
    ctx.stroke();
  }
  ctx.restore();
}

function draw2DScene(row) {
  if (!tracker2dCtx || !row) return;
  const size = resizeTrackerCanvas();
  if (!size) return;

  const { width, height } = size;
  const ctx = tracker2dCtx;
  ctx.clearRect(0, 0, width, height);

  const payload = getPayload();
  const groundY = height * 0.79;
  const skyTop = 18;
  const skyHeight = groundY - skyTop - 36;

  const bg = ctx.createLinearGradient(0, 0, 0, groundY);
  bg.addColorStop(0, "#edf6ff");
  bg.addColorStop(0.65, "#ffffff");
  bg.addColorStop(1, "#f1f5f9");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, groundY);
  ctx.fillStyle = "#eef2f7";
  ctx.fillRect(0, groundY, width, height - groundY);

  const visualRowSpacingM = Math.min(Math.max(payload.row_spacing, payload.panel_width * 1.6), 10);
  const visualMeters = Math.max(visualRowSpacingM * 1.25, MAX_SHADOW_2D_DISPLAY_M, payload.panel_width * 3.2, 7);
  const ppm = Math.min(95, (width - 120) / visualMeters);

  const rowSpacingPx = Math.max(84, Math.min(width * 0.42, payload.row_spacing * ppm));
  const panelLengthPx = Math.max(80, Math.min(width * 0.24, payload.panel_width * ppm));
  const trackerHeightPx = Math.max(width < 640 ? 22 : 26, Math.min(height * (width < 640 ? 0.18 : 0.20), payload.tracker_height * ppm * 0.78));

  const centerX = width / 2;
  const mast1X = centerX - rowSpacingPx / 2;
  const mast2X = centerX + rowSpacingPx / 2;
  const pivotY = groundY - trackerHeightPx;

  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(28, groundY);
  ctx.lineTo(width - 28, groundY);
  ctx.stroke();

  const elevation = Number(row.sun_elevation || 0);
  const azimuth = Number(row.sun_azimuth || 180);
  const useBacktracking = document.getElementById("backtracking").checked;
  const trackerAngle = Number(useBacktracking ? row.backtracking_angle : row.limited_tracker_angle);
  const shadingNoBt = Number(row.shading_percent_without_backtracking || 0);
  const shadingBt = Number(row.shading_percent_with_backtracking || 0);
  const shadingPercentSelected = Number(useBacktracking ? row.shading_percent_with_backtracking : row.shading_percent_without_backtracking);
  const shownShadowRaw = Number(useBacktracking ? row.shadow_length_with_backtracking : row.shadow_length_without_backtracking);
  const shownShadowDisplay = clampShadowForDisplay(shownShadowRaw, MAX_SHADOW_2D_DISPLAY_M);

  const sunOnLeft = azimuth < 180;
  const visualAngle = sunOnLeft ? -Math.abs(trackerAngle) : Math.abs(trackerAngle);
  const angleRad = visualAngle * Math.PI / 180;

  const panelA = drawPanelAt(ctx, mast1X, pivotY, angleRad, panelLengthPx, "#2563eb", "Row A", groundY);
  const panelB = drawPanelAt(ctx, mast2X, pivotY, angleRad, panelLengthPx, "#1d4ed8", "Row B", groundY);

  if (elevation > 0) {
    const azClamped = Math.max(90, Math.min(270, azimuth));
    const azNorm = (azClamped - 90) / 180;
    const sunX = 42 + azNorm * (width - 84);
    const sunY = groundY - 14 - Math.max(0, Math.min(1, elevation / 90)) * skyHeight;

    ctx.strokeStyle = "rgba(148,163,184,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width / 2, groundY + 12, Math.min(width * 0.42, 250), Math.PI, 2 * Math.PI);
    ctx.stroke();

    drawSunIcon(ctx, sunX, sunY, 11);

    const shadowPx = shownShadowDisplay * ppm;
    const shadowSourceX = sunOnLeft ? mast1X : mast2X;
    const shadowEndX = sunOnLeft ? shadowSourceX + shadowPx : shadowSourceX - shadowPx;

    ctx.strokeStyle = "rgba(0,0,0,0.70)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(shadowSourceX, groundY);
    ctx.lineTo(shadowEndX, groundY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(shadowSourceX, groundY);
    ctx.lineTo(shadowEndX, groundY);
    ctx.stroke();

    if (shadingPercentSelected > MIN_SHADING_VISUAL_PERCENT) {
      const targetPanel = sunOnLeft ? panelB : panelA;
      const panelWidthPx = Math.max(1, targetPanel.rightX - targetPanel.leftX);
      const shadeWidth = Math.max(5, Math.min(panelWidthPx, panelWidthPx * (shadingPercentSelected / 100)));
      const shadeX = sunOnLeft ? targetPanel.leftX : targetPanel.rightX - shadeWidth;

      ctx.fillStyle = "rgba(220,38,38,0.24)";
      ctx.fillRect(shadeX, pivotY - 13, shadeWidth, 26);
      ctx.strokeStyle = "rgba(185,28,28,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(shadeX, pivotY - 13, shadeWidth, 26);

      ctx.fillStyle = "#b91c1c";
      ctx.font = "12px Arial";
      ctx.fillText(`Shading ${shadingPercentSelected.toFixed(1)}%`, width / 2 - 42, pivotY - 22);
      setBadge(badgeShading, "Shading: Yes", "badge-red");
    } else {
      ctx.fillStyle = "#16a34a";
      ctx.font = "12px Arial";
      ctx.fillText("No Shading", width / 2 - 28, pivotY - 22);
      setBadge(badgeShading, "Shading: No", "badge-green");
    }
  } else {
    ctx.fillStyle = "#475569";
    ctx.font = "12px Arial";
    ctx.fillText("Night / No Sun", width - 116, 26);
    setBadge(badgeShading, "Shading: --", "badge-gray");
  }

  const compressed = payload.row_spacing > 10 || shownShadowRaw > MAX_SHADOW_2D_DISPLAY_M;
  setBadge(badgeMode, `Mode: ${useBacktracking ? "Backtracking ON" : "Backtracking OFF"}`, useBacktracking ? "badge-blue" : "badge-gray");
  setBadge(badgeScale, compressed ? "View: Display scaled" : "View: 1:1", compressed ? "badge-gray" : "badge-green");

  ctx.fillStyle = "#0f172a";
  ctx.font = width < 500 ? "11px Arial" : "12px Arial";
  ctx.fillText(`Time: ${formatTimeLabel(row.timestamp)}`, 16, 18);
  ctx.fillText(`Sun Elevation: ${elevation.toFixed(1)}°`, 16, 32);
  ctx.fillText(`Sun Azimuth: ${azimuth.toFixed(1)}°`, 16, 46);
  ctx.fillText(`Tracker Angle: ${trackerAngle.toFixed(1)}°`, 16, 60);
  ctx.fillText(`Shadow: ${formatShadowMetric(shownShadowRaw)}`, 16, 74);

  ctx.fillStyle = "#475569";
  ctx.font = "11px Arial";
  ctx.fillText(`Shading (No BT): ${shadingNoBt.toFixed(2)}%`, 16, height - 26);
  ctx.fillText(`Shading (With BT): ${shadingBt.toFixed(2)}%`, width < 640 ? 150 : 170, height - 26);

  if (shownShadowRaw > MAX_SHADOW_2D_DISPLAY_M) {
    ctx.fillStyle = "#64748b";
    ctx.font = "10px Arial";
    ctx.fillText(`Visual shadow capped at ${MAX_SHADOW_2D_DISPLAY_M} m`, 16, height - 10);
  }
}

function update2DFrame(index) {
  if (!latestSimulationData.length) return;
  const safeIndex = Math.max(0, Math.min(index, latestSimulationData.length - 1));
  if (timeSlider) timeSlider.value = String(safeIndex);
  if (timeLabel) timeLabel.textContent = formatTimeLabel(latestSimulationData[safeIndex].timestamp);
  draw2DScene(latestSimulationData[safeIndex]);
}

function setup2DControls() {
  if (!timeSlider || !play2dBtn || !pause2dBtn) return;
  timeSlider.addEventListener("input", () => update2DFrame(parseInt(timeSlider.value, 10)));
  play2dBtn.addEventListener("click", () => {
    if (!latestSimulationData.length) return;
    if (playTimer) clearInterval(playTimer);
    playTimer = setInterval(() => {
      let next = parseInt(timeSlider.value, 10) + 1;
      if (next >= latestSimulationData.length) next = 0;
      update2DFrame(next);
    }, 120);
  });
  pause2dBtn.addEventListener("click", () => {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
  });
  window.addEventListener("resize", () => update2DFrame(parseInt(timeSlider?.value || "0", 10)));
}

async function runSimulation() {
  const payload = getPayload();
  localStorage.setItem("solarInputs", JSON.stringify(payload));
  updateScenarioHeader();
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
      setBadge(badgeApi, "API: Error", "badge-red");
      preview.textContent = `API Error:\n${text}`;
      showPopup("Simulation failed. Check API URL or backend logs.", "error");
      openSettings();
      return;
    }

    const result = await response.json();
    latestSimulationResult = result;
    latestSimulationData = result.data || [];
    setBadge(badgeApi, "API: Connected", "badge-green");

    preview.textContent = JSON.stringify({
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
    }, null, 2);

    updateSummary(result);
    buildCharts(latestSimulationData);
    if (timeSlider) timeSlider.max = String(Math.max(0, latestSimulationData.length - 1));
    update2DFrame(Math.min(720, Math.max(0, latestSimulationData.length - 1)));
    showPopup("Simulation completed successfully.", "success");
  } catch (error) {
    setBadge(badgeApi, "API: Error", "badge-red");
    preview.textContent = `Request failed:\n${error.message}`;
    showPopup("Unable to connect to API.", "error");
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
      preview.textContent = `CSV Error:\n${await response.text()}`;
      showPopup("CSV download failed.", "error");
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
    preview.textContent = `CSV download failed:\n${error.message}`;
    showPopup("CSV download failed.", "error");
    openSettings();
  }
}

function addTextBlock(doc, lines, x, y, lineHeight = 6) {
  lines.forEach((line) => {
    doc.text(String(line), x, y);
    y += lineHeight;
  });
  return y;
}

function addMetricBox(doc, x, y, w, h, title, value) {
  doc.setDrawColor(220, 226, 232);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(title, x + 3, y + 5);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(String(value), x + 3, y + 12);
}

function buildDimensionDiagramDataUrl(payload) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  const margin = 70;
  const groundY = 280;
  const usableWidth = canvas.width - margin * 2;
  const maxMeters = Math.max(payload.row_spacing * 1.1, payload.panel_width * 2.5, 6);
  const scale = usableWidth / maxMeters;
  const mast1X = 260;
  const mast2X = mast1X + payload.row_spacing * scale;
  const panelLength = payload.panel_width * scale;
  const trackerHeight = payload.tracker_height * scale;
  const pivotY = groundY - trackerHeight;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, groundY);
  ctx.lineTo(canvas.width - margin, groundY);
  ctx.stroke();

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(mast1X, groundY);
  ctx.lineTo(mast1X, pivotY);
  ctx.moveTo(mast2X, groundY);
  ctx.lineTo(mast2X, pivotY);
  ctx.stroke();

  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(mast1X - panelLength / 2, pivotY);
  ctx.lineTo(mast1X + panelLength / 2, pivotY);
  ctx.moveTo(mast2X - panelLength / 2, pivotY);
  ctx.lineTo(mast2X + panelLength / 2, pivotY);
  ctx.stroke();

  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mast1X, groundY + 24);
  ctx.lineTo(mast2X, groundY + 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mast1X + 14, pivotY - 36);
  ctx.lineTo(mast1X + 14, groundY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mast1X - panelLength / 2, pivotY - 20);
  ctx.lineTo(mast1X + panelLength / 2, pivotY - 20);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = "22px Arial";
  ctx.fillText("Tracker Dimensions", margin, 40);
  ctx.font = "18px Arial";
  ctx.fillText(`Panel width: ${payload.panel_width.toFixed(2)} m`, mast1X - 70, pivotY - 34);
  ctx.fillText(`Tracker height: ${payload.tracker_height.toFixed(2)} m`, mast1X + 24, (pivotY + groundY) / 2);
  ctx.fillText(`Row spacing: ${payload.row_spacing.toFixed(2)} m`, (mast1X + mast2X) / 2 - 80, groundY + 52);
  return canvas.toDataURL("image/png");
}

async function downloadPdf() {
  if (!latestSimulationResult || !latestSimulationData.length) {
    showPopup("Run a simulation first to export PDF.", "error");
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const payload = getPayload();
    const metrics = {
      gcr: calculateGcr(),
      sunriseSunset: calculateSunTimes(latestSimulationData),
      maxShadingNoBt: Math.max(...latestSimulationData.map((r) => Number(r.shading_percent_without_backtracking || 0)), 0),
      maxShadingBt: Math.max(...latestSimulationData.map((r) => Number(r.shading_percent_with_backtracking || 0)), 0),
      maxShadowNoBt: Math.max(...latestSimulationData.map((r) => Number(r.shadow_length_without_backtracking || 0)), 0),
      maxShadowBt: Math.max(...latestSimulationData.map((r) => Number(r.shadow_length_with_backtracking || 0)), 0),
      maxPowerNoBt: Math.max(...latestSimulationData.map((r) => Number(r.power_without_backtracking || 0)), 0),
      maxPowerBt: Math.max(...latestSimulationData.map((r) => Number(r.power_with_backtracking || 0)), 0)
    };

    const powerCanvas = document.getElementById("powerChart");
    const anglesCanvas = document.getElementById("anglesChart");
    const sunCanvas = document.getElementById("sunChart");
    const shadingCanvas = document.getElementById("shadingChart");
    const trackerImage = trackerCanvas.toDataURL("image/png");
    const dimensionDiagram = buildDimensionDiagramDataUrl(payload);

    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 297, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(18);
    doc.text("Solar Tracker Simulator", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("Single-axis tracker simulation report", 14, 22);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 26, 196, 26);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Scenario", 14, 34);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    addTextBlock(doc, [
      `${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}`,
      `${payload.timezone} | ${payload.date}`,
      `${payload.backtracking ? "Backtracking ON" : "Backtracking OFF"}`
    ], 14, 40, 5);

    addMetricBox(doc, 14, 56, 42, 18, "Energy No BT", `${Number(latestSimulationResult.daily_energy_without_backtracking || 0).toFixed(3)} kWh`);
    addMetricBox(doc, 60, 56, 42, 18, "Energy BT", `${Number(latestSimulationResult.daily_energy_with_backtracking || 0).toFixed(3)} kWh`);
    addMetricBox(doc, 106, 56, 42, 18, "Energy Gain", `${Number(latestSimulationResult.daily_energy_gain_percent || 0).toFixed(2)} %`);
    addMetricBox(doc, 152, 56, 42, 18, "GCR", `${metrics.gcr.ratio.toFixed(3)}`);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Inputs", 14, 84);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    addTextBlock(doc, [
      `Panel width: ${payload.panel_width.toFixed(2)} m`,
      `Panel height: ${payload.panel_height.toFixed(2)} m`,
      `Tracker height: ${payload.tracker_height.toFixed(2)} m`,
      `Row spacing: ${payload.row_spacing.toFixed(2)} m`,
      `Efficiency: ${payload.panel_efficiency.toFixed(3)}`,
      `Max angle: ${payload.max_angle.toFixed(1)}°`,
      `Sunrise / Sunset: ${metrics.sunriseSunset.sunrise ? formatTimeLabel(metrics.sunriseSunset.sunrise) : "--"} / ${metrics.sunriseSunset.sunset ? formatTimeLabel(metrics.sunriseSunset.sunset) : "--"}`
    ], 14, 90, 5.2);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Key metrics", 14, 132);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    addTextBlock(doc, [
      `Max shading without backtracking: ${metrics.maxShadingNoBt.toFixed(2)}%`,
      `Max shading with backtracking: ${metrics.maxShadingBt.toFixed(2)}%`,
      `Max shadow without backtracking: ${formatShadowMetric(metrics.maxShadowNoBt)}`,
      `Max shadow with backtracking: ${formatShadowMetric(metrics.maxShadowBt)}`,
      `Display caps used: charts ${MAX_SHADOW_CHART_DISPLAY_M} m, 2D ${MAX_SHADOW_2D_DISPLAY_M} m`,
      `Max power without backtracking: ${metrics.maxPowerNoBt.toFixed(1)} W`,
      `Max power with backtracking: ${metrics.maxPowerBt.toFixed(1)} W`
    ], 14, 138, 5.2);

    doc.addImage(dimensionDiagram, "PNG", 108, 82, 86, 48);
    doc.addImage(trackerImage, "PNG", 104, 134, 90, 68);

    doc.addPage();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 297, "F");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("Charts", 14, 16);

    const charts = [
      { title: "Tracker Angle", canvas: anglesCanvas, x: 14, y: 22 },
      { title: "Solar Position", canvas: sunCanvas, x: 110, y: 22 },
      { title: "Inter-row Shadowing", canvas: shadingCanvas, x: 14, y: 114 },
      { title: "Power Output", canvas: powerCanvas, x: 110, y: 114 }
    ];

    charts.forEach((c) => {
      if (!c.canvas) return;
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(c.title, c.x, c.y);
      doc.addImage(c.canvas.toDataURL("image/png"), "PNG", c.x, c.y + 4, 86, 60);
    });

    doc.addPage();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 297, "F");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("Formulas and notes", 14, 16);

    doc.setFontSize(10);
    doc.text("Formulas", 14, 30);
    doc.setDrawColor(220, 226, 232);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 34, 186, 44, 2, 2, "FD");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    addTextBlock(doc, [
      "GCR = panel width / row spacing",
      "Tracker angle and backtracking are calculated using pvlib single-axis tracker logic.",
      "POA irradiance is based on pvlib clear-sky irradiance and transposition.",
      "Shaded fraction is based on pvlib row-shading logic using shaded_fraction1d.",
      "Applied irradiance = direct POA × (1 − shaded fraction) + diffuse POA.",
      "Power = applied POA × panel area × panel efficiency."
    ], 18, 42, 5.6);

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Notes / disclaimer", 14, 84);
    doc.setDrawColor(220, 226, 232);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 88, 186, 40, 2, 2, "FD");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    addTextBlock(doc, [
      "This report reflects the current UI inputs and the latest simulation loaded in the browser.",
      "It is intended for practical engineering analysis and comparison, not a full bankable performance model.",
      "Clear-sky irradiance is used in this practical version unless measured weather data is added later.",
      "Very large shadow values can occur at low solar elevation. UI and chart display scaling is used for readability."
    ], 18, 96, 5.6);

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Readable shadow summary", 14, 134);
    doc.setDrawColor(220, 226, 232);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 138, 186, 28, 2, 2, "FD");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    addTextBlock(doc, [
      `Raw max shadow (No BT): ${formatShadowMetric(metrics.maxShadowNoBt)}`,
      `Raw max shadow (BT): ${formatShadowMetric(metrics.maxShadowBt)}`,
      `Display caps: charts ${MAX_SHADOW_CHART_DISPLAY_M} m, 2D ${MAX_SHADOW_2D_DISPLAY_M} m`
    ], 18, 146, 5.6);

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("pvlib reference", 14, 182);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text("https://pvlib-python.readthedocs.io/", 14, 188);

    doc.save(`solar_tracker_report_${payload.date}.pdf`);
    showPopup("PDF downloaded successfully.", "success");
  } catch (error) {
    preview.textContent = `PDF export failed:\n${error.message}`;
    showPopup("PDF export failed.", "error");
  }
}

function setupLocationButton() {
  if (!getLocationBtn) return;
  getLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showPopup("Geolocation is not supported on this browser.", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        document.getElementById("latitude").value = position.coords.latitude.toFixed(4);
        document.getElementById("longitude").value = position.coords.longitude.toFixed(4);
        updateLocationPreviewFromInputs();
        updateScenarioHeader();
        if (latestSimulationData.length) {
          update2DFrame(parseInt(timeSlider?.value || "0", 10));
        }
        showPopup("Location detected successfully.", "success");
      },
      () => showPopup("Unable to retrieve location.", "error")
    );
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSimulation();
});

downloadCsvBtn?.addEventListener("click", async () => {
  await downloadCsv();
});

downloadPdfBtn?.addEventListener("click", async () => {
  await downloadPdf();
});

window.onload = function () {
  initApiBase();
  loadTimezones();
  setupTimezoneSearch();
  restoreSavedInputs();
  setDefaultDate();
  setupTopButtons();
  setupLocationButton();
  setup2DControls();
  updateScenarioHeader();
  updateLocationPreviewFromInputs();

  [
    "latitude", "longitude", "panel_width", "panel_height", "tracker_height",
    "row_spacing", "panel_efficiency", "max_angle", "date"
  ].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", () => {
      updateScenarioHeader();
      updateLocationPreviewFromInputs();
      if (latestSimulationData.length) update2DFrame(parseInt(timeSlider?.value || "0", 10));
    });
    el?.addEventListener("change", () => {
      updateScenarioHeader();
      updateLocationPreviewFromInputs();
      if (latestSimulationData.length) update2DFrame(parseInt(timeSlider?.value || "0", 10));
    });
  });

  document.getElementById("timezone")?.addEventListener("change", updateScenarioHeader);
  document.getElementById("backtracking")?.addEventListener("change", () => {
    updateScenarioHeader();
    if (latestSimulationData.length) update2DFrame(parseInt(timeSlider?.value || "0", 10));
  });

  setBadge(badgeApi, "API: Not checked", "badge-gray");
};

// API base URL resolution (priority order):
// 1. User-saved override in localStorage (Settings panel)
// 2. Codespaces: auto-derive from the preview hostname (must check BEFORE Render override
//    because _api_config.js is also served in Codespaces and would point at the wrong host)
// 3. RENDER_API_URL injected at build/deploy time (window.__RENDER_API_URL)
// 4. Local dev fallback
const AUTO_API_BASE = (() => {
  if (window.location.hostname.includes("app.github.dev"))
    return `${window.location.protocol}//${window.location.hostname.replace(/-\d+\./, "-8000.")}/api/v1`;
  if (window.__RENDER_API_URL) return window.__RENDER_API_URL;
  return "http://localhost:8000/api/v1";
})();

let API_BASE = localStorage.getItem("api_url") || AUTO_API_BASE;
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
const powerCtx      = document.getElementById("powerChart")?.getContext("2d");
const powerWCtx     = document.getElementById("powerWChart")?.getContext("2d");
const shadowDirCtx  = document.getElementById("shadowDirChart")?.getContext("2d");
const tempCtx       = document.getElementById("tempChart")?.getContext("2d");
const ghiCompCtx    = document.getElementById("ghiCompChart")?.getContext("2d");
const windCtx          = document.getElementById("windChart")?.getContext("2d");
const cloudRainCtx     = document.getElementById("cloudRainChart")?.getContext("2d");
const humidityCtx      = document.getElementById("humidityChart")?.getContext("2d");

const trackerCanvas = document.getElementById("tracker2dCanvas");
const tracker2dCtx = trackerCanvas?.getContext("2d");
const timeSlider = document.getElementById("timeSlider");
const timeLabel = document.getElementById("timeLabel");
const play2dBtn = document.getElementById("play2d");
const pause2dBtn = document.getElementById("pause2d");
const liveModeBtn = document.getElementById("liveMode");

let anglesChart = null;
let sunChart = null;
let shadingChart = null;
let liveTimer = null;

/* ── Theme & accent system ─────────────────────────────────────────── */
const ACCENTS = {
  cyber:    { base: "#00c853", dark: "#00a844", dim: "rgba(0,200,83,0.12)",    glow: "rgba(0,200,83,0.25)" },
  military: { base: "#6b8f3a", dark: "#4d6b27", dim: "rgba(107,143,58,0.14)", glow: "rgba(107,143,58,0.30)" },
  phosphor: { base: "#39ff14", dark: "#28cc00", dim: "rgba(57,255,20,0.12)",   glow: "rgba(57,255,20,0.25)" },
  arctic:   { base: "#00e5ff", dark: "#00b8cc", dim: "rgba(0,229,255,0.12)",   glow: "rgba(0,229,255,0.25)" },
  amber:    { base: "#f59e0b", dark: "#d97706", dim: "rgba(245,158,11,0.12)",  glow: "rgba(245,158,11,0.25)" },
};

function applyAccent(name) {
  const a = ACCENTS[name] || ACCENTS.cyber;
  const r = document.documentElement;
  r.style.setProperty("--accent",      a.base);
  r.style.setProperty("--accent-dark", a.dark);
  r.style.setProperty("--accent-dim",  a.dim);
  r.style.setProperty("--accent-glow", a.glow);
  localStorage.setItem("accent", name);
  document.querySelectorAll(".accent-swatch").forEach(b => {
    b.classList.toggle("active", b.dataset.accent === name);
  });
  // rebuild charts so colours update
  if (latestSimulationData.length) buildCharts(latestSimulationData);
}

function getAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#00c853";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  const isLight = theme === "light";
  const icon = isLight ? "🌙" : "☀️";
  const label = isLight ? "Switch to Dark" : "Switch to Light";
  const statusText = isLight ? "Current: Light" : "Current: Dark";
  document.getElementById("themeToggleBtn")?.setAttribute("title", label);
  document.getElementById("themeToggleBtn").textContent = icon;
  const settingBtn = document.getElementById("themeToggleSetting");
  if (settingBtn) settingBtn.textContent = `${icon} ${label}`;
  const statusEl = document.getElementById("themeStatus");
  if (statusEl) statusEl.textContent = statusText;
  if (latestSimulationData.length) {
    buildCharts(latestSimulationData);
    const idx = parseInt(document.getElementById("timeSlider")?.value || "720", 10);
    const safeIdx = Math.max(0, Math.min(idx, latestSimulationData.length - 1));
    draw2DScene(latestSimulationData[safeIdx]);
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

function initThemeAndAccent() {
  applyTheme(localStorage.getItem("theme") || "dark");
  applyAccent(localStorage.getItem("accent") || "cyber");
}
let powerChart     = null;
let powerWChart    = null;
let shadowDirChart = null;
let tempChart      = null;
let ghiCompChart   = null;
let windChart      = null;
let cloudRainChart = null;
let humidityChart  = null;
let latestSimulationResult = null;
let latestSimulationData = [];
let playTimer = null;

const MAX_SHADOW_CHART_DISPLAY_M = 40;
const MAX_SHADOW_2D_DISPLAY_M = 18;
const MIN_SHADING_VISUAL_PERCENT = 0.2;

function showPopup(message, type = "info", timeout = 3200, action = null) {
  const el = document.getElementById("statusPopup");
  if (!el) return;
  clearTimeout(el._popupTimer);

  el.innerHTML = "";
  const msgEl = document.createElement("span");
  msgEl.textContent = message;
  el.appendChild(msgEl);

  if (action) {
    const btn = document.createElement("button");
    btn.className = "popup-action-btn";
    btn.textContent = action.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      el.className = "status-popup hidden";
      action.fn();
    });
    el.appendChild(btn);
  }

  el.className = `status-popup ${type}`;
  el.onclick = () => { el.className = "status-popup hidden"; };
  if (timeout > 0) {
    el._popupTimer = setTimeout(() => { el.className = "status-popup hidden"; }, timeout);
  }
}

async function handleApiError(error) {
  setBadge(badgeApi, "API: Error", "badge-red");

  let online = false;
  try {
    const r = await fetch(
      `${API_BASE.replace(/\/api\/v1$/, "")}/api/v1/health`,
      { signal: AbortSignal.timeout(5000) }
    );
    online = r.ok;
  } catch (_) {}

  if (error?.name === "AbortError") {
    showPopup("Server is waking up — please try again in ~30s", "error", 10000);
  } else if (!online) {
    showPopup(
      "API server unreachable — check or update URL",
      "error", 0,
      { label: "⚙ Open Settings", fn: openSettings }
    );
  } else {
    showPopup(
      "API returned an error — server is up but request failed",
      "error", 7000,
      { label: "⚙ Open Settings", fn: openSettings }
    );
  }
}

function setBadge(el, text, klass) {
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${klass}`;
}

function initApiBase() {
  const savedApi = localStorage.getItem("api_url");
  API_BASE = savedApi || AUTO_API_BASE;
  if (apiUrlInput) apiUrlInput.value = API_BASE;
  const src = document.getElementById("apiUrlSource");
  if (src) src.textContent = savedApi ? "⚠️ Using saved override — click Reset to use default." : "✅ Using default URL.";
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
  document.getElementById("themeToggleBtn")?.addEventListener("click", toggleTheme);
  document.getElementById("themeToggleSetting")?.addEventListener("click", toggleTheme);
  document.querySelectorAll(".accent-swatch").forEach(btn => {
    btn.addEventListener("click", () => applyAccent(btn.dataset.accent));
  });

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
    API_BASE = AUTO_API_BASE;
    if (apiUrlInput) apiUrlInput.value = API_BASE;
    localStorage.removeItem("api_url");
    setBadge(badgeApi, "API: Default URL", "badge-gray");
    const src = document.getElementById("apiUrlSource");
    if (src) src.textContent = "✅ Using default URL.";
    showPopup("API URL reset to default.", "success");
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
  const soilingPct = parseFloat(document.getElementById("soiling_loss")?.value || "0");
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
    backtracking: document.getElementById("backtracking").checked,
    use_real_weather: document.getElementById("use_real_weather")?.checked ?? false,
    soiling_loss: Math.min(0.5, Math.max(0, soilingPct / 100.0)),
    wind_stow_speed: document.getElementById("wind_stow_enable")?.checked
      ? parseFloat(document.getElementById("wind_stow_speed")?.value || "15")
      : 0
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
  document.getElementById("energyNo").textContent = `${Number(result.daily_irradiance_no_bt || 0).toFixed(0)} Wh/m²`;
  document.getElementById("energyBt").textContent = `${Number(result.daily_irradiance_bt || 0).toFixed(0)} Wh/m²`;
  document.getElementById("energyGain").textContent = `+${Number(result.irradiance_gain_bt_vs_fixed || 0).toFixed(2)}%`;

  const sunTimes = calculateSunTimes(data);
  document.getElementById("sunCycle").textContent = `${sunTimes.sunrise ? formatTimeLabel(sunTimes.sunrise) : "--"} / ${sunTimes.sunset ? formatTimeLabel(sunTimes.sunset) : "--"}`;

  const gcr = calculateGcr();
  document.getElementById("gcrValue").textContent = `${gcr.ratio.toFixed(3)} (${gcr.percent.toFixed(1)}%)`;
}

/* ── Financial calculator ──────────────────────────────────────────── */
function updateFinancialCalc(result) {
  const placeholder = document.getElementById("financialPlaceholder");
  const table = document.getElementById("financialResult");
  if (!result) {
    placeholder?.classList.remove("hidden");
    table?.classList.add("hidden");
    return;
  }

  const rate = parseFloat(document.getElementById("elec_rate")?.value || "0.30");
  const panels = Math.max(1, parseInt(document.getElementById("num_panels")?.value || "1", 10));

  const kwhFixed  = (Number(result.daily_energy_fixed  || 0) * panels);
  const kwhNoBt   = (Number(result.daily_energy_without_backtracking || 0) * panels);
  const kwhBt     = (Number(result.daily_energy_with_backtracking    || 0) * panels);

  const annFixed  = kwhFixed  * 365;
  const annNoBt   = kwhNoBt   * 365;
  const annBt     = kwhBt     * 365;

  const valFixed  = kwhFixed  * rate;
  const valNoBt   = kwhNoBt   * rate;
  const valBt     = kwhBt     * rate;
  const avalFixed = annFixed  * rate;
  const avalNoBt  = annNoBt   * rate;
  const avalBt    = annBt     * rate;

  const gainNoBt  = avalNoBt  - avalFixed;
  const gainBt    = avalBt    - avalFixed;

  const fmt2  = (n) => n.toFixed(2);
  const fmtM  = (n) => n >= 1000 ? `${(n / 1000).toFixed(2)} k` : n.toFixed(0);
  const fmtD  = (n) => `$${fmt2(n)}`;
  const fmtA  = (n) => `$${fmtM(n)}`;
  const sign  = (n) => `${n >= 0 ? "+" : ""}$${fmtM(Math.abs(n))}`;

  document.getElementById("fin_kwh_fixed").textContent  = fmt2(kwhFixed);
  document.getElementById("fin_kwh_nobt").textContent   = fmt2(kwhNoBt);
  document.getElementById("fin_kwh_bt").textContent     = fmt2(kwhBt);
  document.getElementById("fin_ann_fixed").textContent  = fmtM(annFixed);
  document.getElementById("fin_ann_nobt").textContent   = fmtM(annNoBt);
  document.getElementById("fin_ann_bt").textContent     = fmtM(annBt);
  document.getElementById("fin_val_fixed").textContent  = fmtD(valFixed);
  document.getElementById("fin_val_nobt").textContent   = fmtD(valNoBt);
  document.getElementById("fin_val_bt").textContent     = fmtD(valBt);
  document.getElementById("fin_aval_fixed").textContent = fmtA(avalFixed);
  document.getElementById("fin_aval_nobt").textContent  = fmtA(avalNoBt);
  document.getElementById("fin_aval_bt").textContent    = fmtA(avalBt);
  document.getElementById("fin_gain_nobt").textContent  = sign(gainNoBt);
  document.getElementById("fin_gain_bt").textContent    = sign(gainBt);

  placeholder?.classList.add("hidden");
  table?.classList.remove("hidden");
}

function destroyCharts() {
  anglesChart?.destroy();
  sunChart?.destroy();
  shadingChart?.destroy();
  powerChart?.destroy();
  powerWChart?.destroy();
  shadowDirChart?.destroy();
  tempChart?.destroy();
  ghiCompChart?.destroy();
  windChart?.destroy();
  cloudRainChart?.destroy();
  humidityChart?.destroy();
}

// Plugin: draws a vertical accent line + value labels at the current time slider position
const timeLinePlugin = {
  id: "timeLine",
  afterDraw(chart) {
    if (!latestSimulationData.length || !timeSlider) return;
    const idx   = parseInt(timeSlider.value || "0", 10);
    const total = latestSimulationData.length;
    const xScale = chart.scales?.x;
    if (!xScale) return;
    const ratio = Math.max(0, Math.min(1, idx / Math.max(total - 1, 1)));
    const x = xScale.left + ratio * (xScale.right - xScale.left);
    const { top, bottom, right } = chart.chartArea;
    const ctx = chart.ctx;
    const accent = liveTimer
      ? "#22c55e"
      : getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#00c853";
    const isLight = document.documentElement.dataset.theme === "light";

    // Vertical line — solid and brighter when live, dashed otherwise
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.strokeStyle = accent;
    ctx.lineWidth = liveTimer ? 2 : 1.5;
    ctx.setLineDash(liveTimer ? [] : [4, 3]);
    ctx.globalAlpha = liveTimer ? 0.9 : 0.75;
    ctx.stroke();
    ctx.restore();

    // Value labels for each visible dataset
    ctx.save();
    ctx.setLineDash([]);
    const fontSize = 9;
    ctx.font = `bold ${fontSize}px system-ui,sans-serif`;
    ctx.textBaseline = "middle";

    const entries = [];
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      const val = ds.data[idx];
      if (val == null || isNaN(+val)) return;
      const yScale = chart.scales[ds.yAxisID || "y"];
      if (!yScale) return;
      const yPx = yScale.getPixelForValue(+val);
      if (yPx < top - 1 || yPx > bottom + 1) return;
      const color = (typeof ds.borderColor === "string" ? ds.borderColor : null) || accent;
      const num = +val;
      const text = num >= 100 || num <= -100 ? num.toFixed(0) : num.toFixed(1);
      entries.push({ yPx: Math.max(top + 5, Math.min(bottom - 5, yPx)), text, color });
    });

    if (!entries.length) { ctx.restore(); return; }

    // Sort top→bottom, then push down any overlapping labels
    entries.sort((a, b) => a.yPx - b.yPx);
    const minGap = fontSize + 5;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].yPx - entries[i - 1].yPx < minGap)
        entries[i].yPx = entries[i - 1].yPx + minGap;
    }

    // Labels go right of line; flip left when near right edge
    const flipThreshold = right - 36;
    const padX = 3, padY = 2;

    entries.forEach(({ yPx, text, color }) => {
      if (yPx > bottom || yPx < top) return;
      const tw = ctx.measureText(text).width;
      const bw = tw + padX * 2, bh = fontSize + padY * 2;
      const lx = x > flipThreshold ? x - bw - 5 : x + 4;

      // Dot on line
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, yPx, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Pill background
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = isLight ? "rgba(255,255,255,0.93)" : "rgba(10,17,28,0.90)";
      ctx.beginPath();
      ctx.roundRect(lx, yPx - bh / 2, bw, bh, 3);
      ctx.fill();

      // Pill border
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Value text
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillText(text, lx + padX, yPx);
    });

    ctx.restore();
  }
};

function _refreshChartLines() {
  [anglesChart, sunChart, shadingChart, powerChart,
   powerWChart, shadowDirChart, tempChart, ghiCompChart, windChart, cloudRainChart, humidityChart].forEach(c => {
    try { if (c) c.update("none"); } catch (e) {}
  });
}

function compactLegendOptions() {
  return {
    position: "bottom",
    align: "start",
    labels: {
      boxWidth: 10,
      boxHeight: 10,
      padding: 6,
      font: { size: 10 },
      color: "#94a3b8"
    }
  };
}

function chartBaseOptions(yText) {
  const isLight = document.documentElement.dataset.theme === "light";
  const gridColor  = isLight ? "rgba(0,0,0,0.07)"  : "rgba(100,116,139,0.40)";
  const tickColor  = isLight ? "#64748b"            : "#64748b";
  const titleColor = isLight ? "#475569"            : "#94a3b8";
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: compactLegendOptions(),
      tooltip: {
        backgroundColor: isLight ? "rgba(255,255,255,0.97)" : "rgba(13,20,32,0.97)",
        titleColor:      isLight ? "#0f172a"                : "#e2e8f0",
        bodyColor:       isLight ? "#334155"                : "#94a3b8",
        borderColor:     isLight ? "#cbd5e1"                : "#1e2736",
        borderWidth: 1,
        padding: { x: 8, y: 5 },
        titleFont: { size: 11 },
        bodyFont:  { size: 10 },
        boxWidth: 8, boxHeight: 8,
      }
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: tickColor },
        grid: { color: gridColor }
      },
      y: {
        title: { display: false },
        ticks: { font: { size: 10 }, color: tickColor },
        grid: { color: gridColor }
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
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        { label: "Ideal",        data: data.map((r) => r.ideal_tracker_angle),       borderColor: "#60a5fa", borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        { label: "Limited",      data: data.map((r) => r.limited_tracker_angle),     borderColor: "#34d399", borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        { label: "Backtracking", data: data.map((r) => r.backtracking_angle),        borderColor: "#fb923c", borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        {
          label: "Wind Stow",
          data: data.map((r) => r.wind_stow ? 0 : null),
          borderColor: "#ef4444",
          backgroundColor: "#ef4444",
          borderWidth: 0,
          pointRadius: 3,
          pointStyle: "triangle",
          showLine: false,
          tension: 0,
          spanGaps: false
        }
      ]
    },
    options: chartBaseOptions("Angle (deg)")
  });

  sunChart = new Chart(sunCtx, {
    type: "line",
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        { label: "Elevation", data: data.map((r) => r.sun_elevation), borderColor: "#d97706", borderWidth: 1.5, pointRadius: 0, tension: 0.22, yAxisID: "y" },
        { label: "Azimuth",   data: data.map((r) => r.sun_azimuth),   borderColor: "#38bdf8", borderWidth: 1.5, pointRadius: 0, tension: 0.22, yAxisID: "y1" }
      ]
    },
    options: (() => {
      const base = chartBaseOptions("Elevation (deg)");
      const isLight = document.documentElement.dataset.theme === "light";
      const gridColor = isLight ? "rgba(0,0,0,0.07)" : "rgba(100,116,139,0.40)";
      const tickColor = "#64748b";
      base.scales.y  = { ...base.scales.y,  position: "left",  title: { display: false }, ticks: { font: { size: 10 }, color: tickColor }, grid: { color: gridColor } };
      base.scales.y1 = { type: "linear", position: "right", min: 0, max: 360, title: { display: false },
                         ticks: { font: { size: 10 }, color: tickColor, stepSize: 90 }, grid: { drawOnChartArea: false } };
      return base;
    })()
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
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        { label: "No BT",   data: shadowNoBtDisplay,                                          borderColor: "#38bdf8", borderWidth: 2,   pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "BT",      data: shadowBtDisplay,                                             borderColor: "#f472b6", borderWidth: 2,   pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "% No BT", data: data.map((r) => r.shading_percent_without_backtracking),     borderColor: "#fb923c", borderWidth: 1.8, pointRadius: 0, tension: 0.18, borderDash: [8, 4], yAxisID: "y1" },
        { label: "% BT",    data: data.map((r) => r.shading_percent_with_backtracking),        borderColor: "#a78bfa", borderWidth: 1.8, pointRadius: 0, tension: 0.18, borderDash: [3, 3], yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: compactLegendOptions() },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: "#64748b" }, grid: { color: document.documentElement.dataset.theme === "light" ? "rgba(0,0,0,0.07)" : "rgba(100,116,139,0.40)" } },
        y: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          min: 0,
          max: Math.max(5, Math.ceil(maxShadowLen * 1.15)),
          title: { display: false },
          ticks: { font: { size: 10 }, color: "#64748b" },
          grid: { color: document.documentElement.dataset.theme === "light" ? "rgba(0,0,0,0.07)" : "rgba(100,116,139,0.40)" }
        },
        y1: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          min: 0,
          max: Math.max(5, Math.ceil(maxShadingPercent + 1)),
          title: { display: false },
          ticks: { font: { size: 10 }, color: "#64748b" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  powerChart = new Chart(powerCtx, {
    type: "line",
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        {
          label: "Fixed Panel",
          data: data.map((r) => r.irradiance_fixed),
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.07)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.22
        },
        {
          label: "Tracker – No BT",
          data: data.map((r) => r.irradiance_without_backtracking),
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.07)",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.22
        },
        {
          label: "Tracker – BT",
          data: data.map((r) => r.irradiance_with_backtracking),
          borderColor: "#00e5ff",
          backgroundColor: "rgba(0,229,255,0.07)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.22
        }
      ]
    },
    options: chartBaseOptions("Irradiance (W/m²)")
  });

  // ── Power Output (W) — temperature-derated via pvlib noct_sam ─────────
  powerWChart = new Chart(powerWCtx, {
    type: "line",
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        { label: "Fixed Panel",    data: data.map(r => r.power_fixed),                borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.07)",   borderWidth: 2,   pointRadius: 0, tension: 0.22 },
        { label: "Tracker – No BT", data: data.map(r => r.power_without_backtracking), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.07)", borderWidth: 1.5, pointRadius: 0, tension: 0.22 },
        { label: "Tracker – BT",    data: data.map(r => r.power_with_backtracking),    borderColor: "#00e5ff", backgroundColor: "rgba(0,229,255,0.07)",   borderWidth: 2,   pointRadius: 0, tension: 0.22 },
      ]
    },
    options: chartBaseOptions("Power (W)")
  });

  // ── Shadow Direction E/W — pvlib projected_solar_zenith sign ──────────
  // Clamp before applying sign so extreme low-elevation shadows don't blow the scale
  const shadowDirBt   = data.map(r => {
    const s = clampShadowForDisplay(r.shadow_length_with_backtracking);
    return (r.projected_solar_zenith ?? 0) >= 0 ? s : -s;
  });
  const shadowDirNoBt = data.map(r => {
    const s = clampShadowForDisplay(r.shadow_length_without_backtracking);
    return (r.projected_solar_zenith ?? 0) >= 0 ? s : -s;
  });
  const maxShadowDirAbs = Math.max(...shadowDirBt.map(Math.abs), ...shadowDirNoBt.map(Math.abs), 1);

  shadowDirChart = new Chart(shadowDirCtx, {
    type: "line",
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        { label: "Shadow BT (+ East / − West)",    data: shadowDirBt,   borderColor: "#00e5ff", backgroundColor: "rgba(0,229,255,0.07)",   borderWidth: 2,   pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "Shadow No BT (+ East / − West)", data: shadowDirNoBt, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.06)", borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "Shading % BT", data: data.map(r => r.shading_percent_with_backtracking), borderColor: "#ef4444", borderWidth: 1.5, borderDash: [3,3], pointRadius: 0, tension: 0.18, yAxisID: "y1" },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: compactLegendOptions() },
      scales: {
        x:  { ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: "#64748b" }, grid: { color: "rgba(100,116,139,0.40)" } },
        y:  { type: "linear", position: "left", min: -maxShadowDirAbs, max: maxShadowDirAbs,
              title: { display: false }, ticks: { font: { size: 10 }, color: "#64748b" }, grid: { color: "rgba(100,116,139,0.40)" } },
        y1: { type: "linear", position: "right", beginAtZero: true, min: 0, max: 100,
              title: { display: false }, ticks: { font: { size: 10 }, color: "#64748b" }, grid: { drawOnChartArea: false } },
      }
    }
  });

  // ── Cell Temperature — pvlib noct_sam ─────────────────────────────────
  const _tempAmb  = data.map(r => r.temp      != null ? Number(r.temp)      : 20);
  const _tempCell = data.map(r => r.cell_temp != null ? Number(r.cell_temp) : 20);
  const _tempBase = (() => {
    const base = chartBaseOptions("Temperature (°C)");
    base.scales.y = { ...base.scales.y, suggestedMin: 0, suggestedMax: Math.max(..._tempCell, 40) + 5 };
    return base;
  })();

  tempChart = new Chart(tempCtx, {
    type: "line",
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        { label: "Ambient (°C)",   data: _tempAmb,  borderColor: "#94a3b8", borderWidth: 1.5, borderDash: [4,3], pointRadius: 0, tension: 0.22 },
        { label: "Cell Temp (°C)", data: _tempCell, borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.08)", borderWidth: 2, pointRadius: 0, tension: 0.22 },
      ]
    },
    options: _tempBase
  });

  // ── Cloud Cover & GHI — dual-axis ─────────────────────────────────────
  const isLight = document.documentElement.dataset.theme === "light";
  const gridColor = isLight ? "rgba(0,0,0,0.07)" : "rgba(100,116,139,0.40)";

  ghiCompChart = new Chart(ghiCompCtx, {
    type: "line",
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        { label: "Clear-sky GHI", data: data.map(r => r.clearsky_ghi   != null ? Number(r.clearsky_ghi)   : (r.ghi != null ? Number(r.ghi) : 0)), borderColor: "#f59e0b", borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, tension: 0.22, yAxisID: "y" },
        { label: "Actual GHI",    data: data.map(r => r.irradiance_raw != null ? Number(r.irradiance_raw) : (r.ghi != null ? Number(r.ghi) : 0)), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.07)", borderWidth: 2, pointRadius: 0, tension: 0.22, yAxisID: "y" },
        { label: "Cloud Cover %", data: data.map(r => Number(r.cloud_cover ?? 0)), borderColor: "#94a3b8", backgroundColor: "rgba(148,163,184,0.10)", borderWidth: 1.5, borderDash: [3,3], pointRadius: 0, tension: 0.22, yAxisID: "y1" },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: compactLegendOptions() },
      scales: {
        x:  { ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: "#64748b" }, grid: { color: gridColor } },
        y:  { type: "linear", position: "left",  beginAtZero: true, title: { display: false }, ticks: { font: { size: 10 }, color: "#64748b" }, grid: { color: gridColor } },
        y1: { type: "linear", position: "right", beginAtZero: true, min: 0, max: 100, title: { display: false }, ticks: { font: { size: 10 }, color: "#64748b" }, grid: { drawOnChartArea: false } },
      }
    }
  });

  // ── Wind Speed & Stow threshold ────────────────────────────────────────
  const windStowEnabled = document.getElementById("wind_stow_enable")?.checked ?? true;
  const windStowSpeed   = windStowEnabled ? parseFloat(document.getElementById("wind_stow_speed")?.value || "15") : 0;
  const _maxWindActual  = Math.max(...data.map(r => Number(r.wind_speed ?? 1)), 1);
  // Y-axis: show enough to see actual wind clearly; always include stow threshold + 20%
  const maxWind = Math.max(
    _maxWindActual * 1.3,
    windStowEnabled ? windStowSpeed * 1.2 : 0,
    5
  );

  windChart = new Chart(windCtx, {
    type: "line",
    plugins: [timeLinePlugin],
    data: {
      labels,
      datasets: [
        {
          label: "Wind Speed (m/s)",
          data: data.map(r => r.wind_speed != null ? Number(r.wind_speed) : 1),
          borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.08)",
          borderWidth: 2, pointRadius: 0, tension: 0.22, fill: true, yAxisID: "y"
        },
        {
          label: windStowEnabled ? `Stow @ ${windStowSpeed} m/s` : "Stow disabled",
          data: windStowEnabled ? data.map(() => windStowSpeed) : data.map(() => null),
          borderColor: "#fb923c", borderWidth: 1.5, borderDash: [6,4],
          pointRadius: 0, tension: 0, yAxisID: "y"
        },
        {
          label: "Stow active",
          data: data.map(r => r.wind_stow ? Number(r.wind_speed ?? 1) : null),
          borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.25)",
          borderWidth: 0, pointRadius: 3, pointStyle: "circle", showLine: false, yAxisID: "y"
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: compactLegendOptions() },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: "#64748b" }, grid: { color: gridColor } },
        y: { type: "linear", position: "left", beginAtZero: true, max: Math.ceil(maxWind * 1.2), title: { display: false }, ticks: { font: { size: 10 }, color: "#64748b" }, grid: { color: gridColor } }
      }
    }
  });

  // ── Cloud Cover & Precipitation chart ───────────────────────────────
  if (cloudRainCtx) {
    const maxPrecip = Math.max(...data.map(r => Number(r.precipitation ?? 0)), 0.1);
    cloudRainChart = new Chart(cloudRainCtx, {
      type: "bar",
      plugins: [timeLinePlugin],
      data: {
        labels,
        datasets: [
          {
            type: "line",
            label: "Cloud Cover (%)",
            data: data.map(r => r.cloud_cover != null ? Number(r.cloud_cover) : 0),
            borderColor: "#94a3b8", backgroundColor: "rgba(148,163,184,0.15)",
            borderWidth: 1.5, pointRadius: 0, tension: 0.22, fill: true,
            yAxisID: "y"
          },
          {
            type: "bar",
            label: "Precipitation (mm/h)",
            data: data.map(r => r.precipitation != null ? Number(r.precipitation) : 0),
            backgroundColor: "rgba(56,189,248,0.55)",
            borderColor: "#38bdf8",
            borderWidth: 1,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: compactLegendOptions() },
        scales: {
          x: { ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: "#64748b" }, grid: { color: gridColor } },
          y:  { type: "linear", position: "left",  min: 0, max: 100, title: { display: false }, ticks: { font: { size: 10 }, color: "#64748b" }, grid: { color: gridColor } },
          y1: { type: "linear", position: "right", beginAtZero: true, max: Math.max(Math.ceil(maxPrecip * 1.3), 1),
                title: { display: false }, ticks: { font: { size: 10 }, color: "#38bdf8" }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // ── Humidity & Dew Point chart ───────────────────────────────────────
  if (humidityCtx) {
    const dewMin = Math.min(...data.map(r => Number(r.dew_point ?? 0))) - 2;
    const dewMax = Math.max(...data.map(r => Number(r.dew_point ?? 20))) + 2;
    humidityChart = new Chart(humidityCtx, {
      type: "line",
      plugins: [timeLinePlugin],
      data: {
        labels,
        datasets: [
          {
            label: "Relative Humidity (%)",
            data: data.map(r => r.humidity != null ? Number(r.humidity) : null),
            borderColor: "#818cf8", backgroundColor: "rgba(129,140,248,0.12)",
            borderWidth: 1.5, pointRadius: 0, tension: 0.22, fill: true, yAxisID: "y"
          },
          {
            label: "Dew Point (°C)",
            data: data.map(r => r.dew_point != null ? Number(r.dew_point) : null),
            borderColor: "#34d399", borderWidth: 1.5, borderDash: [4, 3],
            pointRadius: 0, tension: 0.22, fill: false, yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: compactLegendOptions() },
        scales: {
          x:  { ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: "#64748b" }, grid: { color: gridColor } },
          y:  { type: "linear", position: "left",  min: 0, max: 100, title: { display: false }, ticks: { font: { size: 10 }, color: "#818cf8" }, grid: { color: gridColor } },
          y1: { type: "linear", position: "right", min: Math.floor(dewMin), max: Math.ceil(dewMax),
                title: { display: false }, ticks: { font: { size: 10 }, color: "#34d399" }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }
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


function drawPanelAt(ctx, pivotX, pivotY, angleRad, panelLength, color, label, groundY, isLight = false) {
  const x1 = pivotX - Math.cos(angleRad) * panelLength / 2;
  const y1 = pivotY - Math.sin(angleRad) * panelLength / 2;
  const x2 = pivotX + Math.cos(angleRad) * panelLength / 2;
  const y2 = pivotY + Math.sin(angleRad) * panelLength / 2;

  // mast
  ctx.strokeStyle = isLight ? "#64748b" : "#334155";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pivotX, groundY);
  ctx.lineTo(pivotX, pivotY);
  ctx.stroke();

  // pivot
  ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
  ctx.fill();

  // panel
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.fillStyle = isLight ? "#1e3a5f" : "#94a3b8";
  ctx.font = "bold 11px Arial";
  ctx.fillText(label, pivotX - 16, groundY + 13);

  return {
    leftX: Math.min(x1, x2),
    rightX: Math.max(x1, x2),
    topY: Math.min(y1, y2),
    bottomY: Math.max(y1, y2),
    // actual panel endpoints (x1/y1 = left end, x2/y2 = right end)
    ex1: x1, ey1: y1,
    ex2: x2, ey2: y2
  };
}



function drawSunIcon(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(245,158,11,0.65)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const x1 = x + Math.cos(a) * (r + 2);
    const y1 = y + Math.sin(a) * (r + 2);
    const x2 = x + Math.cos(a) * (r + 7);
    const y2 = y + Math.sin(a) * (r + 7);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}




function draw2DScene(row, overrideCtx, overrideW, overrideH) {
  if (!row) return;
  let ctx, width, height;
  if (overrideCtx) {
    ctx = overrideCtx; width = overrideW; height = overrideH;
  } else {
    if (!tracker2dCtx) return;
    const size = resizeTrackerCanvas();
    if (!size) return;
    ctx = tracker2dCtx; width = size.width; height = size.height;
  }
  ctx.clearRect(0, 0, width, height);

  const payload = getPayload();

  const groundY = height * (width < 640 ? 0.85 : 0.80);
  const skyTop = 18;
  const skyHeight = groundY - skyTop - 40;

  const isLight = document.documentElement.dataset.theme === "light";

  // background
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  if (isLight) {
    sky.addColorStop(0,    "#c8dff0");
    sky.addColorStop(0.65, "#ddeef8");
    sky.addColorStop(1,    "#eaf4fb");
  } else {
    sky.addColorStop(0,    "#060a0f");
    sky.addColorStop(0.70, "#0a0e16");
    sky.addColorStop(1,    "#0d1420");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, groundY);

  ctx.fillStyle = isLight ? "#b8cfa0" : "#080c12";
  ctx.fillRect(0, groundY, width, height - groundY);

  // visual scaling
  const visualRowSpacingM = Math.min(Math.max(payload.row_spacing, payload.panel_width * 1.8), 10);
  const visualMeters = Math.max(visualRowSpacingM * 1.2, payload.panel_width * 3.2, MAX_SHADOW_2D_DISPLAY_M, 7);
  const ppm = Math.min(92, (width - 120) / visualMeters);

  const rowSpacingPx = Math.max(88, Math.min(width * 0.42, payload.row_spacing * ppm));
  const panelLengthPx = Math.max(58, Math.min(width < 640 ? width * 0.17 : width * 0.24, payload.panel_width * ppm));

  const trackerHeightPx = Math.max(
    width < 640 ? 50 : 46,
    Math.min(height * (width < 640 ? 0.20 : 0.26), payload.tracker_height * ppm * 0.88)
  );

  const centerX = width / 2;
  const mast1X = centerX - rowSpacingPx / 2;
  const mast2X = centerX + rowSpacingPx / 2;
  const pivotY = groundY - trackerHeightPx;

  // ground
  ctx.strokeStyle = isLight ? "#3a7c28" : "rgba(100,116,139,0.55)";
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
  const shadingPercentSelected = Number(
    useBacktracking ? row.shading_percent_with_backtracking : row.shading_percent_without_backtracking
  );

  const shownShadowRaw = Number(
    useBacktracking ? row.shadow_length_with_backtracking : row.shadow_length_without_backtracking
  );
  const shownShadowDisplay = clampShadowForDisplay(shownShadowRaw, MAX_SHADOW_2D_DISPLAY_M);

  // east side = left, west side = right
  const sunOnLeft = azimuth < 180;

  // visual tracker should face the sun
  const visualAngle = sunOnLeft ? -Math.abs(trackerAngle) : Math.abs(trackerAngle);
  const angleRad = visualAngle * Math.PI / 180;

  const panelColor = getAccentColor();
  const panelA = drawPanelAt(ctx, mast1X, pivotY, angleRad, panelLengthPx, panelColor, "Row A", groundY, isLight);
  const panelB = drawPanelAt(ctx, mast2X, pivotY, angleRad, panelLengthPx, panelColor, "Row B", groundY, isLight);

  if (elevation > 0) {
    // smooth arc from east(90) to west(270)
    const azClamped = Math.max(90, Math.min(270, azimuth));
    const azNorm = (azClamped - 90) / 180;
    const sunX = 44 + azNorm * (width - 88);
    const elevNorm = Math.max(0, Math.min(1, elevation / 90));


    const sunYOffset = width < 640 ? 10 : 14;
    const sunHeightBoost = width < 640 ? 30 : 55;
    const sunY = groundY - sunYOffset - elevNorm * (skyHeight + sunHeightBoost);

    drawSunIcon(ctx, sunX, sunY, 8);

    // shadow opposite to sun — only draw when shadow actually exists
    if (shownShadowDisplay > 0) {
      const shadowPx = shownShadowDisplay * ppm;
      const shadowSourceX = sunOnLeft ? mast1X : mast2X;
      const shadowEndX = sunOnLeft ? shadowSourceX + shadowPx : shadowSourceX - shadowPx;

      ctx.strokeStyle = isLight ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.40)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(shadowSourceX, groundY);
      ctx.lineTo(shadowEndX, groundY);
      ctx.stroke();

      ctx.strokeStyle = isLight ? "rgba(30,58,95,0.60)" : "rgba(148,163,184,0.90)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(shadowSourceX, groundY);
      ctx.lineTo(shadowEndX, groundY);
      ctx.stroke();
    }

    // downstream row shading — drawn as a red line segment ON the tilted panel
    if (shadingPercentSelected > MIN_SHADING_VISUAL_PERCENT) {
      const targetPanel = sunOnLeft ? panelB : panelA;
      const shade = Math.min(shadingPercentSelected / 100, 1);

      // The shaded end faces the upstream row (into the shadow).
      // sunOnLeft → shadow goes right → downstream panel B → shaded end = left end (ex1/ey1)
      // sunOnRight → shadow goes left → downstream panel A → shaded end = right end (ex2/ey2)
      const [sx, sy, ex2, ey2] = sunOnLeft
        ? [targetPanel.ex1, targetPanel.ey1, targetPanel.ex2, targetPanel.ey2]
        : [targetPanel.ex2, targetPanel.ey2, targetPanel.ex1, targetPanel.ey1];

      const shadeEndX = sx + (ex2 - sx) * shade;
      const shadeEndY = sy + (ey2 - sy) * shade;

      // thick semi-transparent fill under the highlight
      ctx.strokeStyle = "rgba(239,68,68,0.30)";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(shadeEndX, shadeEndY);
      ctx.stroke();

      // sharp red outline on top
      ctx.strokeStyle = "rgba(239,68,68,0.90)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(shadeEndX, shadeEndY);
      ctx.stroke();
      ctx.lineCap = "butt";

      ctx.fillStyle = "#ef4444";
      ctx.font = "12px Arial";
      ctx.fillText(`Shading ${shadingPercentSelected.toFixed(1)}%`, width / 2 - 42, pivotY - 22);
      setBadge(badgeShading, "Shading: Yes", "badge-red");
    } else {
      ctx.fillStyle = getAccentColor();
      ctx.font = "12px Arial";
      ctx.fillText("No Shading", width / 2 - 28, pivotY - 22);
      setBadge(badgeShading, "Shading: No", "badge-green");
    }
  } else {
    ctx.fillStyle = isLight ? "#334155" : "#475569";
    ctx.font = "12px Arial";
    ctx.fillText("Night / No Sun", width - 116, 26);
    setBadge(badgeShading, "Shading: --", "badge-gray");
  }

  const compressed = payload.row_spacing > 10 || shownShadowRaw > MAX_SHADOW_2D_DISPLAY_M;
  setBadge(
    badgeMode,
    `Mode: ${useBacktracking ? "Backtracking ON" : "Backtracking OFF"}`,
    useBacktracking ? "badge-blue" : "badge-gray"
  );
  setBadge(
    badgeScale,
    compressed ? "View: Display scaled" : "View: 1:1",
    compressed ? "badge-gray" : "badge-green"
  );

  // top info
  ctx.fillStyle = isLight ? "#1e3a5f" : "#94a3b8";
  ctx.font = width < 500 ? "11px Arial" : "12px Arial";
  ctx.fillText(`Time: ${formatTimeLabel(row.timestamp)}`, 16, 18);
  ctx.fillText(`Sun Elevation: ${elevation.toFixed(1)}°`, 16, 32);
  ctx.fillText(`Sun Azimuth: ${azimuth.toFixed(1)}°`, 16, 46);
  ctx.fillText(`Tracker Angle: ${trackerAngle.toFixed(1)}°`, 16, 60);
  ctx.fillText(`Shadow: ${formatShadowMetric(shownShadowRaw)}`, 16, 74);

  // Dark info strip — gives the Row labels + shading text a clean background
  ctx.fillStyle = isLight ? "rgba(170,205,140,0.55)" : "rgba(2,5,10,0.75)";
  ctx.fillRect(0, groundY + 2, width, height - groundY - 2);

  // Bottom text — anchored to groundY so it never collides with Row A/B labels
  // Row labels are at groundY+12; shading text starts at groundY+26
  ctx.fillStyle = isLight ? "#1e3a5f" : "#64748b";
  const bFont = width < 500 ? "10px Arial" : "11px Arial";
  ctx.font = bFont;
  const col2X = width < 640 ? Math.floor(width / 2) : 170;
  ctx.fillText(`Shading (No BT): ${shadingNoBt.toFixed(2)}%`,   8,     groundY + 26);
  ctx.fillText(`Shading (BT): ${shadingBt.toFixed(2)}%`,        col2X, groundY + 26);

  if (shownShadowRaw > MAX_SHADOW_2D_DISPLAY_M) {
    ctx.font = "10px Arial";
    ctx.fillText(`Shadow capped at ${MAX_SHADOW_2D_DISPLAY_M} m`, 8, groundY + 40);
  }
}


function update2DFrame(index) {
  if (!latestSimulationData.length) return;
  const safeIndex = Math.max(0, Math.min(index, latestSimulationData.length - 1));
  if (timeSlider) timeSlider.value = String(safeIndex);
  if (timeLabel) timeLabel.textContent = formatTimeLabel(latestSimulationData[safeIndex].timestamp);
  // keep modal slider in sync
  const modalSlider = document.getElementById("tracker2dModalSlider");
  const modalSliderTime = document.getElementById("tracker2dModalSliderTime");
  if (modalSlider) modalSlider.value = String(safeIndex);
  if (modalSliderTime) modalSliderTime.textContent = formatTimeLabel(latestSimulationData[safeIndex].timestamp);
  draw2DScene(latestSimulationData[safeIndex]);
  if (_tracker2dModalOpen) _drawTracker2dModal();
  _refreshChartLines();
}

function setPlaybackState(isPlaying) {
  if (!play2dBtn || !pause2dBtn) return;

  play2dBtn.classList.toggle("active", isPlaying);
  pause2dBtn.classList.toggle("active", !isPlaying);

  play2dBtn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
  pause2dBtn.setAttribute("aria-pressed", isPlaying ? "false" : "true");
}

function stop2DPlayback() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  setPlaybackState(false);
}

/* ── Live Mode ────────────────────────────────────────────────────── */
// Finds the simulation row whose timestamp is closest to the current
// real-world local time and jumps the slider + 2D canvas to that frame.
// Updates every 30 seconds automatically.

function _liveCurrentIndex() {
  if (!latestSimulationData.length) return 0;
  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();
  let best = 0, bestDiff = Infinity;
  latestSimulationData.forEach((row, i) => {
    const t = new Date(row.timestamp);
    const rowMin = t.getHours() * 60 + t.getMinutes();
    const diff = Math.abs(rowMin - hhmm);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  });
  return best;
}

function _liveCheckDateMismatch() {
  const simDate = document.getElementById("date")?.value;   // "YYYY-MM-DD"
  if (!simDate) return;
  const today = new Date().toISOString().slice(0, 10);
  const warn = document.getElementById("liveDateWarn");
  if (warn) warn.style.display = simDate !== today ? "inline" : "none";
}

function stopLiveMode() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  liveModeBtn?.classList.remove("live-active");
  liveModeBtn?.setAttribute("aria-pressed", "false");
  const warn = document.getElementById("liveDateWarn");
  if (warn) warn.style.display = "none";
}

function startLiveMode() {
  if (!latestSimulationData.length) {
    showPopup("Run simulation first.", "error"); return;
  }
  stop2DPlayback();         // stop animation playback if running
  liveModeBtn?.classList.add("live-active");
  liveModeBtn?.setAttribute("aria-pressed", "true");

  const tick = () => {
    if (!latestSimulationData.length) { stopLiveMode(); return; }
    _liveCheckDateMismatch();
    update2DFrame(_liveCurrentIndex());
  };
  tick();                   // jump immediately
  liveTimer = setInterval(tick, 30_000);  // refresh every 30s
}

function toggleLiveMode() {
  if (liveTimer) { stopLiveMode(); } else { startLiveMode(); }
}

function start2DPlayback() {
  if (!latestSimulationData.length || !timeSlider) {
    showPopup("Run simulation first.", "error");
    return;
  }
  stopLiveMode();   // live mode and playback are mutually exclusive

  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }

  setPlaybackState(true);

  playTimer = setInterval(() => {
    if (!latestSimulationData.length) {
      stop2DPlayback();
      return;
    }

    let current = parseInt(timeSlider.value || "0", 10);
    let next = current + 1;

    if (next >= latestSimulationData.length) {
      next = 0;
    }

    update2DFrame(next);
  }, 140);
}

function setup2DControls() {
  if (!timeSlider || !play2dBtn || !pause2dBtn) return;

  setPlaybackState(false);

  timeSlider.addEventListener("input", () => {
    stop2DPlayback();
    stopLiveMode();
    update2DFrame(parseInt(timeSlider.value, 10));
  });

  play2dBtn.addEventListener("click", () => {
    start2DPlayback();
  });

  pause2dBtn.addEventListener("click", () => {
    stop2DPlayback();
  });

  liveModeBtn?.addEventListener("click", toggleLiveMode);

  // ⓘ info toggle: show/hide .chart-legend-note on mobile
  document.querySelectorAll(".info-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const visible = target.classList.toggle("info-visible");
      btn.classList.toggle("active", visible);
    });
  });

  window.addEventListener("resize", () => {
    if (!latestSimulationData.length) return;
    update2DFrame(parseInt(timeSlider?.value || "0", 10));
  });
}

async function runSimulation() {
  const payload = getPayload();
  localStorage.setItem("solarInputs", JSON.stringify(payload));
  updateScenarioHeader();
  preview.textContent = "Loading simulation...";
  showPopup("Running simulation… (first load may take ~30s to wake server)", "info", 8000);

  try {
    // 90s timeout — Render free tier can take ~30-50s to wake from sleep
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    const response = await fetch(`${API_BASE}/simulate/day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

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
    // sync modal slider max to data length
    const modalSlider = document.getElementById("tracker2dModalSlider");
    if (modalSlider) modalSlider.max = String(latestSimulationData.length - 1);
    setBadge(badgeApi, "API: Connected", "badge-green");

preview.textContent = JSON.stringify(
  {
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
    date: result.date,
    total_points: result.total_points,
    daily_irradiance_fixed: result.daily_irradiance_fixed,
    daily_irradiance_no_bt: result.daily_irradiance_no_bt,
    daily_irradiance_bt: result.daily_irradiance_bt,
    irradiance_gain_bt_vs_fixed: result.irradiance_gain_bt_vs_fixed,
    irradiance_gain_bt_vs_no_bt: result.irradiance_gain_bt_vs_no_bt,
    row_540: result.data[540],
    row_720: result.data[720],
    row_900: result.data[900]
  },
  null,
  2
);

    updateSummary(result);
    updateFinancialCalc(result);
    buildCharts(latestSimulationData);
    if (timeSlider) timeSlider.max = String(Math.max(0, latestSimulationData.length - 1));
    update2DFrame(Math.min(720, Math.max(0, latestSimulationData.length - 1)));
    stop2DPlayback();

    // Weather source badge + popup
    const src = result.weather_source || "clearsky (ineichen)";
    const isReal    = src.startsWith("Open-Meteo");
    const isFailed  = src.includes("failed");
    const wantedReal = payload.use_real_weather;

    setBadge(
      document.getElementById("badgeWeather"),
      `Weather: ${isReal ? "Real ✓" : "Clear-sky"}`,
      isReal ? "badge-green" : (isFailed ? "badge-red" : "badge-gray")
    );

    // Build a clear post-simulation status popup
    if (wantedReal && !isReal) {
      // User wanted real weather but got clearsky (fetch failed or unavailable)
      const reason = isFailed
        ? "Open-Meteo fetch failed — check internet or try another date."
        : "Clearsky model used (weather unavailable for this date/location).";
      showPopup(`⚠ Weather: ${reason} Irradiance and temperature are clearsky estimates.`, "warning", 8000);
    } else if (isReal) {
      const soiling = payload.soiling_loss > 0 ? ` | Soiling: ${(payload.soiling_loss * 100).toFixed(0)}%` : "";
      showPopup(`✓ Real weather loaded (${src})${soiling}. Irradiance reflects actual conditions.`, "success", 6000);
    } else {
      showPopup("Simulation complete — clearsky model.", "success", 3000);
    }
  } catch (error) {
    preview.textContent = `Request failed:\n${error?.message ?? error}`;
    await handleApiError(error);
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
    preview.textContent = `CSV download failed:\n${error?.message ?? error}`;
    await handleApiError(error);
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

function setupPresetButtons() {
const presetDublin = document.getElementById("presetDublin");
const presetDubai = document.getElementById("presetDubai");
const detectTimezoneBtn = document.getElementById("detectTimezoneBtn");
const resetPresetBtn = document.getElementById("resetPresetBtn");

presetDublin?.addEventListener("click", () => {
document.getElementById("latitude").value = "53.3498";
document.getElementById("longitude").value = "-6.2603";
document.getElementById("timezone").value = "Europe/Dublin";
updateLocationPreviewFromInputs();
updateScenarioHeader();
});

presetDubai?.addEventListener("click", () => {
document.getElementById("latitude").value = "25.2048";
document.getElementById("longitude").value = "55.2708";
document.getElementById("timezone").value = "Asia/Dubai";
updateLocationPreviewFromInputs();
updateScenarioHeader();
});

detectTimezoneBtn?.addEventListener("click", () => {
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzEl = document.getElementById("timezone");
if (tzEl && browserTz) {
tzEl.value = browserTz;
updateScenarioHeader();
showPopup(`Detected timezone: ${browserTz}`, "success");
}
});

resetPresetBtn?.addEventListener("click", () => {
document.getElementById("latitude").value = "53.3498";
document.getElementById("longitude").value = "-6.2603";
document.getElementById("timezone").value = "Europe/Dublin";
document.getElementById("panel_width").value = "2.0";
document.getElementById("panel_height").value = "1.1";
document.getElementById("tracker_height").value = "1.5";
document.getElementById("row_spacing").value = "5.5";
document.getElementById("panel_efficiency").value = "0.20";
document.getElementById("max_angle").value = "60";
document.getElementById("backtracking").checked = true;
updateLocationPreviewFromInputs();
updateScenarioHeader();
showPopup("Inputs reset.", "success");
});
}

function pdfIsMobileView() {
  return window.innerWidth <= 768;
}

function pdfPageBackground(doc) {
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, 210, 297, "F");
}

function pdfSectionTitle(doc, title, x, y) {
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title, x, y);
}

function pdfSectionBox(doc, x, y, w, h) {
  doc.setDrawColor(220, 226, 232);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
}

/* ── Offscreen PDF chart helpers ──────────────────────────────────────
 * Creates a detached 2000×1500 canvas (never added to DOM), builds a
 * Chart.js instance with animation:false + responsive:false so it draws
 * synchronously, composites onto white, returns a JPEG data-URL.
 * jsPDF then downscales this to 160×120mm → sharp, clean output.
 * ──────────────────────────────────────────────────────────────────── */
// Canvas is 1200×900px; jsPDF slots it into 160×120mm ≈ 454×341px → scale ~2.64×.
// Multiply target pt size × 2.64:
//   legend/title 11pt → 29px | ticks 9pt → 24px
function _pdfChartOpts(yText) {
  const grid = "rgba(0,0,0,0.11)";
  const tick = "#1e293b";
  return {
    responsive: false,
    animation: false,
    maintainAspectRatio: false,
    layout: { padding: { top: 6, right: 24, bottom: 6, left: 6 } },
    plugins: {
      legend: { display: true, position: "top",
        labels: { font: { size: 26, weight: "600" }, color: "#0f172a", boxWidth: 24, padding: 18 } },
      tooltip: { enabled: false }
    },
    scales: {
      x: { ticks: { maxTicksLimit: 10, font: { size: 22 }, color: tick, maxRotation: 0 },
           grid: { color: grid } },
      y: { title: { display: true, text: yText, font: { size: 26, weight: "700" }, color: "#0f172a" },
           ticks: { font: { size: 22 }, color: tick }, grid: { color: grid } }
    }
  };
}

function pdfOffscreenChart(config) {
  try {
    // 1200×900 is safe across all mobile browsers (iOS Safari caps ~4096px
    // total area; 2000×1500=3M pixels was too close to limits on some devices).
    // jsPDF downscales to 160×120mm regardless — quality is still sharp.
    // devicePixelRatio:1 prevents Chart.js from scaling the canvas by the
    // device ratio (2-3× on mobile retina), which would push it to 3600×2700
    // and exceed mobile canvas limits, causing data to bunch at the right edge.
    const CW = 1200, CH = 900;
    const chartCanvas = document.createElement("canvas");
    chartCanvas.width = CW; chartCanvas.height = CH;
    const mergedConfig = {
      ...config,
      options: { ...config.options, devicePixelRatio: 1 }
    };
    const chart = new Chart(chartCanvas, mergedConfig);
    // animation:false means Chart.js drew synchronously in the constructor
    // call stop+draw as belt-and-suspenders safety
    chart.stop?.();
    if (typeof chart.draw === "function") chart.draw();

    // Composite onto white (canvas background is transparent by default)
    const out = document.createElement("canvas");
    out.width = CW; out.height = CH;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CW, CH);
    ctx.drawImage(chartCanvas, 0, 0);

    const data = out.toDataURL("image/jpeg", 0.92);
    chart.destroy();
    return data;
  } catch (e) {
    console.warn("pdfOffscreenChart failed:", e);
    return null;
  }
}

function pdfTextBlock(doc, lines, x, y, lineHeight = 5.6) {
  lines.forEach((line) => {
    doc.text(String(line), x, y);
    y += lineHeight;
  });
  return y;
}

function pdfMetricBox(doc, x, y, w, h, title, value) {
  doc.setDrawColor(220, 226, 232);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(title, x + 3, y + 5);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(String(value), x + 3, y + 12);
}

function pdfSafeCanvasData(canvas, jpeg = true) {
  if (!canvas) return null;
  try {
    // Composite source canvas onto white background before export
    const W = canvas.width  || (jpeg ? 800 : 910);
    const H = canvas.height || (jpeg ? 600 : 360);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width  = W;
    exportCanvas.height = H;
    const ctx = exportCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(canvas, 0, 0, W, H);
    return exportCanvas.toDataURL(jpeg ? "image/jpeg" : "image/png", jpeg ? 0.92 : 1.0);
  } catch (e) {
    return null;
  }
}


function pdfSafeTrackerData() {
  try {
    if (typeof update2DFrame === "function") {
      update2DFrame(parseInt(timeSlider?.value || "0", 10));
    }
    return trackerCanvas?.toDataURL("image/png", 1.0) || null;
  } catch (e) {
    return null;
  }
}

function pdfFormatShadowMetric(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "--";
  if (n > 9999) return `${n.toExponential(2)} m`;
  if (n > 999) return `${Math.round(n)} m`;
  return `${n.toFixed(2)} m`;
}

function pdfBuildSummarySentence(result) {
  const gainVsFixed = Number(result?.irradiance_gain_bt_vs_fixed || 0);
  const gainVsNoBt  = Number(result?.irradiance_gain_bt_vs_no_bt || 0);
  return `BT tracker vs fixed panel: ${gainVsFixed >= 0 ? "+" : ""}${gainVsFixed.toFixed(2)}% irradiance. ` +
         `BT vs No-BT tracker: ${gainVsNoBt >= 0 ? "+" : ""}${gainVsNoBt.toFixed(2)}%.`;
}

function pdfBuildDimensionDiagramDataUrl(payload, mobileView = false) {
  const canvas = document.createElement("canvas");
  canvas.width = mobileView ? 1200 : 1600;
  canvas.height = mobileView ? 620 : 760;
  const ctx = canvas.getContext("2d");

  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const marginX = 120;
  const groundY = 500;

  const rowSpacingValue = Math.max(Number(payload.row_spacing || 5.5), 0.1);
  const panelWidthValue = Math.max(Number(payload.panel_width || 2.0), 0.1);
  const trackerHeightValue = Math.max(Number(payload.tracker_height || 1.5), 0.1);

  const usableWidth = W - marginX * 2;
  const metersToPxX = usableWidth / (rowSpacingValue * 1.55);
  const metersToPxY = 210 / trackerHeightValue;

  const mast1X = 420;
  const mast2X = mast1X + rowSpacingValue * metersToPxX;
  const pivotY = groundY - trackerHeightValue * metersToPxY;
  const panelLength = panelWidthValue * metersToPxX;

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 32px Arial";
  ctx.fillText("Tracker Dimensions", marginX, 56);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(marginX, groundY);
  ctx.lineTo(W - marginX, groundY);
  ctx.stroke();

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(mast1X, groundY);
  ctx.lineTo(mast1X, pivotY);
  ctx.moveTo(mast2X, groundY);
  ctx.lineTo(mast2X, pivotY);
  ctx.stroke();

  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(mast1X - panelLength / 2, pivotY);
  ctx.lineTo(mast1X + panelLength / 2, pivotY);
  ctx.moveTo(mast2X - panelLength / 2, pivotY);
  ctx.lineTo(mast2X + panelLength / 2, pivotY);
  ctx.stroke();

  const dimY = groundY + 72;
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mast1X, dimY);
  ctx.lineTo(mast2X, dimY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mast1X, dimY - 12);
  ctx.lineTo(mast1X, dimY + 12);
  ctx.moveTo(mast2X, dimY - 12);
  ctx.lineTo(mast2X, dimY + 12);
  ctx.stroke();

  const heightDimX = mast1X - 135;
  ctx.beginPath();
  ctx.moveTo(heightDimX, pivotY);
  ctx.lineTo(heightDimX, groundY);
  ctx.stroke();

  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(heightDimX + 10, pivotY);
  ctx.lineTo(mast1X - 6, pivotY);
  ctx.moveTo(heightDimX + 10, groundY);
  ctx.lineTo(mast1X - 6, groundY);
  ctx.stroke();

  const panelDimY = pivotY - 60;
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mast1X - panelLength / 2, panelDimY);
  ctx.lineTo(mast1X + panelLength / 2, panelDimY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mast1X - panelLength / 2, panelDimY - 12);
  ctx.lineTo(mast1X - panelLength / 2, panelDimY + 12);
  ctx.moveTo(mast1X + panelLength / 2, panelDimY - 12);
  ctx.lineTo(mast1X + panelLength / 2, panelDimY + 12);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Panel width: ${panelWidthValue.toFixed(2)} m`, mast1X, panelDimY - 18);
  ctx.fillText(`Row spacing: ${rowSpacingValue.toFixed(2)} m`, (mast1X + mast2X) / 2, dimY + 42);

  ctx.save();
  ctx.translate(heightDimX - 38, (pivotY + groundY) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Tracker height: ${trackerHeightValue.toFixed(2)} m`, 0, 0);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

function pdfAddSingleChartPage(doc, title, img, note = "") {
  doc.addPage();
  pdfPageBackground(doc);
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 16);

  if (img) {
    doc.addImage(img, "PNG", 14, 24, 182, 88);
  }

  if (note) {
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(note, 14, 120, { maxWidth: 182 });
  }
}

function pdfAddTwoChartsPage(doc, title, chartA, chartB) {
  doc.addPage();
  pdfPageBackground(doc);

  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 16);

  if (chartA?.img) {
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(chartA.title, 15, 24);
    doc.addImage(chartA.img, "JPEG", 15, 28, 160, 120);
  }

  if (chartB?.img) {
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(chartB.title, 15, 156);
    doc.addImage(chartB.img, "JPEG", 15, 160, 160, 120);
  }
}

async function downloadPdf() {
  if (!latestSimulationResult || !latestSimulationData.length) {
    showPopup("Run a simulation first to export PDF.", "error");
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const mobileView = pdfIsMobileView();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const payload = getPayload();
    const result = latestSimulationResult;

    const metrics = {
      gcr: calculateGcr(),
      sunriseSunset: calculateSunTimes(latestSimulationData),
      maxShadingNoBt: Math.max(...latestSimulationData.map((r) => Number(r.shading_percent_without_backtracking || 0)), 0),
      maxShadingBt: Math.max(...latestSimulationData.map((r) => Number(r.shading_percent_with_backtracking || 0)), 0),
      maxShadowNoBt: Math.max(...latestSimulationData.map((r) => Number(r.shadow_length_without_backtracking || 0)), 0),
      maxShadowBt: Math.max(...latestSimulationData.map((r) => Number(r.shadow_length_with_backtracking || 0)), 0),
      maxPowerNoBt: Math.max(...latestSimulationData.map((r) => Number(r.power_without_backtracking || 0)), 0),
      maxPowerBt: Math.max(...latestSimulationData.map((r) => Number(r.power_with_backtracking || 0)), 0),
      maxIrrFixed: Math.max(...latestSimulationData.map((r) => Number(r.irradiance_fixed || 0)), 0),
      maxIrrNoBt: Math.max(...latestSimulationData.map((r) => Number(r.irradiance_without_backtracking || 0)), 0),
      maxIrrBt: Math.max(...latestSimulationData.map((r) => Number(r.irradiance_with_backtracking || 0)), 0)
    };

    // Build chart images from detached offscreen canvases.
    // Option B: read checkbox states from PDF filter modal.
    // Sample every 5th minute (1440 → 288 pts) so Chart.js category scale
    // distributes data across the full canvas width (1440 string labels in a
    // 1200px responsive:false canvas causes all data to bunch at the right edge).
    const _d   = latestSimulationData;
    const _ds  = _d.filter((_, i) => i % 5 === 0);   // one point per 5 min
    const _lbl = _ds.map(r => formatTimeLabel(r.timestamp));
    const _chk = id => document.getElementById(id)?.checked !== false;

    const anglesImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "Ideal",        hidden: !_chk("pdf_ideal"),        data: _ds.map(r => r.ideal_tracker_angle),   borderColor: "#2563eb", borderWidth: 2.5, pointRadius: 0, tension: 0.22 },
        { label: "Limited",      hidden: !_chk("pdf_limited"),      data: _ds.map(r => r.limited_tracker_angle), borderColor: "#d97706", borderWidth: 2.5, pointRadius: 0, tension: 0.22 },
        { label: "Backtracking", hidden: !_chk("pdf_backtracking"), data: _ds.map(r => r.backtracking_angle),    borderColor: "#16a34a", borderWidth: 2.5, pointRadius: 0, tension: 0.22 }
      ]},
      options: _pdfChartOpts("Angle (deg)")
    });

    const sunImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "Elevation", hidden: !_chk("pdf_elevation"), data: _ds.map(r => r.sun_elevation), borderColor: "#d97706", borderWidth: 2.5, pointRadius: 0, tension: 0.22, yAxisID: "y" },
        { label: "Azimuth",   hidden: !_chk("pdf_azimuth"),   data: _ds.map(r => r.sun_azimuth),   borderColor: "#38bdf8", borderWidth: 2.5, pointRadius: 0, tension: 0.22, yAxisID: "y1" }
      ]},
      options: { ..._pdfChartOpts("Elevation (deg)"),
        scales: {
          x:  { ticks: { maxTicksLimit: 10, font: { size: 22 }, color: "#1e293b", maxRotation: 0 }, grid: { color: "rgba(0,0,0,0.11)" } },
          y:  { type: "linear", position: "left",
                title: { display: true, text: "Elevation (deg)", font: { size: 26, weight: "700" }, color: "#0f172a" },
                ticks: { font: { size: 22 }, color: "#1e293b" }, grid: { color: "rgba(0,0,0,0.11)" } },
          y1: { type: "linear", position: "right", min: 0, max: 360,
                title: { display: true, text: "Azimuth (deg)", font: { size: 26, weight: "700" }, color: "#0f172a" },
                ticks: { font: { size: 22 }, color: "#1e293b", stepSize: 90 }, grid: { drawOnChartArea: false } }
        }
      }
    });

    const _snoBt  = _ds.map(r => clampShadowForDisplay(r.shadow_length_without_backtracking));
    const _sBt    = _ds.map(r => clampShadowForDisplay(r.shadow_length_with_backtracking));
    const _maxSh  = Math.max(..._snoBt, ..._sBt, 1);
    const _maxPct = Math.max(..._ds.map(r => Number(r.shading_percent_without_backtracking || 0)),
                             ..._ds.map(r => Number(r.shading_percent_with_backtracking    || 0)), 1);
    const shadingImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "No BT",   hidden: !_chk("pdf_shadow_nobt"),  data: _snoBt, borderColor: "#38bdf8", borderWidth: 2.5, pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "BT",      hidden: !_chk("pdf_shadow_bt"),    data: _sBt,   borderColor: "#f472b6", borderWidth: 2.5, pointRadius: 0, tension: 0.18, yAxisID: "y" },
        { label: "% No BT", hidden: !_chk("pdf_shading_nobt"), data: _ds.map(r => r.shading_percent_without_backtracking), borderColor: "#fb923c", borderWidth: 2.2, borderDash: [8,4], pointRadius: 0, tension: 0.18, yAxisID: "y1" },
        { label: "% BT",    hidden: !_chk("pdf_shading_bt"),   data: _ds.map(r => r.shading_percent_with_backtracking),    borderColor: "#a78bfa", borderWidth: 2.2, borderDash: [3,3], pointRadius: 0, tension: 0.18, yAxisID: "y1" }
      ]},
      options: { ..._pdfChartOpts("Shadow Length (m)"),
        scales: {
          x:  { ticks: { maxTicksLimit: 10, font: { size: 22 }, color: "#1e293b", maxRotation: 0 }, grid: { color: "rgba(0,0,0,0.11)" } },
          y:  { type: "linear", position: "left",  beginAtZero: true, min: 0, max: Math.max(5, Math.ceil(_maxSh  * 1.15)),
                title: { display: true, text: "Shadow Length (m)", font: { size: 26, weight: "700" }, color: "#0f172a" },
                ticks: { font: { size: 22 }, color: "#1e293b" }, grid: { color: "rgba(0,0,0,0.11)" } },
          y1: { type: "linear", position: "right", beginAtZero: true, min: 0, max: Math.max(5, Math.ceil(_maxPct + 1)),
                title: { display: true, text: "Shading (%)", font: { size: 26, weight: "700" }, color: "#0f172a" },
                ticks: { font: { size: 22 }, color: "#1e293b" }, grid: { drawOnChartArea: false } }
        }
      }
    });

    const powerImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "Fixed Panel",     hidden: !_chk("pdf_fixed"),    data: _ds.map(r => r.irradiance_fixed),                 borderColor: "#16a34a", borderWidth: 2.5, pointRadius: 0, tension: 0.22 },
        { label: "Tracker – No BT", hidden: !_chk("pdf_irr_nobt"), data: _ds.map(r => r.irradiance_without_backtracking), borderColor: "#d97706", borderWidth: 2.5, pointRadius: 0, tension: 0.22 },
        { label: "Tracker – BT",    hidden: !_chk("pdf_irr_bt"),   data: _ds.map(r => r.irradiance_with_backtracking),    borderColor: "#2563eb", borderWidth: 2.5, pointRadius: 0, tension: 0.22 }
      ]},
      options: _pdfChartOpts("Irradiance (W/m²)")
    });

    const windStowSpeedPdf = document.getElementById("wind_stow_enable")?.checked
      ? parseFloat(document.getElementById("wind_stow_speed")?.value || "15") : 0;
    const _maxWindPdf = Math.max(..._ds.map(r => Number(r.wind_speed || 0)), windStowSpeedPdf || 0, 5);

    const powerWImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "Fixed Panel",     hidden: !_chk("pdf_pow_fixed"), data: _ds.map(r => r.power_fixed),                borderColor: "#16a34a", borderWidth: 2.5, pointRadius: 0, tension: 0.22 },
        { label: "Tracker – No BT", hidden: !_chk("pdf_pow_nobt"),  data: _ds.map(r => r.power_without_backtracking), borderColor: "#d97706", borderWidth: 2.5, pointRadius: 0, tension: 0.22 },
        { label: "Tracker – BT",    hidden: !_chk("pdf_pow_bt"),    data: _ds.map(r => r.power_with_backtracking),    borderColor: "#00e5ff", borderWidth: 2.5, pointRadius: 0, tension: 0.22 }
      ]},
      options: _pdfChartOpts("Power (W)")
    });

    const tempImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "Ambient (°C)",   hidden: !_chk("pdf_temp_amb"),  data: _ds.map(r => r.temp),      borderColor: "#94a3b8", borderWidth: 2.2, borderDash: [4,3], pointRadius: 0, tension: 0.22 },
        { label: "Cell Temp (°C)", hidden: !_chk("pdf_temp_cell"), data: _ds.map(r => r.cell_temp), borderColor: "#f97316", borderWidth: 2.5, pointRadius: 0, tension: 0.22 }
      ]},
      options: _pdfChartOpts("Temperature (°C)")
    });

    const ghiCompImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "Clear-sky GHI", hidden: !_chk("pdf_ghi_cs"),    data: _ds.map(r => r.clearsky_ghi),   borderColor: "#f59e0b", borderWidth: 2.2, borderDash: [5,4], pointRadius: 0, tension: 0.22, yAxisID: "y" },
        { label: "Actual GHI",    hidden: !_chk("pdf_ghi_act"),   data: _ds.map(r => r.irradiance_raw), borderColor: "#3b82f6", borderWidth: 2.5, pointRadius: 0, tension: 0.22, yAxisID: "y" },
        { label: "Cloud Cover %", hidden: !_chk("pdf_ghi_cloud"), data: _ds.map(r => Number(r.cloud_cover || 0)), borderColor: "#94a3b8", borderWidth: 2.2, borderDash: [3,3], pointRadius: 0, tension: 0.22, yAxisID: "y1" }
      ]},
      options: { ..._pdfChartOpts("GHI (W/m²)"),
        scales: {
          x:  { ticks: { maxTicksLimit: 10, font: { size: 22 }, color: "#1e293b", maxRotation: 0 }, grid: { color: "rgba(0,0,0,0.11)" } },
          y:  { type: "linear", position: "left",  beginAtZero: true,
                title: { display: true, text: "GHI (W/m²)", font: { size: 26, weight: "700" }, color: "#0f172a" },
                ticks: { font: { size: 22 }, color: "#1e293b" }, grid: { color: "rgba(0,0,0,0.11)" } },
          y1: { type: "linear", position: "right", beginAtZero: true, min: 0, max: 100,
                title: { display: true, text: "Cloud Cover (%)", font: { size: 26, weight: "700" }, color: "#0f172a" },
                ticks: { font: { size: 22 }, color: "#1e293b" }, grid: { drawOnChartArea: false } }
        }
      }
    });

    const windImg = pdfOffscreenChart({
      type: "line",
      data: { labels: _lbl, datasets: [
        { label: "Wind Speed (m/s)", hidden: !_chk("pdf_wind_speed"), data: _ds.map(r => Number(r.wind_speed || 0)), borderColor: "#38bdf8", borderWidth: 2.5, pointRadius: 0, tension: 0.22, fill: false },
        { label: windStowSpeedPdf > 0 ? `Stow @ ${windStowSpeedPdf} m/s` : "Stow disabled",
          hidden: !_chk("pdf_wind_stow"),
          data: windStowSpeedPdf > 0 ? _ds.map(() => windStowSpeedPdf) : _ds.map(() => null),
          borderColor: "#fb923c", borderWidth: 2.2, borderDash: [6,4], pointRadius: 0, tension: 0 }
      ]},
      options: { ..._pdfChartOpts("Wind Speed (m/s)"),
        scales: {
          x: { ticks: { maxTicksLimit: 10, font: { size: 22 }, color: "#1e293b", maxRotation: 0 }, grid: { color: "rgba(0,0,0,0.11)" } },
          y: { type: "linear", position: "left", beginAtZero: true, max: Math.ceil(_maxWindPdf * 1.2),
               title: { display: true, text: "Wind Speed (m/s)", font: { size: 26, weight: "700" }, color: "#0f172a" },
               ticks: { font: { size: 22 }, color: "#1e293b" }, grid: { color: "rgba(0,0,0,0.11)" } }
        }
      }
    });

    const _maxPrecipPdf = Math.max(..._ds.map(r => Number(r.precipitation ?? 0)), 0.1);
    const cloudRainImg = pdfOffscreenChart({
      type: "bar",
      data: { labels: _lbl, datasets: [
        { type: "line",  label: "Cloud Cover (%)",       hidden: !_chk("pdf_cloud_cover"),
          data: _ds.map(r => Number(r.cloud_cover || 0)),
          borderColor: "#94a3b8", backgroundColor: "rgba(148,163,184,0.15)",
          borderWidth: 2.2, pointRadius: 0, tension: 0.22, fill: true, yAxisID: "y" },
        { type: "bar",   label: "Precipitation (mm/h)",  hidden: !_chk("pdf_precip"),
          data: _ds.map(r => Number(r.precipitation ?? 0)),
          backgroundColor: "rgba(56,189,248,0.55)", borderColor: "#38bdf8",
          borderWidth: 1, yAxisID: "y1" }
      ]},
      options: { ..._pdfChartOpts("Cloud Cover (%)"),
        scales: {
          x:  { ticks: { maxTicksLimit: 10, font: { size: 22 }, color: "#1e293b", maxRotation: 0 }, grid: { color: "rgba(0,0,0,0.11)" } },
          y:  { type: "linear", position: "left",  min: 0, max: 100,
                title: { display: true, text: "Cloud Cover (%)", font: { size: 26, weight: "700" }, color: "#0f172a" },
                ticks: { font: { size: 22 }, color: "#1e293b" }, grid: { color: "rgba(0,0,0,0.11)" } },
          y1: { type: "linear", position: "right", beginAtZero: true, max: Math.max(Math.ceil(_maxPrecipPdf * 1.3), 1),
                title: { display: true, text: "Precipitation (mm/h)", font: { size: 26, weight: "700" }, color: "#38bdf8" },
                ticks: { font: { size: 22 }, color: "#38bdf8" }, grid: { drawOnChartArea: false } }
        }
      }
    });

    const dimensionImg = pdfBuildDimensionDiagramDataUrl(payload, mobileView);
    const summarySentence = pdfBuildSummarySentence(result);

    // PAGE 1 - SUMMARY
    pdfPageBackground(doc);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(18);
    doc.text("Solar Tracker Simulator", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("Single-axis tracker simulation report", 14, 22);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 26, 196, 26);

    pdfSectionTitle(doc, "Scenario", 14, 34);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    pdfTextBlock(doc, [
      `${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}`,
      `${payload.timezone} | ${payload.date}`,
      `${payload.backtracking ? "Backtracking ON" : "Backtracking OFF"}`
    ], 14, 40, 5);

    pdfMetricBox(doc, 14, 56, 42, 18, "Irr. Fixed", `${Number(result.daily_irradiance_fixed || 0).toFixed(0)} Wh/m²`);
    pdfMetricBox(doc, 60, 56, 42, 18, "Irr. No BT", `${Number(result.daily_irradiance_no_bt || 0).toFixed(0)} Wh/m²`);
    pdfMetricBox(doc, 106, 56, 42, 18, "Irr. BT", `${Number(result.daily_irradiance_bt || 0).toFixed(0)} Wh/m²`);
    pdfMetricBox(doc, 152, 56, 42, 18, "GCR", `${metrics.gcr.ratio.toFixed(3)}`);

    pdfSectionTitle(doc, "Selected inputs", 14, 84);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    pdfTextBlock(doc, [
      `Panel width: ${payload.panel_width.toFixed(2)} m`,
      `Panel height: ${payload.panel_height.toFixed(2)} m`,
      `Tracker height: ${payload.tracker_height.toFixed(2)} m`,
      `Row spacing: ${payload.row_spacing.toFixed(2)} m`,
      `Panel efficiency: ${payload.panel_efficiency.toFixed(3)}`,
      `Max angle: ${payload.max_angle.toFixed(1)}°`,
      `Sunrise / Sunset: ${metrics.sunriseSunset.sunrise ? formatTimeLabel(metrics.sunriseSunset.sunrise) : "--"} / ${metrics.sunriseSunset.sunset ? formatTimeLabel(metrics.sunriseSunset.sunset) : "--"}`
    ], 14, 90, mobileView ? 5.0 : 5.2);

    pdfSectionTitle(doc, "Key metrics", 14, 132);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    pdfTextBlock(doc, [
      `Max shading without backtracking: ${metrics.maxShadingNoBt.toFixed(2)}%`,
      `Max shading with backtracking: ${metrics.maxShadingBt.toFixed(2)}%`,
      `Max shadow without backtracking: ${pdfFormatShadowMetric(metrics.maxShadowNoBt)}`,
      `Max shadow with backtracking: ${pdfFormatShadowMetric(metrics.maxShadowBt)}`,
      `Peak irradiance – Fixed: ${metrics.maxIrrFixed.toFixed(1)} W/m²`,
      `Peak irradiance – No BT: ${metrics.maxIrrNoBt.toFixed(1)} W/m²`,
      `Peak irradiance – BT: ${metrics.maxIrrBt.toFixed(1)} W/m²`
    ], 14, 138, mobileView ? 5.0 : 5.2);

    pdfSectionTitle(doc, "Comparison summary", 14, 178);
    pdfSectionBox(doc, 12, 182, 186, 18);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(summarySentence, 16, 192, { maxWidth: 178 });

    // PAGE 2 - TRACKER DIMENSIONS
    doc.addPage();
    pdfPageBackground(doc);
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("Tracker Dimensions", 14, 16);

    if (dimensionImg) {
      doc.addImage(dimensionImg, "PNG", 10, 24, 190, 92);
    }

    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Geometry reference used for the current simulation inputs.", 14, 122, { maxWidth: 182 });

    // PAGE 3 — Tracker Angle + Solar Position (160×120mm JPEG, 2 per page)
    {
      const CW = 160, CH = 120;   // 4:3 matches pdfSafeCanvasData 800×600 JPEG export
      const X = 15;
      doc.addPage();
      pdfPageBackground(doc);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Tracker Angle", X, 14);
      if (anglesImg) doc.addImage(anglesImg, "JPEG", X, 18, CW, CH);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Solar Position", X, 146);
      if (sunImg) doc.addImage(sunImg, "JPEG", X, 150, CW, CH);
    }

    // PAGE 4 — Inter-row Shadowing + Irradiance Comparison (160×120mm JPEG)
    {
      const CW = 160, CH = 120;
      const X = 15;
      doc.addPage();
      pdfPageBackground(doc);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Inter-row Shadowing", X, 14);
      if (shadingImg) doc.addImage(shadingImg, "JPEG", X, 18, CW, CH);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Irradiance Comparison", X, 146);
      if (powerImg) doc.addImage(powerImg, "JPEG", X, 150, CW, CH);
    }

    // PAGE 5 — Power Output (W) + Cell Temperature
    {
      const CW = 160, CH = 120;
      const X = 15;
      doc.addPage();
      pdfPageBackground(doc);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Power Output (W)", X, 14);
      if (powerWImg) doc.addImage(powerWImg, "JPEG", X, 18, CW, CH);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Cell Temperature", X, 146);
      if (tempImg) doc.addImage(tempImg, "JPEG", X, 150, CW, CH);
    }

    // PAGE 6 — Cloud Cover & GHI + Wind Speed & Stow
    {
      const CW = 160, CH = 120;
      const X = 15;
      doc.addPage();
      pdfPageBackground(doc);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Cloud Cover & GHI", X, 14);
      if (ghiCompImg) doc.addImage(ghiCompImg, "JPEG", X, 18, CW, CH);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Wind Speed & Stow", X, 146);
      if (windImg) doc.addImage(windImg, "JPEG", X, 150, CW, CH);
    }

    // PAGE 7 — Cloud Cover & Precipitation
    {
      const CW = 160, CH = 120;
      const X = 15;
      doc.addPage();
      pdfPageBackground(doc);

      doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text("Cloud Cover & Precipitation", X, 14);
      if (cloudRainImg) doc.addImage(cloudRainImg, "JPEG", X, 18, CW, CH);
    }

    // FINAL PAGE - NOTES
    doc.addPage();
    pdfPageBackground(doc);
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("Formulas and notes", 14, 16);

    pdfSectionTitle(doc, "Formulas", 14, 28);
    pdfSectionBox(doc, 12, 32, 186, 48);
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    pdfTextBlock(doc, [
      "GCR = panel width / row spacing",
      "Tracker angle and backtracking are calculated using pvlib single-axis tracker logic.",
      "POA irradiance is based on pvlib clear-sky irradiance and transposition.",
      "Shaded fraction is based on pvlib row-shading logic using shaded_fraction1d.",
      "Applied irradiance = direct POA x (1 - shaded fraction) + diffuse POA.",
      "Power = applied POA x panel area x panel efficiency."
    ], 18, 40, 6);

    pdfSectionTitle(doc, "Notes / disclaimer", 14, 92);
    pdfSectionBox(doc, 12, 96, 186, 42);
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    pdfTextBlock(doc, [
      "This report reflects the current UI inputs and the latest simulation loaded in the browser.",
      "It is intended for practical engineering analysis and comparison, not a full bankable performance model.",
      "Clear-sky irradiance is used in this practical version unless measured weather data is added later.",
      "Very large shadow values can occur at low solar elevation, so display scaling may be applied for readability."
    ], 18, 104, 6);

    pdfSectionTitle(doc, "pvlib reference", 14, 152);
    pdfSectionBox(doc, 12, 156, 186, 16);
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("https://pvlib-python.readthedocs.io/", 18, 166);

    doc.save(`solar_tracker_report_${payload.date}.pdf`);
    showPopup("PDF downloaded successfully.", "success");
  } catch (error) {
    console.error("PDF export failed:", error);
    preview.textContent = `PDF export failed:\n${error.message}\n${error.stack || ""}`;
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

downloadPdfBtn?.addEventListener("click", () => {
  if (!latestSimulationResult || !latestSimulationData.length) {
    showPopup("Run a simulation first to export PDF.", "error"); return;
  }
  // Show filter modal — actual export triggered by Export button inside modal
  document.getElementById("pdfModal")?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});

function closePdfModal() {
  document.getElementById("pdfModal")?.classList.add("hidden");
  document.body.style.overflow = "";
}

document.getElementById("pdfModalCancel")?.addEventListener("click", closePdfModal);
document.getElementById("pdfModalBackdrop")?.addEventListener("click", closePdfModal);
document.getElementById("pdfModalExport")?.addEventListener("click", async () => {
  closePdfModal();
  await downloadPdf();
});

/* ── Chart fullscreen modal ────────────────────────────────────────── */
let _modalChart = null;

const CHART_MAP = {
  anglesChart:    { get: () => anglesChart,    title: "Tracker Angle",        yLabel: "Angle (deg)",            info: "Ideal = unconstrained, Limited = max-angle limited, BT = backtracking." },
  sunChart:       { get: () => sunChart,       title: "Solar Position",        yLabel: "Sun Angle (deg)",        info: "Shows solar elevation and azimuth movement through the day." },
  shadingChart:   { get: () => shadingChart,   title: "Inter-row Shadowing",   yLabel: "Shadow Length (scaled)", yLabelR: "Shading (%)", info: "Displayed shadow is scaled for readability. Shading % better represents actual panel-to-panel impact." },
  powerChart:     { get: () => powerChart,     title: "Irradiance Comparison", yLabel: "Irradiance (W/m²)",      info: "Fixed panel at latitude tilt. Tracker irradiance accounts for POA and row shading." },
  powerWChart:    { get: () => powerWChart,    title: "Power Output",          yLabel: "Power (W)",              info: "Temperature-derated power via pvlib noct_sam. Drop during wind stow shows real-world impact." },
  shadowDirChart: { get: () => shadowDirChart, title: "Shadow Direction E/W",  yLabel: "Shadow (m)", yLabelR: "Shading (%)", info: "+ value = East shadow (morning), − value = West shadow (afternoon). Flips at solar noon." },
  tempChart:      { get: () => tempChart,      title: "Cell Temperature",      yLabel: "Temperature (°C)",       info: "Cell temp is higher than ambient due to solar heating. Wind speed lowers cell temp (cooling effect)." },
  ghiCompChart:   { get: () => ghiCompChart,   title: "Cloud Cover & GHI",     yLabel: "GHI (W/m²)", yLabelR: "Cloud Cover (%)", info: "Gap between actual and clear-sky GHI shows weather impact. Lines identical in clear-sky mode." },
  windChart:      { get: () => windChart,      title: "Wind Speed & Stow",     yLabel: "Wind Speed (m/s)",       info: "Orange dashed line = stow threshold. Red dots = minutes when tracker is stowed flat (0°)." },
  cloudRainChart: { get: () => cloudRainChart, title: "Cloud Cover & Precipitation", yLabel: "Cloud Cover (%)", yLabelR: "Precipitation (mm/h)", info: "Cloud cover (%) as area line. Precipitation (mm/h) as bars. Only populated with real weather enabled." },
  humidityChart:  { get: () => humidityChart,  title: "Humidity & Dew Point",        yLabel: "Humidity (%)",    yLabelR: "Dew Point (°C)",       info: "Relative humidity % (left). Dew point °C (right, dashed). When cell temp < dew point, condensation risk on panels." },
};

function openChartModal(canvasId) {
  const entry = CHART_MAP[canvasId];
  if (!entry) return;
  const source = entry.get();
  if (!source) return;

  document.getElementById("chartModalTitle").textContent = entry.title;

  // y-axis label (always show in modal regardless of mobile CSS)
  const yEl = document.getElementById("chartModalYLabel");
  yEl.style.display = "flex";
  yEl.innerHTML = entry.yLabelR
    ? `<span>${entry.yLabel}</span><span class="chart-yaxis-label-r">${entry.yLabelR}</span>`
    : `<span>${entry.yLabel || ""}</span>`;

  // ⓘ info button — replaces hint text on mobile
  const infoBtn = document.getElementById("chartModalInfoBtn");
  const infoText = document.getElementById("chartModalInfoText");
  if (infoBtn && infoText) {
    infoText.textContent = entry.info || "";
    infoText.style.display = "none";
    infoBtn.onclick = () => {
      const visible = infoText.style.display === "none";
      infoText.style.display = visible ? "block" : "none";
      infoBtn.classList.toggle("active", visible);
    };
  }

  // destroy previous modal chart
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }

  const modalCanvas = document.getElementById("chartModalCanvas");
  const isLight = document.documentElement.dataset.theme === "light";
  const gridColor  = isLight ? "rgba(0,0,0,0.07)"  : "rgba(100,116,139,0.40)";
  const tickColor  = isLight ? "#64748b"            : "#64748b";
  const titleColor = isLight ? "#475569"            : "#94a3b8";

  // deep-clone config data safely
  const srcData    = source.config.data;
  const srcOptions = source.config.options || {};

  _modalChart = new Chart(modalCanvas, {
    type: source.config.type,
    data: JSON.parse(JSON.stringify(srcData)),
    options: {
      ...JSON.parse(JSON.stringify(srcOptions)),
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 8, right: 20, bottom: 10, left: 16 } },
      plugins: {
        ...(srcOptions.plugins || {}),
        legend: {
          ...(srcOptions.plugins?.legend || {}),
          labels: { ...(srcOptions.plugins?.legend?.labels || {}), color: titleColor, font: { size: 10 }, boxWidth: 8, boxHeight: 8, padding: 8 }
        },
        tooltip: {
          backgroundColor: isLight ? "rgba(255,255,255,0.97)" : "rgba(13,20,32,0.97)",
          titleColor: isLight ? "#0f172a" : "#e2e8f0",
          bodyColor:  isLight ? "#334155" : "#94a3b8",
          borderColor: isLight ? "#cbd5e1" : "#1e2736",
          borderWidth: 1,
        }
      },
      scales: buildModalScales(srcOptions.scales, gridColor, tickColor, titleColor),
    }
  });

  document.getElementById("chartModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function buildModalScales(srcScales, gridColor, tickColor, titleColor) {
  if (!srcScales) return {};
  const result = {};
  for (const [key, scale] of Object.entries(srcScales)) {
    const isX = key === "x";
    result[key] = {
      ...JSON.parse(JSON.stringify(scale)),
      ticks: {
        ...(scale.ticks || {}),
        color: tickColor,
        font: { size: 11 },
        padding: isX ? 6 : 4,
        ...(isX ? {
          maxTicksLimit: window.innerWidth <= 640 ? 6 : 8,
          maxRotation: 0,
          minRotation: 0,
          font: { size: window.innerWidth <= 640 ? 11 : 12 },
        } : {}),
      },
      grid:  { ...(scale.grid  || {}), color: gridColor },
      title: { ...(scale.title || {}), color: titleColor, font: { size: 13 } },
    };
  }
  return result;
}

function closeChartModal() {
  document.getElementById("chartModal").classList.add("hidden");
  document.body.style.overflow = "";
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
}

function setupChartModal() {
  document.getElementById("chartModalClose")?.addEventListener("click", closeChartModal);
  document.getElementById("chartModalBackdrop")?.addEventListener("click", closeChartModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeChartModal();
  });

  // Inject an explicit ⤢ expand button into each chart container.
  // Only clicking this button opens the modal — prevents accidental zoom
  // from tapping nearby UI elements (device bar, labels, etc.).
  Object.keys(CHART_MAP).forEach(id => {
    const container = document.getElementById(id)?.closest(".chart-container");
    if (!container) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chart-expand-btn";
    btn.title = "Expand chart";
    btn.setAttribute("aria-label", "Expand chart fullscreen");
    btn.textContent = "⤢";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();   // never bubbles to page
      openChartModal(id);
    });
    container.appendChild(btn);
  });
}

/* ── 2D Tracker popup modal ────────────────────────────────────────── */
let _tracker2dModalOpen = false;

function openTracker2dModal() {
  if (!latestSimulationData.length) { showPopup("Run simulation first.", "error"); return; }
  _tracker2dModalOpen = true;
  document.getElementById("tracker2dModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  _syncModalLiveBtn();
  _drawTracker2dModal();
}

function closeTracker2dModal() {
  _tracker2dModalOpen = false;
  document.getElementById("tracker2dModal").classList.add("hidden");
  document.body.style.overflow = "";
}

function _drawTracker2dModal() {
  if (!_tracker2dModalOpen || !latestSimulationData.length) return;
  const idx = parseInt(timeSlider?.value || "0", 10);
  const row = latestSimulationData[Math.max(0, Math.min(idx, latestSimulationData.length - 1))];
  const modalCanvas = document.getElementById("tracker2dModalCanvas");
  if (!modalCanvas) return;

  // Apply devicePixelRatio for sharp rendering on retina/mobile screens
  const body = modalCanvas.parentElement;
  const W = body.clientWidth  || 600;
  const H = body.clientHeight || 400;
  const dpr = window.devicePixelRatio || 1;
  modalCanvas.width  = Math.floor(W * dpr);
  modalCanvas.height = Math.floor(H * dpr);
  modalCanvas.style.width  = `${W}px`;
  modalCanvas.style.height = `${H}px`;

  const ctx = modalCanvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  draw2DScene(row, ctx, W, H);

  // Update time label in modal header
  const timeEl = document.getElementById("tracker2dModalTime");
  if (timeEl) timeEl.textContent = formatTimeLabel(row.timestamp);
}

function _syncModalLiveBtn() {
  const btn = document.getElementById("tracker2dModalLive");
  if (!btn) return;
  const active = !!liveTimer;
  btn.classList.toggle("live-active", active);
  btn.setAttribute("aria-pressed", String(active));
}

function setupTracker2dModal() {
  document.getElementById("tracker2dModalClose")?.addEventListener("click", closeTracker2dModal);
  document.getElementById("tracker2dModalBackdrop")?.addEventListener("click", closeTracker2dModal);
  document.getElementById("tracker2dExpandBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openTracker2dModal();
  });

  // Modal slider mirrors main slider
  document.getElementById("tracker2dModalSlider")?.addEventListener("input", (e) => {
    stop2DPlayback();
    stopLiveMode();
    _syncModalLiveBtn();
    update2DFrame(parseInt(e.target.value, 10));
  });

  // Play / Pause / Live mirror the main controls
  document.getElementById("tracker2dModalPlay")?.addEventListener("click", () => {
    start2DPlayback();
    _syncModalLiveBtn();
  });
  document.getElementById("tracker2dModalPause")?.addEventListener("click", () => {
    stop2DPlayback();
    _syncModalLiveBtn();
  });
  document.getElementById("tracker2dModalLive")?.addEventListener("click", () => {
    toggleLiveMode();
    _syncModalLiveBtn();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _tracker2dModalOpen) closeTracker2dModal();
  });
}

function setupDeviceBar() {
  const btns = document.querySelectorAll(".dev-btn");
  const saved = localStorage.getItem("previewDevice") || "desktop";
  setPreviewDevice(saved);

  btns.forEach(btn => {
    btn.addEventListener("click", () => setPreviewDevice(btn.dataset.device));
  });
}

function setPreviewDevice(device) {
  document.body.dataset.preview = device;
  localStorage.setItem("previewDevice", device);
  document.querySelectorAll(".dev-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.device === device);
  });
  // redraw canvas to fit new width
  if (latestSimulationData.length) {
    const idx = parseInt(document.getElementById("timeSlider")?.value || "720");
    draw2DScene(latestSimulationData[Math.min(idx, latestSimulationData.length - 1)]);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

window.onload = function () {
  initThemeAndAccent();
  initApiBase();
  loadTimezones();
  setupTimezoneSearch();
  restoreSavedInputs();
  setDefaultDate();
  setupTopButtons();
  setupLocationButton();
  setup2DControls();
  setupPresetButtons();
  setupDeviceBar();
  setupChartModal();
  setupTracker2dModal();
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

  document.getElementById("wind_stow_speed")?.addEventListener("input", e => {
    document.getElementById("wind_stow_val").textContent = e.target.value;
  });

  // Soiling loss preset buttons
  document.querySelectorAll(".preset-btn[data-target]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) { target.value = btn.dataset.value; target.dispatchEvent(new Event("change")); }
    });
  });

  document.getElementById("timezone")?.addEventListener("change", updateScenarioHeader);
  document.getElementById("backtracking")?.addEventListener("change", () => {
    updateScenarioHeader();
    if (latestSimulationData.length) update2DFrame(parseInt(timeSlider?.value || "0", 10));
  });

  setBadge(badgeApi, "API: Not checked", "badge-gray");

  // Financial calculator — recalculate when rate or panel count changes
  ["elec_rate", "num_panels"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      if (latestSimulationResult) updateFinancialCalc(latestSimulationResult);
    });
  });

  // Dismiss chart tooltips on touch outside a chart canvas (Chart.js has no
  // native mouseleave on touch, so tooltips stick until tapped again).
  const _chartCanvasIds = ["anglesChart", "sunChart", "shadingChart", "powerChart"];
  document.addEventListener("touchstart", (e) => {
    const onCanvas = _chartCanvasIds.some(id => e.target === document.getElementById(id));
    if (!onCanvas) {
      [anglesChart, sunChart, shadingChart, powerChart].forEach(c => {
        if (!c) return;
        try { c.tooltip.setActiveElements([], {}); c.update("none"); } catch (_) {}
      });
    }
  }, { passive: true });

  // Keep-alive ping — prevents Render free tier backend from sleeping.
  // Calls /health silently every 10 min; no UI impact if it fails.
  const _keepAlive = () => fetch(`${API_BASE.replace(/\/api\/v1$/, "")}/api/v1/health`, { method: "GET" }).catch(() => {});
  _keepAlive();
  setInterval(_keepAlive, 10 * 60 * 1000);

  // iOS portrait↔landscape rotation fix — temporarily locks maximum-scale=1
  // then restores it so the browser doesn't auto-zoom on orientation change.
  const _metaViewport = document.querySelector("meta[name=viewport]");
  window.addEventListener("orientationchange", () => {
    if (!_metaViewport) return;
    const orig = _metaViewport.getAttribute("content");
    _metaViewport.setAttribute("content", orig + ", maximum-scale=1");
    setTimeout(() => _metaViewport.setAttribute("content", orig), 500);
  });
};

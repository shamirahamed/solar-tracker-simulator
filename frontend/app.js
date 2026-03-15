const API_BASE = "https://organic-space-eureka-6rrg9vx496r2r5qx-8000.app.github.dev/api/v1";

const form = document.getElementById("simulation-form");
const downloadCsvBtn = document.getElementById("download-csv");
const preview = document.getElementById("preview");
const ctx = document.getElementById("anglesChart").getContext("2d");

let anglesChart = null;

function getPayload() {
  return {
    latitude: parseFloat(document.getElementById("latitude").value),
    longitude: parseFloat(document.getElementById("longitude").value),
    timezone: document.getElementById("timezone").value,
    date: document.getElementById("date").value,
    max_angle: parseFloat(document.getElementById("max_angle").value),
    gcr: parseFloat(document.getElementById("gcr").value),
    backtracking: document.getElementById("backtracking").checked
  };
}

function formatTimeLabel(timestamp) {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildChart(data) {
  const labels = data.map(row => formatTimeLabel(row.timestamp));
  const ideal = data.map(row => row.ideal_tracker_angle);
  const limited = data.map(row => row.limited_tracker_angle);
  const backtracking = data.map(row => row.backtracking_angle);

  if (anglesChart) {
    anglesChart.destroy();
  }

  anglesChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Ideal Tracker Angle",
          data: ideal,
          borderWidth: 1.5,
          pointRadius: 0
        },
        {
          label: "Limited Tracker Angle",
          data: limited,
          borderWidth: 1.5,
          pointRadius: 0
        },
        {
          label: "Backtracking Angle",
          data: backtracking,
          borderWidth: 1.5,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: "index",
        intersect: false
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 12
          }
        },
        y: {
          title: {
            display: true,
            text: "Angle (deg)"
          }
        }
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
      headers: {
        "Content-Type": "application/json"
      },
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

    buildChart(result.data);
  } catch (error) {
    preview.textContent = `Request failed:\n${error.message}`;
  }
}

async function downloadCsv() {
  const payload = getPayload();

  try {
    const response = await fetch(`${API_BASE}/simulate/day.csv`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
const socket = io();

const mediaContainer = document.getElementById("mediaContainer");
const pinInner = document.getElementById("pinInner");
const qrWifiBlock = document.getElementById("wifiQrBlock");
const qrWifiImage = document.getElementById("qrWifiImage");
const qrWifiText = document.getElementById("qrWifiText");
const qrControlImage = document.getElementById("qrControlImage");
const qrControlText = document.getElementById("qrControlText");

let backgrounds = [];
let config = null;

function solve(a, b) {
  const m = a.map((row, i) => [...row, b[i]]);
  const n = m.length;

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) {
        pivot = row;
      }
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const div = m[col][col];
    if (Math.abs(div) < 1e-10) {
      return null;
    }
    for (let j = col; j <= n; j += 1) {
      m[col][j] /= div;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let j = col; j <= n; j += 1) {
        m[row][j] -= factor * m[col][j];
      }
    }
  }

  return m.map((row) => row[n]);
}

function computeHomography(corners, width, height) {
  const src = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const dst = [corners.tl, corners.tr, corners.br, corners.bl].map((p) => [p.x * width, p.y * height]);

  const A = [];
  const B = [];

  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }

  const h = solve(A, B);
  if (!h) return null;

  return [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1];
}

function applyCornerPin() {
  if (!config?.cornerPin || !pinInner) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const matrix = computeHomography(config.cornerPin, width, height);
  if (!matrix) return;
  pinInner.style.transform = `matrix3d(${matrix.join(",")}) translateZ(0)`;
}

function renderEmptyState() {
  mediaContainer.innerHTML = '<div id="empty">Upload a background from the admin page.</div>';
}

function renderBackground() {
  if (!config || !backgrounds.length) {
    renderEmptyState();
    return;
  }
  const selected = backgrounds.find((b) => b.id === config.currentBackgroundId) || backgrounds[0];
  if (!selected) {
    renderEmptyState();
    return;
  }

  if (selected.type === "video") {
    mediaContainer.innerHTML = `<video src="${selected.url}" autoplay loop muted playsinline></video>`;
  } else {
    mediaContainer.innerHTML = `<img src="${selected.url}" alt="${selected.label}" />`;
  }
}

async function loadQr() {
  const res = await fetch("/api/network/qr");
  const qr = await res.json();
  qrControlImage.src = qr.dataUrl;
  qrControlText.textContent = qr.controlUrl;

  const w = qr.wifiQr;
  if (w && w.enabled && w.dataUrl) {
    qrWifiBlock.classList.add("visible");
    qrWifiImage.src = w.dataUrl;
    qrWifiText.textContent = w.ssid ? `Network: ${w.ssid}` : "Scan to join";
  } else {
    qrWifiBlock.classList.remove("visible");
    qrWifiImage.removeAttribute("src");
    qrWifiText.textContent = "";
  }
}

async function loadState() {
  const [bgRes, cfgRes] = await Promise.all([fetch("/api/backgrounds"), fetch("/api/config")]);
  backgrounds = await bgRes.json();
  config = await cfgRes.json();
  renderBackground();
  applyCornerPin();
  await loadQr();
}

socket.on("backgrounds:updated", loadState);
socket.on("background:changed", async ({ backgroundId }) => {
  if (!config) return;
  config.currentBackgroundId = backgroundId;
  renderBackground();
});
socket.on("config:updated", async (updatedConfig) => {
  config = updatedConfig;
  renderBackground();
  applyCornerPin();
  await loadQr();
});

window.addEventListener("resize", applyCornerPin);
loadState();

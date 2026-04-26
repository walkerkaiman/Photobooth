const uploadForm = document.getElementById("uploadForm");
const fileInput = document.getElementById("file");
const labelInput = document.getElementById("label");
const backgroundList = document.getElementById("backgroundList");
const hostSelect = document.getElementById("hostSelect");
const saveHostBtn = document.getElementById("saveHost");
const qrImg = document.getElementById("qrImg");
const qrUrl = document.getElementById("qrUrl");
const resetCornersBtn = document.getElementById("resetCorners");
const cornerEditor = document.getElementById("cornerEditor");
const cornerHint = document.getElementById("cornerHint");
const cornerHandles = [...document.querySelectorAll(".cornerHandle")];
const cornerLabels = [...document.querySelectorAll(".cornerLabel")];
const eventNameInput = document.getElementById("eventName");
const saveEventNameBtn = document.getElementById("saveEventName");
const eventNameStatus = document.getElementById("eventNameStatus");
const wifiSsid = document.getElementById("wifiSsid");
const wifiPassword = document.getElementById("wifiPassword");
const wifiSecurity = document.getElementById("wifiSecurity");
const wifiHidden = document.getElementById("wifiHidden");
const saveWifiBtn = document.getElementById("saveWifi");
const qrWifiImg = document.getElementById("qrWifiImg");
const qrWifiCaption = document.getElementById("qrWifiCaption");
const shuffleEnabledInput = document.getElementById("shuffleEnabled");
const shuffleIntervalInput = document.getElementById("shuffleInterval");
const saveShuffleBtn = document.getElementById("saveShuffle");
const shuffleStatus = document.getElementById("shuffleStatus");

let backgrounds = [];
let cornerPinState = {
  tl: { x: 0, y: 0 },
  tr: { x: 1, y: 0 },
  br: { x: 1, y: 1 },
  bl: { x: 0, y: 1 },
};
let activeCorner = null;

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function setCornerState(cornerPin) {
  cornerPinState = {
    tl: { ...cornerPin.tl },
    tr: { ...cornerPin.tr },
    br: { ...cornerPin.br },
    bl: { ...cornerPin.bl },
  };
  renderCornerHandles();
}

function renderCornerHandles() {
  cornerHandles.forEach((handle) => {
    const corner = handle.dataset.corner;
    const point = cornerPinState[corner];
    handle.style.left = `${point.x * 100}%`;
    handle.style.top = `${point.y * 100}%`;
  });
  cornerLabels.forEach((label) => {
    const corner = label.dataset.cornerLabel;
    const point = cornerPinState[corner];
    label.style.left = `${point.x * 100}%`;
    label.style.top = `${point.y * 100}%`;
  });
}

function updateCornerFromMouse(event) {
  if (!activeCorner) {
    return;
  }
  const bounds = cornerEditor.getBoundingClientRect();
  const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
  cornerPinState[activeCorner] = { x: round3(x), y: round3(y) };
  renderCornerHandles();
}

async function saveCornerPin() {
  await fetchJson("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cornerPin: cornerPinState }),
  });
  cornerHint.textContent = "Corner pin updated.";
}

function bindCornerDrag() {
  cornerHandles.forEach((handle) => {
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activeCorner = handle.dataset.corner;
      handle.classList.add("dragging");
      cornerHint.textContent = `Dragging ${activeCorner.toUpperCase()}...`;
      updateCornerFromMouse(event);
    });
  });

  document.addEventListener("mousemove", (event) => {
    updateCornerFromMouse(event);
  });

  document.addEventListener("mouseup", async () => {
    if (!activeCorner) {
      return;
    }
    const releasedCorner = activeCorner;
    activeCorner = null;
    cornerHandles.forEach((handle) => handle.classList.remove("dragging"));
    cornerHint.textContent = `Applying ${releasedCorner.toUpperCase()} corner...`;
    try {
      await saveCornerPin();
    } catch (error) {
      cornerHint.textContent = `Failed to save corner pin: ${error.message}`;
    }
  });
}

function escapeAttr(value) {
  return String(value ?? "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderBackgrounds() {
  backgroundList.innerHTML = "";
  backgrounds.forEach((bg, index) => {
    const card = document.createElement("div");
    card.className = "bgCard";
    card.innerHTML = `
      <img src="${bg.thumbnailUrl}" alt="${escapeAttr(bg.label)}">
      <div class="bgBody">
        <input class="bgLabel" type="text" maxlength="200" value="${escapeAttr(bg.label)}" />
        <div class="bgActions">
          <button data-action="rename">Rename</button>
          <button data-action="up">Up</button>
          <button data-action="down">Down</button>
          <button data-action="delete" class="danger">Delete</button>
        </div>
      </div>
    `;

    const labelInput = card.querySelector(".bgLabel");
    const renameBtn = card.querySelector('[data-action="rename"]');

    const persistLabel = async () => {
      const newLabel = labelInput.value.trim();
      if (!newLabel || newLabel === bg.label) {
        labelInput.value = bg.label;
        labelInput.classList.remove("dirty");
        return;
      }
      renameBtn.disabled = true;
      try {
        const updated = await fetchJson(`/api/backgrounds/${bg.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: newLabel }),
        });
        bg.label = updated.label;
        labelInput.value = updated.label;
        labelInput.classList.remove("dirty");
      } catch (error) {
        labelInput.value = bg.label;
        labelInput.classList.remove("dirty");
        alert(`Could not rename: ${error.message}`);
      } finally {
        renameBtn.disabled = false;
      }
    };

    labelInput.addEventListener("input", () => {
      labelInput.classList.toggle("dirty", labelInput.value.trim() !== bg.label);
    });
    labelInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void persistLabel();
      } else if (event.key === "Escape") {
        labelInput.value = bg.label;
        labelInput.classList.remove("dirty");
        labelInput.blur();
      }
    });
    renameBtn.addEventListener("click", () => {
      void persistLabel();
    });

    card.querySelector('[data-action="up"]').onclick = async () => {
      if (index === 0) return;
      [backgrounds[index - 1], backgrounds[index]] = [backgrounds[index], backgrounds[index - 1]];
      await saveOrder();
      renderBackgrounds();
    };
    card.querySelector('[data-action="down"]').onclick = async () => {
      if (index === backgrounds.length - 1) return;
      [backgrounds[index + 1], backgrounds[index]] = [backgrounds[index], backgrounds[index + 1]];
      await saveOrder();
      renderBackgrounds();
    };
    card.querySelector('[data-action="delete"]').onclick = async () => {
      await fetchJson(`/api/backgrounds/${bg.id}`, { method: "DELETE" });
      await loadBackgrounds();
    };
    backgroundList.appendChild(card);
  });
}

async function saveOrder() {
  await fetchJson("/api/backgrounds/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: backgrounds.map((b) => b.id) }),
  });
}

async function loadBackgrounds() {
  backgrounds = await fetchJson("/api/backgrounds");
  renderBackgrounds();
}

function readShuffleInterval() {
  const raw = Number(shuffleIntervalInput.value);
  if (!Number.isFinite(raw) || raw <= 0) return 30;
  return Math.round(clamp(raw, 1, 3600));
}

async function persistShuffleSettings({ silent = false } = {}) {
  const payload = {
    enabled: shuffleEnabledInput.checked,
    intervalSeconds: readShuffleInterval(),
  };
  const updated = await fetchJson("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shuffle: payload }),
  });
  const s = updated.shuffle || payload;
  shuffleEnabledInput.checked = Boolean(s.enabled);
  shuffleIntervalInput.value = String(s.intervalSeconds);
  if (!silent) {
    shuffleStatus.textContent = s.enabled
      ? `Shuffling every ${s.intervalSeconds}s.`
      : "Shuffle off.";
    setTimeout(() => {
      shuffleStatus.textContent = "";
    }, 2500);
  }
}

function wifiFormPayload() {
  return {
    ssid: wifiSsid.value.trim(),
    password: wifiPassword.value,
    security: wifiSecurity.value,
    hidden: wifiHidden.checked,
  };
}

async function persistWifiSettings() {
  await fetchJson("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wifi: wifiFormPayload() }),
  });
  await loadNetwork();
}

function setWifiQrPreview(qr) {
  const w = qr.wifiQr || {};
  if (w.enabled && w.dataUrl) {
    qrWifiImg.src = w.dataUrl;
    qrWifiImg.style.display = "block";
    qrWifiCaption.textContent = w.ssid ? `Join “${w.ssid}”` : "Wi‑Fi QR";
    return;
  }
  qrWifiImg.removeAttribute("src");
  qrWifiImg.style.display = "none";
  if (w.disabledReason === "wifi_no_ssid") {
    qrWifiCaption.textContent = "Enter a network name (SSID) and click Save Wi‑Fi QR.";
  } else {
    qrWifiCaption.textContent = "Wi‑Fi QR not generated.";
  }
}

async function loadNetwork() {
  const network = await fetchJson("/api/network");
  hostSelect.innerHTML = "";
  const options = network.ips.length ? network.ips : [network.selectedHost];
  options.forEach((ip) => {
    const option = document.createElement("option");
    option.value = ip;
    option.textContent = ip;
    if (network.selectedHost.startsWith(ip)) {
      option.selected = true;
    }
    hostSelect.appendChild(option);
  });

  const qr = await fetchJson("/api/network/qr");
  qrImg.src = qr.dataUrl;
  qrUrl.textContent = qr.controlUrl;
  setWifiQrPreview(qr);
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) return;
  const body = new FormData();
  body.append("file", file);
  if (labelInput.value.trim()) {
    body.append("label", labelInput.value.trim());
  }
  await fetchJson("/api/backgrounds/upload", { method: "POST", body });
  uploadForm.reset();
  await loadBackgrounds();
});

saveEventNameBtn.addEventListener("click", async () => {
  const name = eventNameInput.value.trim().slice(0, 200);
  await fetchJson("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName: name }),
  });
  eventNameInput.value = name;
  eventNameStatus.textContent = "Saved.";
  setTimeout(() => {
    eventNameStatus.textContent = "";
  }, 2500);
});

saveHostBtn.addEventListener("click", async () => {
  await fetchJson("/api/network/select-host", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: hostSelect.value }),
  });
  await loadNetwork();
});

saveWifiBtn.addEventListener("click", async () => {
  await persistWifiSettings();
});

wifiHidden.addEventListener("change", () => {
  void persistWifiSettings();
});

shuffleEnabledInput.addEventListener("change", () => {
  void persistShuffleSettings();
});

saveShuffleBtn.addEventListener("click", () => {
  void persistShuffleSettings();
});

shuffleIntervalInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void persistShuffleSettings();
  }
});

resetCornersBtn.addEventListener("click", async () => {
  setCornerState({
    tl: { x: 0, y: 0 },
    tr: { x: 1, y: 0 },
    br: { x: 1, y: 1 },
    bl: { x: 0, y: 1 },
  });
  try {
    await saveCornerPin();
  } catch (error) {
    cornerHint.textContent = `Failed to reset corner pin: ${error.message}`;
  }
});

(async () => {
  const config = await fetchJson("/api/config");
  eventNameInput.value = typeof config.eventName === "string" ? config.eventName : "";
  const w = config.wifi || {};
  wifiSsid.value = typeof w.ssid === "string" ? w.ssid : "";
  wifiPassword.value = typeof w.password === "string" ? w.password : "";
  wifiSecurity.value = ["WPA2", "WPA", "WEP", "NOPASS"].includes(String(w.security).toUpperCase())
    ? String(w.security).toUpperCase()
    : "WPA2";
  wifiHidden.checked = Boolean(w.hidden);
  const shuffle = config.shuffle || {};
  shuffleEnabledInput.checked = Boolean(shuffle.enabled);
  shuffleIntervalInput.value = String(
    Number.isFinite(Number(shuffle.intervalSeconds)) && Number(shuffle.intervalSeconds) > 0
      ? Number(shuffle.intervalSeconds)
      : 30,
  );
  setCornerState(config.cornerPin);
  bindCornerDrag();
  await loadBackgrounds();
  await loadNetwork();
})();

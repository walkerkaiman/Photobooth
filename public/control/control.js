const statusEl = document.getElementById("status");
const cardsEl = document.getElementById("cards");
const eventTitleEl = document.getElementById("eventTitle");
const shuffleToggleEl = document.getElementById("shuffleToggle");

let backgrounds = [];
let currentBackgroundId = null;
let toastTimer = null;

function applyEventTitle(config) {
  const raw = typeof config?.eventName === "string" ? config.eventName.trim() : "";
  const title = raw || "Photobooth";
  eventTitleEl.textContent = title;
  document.title = title;
}

function applyShuffleState(config) {
  const enabled = Boolean(config?.shuffle?.enabled);
  shuffleToggleEl.checked = enabled;
}

function setStatus(text, tone = "neutral") {
  statusEl.textContent = text;
  if (tone === "ok") statusEl.dataset.tone = "ok";
  else if (tone === "wait") statusEl.dataset.tone = "wait";
  else if (tone === "err") statusEl.dataset.tone = "err";
  else delete statusEl.dataset.tone;
}

function refreshOnScreenStatus() {
  if (!backgrounds.length) {
    setStatus("Nothing to show yet.", "wait");
    return;
  }
  const match = backgrounds.find((b) => b.id === currentBackgroundId);
  if (match) {
    setStatus(`Current Background: ${match.label || "Untitled"}`, "ok");
  } else {
    setStatus("", "neutral");
  }
}

function showToast(text, tone = "ok", ms = 2500) {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  setStatus(text, tone);
  toastTimer = setTimeout(() => {
    toastTimer = null;
    refreshOnScreenStatus();
  }, ms);
}

function setCurrentBackground(id) {
  currentBackgroundId = id || null;
  if (!toastTimer) {
    refreshOnScreenStatus();
  }
}

async function loadInitialConfig() {
  const res = await fetch("/api/config");
  const config = await res.json();
  applyEventTitle(config);
  applyShuffleState(config);
  currentBackgroundId = config.currentBackgroundId || null;
}

async function setShuffleEnabled(enabled) {
  shuffleToggleEl.disabled = true;
  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shuffle: { enabled } }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "Could not change shuffle.", "err");
      shuffleToggleEl.checked = !enabled;
      return;
    }
    const config = await res.json();
    applyShuffleState(config);
    showToast(
      enabled ? "Shuffle on — backgrounds will cycle." : "Shuffle off.",
      "ok",
    );
  } catch {
    showToast("Network error — try again.", "err");
    shuffleToggleEl.checked = !enabled;
  } finally {
    shuffleToggleEl.disabled = false;
  }
}

shuffleToggleEl.addEventListener("change", () => {
  void setShuffleEnabled(shuffleToggleEl.checked);
});

function createPreviewMedia(bg) {
  if (bg.type === "video") {
    const video = document.createElement("video");
    video.src = bg.url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    return video;
  }
  const img = document.createElement("img");
  img.src = bg.url;
  img.alt = bg.label || "";
  img.loading = "lazy";
  return img;
}

function mediaBadgeLabel(bg) {
  if (bg.type === "video") return "Video";
  const lower = (bg.url || "").toLowerCase();
  if (lower.endsWith(".gif")) return "GIF";
  return "Still";
}

async function loadBackgrounds() {
  const res = await fetch("/api/backgrounds");
  backgrounds = await res.json();
  cardsEl.innerHTML = "";

  if (!backgrounds.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No backgrounds yet. Ask the booth operator to add some in admin.";
    cardsEl.appendChild(empty);
    if (!toastTimer) {
      refreshOnScreenStatus();
    }
    return;
  }

  backgrounds.forEach((bg) => {
    const card = document.createElement("article");
    card.className = "card";

    const mediaWrap = document.createElement("div");
    mediaWrap.className = "card-media";
    const badge = document.createElement("span");
    badge.className = "card-badge";
    badge.textContent = mediaBadgeLabel(bg);
    mediaWrap.appendChild(createPreviewMedia(bg));
    mediaWrap.appendChild(badge);

    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = bg.label || "Untitled";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Select this background";

    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await fetch("/api/config/select-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backgroundId: bg.id }),
        });
        if (!result.ok) {
          const err = await result.json().catch(() => ({}));
          showToast(err.error || "Could not update background.", "err");
          return;
        }
        setCurrentBackground(bg.id);
      } catch {
        showToast("Network error — try again.", "err");
      } finally {
        button.disabled = false;
      }
    });

    body.appendChild(title);
    body.appendChild(button);
    card.appendChild(mediaWrap);
    card.appendChild(body);
    cardsEl.appendChild(card);
  });

  if (!toastTimer) {
    refreshOnScreenStatus();
  }
}

if (typeof io === "function") {
  const socket = io();
  socket.on("config:updated", (config) => {
    if (!config) return;
    applyEventTitle(config);
    applyShuffleState(config);
    setCurrentBackground(config.currentBackgroundId);
  });
  socket.on("background:changed", ({ backgroundId } = {}) => {
    setCurrentBackground(backgroundId);
  });
  socket.on("backgrounds:updated", async () => {
    await loadBackgrounds();
  });
}

(async () => {
  setStatus("Loading…", "wait");
  try {
    await loadInitialConfig();
  } catch {
    applyEventTitle({});
    applyShuffleState({});
  }
  await loadBackgrounds();
  if (!toastTimer) {
    refreshOnScreenStatus();
  }
})();

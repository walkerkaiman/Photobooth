const statusEl = document.getElementById("status");
const cardsEl = document.getElementById("cards");
const eventTitleEl = document.getElementById("eventTitle");

function applyEventTitle(config) {
  const raw = typeof config?.eventName === "string" ? config.eventName.trim() : "";
  const title = raw || "Photobooth";
  eventTitleEl.textContent = title;
  document.title = title;
}

async function loadEventTitle() {
  const res = await fetch("/api/config");
  const config = await res.json();
  applyEventTitle(config);
}

function setStatus(text, tone = "neutral") {
  statusEl.textContent = text;
  if (tone === "ok") statusEl.dataset.tone = "ok";
  else if (tone === "wait") statusEl.dataset.tone = "wait";
  else if (tone === "err") statusEl.dataset.tone = "err";
  else delete statusEl.dataset.tone;
}

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
  const backgrounds = await res.json();
  cardsEl.innerHTML = "";

  if (!backgrounds.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No backgrounds yet. Ask the booth operator to add some in admin.";
    cardsEl.appendChild(empty);
    setStatus("Nothing to show yet.", "wait");
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
          setStatus(err.error || "Could not update background.", "err");
          return;
        }
        setStatus(`On screen: ${bg.label}`, "ok");
      } catch {
        setStatus("Network error — try again.", "err");
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

  setStatus("", "neutral");
}

(async () => {
  setStatus("Loading…", "wait");
  try {
    await loadEventTitle();
  } catch {
    applyEventTitle({});
  }
  await loadBackgrounds();
})();

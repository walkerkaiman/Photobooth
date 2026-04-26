const { readConfig, saveConfig, readBackgrounds } = require("./store");

let timer = null;
let ioRef = null;
let pendingTick = false;

function clearScheduled() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function pickNext(backgrounds, currentId) {
  if (!Array.isArray(backgrounds) || backgrounds.length === 0) {
    return null;
  }
  if (backgrounds.length === 1) {
    return backgrounds[0];
  }
  const candidates = backgrounds.filter((b) => b.id !== currentId);
  const pool = candidates.length ? candidates : backgrounds;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function tick() {
  pendingTick = false;
  const [config, backgrounds] = await Promise.all([readConfig(), readBackgrounds()]);
  const shuffle = config.shuffle || {};
  if (!shuffle.enabled || backgrounds.length < 2) {
    clearScheduled();
    return;
  }
  const next = pickNext(backgrounds, config.currentBackgroundId);
  if (next) {
    const updated = { ...config, currentBackgroundId: next.id };
    await saveConfig(updated);
    if (ioRef) {
      ioRef.emit("background:changed", { backgroundId: next.id });
      ioRef.emit("config:updated", updated);
    }
  }
  scheduleNext(shuffle.intervalSeconds);
}

function scheduleNext(seconds) {
  clearScheduled();
  const ms = Math.max(1000, Math.floor(Number(seconds) * 1000));
  timer = setTimeout(() => {
    if (pendingTick) return;
    pendingTick = true;
    tick().catch((err) => {
      pendingTick = false;
      console.error("Shuffle tick failed:", err);
      scheduleNext(seconds);
    });
  }, ms);
  if (timer && typeof timer.unref === "function") {
    timer.unref();
  }
}

async function reconfigure() {
  clearScheduled();
  const [config, backgrounds] = await Promise.all([readConfig(), readBackgrounds()]);
  const shuffle = config.shuffle || {};
  if (shuffle.enabled && backgrounds.length >= 2 && Number(shuffle.intervalSeconds) > 0) {
    scheduleNext(shuffle.intervalSeconds);
  }
}

function attach(io) {
  ioRef = io;
}

function detach() {
  ioRef = null;
  clearScheduled();
}

module.exports = { attach, detach, reconfigure };

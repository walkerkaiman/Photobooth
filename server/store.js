const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "data");
const BACKGROUNDS_FILE = path.join(DATA_DIR, "backgrounds.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DEFAULT_CONFIG = {
  currentBackgroundId: null,
  eventName: "",
  qrHost: "",
  wifi: {
    ssid: "",
    password: "",
    security: "WPA2",
    hidden: false,
  },
  cornerPin: {
    tl: { x: 0, y: 0 },
    tr: { x: 1, y: 0 },
    br: { x: 1, y: 1 },
    bl: { x: 0, y: 1 },
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function coerceConfigBool(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(s)) return true;
    if (["false", "0", "no", "off", ""].includes(s)) return false;
  }
  return false;
}

function normalizePoint(point, fallbackPoint) {
  const x = typeof point?.x === "number" ? point.x : fallbackPoint.x;
  const y = typeof point?.y === "number" ? point.y : fallbackPoint.y;
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
  };
}

async function ensureStore() {
  await fs.mkdir(path.join(DATA_DIR, "backgrounds"), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "thumbnails"), { recursive: true });

  try {
    await fs.access(BACKGROUNDS_FILE);
  } catch {
    await fs.writeFile(BACKGROUNDS_FILE, "[]\n", "utf8");
  }

  try {
    await fs.access(CONFIG_FILE);
  } catch {
    await fs.writeFile(CONFIG_FILE, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
  }
}

async function readJson(filePath, fallbackValue) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch {
    return fallbackValue;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readBackgrounds() {
  return readJson(BACKGROUNDS_FILE, []);
}

async function saveBackgrounds(backgrounds) {
  return writeJson(BACKGROUNDS_FILE, backgrounds);
}

async function readConfig() {
  const config = await readJson(CONFIG_FILE, DEFAULT_CONFIG);
  const mergedWifi = {
    ...DEFAULT_CONFIG.wifi,
    ...(config.wifi || {}),
  };
  delete mergedWifi.showOnProjection;
  return {
    ...DEFAULT_CONFIG,
    ...config,
    wifi: {
      ...mergedWifi,
      hidden: coerceConfigBool(mergedWifi.hidden),
    },
    cornerPin: {
      ...DEFAULT_CONFIG.cornerPin,
      ...(config.cornerPin || {}),
    },
  };
}

async function saveConfig(config) {
  return writeJson(CONFIG_FILE, config);
}

async function reconcileState(defaultHost = "localhost:3000") {
  const backgroundsRaw = await readBackgrounds();
  const orderedBackgrounds = [...backgroundsRaw]
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((item, index) => ({ ...item, order: index }));

  let backgroundsChanged = orderedBackgrounds.length !== backgroundsRaw.length;
  if (!backgroundsChanged) {
    backgroundsChanged = orderedBackgrounds.some((item, index) => {
      const raw = backgroundsRaw[index];
      return (
        !raw ||
        raw.id !== item.id ||
        raw.order !== item.order ||
        raw.filename !== item.filename ||
        raw.thumbnail !== item.thumbnail
      );
    });
  }
  if (backgroundsChanged) {
    await saveBackgrounds(orderedBackgrounds);
  }

  const configRaw = await readJson(CONFIG_FILE, DEFAULT_CONFIG);
  const normalizedCornerPin = {
    tl: normalizePoint(configRaw.cornerPin?.tl, DEFAULT_CONFIG.cornerPin.tl),
    tr: normalizePoint(configRaw.cornerPin?.tr, DEFAULT_CONFIG.cornerPin.tr),
    br: normalizePoint(configRaw.cornerPin?.br, DEFAULT_CONFIG.cornerPin.br),
    bl: normalizePoint(configRaw.cornerPin?.bl, DEFAULT_CONFIG.cornerPin.bl),
  };

  const validBackgroundIds = new Set(orderedBackgrounds.map((bg) => bg.id));
  const currentBackgroundId = validBackgroundIds.has(configRaw.currentBackgroundId)
    ? configRaw.currentBackgroundId
    : orderedBackgrounds[0]?.id || null;

  const qrHost = typeof configRaw.qrHost === "string" && configRaw.qrHost.trim()
    ? configRaw.qrHost.trim()
    : defaultHost;

  const eventName =
    typeof configRaw.eventName === "string" ? configRaw.eventName.trim().slice(0, 200) : "";

  const rawWifi = configRaw.wifi || {};
  const secRaw = String(rawWifi.security || "WPA2").toUpperCase();
  const security = ["WPA2", "WPA", "WEP", "NOPASS"].includes(secRaw) ? secRaw : "WPA2";
  const wifi = {
    ssid: typeof rawWifi.ssid === "string" ? rawWifi.ssid.trim().slice(0, 32) : "",
    password: typeof rawWifi.password === "string" ? rawWifi.password.slice(0, 128) : "",
    security,
    hidden: coerceConfigBool(rawWifi.hidden),
  };

  const normalizedConfig = {
    ...DEFAULT_CONFIG,
    ...configRaw,
    currentBackgroundId,
    eventName,
    qrHost,
    wifi,
    cornerPin: normalizedCornerPin,
  };

  const changed = JSON.stringify(configRaw) !== JSON.stringify(normalizedConfig);
  if (changed) {
    await saveConfig(normalizedConfig);
  }
}

module.exports = {
  DATA_DIR,
  ensureStore,
  reconcileState,
  readBackgrounds,
  saveBackgrounds,
  readConfig,
  saveConfig,
};

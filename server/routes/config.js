const express = require("express");
const {
  readConfig,
  saveConfig,
  readBackgrounds,
  normalizeShuffle,
} = require("../store");
const shuffleService = require("../shuffle");

function coerceWifiBool(value, fallback) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(s)) return true;
    if (["false", "0", "no", "off", ""].includes(s)) return false;
  }
  return fallback;
}

const router = express.Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await readConfig());
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const current = await readConfig();
    const body = req.body || {};
    const updated = {
      ...current,
      ...body,
      cornerPin: {
        ...current.cornerPin,
        ...(body.cornerPin || {}),
      },
    };
    if (Object.prototype.hasOwnProperty.call(body, "eventName")) {
      updated.eventName =
        typeof body.eventName === "string" ? body.eventName.trim().slice(0, 200) : "";
    }
    if (body.wifi && typeof body.wifi === "object") {
      const w = body.wifi;
      const base = current.wifi || {};
      const secRaw = String(w.security ?? base.security).toUpperCase();
      const security = ["WPA2", "WPA", "WEP", "NOPASS"].includes(secRaw) ? secRaw : "WPA2";
      updated.wifi = {
        ssid: typeof w.ssid === "string" ? w.ssid.trim().slice(0, 32) : base.ssid,
        password: Object.prototype.hasOwnProperty.call(w, "password")
          ? String(w.password ?? "").slice(0, 128)
          : base.password,
        security,
        hidden:
          w.hidden !== undefined ? coerceWifiBool(w.hidden, Boolean(base.hidden)) : Boolean(base.hidden),
      };
    }
    if (body.shuffle && typeof body.shuffle === "object") {
      updated.shuffle = normalizeShuffle({
        ...current.shuffle,
        ...body.shuffle,
      });
    }
    await saveConfig(updated);
    req.app.get("io").emit("config:updated", updated);
    await shuffleService.reconfigure();
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post("/select-background", async (req, res, next) => {
  try {
    const { backgroundId } = req.body || {};
    if (!backgroundId) {
      res.status(400).json({ error: "backgroundId is required" });
      return;
    }
    const backgrounds = await readBackgrounds();
    if (!backgrounds.some((item) => item.id === backgroundId)) {
      res.status(404).json({ error: "Background not found" });
      return;
    }

    const current = await readConfig();
    const updated = { ...current, currentBackgroundId: backgroundId };
    await saveConfig(updated);

    req.app.get("io").emit("background:changed", { backgroundId });
    req.app.get("io").emit("config:updated", updated);
    await shuffleService.reconfigure();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

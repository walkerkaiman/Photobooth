const express = require("express");
const os = require("os");
const QRCode = require("qrcode");
const { readConfig, saveConfig } = require("../store");

const router = express.Router();

function getIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  Object.values(nets).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        ips.push(entry.address);
      }
    });
  });
  return [...new Set(ips)];
}

function normalizeHost(host, port = 3000) {
  if (!host) {
    return "";
  }
  return host.includes(":") ? host : `${host}:${port}`;
}

function resolveDefaultHost(port = 3000) {
  const ips = getIps();
  if (!ips.length) {
    return `localhost:${port}`;
  }
  return `${ips[0]}:${port}`;
}

function escapeWifiField(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/"/g, '\\"');
}

function buildWifiQrString(wifi) {
  if (!wifi || !wifi.ssid || !String(wifi.ssid).trim()) {
    return null;
  }
  const ssid = escapeWifiField(String(wifi.ssid).trim());
  const hidden = wifi.hidden ? "true" : "false";
  const security = String(wifi.security || "WPA2").toUpperCase();
  if (security === "NOPASS") {
    return `WIFI:T:nopass;S:${ssid};H:${hidden};;`;
  }
  const pass = escapeWifiField(String(wifi.password ?? ""));
  const auth = security === "WEP" ? "WEP" : security === "WPA" ? "WPA" : "WPA2";
  return `WIFI:T:${auth};S:${ssid};P:${pass};H:${hidden};;`;
}

router.get("/", async (_req, res, next) => {
  try {
    const config = await readConfig();
    const ips = getIps();
    const normalized = normalizeHost(config.qrHost, 3000) || resolveDefaultHost(3000);
    const controlUrl = `http://${normalized}/control`;
    res.json({ ips, selectedHost: normalized, controlUrl });
  } catch (error) {
    next(error);
  }
});

router.post("/select-host", async (req, res, next) => {
  try {
    const { host } = req.body || {};
    if (!host) {
      res.status(400).json({ error: "host is required" });
      return;
    }
    const config = await readConfig();
    const updated = { ...config, qrHost: normalizeHost(host, 3000) };
    await saveConfig(updated);
    req.app.get("io").emit("config:updated", updated);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/qr", async (_req, res, next) => {
  try {
    const config = await readConfig();
    const normalized = normalizeHost(config.qrHost, 3000) || resolveDefaultHost(3000);
    const controlUrl = `http://${normalized}/control`;
    const dataUrl = await QRCode.toDataURL(controlUrl, { width: 200, margin: 1 });

    const wifi = config.wifi || {};
    const ssidTrimmed = String(wifi.ssid ?? "").trim();
    let wifiDisabledReason = null;
    if (!ssidTrimmed) {
      wifiDisabledReason = "wifi_no_ssid";
    }
    const wifiEnabled = wifiDisabledReason === null;
    const wifiString = wifiEnabled ? buildWifiQrString({ ...wifi, ssid: ssidTrimmed }) : null;
    const wifiDataUrl = wifiString
      ? await QRCode.toDataURL(wifiString, { width: 200, margin: 1 })
      : null;

    res.json({
      controlUrl,
      dataUrl,
      wifiQr: {
        api: 2,
        enabled: Boolean(wifiDataUrl),
        ssid: wifiEnabled ? ssidTrimmed : "",
        dataUrl: wifiDataUrl,
        disabledReason: wifiDisabledReason,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  getIps,
  normalizeHost,
  resolveDefaultHost,
  buildWifiQrString,
};

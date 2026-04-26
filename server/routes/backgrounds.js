const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { readBackgrounds, saveBackgrounds, DATA_DIR, readConfig, saveConfig } = require("../store");
const {
  makeThumbnailName,
  generateImageThumbnail,
  generateVideoThumbnail,
} = require("../thumbnails");

const router = express.Router();

const allowedExts = [".png", ".jpg", ".jpeg", ".gif", ".mp4", ".webm"];
const imageExts = [".png", ".jpg", ".jpeg", ".gif"];
const videoExts = [".mp4", ".webm"];

const backgroundsDir = path.join(DATA_DIR, "backgrounds");
const thumbnailsDir = path.join(DATA_DIR, "thumbnails");

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, backgroundsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExts.includes(ext)) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  },
});

function toClient(item) {
  return {
    ...item,
    url: `/data/backgrounds/${item.filename}`,
    thumbnailUrl: `/data/thumbnails/${item.thumbnail}`,
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const backgrounds = await readBackgrounds();
    res.json(backgrounds.map(toClient));
  } catch (error) {
    next(error);
  }
});

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const ext = path.extname(req.file.filename).toLowerCase();
    const id = crypto.randomUUID();
    const type = videoExts.includes(ext) ? "video" : "image";
    const thumbName = makeThumbnailName(id);
    const thumbPath = path.join(thumbnailsDir, thumbName);

    if (imageExts.includes(ext)) {
      await generateImageThumbnail(req.file.path, thumbPath);
    } else {
      await generateVideoThumbnail(req.file.path, thumbPath);
    }

    const backgrounds = await readBackgrounds();
    const item = {
      id,
      label: req.body.label || path.parse(req.file.originalname).name,
      filename: req.file.filename,
      thumbnail: thumbName,
      type,
      order: backgrounds.length,
    };
    backgrounds.push(item);
    await saveBackgrounds(backgrounds);

    const config = await readConfig();
    if (!config.currentBackgroundId) {
      await saveConfig({
        ...config,
        currentBackgroundId: item.id,
      });
      req.app.get("io").emit("background:changed", { backgroundId: item.id });
    }

    req.app.get("io").emit("backgrounds:updated");
    res.status(201).json(toClient(item));
  } catch (error) {
    next(error);
  }
});

router.post("/reorder", express.json(), async (req, res, next) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: "ids must be an array" });
      return;
    }
    const backgrounds = await readBackgrounds();
    const map = new Map(backgrounds.map((item) => [item.id, item]));
    const reordered = ids
      .map((id, index) => {
        const item = map.get(id);
        if (!item) {
          return null;
        }
        return { ...item, order: index };
      })
      .filter(Boolean);
    await saveBackgrounds(reordered);
    req.app.get("io").emit("backgrounds:updated");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const backgrounds = await readBackgrounds();
    const existing = backgrounds.find((item) => item.id === id);
    if (!existing) {
      res.status(404).json({ error: "Background not found" });
      return;
    }
    const kept = backgrounds.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index }));
    await saveBackgrounds(kept);

    await fs.rm(path.join(backgroundsDir, existing.filename), { force: true });
    await fs.rm(path.join(thumbnailsDir, existing.thumbnail), { force: true });

    const config = await readConfig();
    if (config.currentBackgroundId === id) {
      await saveConfig({
        ...config,
        currentBackgroundId: kept[0]?.id || null,
      });
      req.app.get("io").emit("background:changed", { backgroundId: kept[0]?.id || null });
    }

    req.app.get("io").emit("backgrounds:updated");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

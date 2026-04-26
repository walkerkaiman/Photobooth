const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { ensureStore, reconcileState, DATA_DIR } = require("./store");

const backgroundsRoute = require("./routes/backgrounds");
const configRoute = require("./routes/config");
const { router: networkRoute, normalizeHost, resolveDefaultHost } = require("./routes/network");
const shuffleService = require("./shuffle");

const DEFAULT_PORT = Number(process.env.PORT || 3000);

async function createApp() {
  await ensureStore();
  await reconcileState(normalizeHost(resolveDefaultHost(DEFAULT_PORT), DEFAULT_PORT));

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  app.set("io", io);

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/data/backgrounds", express.static(path.join(DATA_DIR, "backgrounds")));
  app.use("/data/thumbnails", express.static(path.join(DATA_DIR, "thumbnails")));

  app.use("/api/backgrounds", backgroundsRoute);
  app.use("/api/config", configRoute);
  app.use("/api/network", networkRoute);

  app.use("/projection", express.static(path.join(__dirname, "..", "public", "projection")));
  app.use("/control", express.static(path.join(__dirname, "..", "public", "control")));
  app.use("/admin", express.static(path.join(__dirname, "..", "public", "admin")));
  app.get("/", (_req, res) => {
    res.redirect("/admin");
  });

  io.on("connection", (socket) => {
    socket.emit("server:ready");
  });

  app.use((err, _req, res, _next) => {
    // Keep errors readable during setup; can be replaced with logger later.
    console.error(err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  return { app, server, io };
}

async function startServer(port = DEFAULT_PORT) {
  const { server, io } = await createApp();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });

  shuffleService.attach(io);
  await shuffleService.reconfigure();

  console.log(`Photobooth server listening on http://0.0.0.0:${port}`);
  return { port, server };
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
};

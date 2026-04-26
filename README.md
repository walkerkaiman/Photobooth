# Photobooth Projector

Local-first photobooth background projection app for a single projector.

## What it does

- Runs a fullscreen projection page through Electron.
- Shows two QR codes on projection: one to **join Wi‑Fi** (`WIFI:` standard) and one to open the **background** control page (scan with the phone camera).
- Lets guests pick still or animated backgrounds (png/jpg/gif/mp4/webm).
- Guest phones can change backgrounds anytime; the **last selection wins** (no session lock).
- Optional auto-shuffle: cycle to a random background every N seconds while enabled.
- Provides an admin page for uploads, ordering, QR host selection, and corner pin.

## What it does not do

- Capture, store, or process guest photos.

## URLs at runtime

The Electron window automatically opens `/projection`. The other two pages are served on the same port (default `3000`) and you reach them from any device on the LAN:

- `http://<projector-host>:3000/projection` — fullscreen output (Electron window).
- `http://<projector-host>:3000/control` — guest phone background picker (linked from QR).
- `http://<projector-host>:3000/admin` — operator page (uploads, event name, corner pin, Wi‑Fi QR, host selection).

Press **Esc** anywhere on the projection window to quit.

## Startup guide — Windows

Tested on Windows 10/11 x64.

1. Install **Node.js 20 LTS** from <https://nodejs.org/>. (npm comes with it.)
2. Clone the repo and install dependencies (in **PowerShell**, not Git Bash, so the `electron-builder` postinstall finds the right toolchain):
   ```powershell
   git clone <repo-url> Photobooth
   cd Photobooth
   npm install
   ```
3. Plug in the projector and extend (not mirror) the desktop. Electron picks the second display automatically; if only one display is present, it uses the primary one.
4. Start the app:
   ```powershell
   npm run electron
   ```
5. Open the admin page on the same machine (or any phone/laptop on the LAN) at `http://localhost:3000/admin` and:
   - Upload a few backgrounds.
   - Enter an event name.
   - (Optional) Turn on **Shuffle** and set an interval (seconds) to auto-cycle through random backgrounds.
   - Enter your guest Wi‑Fi SSID + password and click **Save Wi‑Fi QR**.
   - Drag the four corner-pin handles to align the projection on whatever surface you're using.
   - Pick the right LAN IP from **QR Host / Network** so the QR points at this machine's IP rather than `localhost`.
6. To package an installable `.exe`:
   ```powershell
   npm run build:win
   ```
   Output lands in `dist/`.

### Auto-start on boot (Windows)

The simplest setup: drop a shortcut to `npm run electron` (or your packaged `.exe`) into `shell:startup`. For a more reliable kiosk, use Task Scheduler with **At log on** + **Run with highest privileges** + **Restart on failure**.

### Troubleshooting (Windows)

- **"Port 3000 in use" dialog at launch.** A previous photobooth or stray `node.exe` is still bound. The app already tries to `taskkill` it; if it can't, open Task Manager → Details, end any `node.exe`/`Photobooth Projector.exe` processes, and relaunch.
- **Wi‑Fi QR doesn't appear.** Make sure an SSID is saved in admin. The QR shows automatically once `wifi.ssid` is non-empty.
- **Cursor visible on projection.** Move the mouse to the primary display; the projection page hides it via CSS while focused.

---

## Startup guide — Raspberry Pi OS (Raspbian)

Tested on **64-bit Raspberry Pi OS Bookworm** running on a **Pi 4 (4GB+) or Pi 5**. The 32-bit OS is **not recommended** because `sharp` and Electron don't ship 32-bit ARM prebuilts and would compile from source for hours.

1. Flash **Raspberry Pi OS (64-bit) with desktop** using Raspberry Pi Imager. Set hostname, Wi-Fi, and SSH at flash time.
2. Boot the Pi, finish first-run setup, then update and install Electron's runtime libraries:
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo apt install -y git curl \
     libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libasound2 \
     libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgtk-3-0
   ```
3. Install **Node.js 20** via NodeSource (the apt-default Node is too old):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v   # should print v20.x
   ```
4. Clone and install dependencies:
   ```bash
   git clone <repo-url> ~/Photobooth
   cd ~/Photobooth
   npm install
   ```
   `sharp` and `ffmpeg-static` will pull `linux-arm64` prebuilts — no compilation needed.
5. Connect the projector via HDMI (use **HDMI0** on Pi 4 / either port on Pi 5). Reboot once so the Pi picks up the EDID.
6. Disable screen blanking so the projection never sleeps. Edit `~/.config/wayfire.ini` (Wayland, default on Bookworm) or run from a terminal autostart on X11:
   ```bash
   xset s off
   xset -dpms
   xset s noblank
   ```
7. Start the app from the desktop session:
   ```bash
   cd ~/Photobooth
   npm run electron
   ```
   On Wayland, if Electron starts in a window instead of fullscreen, force X11 once to confirm everything works:
   ```bash
   npm run electron -- --ozone-platform=x11
   ```

### Auto-start on boot (Raspberry Pi)

Use a `systemd --user` unit so the app launches once the desktop session is up and respawns if it crashes:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/photobooth.service <<'EOF'
[Unit]
Description=Photobooth Projector
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
WorkingDirectory=%h/Photobooth
ExecStart=/usr/bin/npm run electron
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical-session.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now photobooth.service
sudo loginctl enable-linger "$USER"   # so the unit starts even before login
```

Logs: `journalctl --user -u photobooth.service -f`.

### Optional: hide the cursor and lock the kiosk

```bash
sudo apt install -y unclutter
echo "@unclutter -idle 0" >> ~/.config/lxsession/LXDE-pi/autostart   # X11 only
```

(The projection page already hides the cursor via CSS, so this is mostly belt-and-suspenders for the desktop edges.)

### Troubleshooting (Raspberry Pi)

- **"Port 3000 in use" dialog.** The Windows-only auto-recovery doesn't run on Linux. Free it manually and relaunch:
  ```bash
  fuser -k 3000/tcp
  ```
- **Black screen / Electron crashes on launch.** Usually a missing system library — re-run the `apt install` line in step 2.
- **`sharp` install errors.** You're probably on 32-bit Pi OS. Reflash with the 64-bit image; or `sudo apt install libvips-dev` and `npm rebuild sharp` (slow).
- **4K video stutters.** Use 1080p `.mp4` (H.264) where possible — the Pi has hardware H.264 decode but software VP9 decode.
- **QR points at `localhost`.** In admin, pick the Pi's LAN IP from **QR Host / Network** so phones can actually reach it.

---

## Dev commands

- `npm run start` — start the Express/Socket.IO server only (no Electron). Useful for hacking on the web pages from your laptop.
- `npm run electron` — run the desktop app locally.
- `npm run build:win` — package a Windows installer into `dist/`.

## Media storage

Uploaded files and admin settings are stored locally and are gitignored:

- `data/backgrounds/` — uploaded source files.
- `data/thumbnails/` — generated thumbnails.
- `data/backgrounds.json` — background library manifest.
- `data/config.json` — admin settings (event name, corner pin, Wi‑Fi, selected QR host, current background).

## Supported formats

- Images: `.png`, `.jpg`, `.jpeg`, `.gif`
- Video: `.mp4`, `.webm` (looped and muted)

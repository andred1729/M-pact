# Globe Simulator

A minimalist CesiumJS setup that renders an interactive 3D globe focused on a scripted meteor re-entry. It prefers Cesium Ion resources when a token is supplied, but can fall back to open OpenStreetMap imagery so the showcase runs out of the box.

## Getting started

1. Install dependencies (already done if `node_modules` is present):
   ```bash
   npm install
   ```
2. Export your Cesium Ion token (optional, but recommended if you want global imagery/terrain):
   ```bash
   export CESIUM_ION_TOKEN="paste-your-token-here"
   ```
3. Start the bundled Node server, which injects the token into the page at runtime:
   ```bash
   node server.js
   ```
   The server defaults to port `8080`. Override with `PORT=3000 node server.js` if desired.
4. Open the app: <http://localhost:8080>

> Prefer a static server? `python3 -m http.server` still works, but any Cesium Ion token will be ignored.

## Controls

- Drag with the mouse (or right-click + drag) to orbit and tilt.
- Scroll or pinch to zoom anywhere on the globe.
- Double-click to focus on the red impact ring once the meteor run has completed.
- Click `Launch Meteor` to watch the meteor streak from Canada toward the southeast United States.

## Meteor configuration

Tweak the `METEOR` settings inside `index.html` to change the launch/impact coordinates, flight duration, or swap in a glTF via `modelUri`. Update `METEOR.targetCity` to point at one of the entries in the `CITIES` lookup (currently only Chicago) and `METEOR.asteroidId` to pull from the `ASTEROIDS` catalog (joule yield + size). Click `Launch Meteor` — the script drives Cesium’s clock, samples the trajectory, spawns a glowing trail, and, once the run completes, stamps a red impact ring sized off the asteroid energy so it stays visible for analysis.

The globe is intentionally sparse — only the meteor primitives and the computed impact ring appear — making it easy to layer additional meteor dynamics without the visual noise of extra demo geometry.

This layout keeps the code lightweight so meteor dynamics overlays, heatmaps, or custom tilesets can be added later without reworking the core viewer.

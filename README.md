# Globe Simulator

A minimalist CesiumJS setup that renders an interactive 3D globe packed with the Geometry & Appearance demo entities plus a scripted meteor re-entry. It prefers Cesium Ion resources when a token is supplied, but can fall back to open OpenStreetMap imagery so the showcase runs out of the box.

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
- Scroll or pinch to zoom in and out of the analytic geometries.
- Double-click an object to focus and zoom the camera on it.
- Click `Launch Meteor` to watch the meteor streak from Canada toward the southeast United States.

## Meteor configuration

Tweak the `METEOR` settings inside `index.html` to change the launch/impact coordinates, flight duration, or swap in a glTF via `modelUri`. Trigger the updated sequence with the `Launch Meteor` button — the script drives Cesium’s clock, samples the trajectory, spawns a glowing trail, and triggers an impact burst when altitude drops below ~1.5 km or the flight time completes.

The default scene mirrors Cesium’s Geometry & Appearance showcase, so you can inspect rectangles, corridors, polyline volumes, and other primitives that we’ll build on for meteor dynamics.

This layout keeps the code lightweight so meteor dynamics overlays, heatmaps, or custom tilesets can be added later without reworking the core viewer.

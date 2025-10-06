# MPACT Asteroid Demo for NASA Space Apps 2025 Chicago

This repo now hosts both stages of the experience behind a single Node server:

1. **Orbital catalog (`/`)** – pick an asteroid in Cesium’s 3D globe, inspect its
   orbit, and press **Start** (toolbar button) to hand the selection off to the
   impact visualisation.
2. **Impact visualisation (`/meteor.html`)** – the selection is replayed at
   ground level with a customisable trajectory, glowing trail, and expanding
   impact rings. A `Back to Selection` button returns you to the orbital view.

The Cesium Ion token you export is injected into both pages so you can run the
entire flow from `node server.js` without juggling separate servers.

## Getting started

```bash
npm install
node server.js
```

Open <http://localhost:8080> to choose an asteroid. When you’re ready, click the
toolbar **Start** button; the app will navigate to `/meteor.html` and replay the
impact using the energy/size metadata from your selection. The meteor page keeps
that trail on screen until you hit **Replay Meteor** or return to the catalog.

## Orbital catalog tips

- Drag/right-click to orbit and tilt, use the mouse wheel to zoom.
- Click an asteroid label to select it – the selection banner updates and the
  **Start** button becomes enabled.
- Each asteroid encodes nominal energy (petajoules) and approximate diameter;
  those values are forwarded to the impact stage for ring sizing.

## Impact stage controls

- `Launch Meteor` plays the run; the orange trail only shows the path already
  travelled so far.
- `Back to Selection` returns to the orbital page to pick a new asteroid.
- `Pick Impact` lets you click a new surface location before replaying.
- `Impact angle` and `Speed` sliders refine the approach vector and clock
  multiplier; the trajectory curve and particle plume update accordingly.
- Captured trails persist between runs until you hit **Replay Meteor**.

The meteor view intentionally stays sparse so you can layer additional overlays
or analysis without fighting extra demo geometry.

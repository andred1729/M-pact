// === main.js (models visible + InfoBox body + overlay label + working nav) ===

// --- Cesium setup (minimal UI) ---
const ionToken = (window.CESIUM_ION_TOKEN || "").trim();
if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;
if (window.CESIUM_BASE_URL) Cesium.buildModuleUrl.setBaseUrl(window.CESIUM_BASE_URL);

const viewer = new Cesium.Viewer("cesiumContainer", {
  infoBox: true,
  terrain: Cesium.Terrain.fromWorldTerrain({ requestWaterMask: true }),
  animation: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  selectionIndicator: true,
  timeline: false,
  vrButton: false,
});

viewer.clock.shouldAnimate = true;

// Remove Cesium toolbar buttons
const toolbar = viewer.container.querySelector(".cesium-viewer-toolbar");
if (toolbar) toolbar.innerHTML = "";

// --- InfoBox theming/size ---
(() => {
  const style = document.createElement("style");
  style.textContent = `
    .cesium-viewer-infoBoxContainer { width: clamp(380px, 36vw, 560px) !important; max-height: 72vh !important; }
    .cesium-infoBox-iframe { height: 420px !important; }
    @media (max-width: 640px) {
      .cesium-viewer-infoBoxContainer { width: 90vw !important; max-height: 60vh !important; }
      .cesium-infoBox-iframe { height: 320px !important; }
    }
  `;
  document.head.appendChild(style);

  const inject = () => {
    const doc = viewer.infoBox.frame?.contentDocument;
    if (!doc || doc.getElementById("injected-infobox-style")) return;
    const s = doc.createElement("style");
    s.id = "injected-infobox-style";
    s.textContent = `
      :root { color-scheme: light dark; }
      html, body { margin:0; padding:8px; font:14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      h3 { margin:0 0 .5em; font-size:16px; }
      code, pre { background: rgba(0,0,0,.06); padding:.1em .3em; border-radius:4px; }
      @media (prefers-color-scheme: dark) { code, pre { background: rgba(255,255,255,.08); } }
    `;
    doc.head.appendChild(s);
  };
  viewer.infoBox.frame?.addEventListener("load", inject);
  inject();
})();

// === Overlay hooks (support both id spellings) ===
const STORAGE_KEY = "mpact:selectedAsteroid";
const selectedNameEl =
  document.getElementById("selectedAsteroidName") ||
  document.getElementById("selectedAsteroidLabel"); // <- fallback
const selectedStatsEl =
  document.getElementById("selectedAsteroidStats") ||
  document.getElementById("selectedAsteroidMeta"); // optional fallback

// Gradient “Choose a Meteor” button in overlay
const chooseBtn = document.createElement("button");
chooseBtn.id = "chooseMeteorBtn";
chooseBtn.textContent = "Choose this Asteroid!";
chooseBtn.type = "button";
chooseBtn.disabled = true;
Object.assign(chooseBtn.style, {
  marginTop: ".5rem",
  padding: ".5rem 1.1rem",
  borderRadius: "999px",
  border: "1px solid rgba(125,211,252,.45)",
  background: "linear-gradient(120deg,#1d8cf8,#935ade)",
  color: "#fff",
  cursor: "pointer",
  fontSize: ".85rem",
  boxShadow: "0 8px 22px rgba(33,150,243,.35)",
  transition: "transform .2s, box-shadow .2s",
  opacity: "0.6",
});
chooseBtn.addEventListener("mouseover", () => {
  if (!chooseBtn.disabled) {
    chooseBtn.style.transform = "translateY(-1px)";
    chooseBtn.style.boxShadow = "0 12px 28px rgba(33,150,243,.4)";
  }
});
chooseBtn.addEventListener("mouseout", () => {
  chooseBtn.style.transform = "none";
  chooseBtn.style.boxShadow = "0 8px 22px rgba(33,150,243,.35)";
});
const overlay = document.querySelector(".overlay");
if (overlay) overlay.appendChild(chooseBtn);

// === Clock window ===
const start = Cesium.JulianDate.now();
const stop  = Cesium.JulianDate.addMinutes(start, 90, new Cesium.JulianDate());
viewer.clock.startTime   = start.clone();
viewer.clock.stopTime    = stop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.clockRange  = Cesium.ClockRange.LOOP_STOP;
viewer.clock.multiplier  = 60;

// === Orbit helpers ===
const GM = 3.986004418e14;
const R_EARTH = 6371000.0;
function orbitalAngularRate(r) { return 10 * Math.sqrt(GM / (r*r*r)); }
function rotateToECI(p, RAAN, inc) {
  const cO = Math.cos(RAAN), sO = Math.sin(RAAN);
  const x1 = cO*p.x - sO*p.y;
  const y1 = sO*p.x + cO*p.y;
  const ci = Math.cos(inc), si = Math.sin(inc);
  return new Cesium.Cartesian3(x1, ci*y1 - si*p.z, si*y1 + ci*p.z);
}
function makeOrbitPosition({ start, stop, altitude, incDeg, RAANDeg, phaseDeg, sampleStepSec=30 }) {
  const inc = Cesium.Math.toRadians(incDeg);
  const RAAN = Cesium.Math.toRadians(RAANDeg);
  const phase0 = Cesium.Math.toRadians(phaseDeg);
  const r = R_EARTH + altitude;
  const omega = orbitalAngularRate(r);
  const position = new Cesium.SampledPositionProperty();
  for (let t = 0; ; t += sampleStepSec) {
    const when = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
    if (Cesium.JulianDate.greaterThan(when, stop)) break;
    const theta = phase0 + omega * t;
    const pOrb = new Cesium.Cartesian3(r*Math.cos(theta), r*Math.sin(theta), 0);
    position.addSample(when, rotateToECI(pOrb, RAAN, inc));
  }
  position.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
  position.forwardExtrapolationType  = Cesium.ExtrapolationType.HOLD;
  return position;
}

// === Overlay display ===
function updateSelectionDisplay(spec) {
  // Always enable/disable the button even if the overlay text nodes are missing
  const hasSelection = !!spec;
  chooseBtn.disabled = !hasSelection;
  chooseBtn.style.opacity = hasSelection ? "1" : "0.6";

  if (!selectedNameEl && !selectedStatsEl) return; // nothing to render text into

  if (!spec) {
    if (selectedNameEl)  selectedNameEl.textContent  = "No asteroid selected";
    if (selectedStatsEl) selectedStatsEl.textContent = "Energy — · Diameter —";
    return;
  }
  if (selectedNameEl)  selectedNameEl.textContent  = spec.name;
  if (selectedStatsEl) {
    const energyPJ = (spec.energyJoules).toFixed(2);
    const energyBombs = spec.energyBombs;
    const sizeObjects = spec.sizeObjects;
    const prob = spec.prob;
    selectedStatsEl.textContent = `Energy ~${energyPJ} Megaton (one million tons of TNT) · Diameter ~${spec.sizeMeters.toFixed(0)} m`;
  }
}

// === Model rendering (primitive or entity) + picking support ===
const primitiveToEntity = new WeakMap();

function addAsteroid({
  id,
  name = "Asteroid",
  glb = "mpact/assets/asteroid.glb",
  altitude = 25_000_000,
  incDeg = 45,
  RAANDeg = 0,
  phaseDeg = 0,
  modelScale = 500_000,
  labelColor = Cesium.Color.WHITE,
  pathColor  = Cesium.Color.CYAN,
  trailTime  = 600,
  usePrimitive = true,
  silhouette = { color: Cesium.Color.LIME, size: 3 },
  energyJoules = 4.0e14,
  energyBombs = 5,
  sizeMeters = 20,
  sizeObjects = "Roughly 8 Christmas Trees on top of each other",
  prob = 1e-4,
  targetCity = "chicago",
}) {
  const position = makeOrbitPosition({ start, stop, altitude, incDeg, RAANDeg, phaseDeg });
  const orientation = new Cesium.VelocityOrientationProperty(position);
  const availability = new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]);

  const e = viewer.entities.add({
    id, availability, position, orientation, name,
    label: {
      text: name,
      font: "16px sans-serif",
      fillColor: labelColor,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
      pixelOffset: new Cesium.Cartesian2(0, -20),
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.2, 1e7, 0.6),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    path: new Cesium.PathGraphics({
      width: 3,
      material: pathColor.withAlpha(0.9),
      leadTime: 0,
      trailTime,
    }),
    description: new Cesium.CallbackProperty((time) => {
      const p = position.getValue(time);
      if (!p) return `<h3>${name}</h3>`;
      const c = Cesium.Cartographic.fromCartesian(p);
      const lat = Cesium.Math.toDegrees(c.latitude).toFixed(2);
      const lon = Cesium.Math.toDegrees(c.longitude).toFixed(2);
      const altKm = (c.height / 1000).toFixed(0);
      return `<h3>${name}</h3>
        <div>Lat/Lon: ${lat}°, ${lon}°</div>
        <div>Alt: ${altKm} km</div>
        <div>Energy: ${(energyJoules).toFixed(0)} Megatons (1 million tons of TNT)</div>
        <div>Energy (scaled): ${energyBombs} Nuclear Bombs (Hiroshima)</div>
        <div>Diameter: ${sizeMeters.toFixed(0)} m</div>
        <div>Diameter (scaled): ${sizeObjects}</div>
        <div>Probability of Earth Impact: 1 in ${(1/prob).toFixed(0)} </div>`;
    }, false),
  });

  e.mpactData = { id, name, energyJoules, sizeMeters, targetCity };

  if (!usePrimitive) {
    // Entity-based model (auto-pickable)
    e.model = new Cesium.ModelGraphics({
      uri: glb,
      scale: modelScale,
      minimumPixelSize: 64,
      maximumScale: 200_000,
      color: Cesium.Color.WHITE,
      colorBlendMode: Cesium.ColorBlendMode.MIX,
    });
  } else {
    // Primitive model with silhouette
    (async () => {
      try {
        const m = await Cesium.Model.fromGltfAsync({ url: glb, scale: modelScale });
        viewer.scene.primitives.add(m);
        primitiveToEntity.set(m, e);
        m.silhouetteColor = silhouette.color;
        m.silhouetteSize  = silhouette.size;
        viewer.scene.preRender.addEventListener((_scene, time) => {
          const pos = position.getValue(time);
          if (!pos) return;
          const q = orientation.getValue(time);
          if (q) {
            const R = Cesium.Matrix3.fromQuaternion(q);
            m.modelMatrix = Cesium.Matrix4.fromRotationTranslation(R, pos);
          } else {
            m.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
          }
        });
      } catch (err) {
        console.warn(`Model load failed for ${name}:`, err);
        e.point = new Cesium.PointGraphics({
          pixelSize: 12,
          color: Cesium.Color.ORANGE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
        });
      }
    })();
  }

  return e;
}

// Global picking: entity or primitive -> select entity (ensures overlay + button update)
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.position);
  if (!picked) return;

  // If an entity was picked (labels/paths/etc.)
  if (picked.id && picked.id instanceof Cesium.Entity) {
    viewer.selectedEntity = picked.id;
    return;
  }
  // If a primitive model was picked, map to its entity
  if (picked.primitive && primitiveToEntity.has(picked.primitive)) {
    viewer.selectedEntity = primitiveToEntity.get(picked.primitive);
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// === Asteroids ===
const specs = [
  {
    id: "2010 ER12",
    name: "2010 ER12",
    altitude: 25_000_000,
    incDeg: 90,
    RAANDeg: 0,
    phaseDeg: 0,
    modelScale: 500_000,
    pathColor: Cesium.Color.CYAN,
    meteorProfileId: "a1",
    energyJoules: 1.2e+5, 
    energyBombs: 8000000,
    sizeMeters: 1012,
    sizeObjects: "Spanning almost the length from the tip of Florida to the top of Georgia (1200m)! ",
    prob: 1.3e-9,
  },
  {
    id: "2014 HN197",
    name: "2014 HN197",
    altitude: 25_000_000,
    incDeg: 130,
    RAANDeg: 60,
    phaseDeg: 45,
    modelScale: 175_000,
    pathColor: Cesium.Color.YELLOW,
    meteorProfileId: "a2",
    energyJoules: 4.3e+3,
    energyBombs: 287000,
    sizeMeters: 350,
    sizeObjects: "Taller than the Eiffel Tower (330m)",
    prob: 6.5e-9, 
  },
  {
    id: "2023 TB2",
    name: "2023 TB2",
    altitude: 60_000_000,
    incDeg: 63.4,
    RAANDeg: -120,
    phaseDeg: 180,
    modelScale: 29_000,
    pathColor: Cesium.Color.ORANGE,
    meteorProfileId: "a3",
    energyJoules: 5.3e+0,
    energyBombs: 353,
    sizeMeters: 58,
    sizeObjects: "The length of five yellow school buses, parked front-to-back",
    prob: 6.5e-5,
  },
  {
    id: "2022 VF1",
    name: "2022 VF1",
    altitude: 50_000_000,
    incDeg: 251.6,
    RAANDeg: -90,
    phaseDeg: 270,
    modelScale: 60_000,
    pathColor: Cesium.Color.LIME,
    usePrimitive: true,
    silhouette: { color: Cesium.Color.LIME, size: 4 },
    meteorProfileId: "a4",
    energyJoules: 1.2e+2,
    energyBombs: 8000,
    sizeMeters: 120,
    sizeObjects: "Almost as tall as Great Pyramid of Giza (138m)",
    prob: 6.1e-8,
  },
  {
    id: "2000 WJ107",
    name: "2000 WJ107",
    altitude: 30_000_000,
    incDeg: 80,
    RAANDeg: -180,
    phaseDeg: 100,
    modelScale: 40_500,
    pathColor: Cesium.Color.ORANGE,
    usePrimitive: true,
    silhouette: { color: Cesium.Color.LIME, size: 4 },
    meteorProfileId: "a4",
    energyJoules: 2.4e+1,
    energyBombs: 1600,
    sizeMeters: 81,
    sizeObjects: "The height of a 17 story building",
    prob: 7.5e-6,
  },
  {
    id: "2025 RM1",
    name: "2025 RM1",
    altitude: 47_000_000,
    incDeg: 205,
    RAANDeg: 220,
    phaseDeg: 170,
    modelScale: 19_000,
    pathColor: Cesium.Color.BLUE,
    usePrimitive: true,
    silhouette: { color: Cesium.Color.LIME, size: 4 },
    meteorProfileId: "a4",
    energyJoules: 2.4e0,
    energyBombs: 160,
    sizeMeters: 38,
    sizeObjects: "1.5 times a typical flagpole's height!",
    prob: 6.3e-5,
  },
  {
    id: "2024 RS16",
    name: "2024 RS16",
    altitude: 47_000_000,
    incDeg: 10,
    RAANDeg: 270,
    phaseDeg: -25,
    modelScale: 2500,
    pathColor: Cesium.Color.YELLOW,
    usePrimitive: true,
    silhouette: { color: Cesium.Color.LIME, size: 4 },
    meteorProfileId: "a4",
    energyJoules: 4.9e-3,
    energyBombs: 2,
    sizeMeters: 5,
    sizeObjects: "2 and a half horses standing on top of each other",
    prob: 2.6e-5,
  },
];
const asteroids = specs.map(addAsteroid);

// === Selection wiring & overlay updates ===
let currentSelection = null;
function setSelection(entity) {
  const data = entity?.mpactData || null;
  currentSelection = data;
  updateSelectionDisplay(data);
}
viewer.selectedEntityChanged.addEventListener(setSelection);
setSelection(viewer.selectedEntity || null); // initialize overlay

// === Button: Save + go to next page (use RELATIVE path) ===
chooseBtn.addEventListener("click", () => {
  if (!currentSelection) {
    alert("Select an asteroid first.");
    return;
  }
  const payload = {
    meteorProfileId: currentSelection.id,  // meteor.html expects "meteorProfileId"
    name: currentSelection.name,
    energyJoules: currentSelection.energyJoules,
    sizeMeters: currentSelection.sizeMeters,
    targetCity: currentSelection.targetCity,
    timestamp: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Unable to persist asteroid selection:", err);
  }
  // Use relative navigation so it works from any base path
  window.location.href = "meteor.html";
});

// === Camera zoom-out on load ===
const camera = viewer.camera;
const current = Cesium.Cartographic.fromCartesian(camera.positionWC);
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromRadians(current.longitude, current.latitude, current.height * 8.0),
  duration: 1.5,
});

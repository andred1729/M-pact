// main.js



const ionToken = (window.CESIUM_ION_TOKEN || "").trim();
if (ionToken) {
  Cesium.Ion.defaultAccessToken = ionToken;
} else {
  console.warn(
    "CESIUM_ION_TOKEN not provided. Terrain and other Ion resources may be unavailable."
  );
}

if (window.CESIUM_BASE_URL) {
  Cesium.buildModuleUrl.setBaseUrl(window.CESIUM_BASE_URL);
}

const viewer = new Cesium.Viewer('cesiumContainer', {
  infoBox: true,
  terrain: Cesium.Terrain.fromWorldTerrain({ requestWaterMask: true }),
});

const STORAGE_KEY = 'mpact:selectedAsteroid';
const selectedNameEl = document.getElementById('selectedAsteroidName');

function updateSelectionDisplay(spec) {
  if (!selectedNameEl) return;
  selectedNameEl.textContent = spec
    ? `Selected: ${spec.name}`
    : 'No asteroid selected yet.';
}

updateSelectionDisplay(null);

// --- Clock setup: loop time and run fast enough to see motion ---
const start = Cesium.JulianDate.now();
const stop  = Cesium.JulianDate.addMinutes(start, 90, new Cesium.JulianDate()); // ~one orbit at 500 km

viewer.clock.startTime = start.clone();
viewer.clock.stopTime  = stop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP; // loop when reaching stop
viewer.clock.multiplier = 60; // 1 sec real-time = 60 sec sim-time (speed up)

// Earth + orbit helpers
const GM = 3.986004418e14;         // m^3/s^2
const R_EARTH = 6371000.0;         // m
// ---------- Constants ----------
const WGS84_A = 6378137.0;                // m
const MU = 3.986004418e14;                // m^3/s^2  (Earth GM)
const R_E = 6371000.0;                    // m (spherical radius for altitude)
const RHO0 = 1.225;                       // kg/m^3 (sea-level density)
const H_SCALE = 8500.0;                   // m (scale height)

function orbitalAngularRate(r) {    // circular orbit
  return 10*Math.sqrt(GM / (r*r*r));
}

// Rotate PQW (orbital plane) → ECI with RAAN (Ω) then inclination (i)
function rotateToECI(p, RAAN, inc) {
  const cO = Math.cos(RAAN), sO = Math.sin(RAAN);
  const x1 =  cO*p.x - sO*p.y;
  const y1 =  sO*p.x + cO*p.y;
  const z1 =  p.z;
  const ci = Math.cos(inc), si = Math.sin(inc);
  return new Cesium.Cartesian3(x1, ci*y1 - si*z1, si*y1 + ci*z1);
}

// Build a SampledPositionProperty for a circular orbit
function makeOrbitPosition({ start, stop, altitude, incDeg, RAANDeg, phaseDeg, sampleStepSec=30 }) {
  const inc  = Cesium.Math.toRadians(incDeg);
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
function addAsteroid({
  id,
  name = "Asteroid",
  glb = "mpact/assets/asteroid.glb",
  altitude = 500_000,          // m
  incDeg = 45,                 // inclination
  RAANDeg = 0,                 // ascending node
  phaseDeg = 0,                // starting angle
  modelScale = 500,            // GLB visual scale
  labelColor = Cesium.Color.WHITE,
  pathColor  = Cesium.Color.CYAN,
  trailTime  = 600,            // seconds of tail
  usePrimitive = true,        // true if you want silhouette support
  silhouette = { color: Cesium.Color.LIME, size: 3 }, // used only if usePrimitive
  meteorProfileId = id,
  energyJoules = 4.0e14,
  sizeMeters = 20,
  targetCity = 'chicago'
}) {
  // Clock window (reuse your viewer clock if already set)
  const start = viewer.clock.startTime ?? Cesium.JulianDate.now();
  const stop  = viewer.clock.stopTime  ?? Cesium.JulianDate.addMinutes(start, 90, new Cesium.JulianDate());
  viewer.clock.startTime = start.clone();
  viewer.clock.stopTime  = stop.clone();
  viewer.clock.currentTime = start.clone();
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.multiplier = viewer.clock.multiplier || 60;

  const position = makeOrbitPosition({ start, stop, altitude, incDeg, RAANDeg, phaseDeg });
  const orientation = new Cesium.VelocityOrientationProperty(position);

  const availability = new Cesium.TimeIntervalCollection([ new Cesium.TimeInterval({ start, stop }) ]);

  // Entity to hold label/path/description (even if we render model as primitive)
  const e = viewer.entities.add({
    id, availability, position, orientation,
    name,
    label: {
      text: name,
      font: "16px sans-serif",
      fillColor: labelColor,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
      pixelOffset: new Cesium.Cartesian2(0, -20),
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.2, 1e7, 0.6),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    path: new Cesium.PathGraphics({
      width: 3,
      material: pathColor.withAlpha(0.9),
      leadTime: 0,
      trailTime
    }),

    description: new Cesium.CallbackProperty((time) => {
      const p = position.getValue(time);
      if (!p) return name;
      const c = Cesium.Cartographic.fromCartesian(p);
      return `<h3>${name}</h3>
              Lat/Lon: ${Cesium.Math.toDegrees(c.latitude).toFixed(2)}°, ${Cesium.Math.toDegrees(c.longitude).toFixed(2)}°<br>
              Alt: ${(c.height/1000).toFixed(0)} km<br>
              Energy: ${(energyJoules / 1e15).toFixed(2)} PJ<br>
              Diameter: ${sizeMeters.toFixed(0)} m`;
    }, false)
  });

  e.mpactData = {
    id,
    name,
    meteorProfileId,
    energyJoules,
    sizeMeters,
    targetCity,
  };

  // Visual model: either Entity model or Primitive (for silhouette)
  if (!usePrimitive) {
    e.model = new Cesium.ModelGraphics({
      uri: glb,
      scale: modelScale,
      minimumPixelSize: 64,
      maximumScale: 200_000,
      color: Cesium.Color.ORANGE,                      // make it bright
      colorBlendMode: Cesium.ColorBlendMode.REPLACE
    });
    return { entity: e };
  } else {
    (async () => {
      const m = await Cesium.Model.fromGltfAsync({ url: glb, scale: modelScale });
      viewer.scene.primitives.add(m);

      // Optional silhouette
      m.silhouetteColor = silhouette.color;
      m.silhouetteSize  = silhouette.size;

      // Keep primitive glued to the entity’s motion/orientation
      viewer.scene.preRender.addEventListener((scene, time) => {
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
    })();
    return { entity: e /*, primitive will attach asynchronously */ };
  }
}
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
    energyJoules: 1.2e15,
    sizeMeters: 1012,
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
    energyJoules: 6.0e14,
    sizeMeters: 350,
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
    energyJoules: 2.5e15,
    sizeMeters: 58,
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
    energyJoules: 8.0e14,
    sizeMeters: 120,
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
    energyJoules: 8.0e14,
    sizeMeters: 81,
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
    energyJoules: 8.0e14,
    sizeMeters: 38,
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
    energyJoules: 8.0e14,
    sizeMeters: 5,
  },
];

const asteroids = specs.map(s => addAsteroid(s));



/*
// --- Orbit parameters (edit these) ---
const mu = 3.986004418e14;       // Earth GM [m^3/s^2]
const R_earth = 6371000.0;       // mean radius [m]
const altitude = 25000000.0;       // 500 km
const r = R_earth + altitude;    // orbital radius [m]
const inc = Cesium.Math.toRadians(45); // inclination i
const RAAN = Cesium.Math.toRadians(-90); // ascending node Ω (rotates ground track)
const phase0 = 0.0;              // starting phase (argument of latitude)

// Derived angular rate for circular orbit
const omega = 10*Math.sqrt(mu / (r*r*r)); // [rad/s]

// --- Helper: rotate a vector by Z(Ω) then X(i) to set inclination/RAAN ---
function rotateToECI(posPQW) {
  // R3(Ω)
  const cosO = Math.cos(RAAN), sinO = Math.sin(RAAN);
  let x1 =  cosO*posPQW.x - sinO*posPQW.y;
  let y1 =  sinO*posPQW.x + cosO*posPQW.y;
  let z1 =  posPQW.z;

  // R1(i)
  const cosi = Math.cos(inc), sini = Math.sin(inc);
  const x2 = x1;
  const y2 = cosi*y1 - sini*z1;
  const z2 = sini*y1 + cosi*z1;

  return new Cesium.Cartesian3(x2, y2, z2);
}

// --- build a true PositionProperty with samples ---
const position = new Cesium.SampledPositionProperty();
position.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
position.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

const stepSeconds = 30; // sample spacing; smaller = smoother path/orientation
for (let t = 0; ; t += stepSeconds) {
  const time = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
  if (Cesium.JulianDate.greaterThan(time, stop)) break;
  const theta = phase0 + omega * t;
  const pOrb = new Cesium.Cartesian3(r*Math.cos(theta), r*Math.sin(theta), 0.0);
  position.addSample(time, rotateToECI(pOrb)); // ECEF-ish position
}

// --- give the entity availability matching the samples (helps the path) ---
const availability = new Cesium.TimeIntervalCollection([
  new Cesium.TimeInterval({ start, stop })
]);
*/
// find the toolbar DOM node
const toolbar = viewer.container.querySelector('.cesium-viewer-toolbar');

const btn = document.createElement('button');
btn.className = 'cesium-button cesium-toolbar-button';
btn.title = 'Start Impact Simulation';
btn.innerText = 'Start';
btn.disabled = true;
toolbar.appendChild(btn);

let currentSelection = null;
function setSelection(entity) {
  const data = entity?.mpactData || null;
  currentSelection = data;
  btn.disabled = !data;
  updateSelectionDisplay(data);
  // viewer.trackedEntity = data ? entity : undefined;
}

viewer.selectedEntityChanged.addEventListener(setSelection);
setSelection(viewer.selectedEntity || null);

btn.addEventListener('click', () => {
  if (!currentSelection) {
    window.alert('Select an asteroid first.');
    return;
  }
  const payload = {
    meteorProfileId: currentSelection.meteorProfileId,
    name: currentSelection.name,
    energyJoules: currentSelection.energyJoules,
    sizeMeters: currentSelection.sizeMeters,
    targetCity: currentSelection.targetCity,
    timestamp: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Unable to persist asteroid selection:', err);
  }
  window.location.href = '/meteor.html';
});

// const asteroid = viewer.entities.add({
//   id: 'asteroid',
//   availability,
//   position,
//   orientation: new Cesium.VelocityOrientationProperty(position),
//   label: {
//     text: "Asteroid",
//     font: "16px sans-serif",
//     showBackground: true,
//     backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
//     fillColor: Cesium.Color.WHITE,
//     outlineColor: Cesium.Color.BLACK,
//     outlineWidth: 2,
//     style: Cesium.LabelStyle.FILL_AND_OUTLINE,

//     // move label slightly above the model in screen space
//     pixelOffset: new Cesium.Cartesian2(0, -20),

//     // keep readable at various distances
//     scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.2, 1.0e7, 0.6),

//     horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
//     verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
//     disableDepthTestDistance: Number.POSITIVE_INFINITY, // keep label visi
//   },
//   description: `
//     <h3>Asteroid</h3>
//     <p>Altitude: 500 km<br/>Scale: 500</p>
//     `,
//   path: new Cesium.PathGraphics({
//     width: 3,
//     material: Cesium.Color.CYAN.withAlpha(0.9),
//     leadTime: 0,         // only show the trail behind
//     trailTime: 60       // seconds of trail to keep
//   })
// });

// Cesium.Model.fromGltfAsync({ url: "/assets/asteroid.glb", scale: 500000 })
//   .then(model => {
//     viewer.scene.primitives.add(model);

//     model.silhouetteColor = Cesium.Color.LIME;
//     model.silhouetteSize  = 2.0;
//     model.shadows = Cesium.ShadowMode.DISABLED;

//     model.color = Cesium.Color.WHITE.withAlpha(1.0);
//     model.colorBlendMode = Cesium.ColorBlendMode.MIX;

//     viewer.scene.preRender.addEventListener((scene, time) => {
//       const pos = asteroid.position.getValue(time);
//       if (!pos) return;
//       const q = asteroid.orientation?.getValue(time);
//       if (q) {
//         const R = Cesium.Matrix3.fromQuaternion(q);
//         model.modelMatrix = Cesium.Matrix4.fromRotationTranslation(R, pos);
//       } else {
//         model.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
//       }
//     });


//     const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
//     handler.setInputAction((movement) => {
//       const picked = viewer.scene.pick(movement.position);
//       if (!Cesium.defined(picked)) return;

//       // For primitives, picked.primitive is the Model. (picked.id may be undefined)
//       if (picked.primitive !== model) return;

//       // --- Do whatever you want on click ---
//       // Toggle silhouette thickness
//       viewer.selectedEntity = asteroid; // shows InfoBox
      
//     }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
//   })
//   .catch(err => console.error("Model load failed:", err));

//viewer.camera.flyHome();

const camera = viewer.camera;
const current = Cesium.Cartographic.fromCartesian(camera.positionWC);

 viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromRadians(
    current.longitude,
    current.latitude,
    current.height * 8.0   // double the altitude → zoom out
  ),
  duration: 1.5

});

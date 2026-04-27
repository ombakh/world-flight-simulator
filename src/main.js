import * as THREE from 'three';
import replaceElement from 'lucide/dist/esm/replaceElement.js';
import Camera from 'lucide/dist/esm/icons/camera.js';
import ChevronsUp from 'lucide/dist/esm/icons/chevrons-up.js';
import CloudSun from 'lucide/dist/esm/icons/cloud-sun.js';
import MapIcon from 'lucide/dist/esm/icons/map.js';
import Pause from 'lucide/dist/esm/icons/pause.js';
import Play from 'lucide/dist/esm/icons/play.js';
import Power from 'lucide/dist/esm/icons/power.js';
import SlidersHorizontal from 'lucide/dist/esm/icons/sliders-horizontal.js';
import './styles.css';

const icons = { Camera, ChevronsUp, CloudSun, Map: MapIcon, Pause, Play, Power, SlidersHorizontal };
const iconAttrs = {
  'stroke-width': 1.8,
  width: 18,
  height: 18,
};

function createSimulatorIcons() {
  document.querySelectorAll('[data-lucide]').forEach((element) => {
    replaceElement(element, { nameAttr: 'data-lucide', icons, attrs: iconAttrs });
  });
}

createSimulatorIcons();

const FT_PER_METER = 3.28084;
const MS_TO_KT = 1.94384;
const EARTH_RADIUS = 6378137;
const TILE_SIZE = 256;
const WORLD_ZOOM = 13;
const TILE_RADIUS = 2;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const wrap360 = (deg) => ((deg % 360) + 360) % 360;
const shortestAngle = (from, to) => {
  let diff = wrap360(to - from);
  if (diff > 180) diff -= 360;
  return diff;
};

const aircraftProfiles = {
  c172: {
    name: 'Cessna 172S Skyhawk',
    category: 'Piston',
    color: 0xf7f3e9,
    accent: 0x1c7ed6,
    mass: 1120,
    wingArea: 16.2,
    drag: 0.031,
    maxThrust: 3550,
    propAuthority: 1,
    maxSpeed: 126,
    stallSpeed: 48,
    rotation: 55,
    flapLimit: 110,
    gear: 'fixed',
    fuelBurn: 0.028,
    climbPower: 720,
    response: 1,
  },
  sr22: {
    name: 'Cirrus SR22T',
    category: 'Turbo piston',
    color: 0xf5f7fb,
    accent: 0xc92a2a,
    mass: 1630,
    wingArea: 13.5,
    drag: 0.027,
    maxThrust: 5200,
    propAuthority: 1.08,
    maxSpeed: 183,
    stallSpeed: 60,
    rotation: 75,
    flapLimit: 119,
    gear: 'fixed',
    fuelBurn: 0.044,
    climbPower: 1120,
    response: 1.15,
  },
  tbm: {
    name: 'Daher TBM 930',
    category: 'Turboprop',
    color: 0xe9ecef,
    accent: 0x2f9e44,
    mass: 3354,
    wingArea: 18,
    drag: 0.023,
    maxThrust: 13800,
    propAuthority: 1.22,
    maxSpeed: 330,
    stallSpeed: 65,
    rotation: 85,
    flapLimit: 178,
    gear: 'retract',
    fuelBurn: 0.092,
    climbPower: 2050,
    response: 0.92,
  },
  citation: {
    name: 'Citation CJ4',
    category: 'Light jet',
    color: 0xf8f9fa,
    accent: 0x495057,
    mass: 7760,
    wingArea: 30.7,
    drag: 0.020,
    maxThrust: 48000,
    propAuthority: 0,
    maxSpeed: 451,
    stallSpeed: 92,
    rotation: 112,
    flapLimit: 200,
    gear: 'retract',
    fuelBurn: 0.22,
    climbPower: 3400,
    response: 0.72,
  },
};

const locations = {
  jfk: { label: 'KJFK', lat: 40.6413, lon: -73.7781, heading: 44, runway: '04L' },
  sfo: { label: 'KSFO', lat: 37.6213, lon: -122.379, heading: 284, runway: '28R' },
  london: { label: 'EGLC', lat: 51.5053, lon: 0.0553, heading: 270, runway: '27' },
  tokyo: { label: 'RJTT', lat: 35.5494, lon: 139.7798, heading: 337, runway: '34R' },
  sydney: { label: 'YSSY', lat: -33.9399, lon: 151.1753, heading: 160, runway: '16R' },
};

const weatherPresets = [
  { name: 'Clear', haze: 0.0015, wind: 4, gust: 0.4, crosswind: 0.2, cloud: 0.12, light: 1 },
  { name: 'Broken', haze: 0.018, wind: 13, gust: 1.2, crosswind: 0.45, cloud: 0.45, light: 0.86 },
  { name: 'IFR', haze: 0.044, wind: 22, gust: 2.1, crosswind: 0.8, cloud: 0.75, light: 0.7 },
];

const mapLayers = [
  {
    id: 'osm',
    label: 'OSM',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  {
    id: 'topo',
    label: 'Topo',
    url: (z, x, y) => `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`,
  },
  {
    id: 'voyager',
    label: 'Voyager',
    url: (z, x, y) => `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
  },
];

const els = {
  canvas: document.querySelector('#world'),
  navMap: document.querySelector('#navMap'),
  positionReadout: document.querySelector('#positionReadout'),
  pauseButton: document.querySelector('#pauseButton'),
  cameraButton: document.querySelector('#cameraButton'),
  weatherButton: document.querySelector('#weatherButton'),
  mapButton: document.querySelector('#mapButton'),
  panelButton: document.querySelector('#panelButton'),
  simUi: document.querySelector('.sim-ui'),
  hudIas: document.querySelector('#hudIas'),
  hudAlt: document.querySelector('#hudAlt'),
  hudHeading: document.querySelector('#hudHeading'),
  hudAircraft: document.querySelector('#hudAircraft'),
  hudThrottle: document.querySelector('#hudThrottle'),
  hudStatus: document.querySelector('#hudStatus'),
  aircraftName: document.querySelector('#aircraftName'),
  annunciator: document.querySelector('#annunciator'),
  ias: document.querySelector('#iasReadout'),
  alt: document.querySelector('#altReadout'),
  heading: document.querySelector('#headingReadout'),
  vs: document.querySelector('#vsReadout'),
  fpm: document.querySelector('#fpmReadout'),
  attitudeBall: document.querySelector('#attitudeBall'),
  pitch: document.querySelector('#pitchReadout'),
  mapLayer: document.querySelector('#mapLayerReadout'),
  rpmMeter: document.querySelector('#rpmMeter'),
  fuelMeter: document.querySelector('#fuelMeter'),
  egtMeter: document.querySelector('#egtMeter'),
  rpm: document.querySelector('#rpmReadout'),
  fuel: document.querySelector('#fuelReadout'),
  egt: document.querySelector('#egtReadout'),
  oil: document.querySelector('#oilReadout'),
  bus: document.querySelector('#busReadout'),
  gear: document.querySelector('#gearReadout'),
  aircraftSelect: document.querySelector('#aircraftSelect'),
  locationSelect: document.querySelector('#locationSelect'),
  throttle: document.querySelector('#throttleSlider'),
  prop: document.querySelector('#propSlider'),
  mixture: document.querySelector('#mixtureSlider'),
  propLabel: document.querySelector('#propLabel'),
  mixtureLabel: document.querySelector('#mixtureLabel'),
  battery: document.querySelector('#batterySwitch'),
  alternator: document.querySelector('#alternatorSwitch'),
  avionics: document.querySelector('#avionicsSwitch'),
  fuelPump: document.querySelector('#fuelPumpSwitch'),
  pitot: document.querySelector('#pitotSwitch'),
  antiIce: document.querySelector('#antiIceSwitch'),
  starter: document.querySelector('#starterButton'),
  gearButton: document.querySelector('#gearButton'),
  fuelTank: document.querySelector('#fuelTankSelect'),
  apMaster: document.querySelector('#apMaster'),
  hdgMode: document.querySelector('#hdgMode'),
  altMode: document.querySelector('#altMode'),
  vsMode: document.querySelector('#vsMode'),
  navMode: document.querySelector('#navMode'),
  fdMode: document.querySelector('#fdMode'),
  headingBug: document.querySelector('#headingBug'),
  altitudeBug: document.querySelector('#altitudeBug'),
  vsBug: document.querySelector('#vsBug'),
  headingBugReadout: document.querySelector('#headingBugReadout'),
  altitudeBugReadout: document.querySelector('#altitudeBugReadout'),
  vsBugReadout: document.querySelector('#vsBugReadout'),
  tabs: document.querySelectorAll('.tab'),
  pages: document.querySelectorAll('.panel-page'),
  flaps: document.querySelectorAll('[data-flaps]'),
  touchPad: document.querySelector('#touchPad'),
};

const renderer = new THREE.WebGLRenderer({
  canvas: els.canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec8ef);
scene.fog = new THREE.FogExp2(0x9fb9c8, 0.0015);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 36000);
camera.position.set(0, 18, 42);

const sun = new THREE.DirectionalLight(0xffffff, 2.8);
sun.position.set(500, 900, 350);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 50;
sun.shadow.camera.far = 2500;
sun.shadow.camera.left = -900;
sun.shadow.camera.right = 900;
sun.shadow.camera.top = 900;
sun.shadow.camera.bottom = -900;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x49664d, 1.6));

const terrainGroup = new THREE.Group();
const runwayGroup = new THREE.Group();
const cityGroup = new THREE.Group();
const cloudGroup = new THREE.Group();
const aircraftGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
scene.add(terrainGroup, runwayGroup, cityGroup, cloudGroup, ghostGroup, aircraftGroup);

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');
const tileMaterials = new Map();
let tileCenterKey = '';

const navCtx = els.navMap.getContext('2d');
const keyState = new Set();
const input = {
  pitch: 0,
  roll: 0,
  yaw: 0,
  braking: false,
};

const sim = {
  paused: false,
  elapsed: 0,
  cameraMode: 0,
  weatherIndex: 0,
  mapLayerIndex: 0,
  aircraftId: 'c172',
  profile: aircraftProfiles.c172,
  locationId: 'jfk',
  location: { ...locations.jfk },
  lat: locations.jfk.lat,
  lon: locations.jfk.lon,
  localEast: 0,
  localNorth: 0,
  altitude: 13.3,
  terrainElevation: 12,
  groundSpeed: 0,
  verticalSpeed: 0,
  trueAirspeed: 0,
  heading: locations.jfk.heading,
  pitch: 0.03,
  roll: 0,
  yawRate: 0,
  throttle: 0.68,
  prop: 1,
  mixture: 1,
  flaps: 0,
  gearDown: true,
  fuel: 1,
  leftFuel: 0.5,
  rightFuel: 0.5,
  battery: true,
  alternator: true,
  avionics: true,
  fuelPump: true,
  pitotHeat: false,
  antiIce: false,
  starter: false,
  engineRunning: true,
  engineSpool: 0.72,
  oilTemp: 84,
  egt: 68,
  busVoltage: 28.1,
  ap: {
    master: false,
    hdg: false,
    alt: false,
    vs: false,
    nav: false,
    fd: false,
    headingBug: locations.jfk.heading,
    altitudeBug: 3500 / FT_PER_METER,
    vsBug: 500 / 196.85,
  },
};

const reusable = {
  cameraTarget: new THREE.Vector3(),
  cameraPosition: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
};

function mercatorTile(lat, lon, zoom) {
  const latRad = lat * DEG;
  const n = 2 ** zoom;
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

function tileBounds(x, y, z) {
  const n = 2 ** z;
  const lonWest = (x / n) * 360 - 180;
  const lonEast = ((x + 1) / n) * 360 - 180;
  const latNorth = RAD * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const latSouth = RAD * Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  return { lonWest, lonEast, latNorth, latSouth };
}

function latLonToLocal(lat, lon, refLat = sim.lat, refLon = sim.lon) {
  const north = ((lat - refLat) * Math.PI * EARTH_RADIUS) / 180;
  const east = ((lon - refLon) * Math.PI * EARTH_RADIUS * Math.cos(refLat * DEG)) / 180;
  return { east, north };
}

function localOffsetToLatLon(east, north) {
  const lat = sim.lat + (north / EARTH_RADIUS) * RAD;
  const lon = sim.lon + (east / (EARTH_RADIUS * Math.cos(sim.lat * DEG))) * RAD;
  return { lat, lon };
}

function metersPerTile(lat, zoom) {
  return (156543.03392 * Math.cos(lat * DEG) * TILE_SIZE) / 2 ** zoom;
}

function createFallbackTileTexture(x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const hue = (x * 19 + y * 11 + z * 29) % 360;
  ctx.fillStyle = `hsl(${hue}, 28%, 44%)`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(59, 95, 67, 0.34)';
  ctx.fillRect(0, 0, 114, 256);
  ctx.fillRect(152, 0, 104, 256);
  ctx.strokeStyle = 'rgba(245,255,247,0.32)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.68)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-20, 74 + ((x + y) % 5) * 9);
  ctx.bezierCurveTo(58, 42, 126, 112, 276, 88);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(242, 211, 128, 0.72)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(44 + (x % 6) * 8, -20);
  ctx.lineTo(102 + (y % 7) * 11, 276);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.font = 'bold 22px system-ui';
  ctx.fillText(`${z}/${x}`, 18, 42);
  ctx.fillText(`${y}`, 18, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function getTileMaterial(x, y, z) {
  const layer = mapLayers[sim.mapLayerIndex];
  const key = `${layer.id}:${z}:${x}:${y}`;
  if (tileMaterials.has(key)) return tileMaterials.get(key);

  const material = new THREE.MeshStandardMaterial({
    color: 0xb2c497,
    roughness: 0.96,
    metalness: 0,
    map: createFallbackTileTexture(x, y, z),
  });
  tileMaterials.set(key, material);

  textureLoader.load(
    layer.url(z, x, y),
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    },
    undefined,
    () => {
      material.color.set(0x90a779);
      material.needsUpdate = true;
    },
  );

  return material;
}

function updateTerrain(force = false) {
  const center = mercatorTile(sim.lat, sim.lon, WORLD_ZOOM);
  const key = `${sim.mapLayerIndex}:${center.x}:${center.y}`;
  if (!force && key === tileCenterKey) return;
  tileCenterKey = key;
  terrainGroup.clear();

  for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx += 1) {
    for (let dy = -TILE_RADIUS; dy <= TILE_RADIUS; dy += 1) {
      const tx = center.x + dx;
      const ty = center.y + dy;
      const bounds = tileBounds(tx, ty, WORLD_ZOOM);
      const centerLat = (bounds.latNorth + bounds.latSouth) / 2;
      const centerLon = (bounds.lonWest + bounds.lonEast) / 2;
      const { east, north } = latLonToLocal(centerLat, centerLon);
      const width = metersPerTile(centerLat, WORLD_ZOOM);
      const height = Math.abs(
        ((bounds.latNorth - bounds.latSouth) * Math.PI * EARTH_RADIUS) / 180,
      );
      const geometry = new THREE.PlaneGeometry(width, height, 18, 18);
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        const px = position.getX(i);
        const py = position.getY(i);
        const wave =
          Math.sin((px + tx * 41) * 0.006) * 0.55 +
          Math.cos((py + ty * 31) * 0.005) * 0.35;
        position.setZ(i, wave - 0.35);
      }
      geometry.computeVertexNormals();
      const tile = new THREE.Mesh(geometry, getTileMaterial(tx, ty, WORLD_ZOOM));
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(east, sim.terrainElevation - 0.8, -north);
      tile.receiveShadow = true;
      terrainGroup.add(tile);
    }
  }

  rebuildRunwaysAndCity();
}

function makeRunwayTexture(label, runway) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2d2f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#34383a';
  for (let y = 0; y < canvas.height; y += 96) {
    ctx.fillRect(0, y, canvas.width, 42);
  }
  ctx.strokeStyle = '#f8f9fa';
  ctx.lineWidth = 12;
  ctx.strokeRect(42, 42, canvas.width - 84, canvas.height - 84);
  ctx.setLineDash([54, 54]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 120);
  ctx.lineTo(canvas.width / 2, canvas.height - 120);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f8f9fa';
  ctx.font = 'bold 72px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(runway, canvas.width / 2, 140);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height - 120);
  ctx.rotate(Math.PI);
  ctx.fillText(runway, 0, 0);
  ctx.restore();
  ctx.font = 'bold 30px system-ui';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 - 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function rebuildRunwaysAndCity() {
  runwayGroup.clear();
  cityGroup.clear();

  const runwayGeo = new THREE.PlaneGeometry(64, 820);
  const runwayMat = new THREE.MeshStandardMaterial({
    map: makeRunwayTexture(sim.location.label, sim.location.runway),
    roughness: 0.8,
  });
  const runway = new THREE.Mesh(runwayGeo, runwayMat);
  runway.rotation.x = -Math.PI / 2;
  runway.rotation.z = -sim.location.heading * DEG;
  runway.position.set(0, sim.terrainElevation + 0.06, 0);
  runway.receiveShadow = true;
  runwayGroup.add(runway);

  const taxiMat = new THREE.MeshStandardMaterial({ color: 0x3d4142, roughness: 0.85 });
  for (let i = -1; i <= 1; i += 2) {
    const taxi = new THREE.Mesh(new THREE.PlaneGeometry(18, 480), taxiMat);
    taxi.rotation.x = -Math.PI / 2;
    taxi.rotation.z = -sim.location.heading * DEG;
    const offset = new THREE.Vector3(i * 58, 0, -120).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -sim.location.heading * DEG,
    );
    taxi.position.set(offset.x, sim.terrainElevation + 0.08, offset.z);
    runwayGroup.add(taxi);
  }

  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 95; i += 1) {
    const rng = seededRandom(i + Math.floor(Math.abs(sim.lat * 1000)));
    const angle = rng() * Math.PI * 2;
    const radius = 680 + rng() * 4200;
    const width = 24 + rng() * 74;
    const depth = 24 + rng() * 92;
    const height = 18 + rng() * (sim.locationId === 'london' ? 80 : 170);
    const building = new THREE.Mesh(
      buildingGeo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.58, 0.09, 0.28 + rng() * 0.34),
        roughness: 0.72,
      }),
    );
    building.scale.set(width, height, depth);
    building.position.set(
      Math.cos(angle) * radius,
      sim.terrainElevation + height / 2,
      Math.sin(angle) * radius,
    );
    building.rotation.y = rng() * Math.PI;
    building.castShadow = true;
    building.receiveShadow = true;
    cityGroup.add(building);
  }
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createClouds() {
  cloudGroup.clear();
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    transparent: true,
    opacity: 0.62,
  });
  for (let i = 0; i < 34; i += 1) {
    const cloud = new THREE.Group();
    const lobes = 3 + (i % 4);
    for (let l = 0; l < lobes; l += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMaterial);
      puff.scale.set(95 + l * 28, 18 + (l % 2) * 9, 44 + l * 12);
      puff.position.set(l * 70 - lobes * 30, (l % 2) * 10, Math.sin(l) * 28);
      cloud.add(puff);
    }
    const angle = (i / 34) * Math.PI * 2;
    cloud.position.set(
      Math.cos(angle) * (2500 + (i % 5) * 900),
      820 + (i % 7) * 210,
      Math.sin(angle) * (2600 + (i % 4) * 1100),
    );
    cloud.rotation.y = angle;
    cloudGroup.add(cloud);
  }
}

function createAircraftModel(profile) {
  aircraftGroup.clear();
  const paint = new THREE.MeshStandardMaterial({
    color: profile.color,
    roughness: 0.42,
    metalness: profile.category === 'Light jet' ? 0.28 : 0.12,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: profile.accent,
    roughness: 0.38,
    metalness: 0.16,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x182833,
    transmission: 0.12,
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.65,
  });

  const fuselageLength = profile.category === 'Light jet' ? 15 : profile.category === 'Turboprop' ? 11 : 8.2;
  const wingSpan = profile.category === 'Light jet' ? 16 : profile.category === 'Turboprop' ? 12.8 : 10.6;
  const bodyRadius = profile.category === 'Light jet' ? 1.05 : 0.72;

  const fuselage = new THREE.Mesh(
    new THREE.CapsuleGeometry(bodyRadius, fuselageLength, 12, 22),
    paint,
  );
  fuselage.rotation.z = Math.PI / 2;
  fuselage.castShadow = true;
  aircraftGroup.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(bodyRadius * 0.95, 2.2, 28), paint);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = fuselageLength / 2 + 1.1;
  nose.castShadow = true;
  aircraftGroup.add(nose);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, wingSpan), paint);
  wing.position.set(-0.35, -0.05, 0);
  wing.castShadow = true;
  aircraftGroup.add(wing);

  const wingAccent = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, wingSpan * 0.95), accent);
  wingAccent.position.set(0.22, 0.08, 0);
  wingAccent.castShadow = true;
  aircraftGroup.add(wingAccent);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.13, wingSpan * 0.34), paint);
  tail.position.set(-fuselageLength / 2 + 0.8, 0.28, 0);
  tail.castShadow = true;
  aircraftGroup.add(tail);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.18), accent);
  rudder.position.set(-fuselageLength / 2 + 0.55, 1.1, 0);
  rudder.rotation.z = -0.18;
  rudder.castShadow = true;
  aircraftGroup.add(rudder);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(bodyRadius * 0.86, 18, 9), glass);
  cockpit.scale.set(1.35, 0.55, 0.72);
  cockpit.position.set(fuselageLength * 0.22, 0.52, 0);
  cockpit.castShadow = true;
  aircraftGroup.add(cockpit);

  if (profile.category === 'Light jet') {
    [-1, 1].forEach((side) => {
      const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.6, 8, 16), accent);
      nacelle.rotation.z = Math.PI / 2;
      nacelle.position.set(-fuselageLength * 0.27, 0.15, side * 1.3);
      nacelle.castShadow = true;
      aircraftGroup.add(nacelle);
    });
  } else {
    const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 18), accent);
    propHub.rotation.z = Math.PI / 2;
    propHub.position.x = fuselageLength / 2 + 2.1;
    aircraftGroup.add(propHub);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.1, 0.12), accent);
    prop.name = 'propeller';
    prop.position.copy(propHub.position);
    aircraftGroup.add(prop);
  }

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.65 });
  [-1, 1].forEach((side) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 16), wheelMat);
    wheel.name = 'mainGear';
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(-0.8, -0.82, side * 1.35);
    aircraftGroup.add(wheel);
  });
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 16), wheelMat);
  noseWheel.name = 'noseGear';
  noseWheel.rotation.x = Math.PI / 2;
  noseWheel.position.set(fuselageLength * 0.32, -0.85, 0);
  aircraftGroup.add(noseWheel);

  aircraftGroup.scale.setScalar(profile.category === 'Light jet' ? 2.45 : profile.category === 'Turboprop' ? 2.05 : 1.78);
  aircraftGroup.position.set(0, sim.altitude, 0);
}

function setReadyToFly({ airborne = false } = {}) {
  const cruiseKt = clamp(
    Math.max(sim.profile.rotation + 28, sim.profile.maxSpeed * 0.58),
    sim.profile.rotation + 18,
    sim.profile.maxSpeed * 0.82,
  );

  sim.throttle = 0.68;
  sim.prop = 1;
  sim.mixture = 1;
  sim.flaps = airborne ? 0 : 10;
  sim.gearDown = sim.profile.gear === 'fixed' ? true : !airborne;
  sim.battery = true;
  sim.alternator = true;
  sim.avionics = true;
  sim.fuelPump = true;
  sim.engineRunning = true;
  sim.engineSpool = 0.72;
  sim.oilTemp = 84;
  sim.egt = 68;
  sim.busVoltage = 28.1;

  if (airborne) {
    sim.altitude = sim.terrainElevation + 220;
    sim.groundSpeed = cruiseKt / MS_TO_KT;
    sim.trueAirspeed = sim.groundSpeed;
    sim.verticalSpeed = 0;
    sim.pitch = 0.025;
    sim.roll = 0;
  } else {
    sim.altitude = sim.terrainElevation + 1.35;
    sim.groundSpeed = 0;
    sim.trueAirspeed = 0;
    sim.verticalSpeed = 0;
    sim.pitch = 0.015;
    sim.roll = 0;
  }

  els.throttle.value = String(Math.round(sim.throttle * 100));
  els.prop.value = String(Math.round(sim.prop * 100));
  els.mixture.value = String(Math.round(sim.mixture * 100));
  els.battery.checked = sim.battery;
  els.alternator.checked = sim.alternator;
  els.avionics.checked = sim.avionics;
  els.fuelPump.checked = sim.fuelPump;
  els.flaps.forEach((item) => item.classList.toggle('active', Number(item.dataset.flaps) === sim.flaps));
}

function applyAircraftProfile(id) {
  sim.aircraftId = id;
  sim.profile = aircraftProfiles[id];
  sim.prop = sim.profile.category === 'Light jet' ? 1 : sim.prop;
  sim.mixture = sim.profile.category === 'Light jet' ? 1 : sim.mixture;
  sim.gearDown = sim.profile.gear === 'fixed' ? true : sim.altitude <= sim.terrainElevation + 50;
  sim.groundSpeed = Math.min(sim.groundSpeed, sim.profile.maxSpeed / MS_TO_KT);
  els.aircraftName.textContent = sim.profile.name;
  els.hudAircraft.textContent = sim.profile.name;
  els.propLabel.textContent = sim.profile.category === 'Light jet' ? 'N1 sync' : 'Prop';
  els.mixtureLabel.textContent = sim.profile.category === 'Turboprop' ? 'Condition' : sim.profile.category === 'Light jet' ? 'Fuel flow' : 'Mixture';
  createAircraftModel(sim.profile);
  setReadyToFly();
}

function resetToLocation(id) {
  sim.locationId = id;
  sim.location = { ...locations[id] };
  sim.lat = sim.location.lat;
  sim.lon = sim.location.lon;
  sim.heading = sim.location.heading;
  sim.localEast = 0;
  sim.localNorth = 0;
  sim.ap.headingBug = sim.heading;
  els.headingBug.value = String(Math.round(sim.heading));
  setReadyToFly();
  tileCenterKey = '';
  updateTerrain(true);
}

function updateWeather() {
  const weather = weatherPresets[sim.weatherIndex];
  scene.fog.density = weather.haze;
  sun.intensity = 2.8 * weather.light;
  cloudGroup.children.forEach((cloud, index) => {
    cloud.visible = index / cloudGroup.children.length < weather.cloud;
  });
  els.weatherButton.title = weather.name;
}

function updateSystems(dt) {
  const starterTorque = sim.starter && sim.battery && sim.fuel > 0.01 ? 0.42 : 0;
  const fuelAvailable =
    sim.fuel > 0.01 &&
    sim.mixture > 0.08 &&
    (sim.fuelPump || sim.profile.category === 'Light jet' || sim.profile.category === 'Turboprop');
  if (starterTorque && fuelAvailable) {
    sim.engineSpool = lerp(sim.engineSpool, 0.34 + sim.throttle * 0.2, dt * 1.8);
    if (sim.engineSpool > 0.22) sim.engineRunning = true;
  } else if (sim.engineRunning && fuelAvailable) {
    const target = 0.22 + sim.throttle * 0.78;
    sim.engineSpool = lerp(sim.engineSpool, target, dt * (sim.profile.category === 'Light jet' ? 0.7 : 1.35));
  } else {
    sim.engineRunning = false;
    sim.engineSpool = lerp(sim.engineSpool, 0, dt * 0.65);
  }

  sim.busVoltage = sim.battery ? (sim.alternator && sim.engineSpool > 0.38 ? 28.1 : 24.2) : 0;
  if (sim.battery && !sim.alternator && !sim.engineRunning) sim.busVoltage = Math.max(20.4, sim.busVoltage - sim.elapsed * 0.00012);
  sim.oilTemp = lerp(sim.oilTemp, sim.engineRunning ? 82 + sim.throttle * 18 : 18, dt * 0.035);
  sim.egt = lerp(sim.egt, sim.engineRunning ? 32 + sim.engineSpool * 68 : 0, dt * 1.8);

  if (sim.engineRunning) {
    const burn = sim.profile.fuelBurn * (0.22 + sim.throttle * 0.95) * dt * 0.004;
    if (els.fuelTank.value === 'left') sim.leftFuel = Math.max(0, sim.leftFuel - burn);
    else if (els.fuelTank.value === 'right') sim.rightFuel = Math.max(0, sim.rightFuel - burn);
    else {
      sim.leftFuel = Math.max(0, sim.leftFuel - burn * 0.5);
      sim.rightFuel = Math.max(0, sim.rightFuel - burn * 0.5);
    }
    sim.fuel = sim.leftFuel + sim.rightFuel;
  }
}

function updateInputs(dt) {
  const pitchAxis = (keyState.has('KeyS') || keyState.has('ArrowDown') ? 1 : 0) - (keyState.has('KeyW') || keyState.has('ArrowUp') ? 1 : 0);
  const rollAxis = (keyState.has('KeyD') || keyState.has('ArrowRight') ? 1 : 0) - (keyState.has('KeyA') || keyState.has('ArrowLeft') ? 1 : 0);
  const yawAxis = (keyState.has('KeyE') ? 1 : 0) - (keyState.has('KeyQ') ? 1 : 0);
  input.pitch = lerp(input.pitch, pitchAxis, dt * 4.2);
  input.roll = lerp(input.roll, rollAxis, dt * 4.8);
  input.yaw = lerp(input.yaw, yawAxis, dt * 3.4);
  input.braking = keyState.has('Space');

  if (keyState.has('Equal') || keyState.has('NumpadAdd')) {
    sim.throttle = clamp(sim.throttle + dt * 0.28, 0, 1);
    els.throttle.value = String(Math.round(sim.throttle * 100));
  }
  if (keyState.has('Minus') || keyState.has('NumpadSubtract')) {
    sim.throttle = clamp(sim.throttle - dt * 0.28, 0, 1);
    els.throttle.value = String(Math.round(sim.throttle * 100));
  }
}

function updateAutopilot(dt) {
  if (!sim.ap.master || !sim.avionics || sim.busVoltage < 20) return;

  if (sim.ap.nav) {
    const waypoint = localOffsetToLatLon(8000, 8000);
    const desired = Math.atan2(
      (waypoint.lon - sim.lon) * Math.cos(sim.lat * DEG),
      waypoint.lat - sim.lat,
    ) * RAD;
    sim.ap.headingBug = wrap360(desired);
    els.headingBug.value = String(Math.round(sim.ap.headingBug));
  }

  if (sim.ap.hdg || sim.ap.nav) {
    const error = shortestAngle(sim.heading, sim.ap.headingBug);
    input.roll = lerp(input.roll, clamp(error / 35, -0.75, 0.75), dt * 1.8);
  }

  if (sim.ap.alt) {
    const altError = sim.ap.altitudeBug - sim.altitude;
    const commandedVs = clamp(altError * 0.35, -7.5, 7.5);
    input.pitch = lerp(input.pitch, clamp(commandedVs / 8, -0.55, 0.65), dt * 1.4);
  } else if (sim.ap.vs) {
    const vsError = sim.ap.vsBug - sim.verticalSpeed;
    input.pitch = lerp(input.pitch, clamp(vsError / 6, -0.45, 0.6), dt * 1.6);
  }
}

function updateFlightModel(dt) {
  const profile = sim.profile;
  const weather = weatherPresets[sim.weatherIndex];
  const onGround = sim.altitude <= sim.terrainElevation + 1.45;
  const flapDrag = sim.flaps * 0.0032;
  const flapLift = sim.flaps * 0.0065;
  const gearDrag = sim.gearDown && profile.gear === 'retract' ? 0.05 : 0.015;
  const enginePower = sim.engineSpool * sim.throttle * sim.mixture * (profile.propAuthority ? 0.72 + sim.prop * 0.28 : 1);
  const density = clamp(1 - (sim.altitude * FT_PER_METER) / 65000, 0.3, 1);
  const thrust = profile.maxThrust * enginePower * density;
  const speedKt = sim.groundSpeed * MS_TO_KT;
  const speedRatio = clamp(speedKt / profile.maxSpeed, 0, 1.8);
  const drag = (profile.drag + flapDrag + gearDrag) * sim.groundSpeed * sim.groundSpeed * profile.mass * 0.016;
  const runwayFriction = onGround ? (input.braking ? 7.2 : 1.35) : 0;
  const acceleration = (thrust - drag) / profile.mass - runwayFriction;

  sim.groundSpeed = clamp(sim.groundSpeed + acceleration * dt, 0, (profile.maxSpeed * 1.16) / MS_TO_KT);
  sim.trueAirspeed = Math.max(0, sim.groundSpeed + weather.wind * 0.22 + Math.sin(sim.elapsed * 0.7) * weather.gust);

  updateAutopilot(dt);

  const controlAuthority = clamp(sim.trueAirspeed * MS_TO_KT / Math.max(profile.stallSpeed, 1), 0.15, 1.45) * profile.response;
  const maxRoll = onGround ? 0.04 : 1.04;
  const targetRoll = clamp(input.roll * maxRoll * controlAuthority, -1.15, 1.15);
  const targetPitch = clamp(
    input.pitch * 0.32 * controlAuthority + (enginePower - 0.45) * 0.08 - speedRatio * 0.05,
    -0.38,
    0.48,
  );
  sim.roll = lerp(sim.roll, targetRoll, dt * (onGround ? 2 : 1.9));
  sim.pitch = lerp(sim.pitch, targetPitch, dt * (onGround ? 1.4 : 1.65));

  const turnRate = onGround
    ? input.yaw * 26 * DEG * clamp(sim.groundSpeed / 22, 0, 1)
    : (Math.tan(sim.roll) * 9.81) / Math.max(sim.trueAirspeed, 22) + input.yaw * 4 * DEG;
  sim.heading = wrap360(sim.heading + turnRate * RAD * dt);

  const liftSpeed = clamp((speedKt - profile.stallSpeed + sim.flaps * 0.45) / Math.max(profile.rotation, 1), -0.6, 1.8);
  const lift = (liftSpeed + flapLift) * Math.cos(sim.roll) + sim.pitch * 1.55;
  const sink = speedKt < profile.stallSpeed && !onGround ? -4.5 * (1 - speedKt / profile.stallSpeed) : 0;
  const targetVs = onGround && speedKt < profile.rotation
    ? 0
    : clamp((lift - 0.68) * profile.climbPower * 0.0018 + sink, -28, 24);

  sim.verticalSpeed = lerp(sim.verticalSpeed, targetVs, dt * 0.85);
  sim.altitude += sim.verticalSpeed * dt;
  if (sim.altitude < sim.terrainElevation + 1.28) {
    sim.altitude = sim.terrainElevation + 1.28;
    sim.verticalSpeed = Math.max(0, sim.verticalSpeed);
    sim.pitch = Math.max(-0.03, sim.pitch);
  }

  const windDrift = Math.sin((sim.heading + 90) * DEG) * weather.crosswind * weather.wind * 0.18;
  const distance = sim.groundSpeed * dt;
  const east = Math.sin(sim.heading * DEG) * distance + windDrift * dt;
  const north = Math.cos(sim.heading * DEG) * distance;
  const next = localOffsetToLatLon(east, north);
  sim.lat = clamp(next.lat, -84.8, 84.8);
  sim.lon = ((next.lon + 540) % 360) - 180;
  sim.localEast += east;
  sim.localNorth += north;
}

function updateAircraftVisuals(dt) {
  aircraftGroup.position.set(0, sim.altitude, 0);
  aircraftGroup.rotation.order = 'YXZ';
  aircraftGroup.rotation.y = -sim.heading * DEG + Math.PI / 2;
  aircraftGroup.rotation.x = sim.pitch;
  aircraftGroup.rotation.z = -sim.roll;

  const propeller = aircraftGroup.getObjectByName('propeller');
  if (propeller) propeller.rotation.x += dt * (16 + sim.engineSpool * 120);

  const gearNames = ['mainGear', 'noseGear'];
  aircraftGroup.traverse((obj) => {
    if (gearNames.includes(obj.name)) {
      obj.visible = sim.profile.gear === 'fixed' || sim.gearDown || sim.altitude < sim.terrainElevation + 18;
    }
  });

  terrainGroup.position.set(-sim.localEast, 0, sim.localNorth);
  runwayGroup.position.copy(terrainGroup.position);
  cityGroup.position.copy(terrainGroup.position);
  ghostGroup.position.copy(terrainGroup.position);

  cloudGroup.children.forEach((cloud, index) => {
    cloud.position.x += Math.sin(sim.elapsed * 0.03 + index) * dt * 2;
    cloud.position.z += weatherPresets[sim.weatherIndex].wind * dt * 0.08;
  });
}

function updateCamera(dt) {
  const heading = sim.heading * DEG;
  const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const up = new THREE.Vector3(0, 1, 0);
  const plane = reusable.cameraTarget.set(0, sim.altitude + 1.4, 0);
  const heightAgl = sim.altitude - sim.terrainElevation;
  const target = plane
    .clone()
    .addScaledVector(forward, heightAgl < 35 ? 42 : 38)
    .addScaledVector(up, heightAgl < 35 ? -1 : -20);
  let desired;
  if (sim.cameraMode === 0) {
    desired = reusable.cameraPosition
      .copy(plane)
      .addScaledVector(forward, heightAgl < 35 ? -56 : -28)
      .addScaledVector(side, 4.2)
      .addScaledVector(up, heightAgl < 35 ? 13 : 15 + clamp(sim.groundSpeed * 0.02, 0, 7));
  } else if (sim.cameraMode === 1) {
    desired = reusable.cameraPosition
      .copy(plane)
      .addScaledVector(forward, 7)
      .addScaledVector(up, 2.2);
  } else {
    desired = reusable.cameraPosition
      .copy(plane)
      .addScaledVector(side, 64)
      .addScaledVector(up, 24);
  }
  camera.position.lerp(desired, clamp(dt * 3.1, 0, 1));
  camera.lookAt(target);
}

function updateAnnunciator() {
  const messages = [];
  if (!sim.battery) messages.push('BAT OFF');
  if (sim.battery && !sim.alternator && sim.engineRunning) messages.push('ALT OFF');
  if (sim.busVoltage < 20 && sim.battery) messages.push('LOW VOLTS');
  if (!sim.avionics && sim.battery) messages.push('AVIONICS OFF');
  if (!sim.engineRunning && sim.throttle > 0.2) messages.push('ENGINE OFF');
  if (sim.trueAirspeed * MS_TO_KT < sim.profile.stallSpeed + 6 && sim.altitude > sim.terrainElevation + 6) messages.push('STALL');
  if (sim.gearDown && sim.profile.gear === 'retract' && sim.trueAirspeed * MS_TO_KT > 210) messages.push('GEAR SPD');
  if (sim.flaps > 0 && sim.trueAirspeed * MS_TO_KT > sim.profile.flapLimit) messages.push('FLAP SPD');
  if (sim.antiIce && !sim.alternator) messages.push('ICE LOAD');
  els.annunciator.textContent = messages[0] || (sim.ap.master ? 'AP READY' : 'NORMAL');
  els.annunciator.classList.toggle('warning', messages.length > 0);
}

function updateG1000() {
  const airspeed = Math.round(sim.trueAirspeed * MS_TO_KT);
  const altitudeFt = Math.round(sim.altitude * FT_PER_METER);
  const vsFpm = Math.round(sim.verticalSpeed * 196.85);
  const fpm = sim.fuel > 0 ? (sim.profile.fuelBurn * (0.22 + sim.throttle) * 60).toFixed(1) : '0.0';
  els.ias.textContent = String(airspeed);
  els.alt.textContent = String(altitudeFt);
  els.heading.textContent = String(Math.round(sim.heading)).padStart(3, '0');
  els.hudIas.textContent = String(airspeed);
  els.hudAlt.textContent = String(altitudeFt);
  els.hudHeading.textContent = String(Math.round(sim.heading)).padStart(3, '0');
  els.hudThrottle.textContent = `${Math.round(sim.throttle * 100)}%`;
  els.hudAircraft.textContent = sim.profile.name;
  els.hudStatus.textContent = sim.engineRunning
    ? `${sim.altitude - sim.terrainElevation < 35 ? 'RUNWAY' : weatherPresets[sim.weatherIndex].name.toUpperCase()} / ${mapLayers[sim.mapLayerIndex].label}`
    : 'ENGINE OFF';
  els.vs.textContent = String(vsFpm);
  els.fpm.textContent = fpm;
  els.pitch.textContent = `${Math.round(sim.pitch * RAD)} deg`;
  els.rpmMeter.value = Math.round(sim.engineSpool * 100);
  els.fuelMeter.value = Math.round(sim.fuel * 100);
  els.egtMeter.value = Math.round(sim.egt);
  els.rpm.textContent = `${Math.round(sim.engineSpool * 100)}%`;
  els.fuel.textContent = `${Math.round(sim.fuel * 100)}%`;
  els.egt.textContent = `${Math.round(sim.egt)}%`;
  els.oil.textContent = `${Math.round(sim.oilTemp)} C`;
  els.bus.textContent = `${sim.busVoltage.toFixed(1)} V`;
  els.gear.textContent = sim.gearDown ? 'DOWN' : 'UP';
  els.gearButton.classList.toggle('active', !sim.gearDown);
  els.mapLayer.textContent = mapLayers[sim.mapLayerIndex].label;
  els.positionReadout.textContent = `${locations[sim.locationId].label} ${sim.lat.toFixed(4)}, ${sim.lon.toFixed(4)}`;
  els.headingBugReadout.textContent = String(Math.round(sim.ap.headingBug)).padStart(3, '0');
  els.altitudeBugReadout.textContent = String(Math.round(sim.ap.altitudeBug * FT_PER_METER));
  els.vsBugReadout.textContent = `${sim.ap.vsBug >= 0 ? '+' : ''}${Math.round(sim.ap.vsBug * 196.85)}`;
  els.attitudeBall.style.setProperty('--roll', `${-sim.roll}rad`);
  els.attitudeBall.style.setProperty('--pitch', `${clamp(sim.pitch * -135, -42, 42)}px`);
  updateAnnunciator();
}

function drawNavMap() {
  const ctx = navCtx;
  const { width, height } = els.navMap;
  ctx.clearRect(0, 0, width, height);
  const grd = ctx.createLinearGradient(0, 0, 0, height);
  grd.addColorStop(0, '#0f2f40');
  grd.addColorStop(1, '#15231d');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2 + 8);
  ctx.rotate(-sim.heading * DEG);
  ctx.strokeStyle = 'rgba(128, 214, 255, 0.18)';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 42, -height);
    ctx.lineTo(i * 42, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-width, i * 42);
    ctx.lineTo(width, i * 42);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 86);
  ctx.lineTo(0, -112);
  ctx.stroke();
  ctx.strokeStyle = '#f7f7f7';
  ctx.lineWidth = 2;
  ctx.strokeRect(-12, -118, 24, 236);
  ctx.fillStyle = 'rgba(255, 193, 7, 0.9)';
  ctx.beginPath();
  ctx.arc(86, -62, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(width / 2, height / 2 + 8);
  ctx.fillStyle = '#4dabf7';
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(11, 14);
  ctx.lineTo(0, 7);
  ctx.lineTo(-11, 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(222, 246, 255, 0.92)';
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillText(`${sim.lat.toFixed(3)}, ${sim.lon.toFixed(3)}`, 16, 24);
  ctx.fillText(`${weatherPresets[sim.weatherIndex].name}`, 16, 44);
  ctx.textAlign = 'right';
  ctx.fillText(`${mapLayers[sim.mapLayerIndex].label} Z${WORLD_ZOOM}`, width - 16, 24);
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  const dt = clamp((now - (animate.last || now)) / 1000, 0, 0.05);
  animate.last = now;

  if (!sim.paused) {
    sim.elapsed += dt;
    updateInputs(dt);
    updateSystems(dt);
    updateFlightModel(dt);
    updateAircraftVisuals(dt);
    updateTerrain();
  }

  updateCamera(dt || 0.016);
  updateG1000();
  drawNavMap();
  renderer.render(scene, camera);
}

function bindUi() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener('keydown', (event) => {
    keyState.add(event.code);
    if (event.code === 'KeyP') sim.paused = !sim.paused;
    if (event.code === 'KeyG') toggleGear();
  });
  window.addEventListener('keyup', (event) => keyState.delete(event.code));

  els.pauseButton.addEventListener('click', () => {
    sim.paused = !sim.paused;
    els.pauseButton.innerHTML = sim.paused ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
    createSimulatorIcons();
  });
  els.cameraButton.addEventListener('click', () => {
    sim.cameraMode = (sim.cameraMode + 1) % 3;
  });
  els.panelButton.addEventListener('click', () => {
    const isOpen = els.simUi.classList.toggle('is-open');
    els.panelButton.classList.toggle('active', isOpen);
    document.body.classList.toggle('panels-open', isOpen);
  });
  els.weatherButton.addEventListener('click', () => {
    sim.weatherIndex = (sim.weatherIndex + 1) % weatherPresets.length;
    updateWeather();
  });
  els.mapButton.addEventListener('click', () => {
    sim.mapLayerIndex = (sim.mapLayerIndex + 1) % mapLayers.length;
    tileCenterKey = '';
    updateTerrain(true);
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      els.tabs.forEach((item) => item.classList.toggle('active', item === tab));
      els.pages.forEach((page) => page.classList.toggle('active', page.id === `panel-${tab.dataset.panel}`));
    });
  });

  els.aircraftSelect.addEventListener('change', (event) => applyAircraftProfile(event.target.value));
  els.locationSelect.addEventListener('change', (event) => resetToLocation(event.target.value));
  els.throttle.addEventListener('input', (event) => {
    sim.throttle = Number(event.target.value) / 100;
  });
  els.prop.addEventListener('input', (event) => {
    sim.prop = Number(event.target.value) / 100;
  });
  els.mixture.addEventListener('input', (event) => {
    sim.mixture = Number(event.target.value) / 100;
  });
  els.flaps.forEach((button) => {
    button.addEventListener('click', () => {
      sim.flaps = Number(button.dataset.flaps);
      els.flaps.forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  els.battery.addEventListener('change', (event) => (sim.battery = event.target.checked));
  els.alternator.addEventListener('change', (event) => (sim.alternator = event.target.checked));
  els.avionics.addEventListener('change', (event) => (sim.avionics = event.target.checked));
  els.fuelPump.addEventListener('change', (event) => (sim.fuelPump = event.target.checked));
  els.pitot.addEventListener('change', (event) => (sim.pitotHeat = event.target.checked));
  els.antiIce.addEventListener('change', (event) => (sim.antiIce = event.target.checked));
  els.starter.addEventListener('pointerdown', () => {
    sim.starter = true;
    els.starter.classList.add('active');
  });
  window.addEventListener('pointerup', () => {
    sim.starter = false;
    els.starter.classList.remove('active');
  });
  els.gearButton.addEventListener('click', toggleGear);

  const apBindings = [
    [els.apMaster, 'master'],
    [els.hdgMode, 'hdg'],
    [els.altMode, 'alt'],
    [els.vsMode, 'vs'],
    [els.navMode, 'nav'],
    [els.fdMode, 'fd'],
  ];
  apBindings.forEach(([el, key]) => {
    el.addEventListener('change', (event) => {
      sim.ap[key] = event.target.checked;
      if (key === 'alt' && event.target.checked) {
        sim.ap.vs = false;
        els.vsMode.checked = false;
      }
      if (key === 'vs' && event.target.checked) {
        sim.ap.alt = false;
        els.altMode.checked = false;
      }
    });
  });
  els.headingBug.addEventListener('input', (event) => {
    sim.ap.headingBug = Number(event.target.value);
  });
  els.altitudeBug.addEventListener('input', (event) => {
    sim.ap.altitudeBug = Number(event.target.value) / FT_PER_METER;
  });
  els.vsBug.addEventListener('input', (event) => {
    sim.ap.vsBug = Number(event.target.value) / 196.85;
  });

  bindTouchYoke();
}

function toggleGear() {
  if (sim.profile.gear === 'fixed') return;
  if (sim.trueAirspeed * MS_TO_KT > 235) return;
  sim.gearDown = !sim.gearDown;
}

function bindTouchYoke() {
  let activePointer = null;
  const setTouchInput = (event) => {
    const rect = els.touchPad.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    input.roll = (x - 0.5) * 2;
    input.pitch = (y - 0.5) * 2;
    els.touchPad.style.setProperty('--knob-x', `${x * 100}%`);
    els.touchPad.style.setProperty('--knob-y', `${y * 100}%`);
  };
  els.touchPad.addEventListener('pointerdown', (event) => {
    activePointer = event.pointerId;
    els.touchPad.setPointerCapture(activePointer);
    setTouchInput(event);
  });
  els.touchPad.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) setTouchInput(event);
  });
  els.touchPad.addEventListener('pointerup', () => {
    activePointer = null;
    input.roll = 0;
    input.pitch = 0;
    els.touchPad.style.setProperty('--knob-x', '50%');
    els.touchPad.style.setProperty('--knob-y', '50%');
  });
}

function boot() {
  createClouds();
  applyAircraftProfile('c172');
  resetToLocation('jfk');
  updateWeather();
  updateTerrain(true);
  updateG1000();
  drawNavMap();
  animate();
}

bindUi();
boot();

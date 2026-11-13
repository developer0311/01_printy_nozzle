import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { AMFLoader } from "three/examples/jsm/loaders/AMFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/* Every 3D-print file type we preview exactly as-uploaded. */
export const SUPPORTED_MODEL_EXTS = ["stl", "obj", "3mf", "amf", "ply", "glb", "gltf"];
export const SUPPORTED_MODEL_ACCEPT = ".stl,.obj,.3mf,.amf,.ply,.glb,.gltf";

/* Build plate size (mm) — the coloured X/Y/Z axes are drawn from its centre. */
const BED_SIZE_MM = 220;

const easeInOutCubic = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/* Display helpers — the unit switch only ever changes what is SHOWN,
   never the millimetre analysis that feeds pricing. */
const formatDimensions = (dims, unit) => {
  if (!dims) return "—";
  const conv = (v) => (unit === "in" ? v / 25.4 : v);
  const suffix = unit === "in" ? "in" : "mm";
  return `${conv(dims.x).toFixed(2)} × ${conv(dims.y).toFixed(2)} × ${conv(dims.z).toFixed(2)} ${suffix}`;
};

const formatVolume = (cm3, unit) => {
  if (!Number.isFinite(cm3)) return "—";
  return unit === "in" ? `${(cm3 / 16.387064).toFixed(2)} in³` : `${cm3.toFixed(2)} cm³`;
};

/* Small STLs are a few hundred bytes — never show them as "0 MB". */
const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

/**
 * Pull every mesh geometry out of a parsed object (OBJ/3MF/AMF/GLTF…),
 * baking each mesh's world transform so the merged result matches the
 * file exactly — position, rotation and scale included.
 */
function extractGeometriesFromObject(obj) {
  const list = [];
  if (!obj) return list;
  obj.updateWorldMatrix(true, true);
  obj.traverse((child) => {
    if (child.isMesh && child.geometry && child.geometry.attributes?.position) {
      const g = child.geometry.clone();
      g.applyMatrix4(child.matrixWorld);
      // Drop empty shells (some exporters emit zero-triangle groups).
      if (g.attributes.position.count > 0) list.push(g.toNonIndexed ? g.toNonIndexed() : g);
      else g.dispose?.();
    }
  });
  return list;
}

/**
 * Merge a list of (non-indexed) BufferGeometries into one, so volume /
 * area / support analysis and the preview all describe the WHOLE model —
 * not just the first solid. Returns null when there is nothing to merge.
 */
function mergeGeometries(geometries) {
  const valid = (geometries || []).filter(
    (g) => g && g.attributes && g.attributes.position && g.attributes.position.count > 0
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0].index ? valid[0].toNonIndexed() : valid[0];
  let total = 0;
  const nonIndexed = valid.map((g) => (g.index ? g.toNonIndexed() : g));
  nonIndexed.forEach((g) => {
    total += g.attributes.position.count;
  });
  const mergedPos = new Float32Array(total * 3);
  let offset = 0;
  nonIndexed.forEach((g) => {
    const arr = g.attributes.position.array;
    mergedPos.set(arr, offset);
    offset += arr.length;
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * Calculates the exact signed volume of a 3D BufferGeometry in mm^3.
 * Uses the Divergence Theorem / signed tetrahedrons summation.
 */
function calculateMeshVolume(geometry) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    return 0;
  }
  const pos = geometry.attributes.position;
  const index = geometry.index;
  let totalVolume = 0;

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      p1.fromBufferAttribute(pos, index.getX(i));
      p2.fromBufferAttribute(pos, index.getX(i + 1));
      p3.fromBufferAttribute(pos, index.getX(i + 2));
      totalVolume += p1.dot(p2.cross(p3)) / 6.0;
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      p1.fromBufferAttribute(pos, i);
      p2.fromBufferAttribute(pos, i + 1);
      p3.fromBufferAttribute(pos, i + 2);
      totalVolume += p1.dot(p2.cross(p3)) / 6.0;
    }
  }

  const vol = Math.abs(totalVolume);
  return Number.isFinite(vol) ? vol : 0;
}

/**
 * Calculates the exact surface area of a 3D BufferGeometry in mm^2.
 * Slicers use this (with the volume) to derive the solid shell.
 */
function calculateMeshArea(geometry) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    return 0;
  }
  const pos = geometry.attributes.position;
  const index = geometry.index;
  let totalArea = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  const addTri = (i1, i2, i3) => {
    a.fromBufferAttribute(pos, i1);
    b.fromBufferAttribute(pos, i2);
    c.fromBufferAttribute(pos, i3);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cross.crossVectors(ab, ac);
    totalArea += cross.length() / 2.0;
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      addTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      addTri(i, i + 1, i + 2);
    }
  }

  return Number.isFinite(totalArea) ? totalArea : 0;
}

/* Support constants (Bambu Studio-style auto-support profile).
 * Faces steeper than SUPPORT_ANGLE_DEG from horizontal need supports;
 * sparse support columns print at SUPPORT_DENSITY with a dense interface. */
const SUPPORT_ANGLE_DEG = 30;
const SUPPORT_DENSITY = 0.2;
const SUPPORT_INTERFACE_MM = 0.6;
const SUPPORT_GRID_MM = 2.0;

/**
 * Estimates support-filament volume (mm^3) the way Bambu Studio does:
 * detect downward overhang faces, project them onto a coarse build-plate
 * grid (unioning overlaps), grow sparse columns up to each cell's highest
 * overhang, and add a dense interface skin under the overhang area.
 *
 * Runs on the ORIGINAL (unscaled, real-mm) geometry with Y-up heights
 * measured from the model's lowest point (the build plate).
 * Returns { overhangAreaCm2, supportVolumeCm3 }.
 */
function calculateSupportVolume(geometry, minY) {
  const fallback = { overhangAreaCm2: 0, supportVolumeCm3: 0 };
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    return fallback;
  }
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  if (!Number.isFinite(triCount) || triCount <= 0) return fallback;

  const threshold = -Math.cos((SUPPORT_ANGLE_DEG * Math.PI) / 180); // nz below this = overhang
  const grid = SUPPORT_GRID_MM;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // Bounding box in XZ for grid sizing
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxZ <= minZ) return fallback;
  const cols = Math.max(1, Math.ceil((maxX - minX) / grid));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / grid));
  if (cols * rows > 40000) return fallback; // absurdly large — skip, don't hang
  const cellTop = new Float32Array(cols * rows); // highest overhang Y per cell

  let overhangAreaMm2 = 0;

  const getVerts = (i1, i2, i3) => {
    a.fromBufferAttribute(pos, i1);
    b.fromBufferAttribute(pos, i2);
    c.fromBufferAttribute(pos, i3);
  };

  const processTri = (i1, i2, i3) => {
    getVerts(i1, i2, i3);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    const len = normal.length();
    if (len <= 0) return;
    const area = len / 2.0;
    normal.divideScalar(len);
    // Downward face steeper than the threshold, floating above the plate
    const topY = Math.max(a.y, b.y, c.y);
    const heightAbovePlate = topY - minY;
    if (normal.y >= threshold || heightAbovePlate <= 0.5) return;
    overhangAreaMm2 += area;
    // Rasterize the triangle footprint into grid cells (union by max height)
    const tx0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - minX) / grid));
    const tx1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x, c.x) - minX) / grid));
    const tz0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - minZ) / grid));
    const tz1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z, c.z) - minZ) / grid));
    for (let cx = tx0; cx <= tx1; cx++) {
      for (let cz = tz0; cz <= tz1; cz++) {
        const k = cz * cols + cx;
        if (heightAbovePlate > cellTop[k]) cellTop[k] = heightAbovePlate;
      }
    }
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      processTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      processTri(i, i + 1, i + 2);
    }
  }

  if (overhangAreaMm2 <= 0) return fallback;

  const cellAreaMm2 = grid * grid;
  let columnVolMm3 = 0;
  for (let k = 0; k < cellTop.length; k++) {
    if (cellTop[k] > 0) columnVolMm3 += cellTop[k] * cellAreaMm2;
  }
  // Sparse columns + dense interface skin under the overhang
  const supportVolMm3 =
    columnVolMm3 * SUPPORT_DENSITY + overhangAreaMm2 * SUPPORT_INTERFACE_MM;

  if (!Number.isFinite(supportVolMm3) || supportVolMm3 <= 0) return fallback;
  return {
    overhangAreaCm2: +(overhangAreaMm2 / 100).toFixed(1),
    supportVolumeCm3: +(supportVolMm3 / 1000).toFixed(2),
  };
}

/**
 * Procedurally generates a clean 3D Rocket model matching the reference design.
 * Scaled to approx 80 x 80 x 150 mm.
 */
function createRocketGeometry() {
  // Fuselage (tapered cylinder)
  const bodyGeo = new THREE.CylinderGeometry(18, 22, 90, 32);
  bodyGeo.translate(0, 55, 0);

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(18, 45, 32);
  noseGeo.translate(0, 122.5, 0);

  // Cabin window ring / portal
  const ringGeo = new THREE.TorusGeometry(8, 2.2, 16, 32);
  ringGeo.rotateX(Math.PI / 2);
  ringGeo.translate(0, 75, 18);

  // Inner window glass
  const glassGeo = new THREE.CylinderGeometry(7, 7, 2, 32);
  glassGeo.rotateX(Math.PI / 2);
  glassGeo.translate(0, 75, 18);

  // Bottom nozzle
  const nozzleGeo = new THREE.CylinderGeometry(15, 12, 15, 32);
  nozzleGeo.translate(0, 7.5, 0);

  // 4 swept fins
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(26, -10);
  finShape.lineTo(24, 25);
  finShape.lineTo(0, 45);
  finShape.closePath();

  const extrudeSettings = { depth: 3, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.8, bevelThickness: 0.8 };
  const finGeo = new THREE.ExtrudeGeometry(finShape, extrudeSettings);
  finGeo.center();

  // Merge into single buffer geometry for unified volume and color
  const geometries = [
    bodyGeo.toNonIndexed(),
    noseGeo.toNonIndexed(),
    ringGeo.toNonIndexed(),
    glassGeo.toNonIndexed(),
    nozzleGeo.toNonIndexed(),
  ];

  // 4 fins rotated 90 deg around Y
  for (let i = 0; i < 4; i++) {
    const fin = finGeo.clone();
    fin.rotateY((i * Math.PI) / 2);
    const angle = (i * Math.PI) / 2;
    fin.translate(Math.cos(angle) * 26, 25, Math.sin(angle) * 26);
    geometries.push(fin.toNonIndexed());
  }

  // Combine geometries
  let totalVerts = 0;
  geometries.forEach((g) => {
    totalVerts += g.attributes.position.count;
  });

  const mergedPos = new Float32Array(totalVerts * 3);
  let offset = 0;
  geometries.forEach((g) => {
    const pos = g.attributes.position.array;
    mergedPos.set(pos, offset);
    offset += pos.length;
  });

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
  mergedGeo.computeVertexNormals();

  // Scale to match 80 x 80 x 150 mm
  mergedGeo.computeBoundingBox();
  const bb = mergedGeo.boundingBox;
  const currentHeight = bb.max.y - bb.min.y;
  const targetHeight = 150;
  const s = targetHeight / currentHeight;
  mergedGeo.scale(s, s, s);
  mergedGeo.computeBoundingBox();

  // Place bottom cleanly on bed (y = 0.05) to eliminate Z-fighting
  const minY = mergedGeo.boundingBox.min.y;
  mergedGeo.translate(0, -minY + 0.05, 0);
  mergedGeo.computeVertexNormals();

  return mergedGeo;
}

export default function ModelViewer3D({
  file = null,
  color = "#1E88E5",
  materialType = "pla",
  density = 1.24,
  useSample = true,
  onAnalysis = () => {},
  onThumbnail = () => {},
  onError = () => {},
  onRemove = null,
  className = "",
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const currentMeshRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Viewer chrome / scene-layer refs
  const gridPartsRef = useRef(null);
  const axesGroupRef = useRef(null);
  const badgeXRef = useRef(null);
  const badgeYRef = useRef(null);
  const badgeZRef = useRef(null);
  const axisLenRef = useRef({ x: 150, y: 150, z: 150 });
  const viewSizeRef = useRef({ w: 0, h: 0 });
  const cameraTweenRef = useRef(null);
  const showAxesRef = useRef(true);
  const wireframeRef = useRef(false);

  // Stable references to avoid infinite render loops
  const onAnalysisRef = useRef(onAnalysis);
  useEffect(() => {
    onAnalysisRef.current = onAnalysis;
  }, [onAnalysis]);

  const colorRef = useRef(color);
  colorRef.current = color;

  const densityRef = useRef(density);
  densityRef.current = density;

  // Stores geometry analysis base data (independent of material or infill density)
  const baseModelDataRef = useRef(null);
  // Monotonic load id — stale async parses (previous file) can never
  // overwrite the newest upload. This is what guarantees every file shows
  // its OWN exact geometry instead of the previous ("same") model.
  const loadIdRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Viewer chrome state
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [unit, setUnit] = useState("mm");
  const [viewerStats, setViewerStats] = useState(null);
  const [fileInfo, setFileInfo] = useState(() =>
    file
      ? { name: file.name, sizeBytes: file.size, demo: false }
      : { name: "rocket.stl", sizeBytes: 2.45 * 1024 * 1024, demo: true }
  );

  // Live thumbnail of whatever is actually loaded (shown in Order Summary).
  const onThumbnailRef = useRef(null);
  useEffect(() => {
    onThumbnailRef.current = onThumbnail;
  }, [onThumbnail]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const captureThumbnail = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !currentMeshRef.current) return;
    // Rendered continuously, so the next frame already shows the new mesh.
    requestAnimationFrame(() => {
      try {
        const url = renderer.domElement.toDataURL("image/png");
        onThumbnailRef.current?.(url);
      } catch {
        /* canvas unavailable — summary keeps the fallback image */
      }
    });
  }, []);

  /* =========================================================
     INIT THREE.JS SCENE (Runs only once on mount)
     ========================================================= */
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;
    viewSizeRef.current = { w: width, h: height };

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f8fafc");
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(190, 160, 220);
    cameraRef.current = camera;

    // 3. Renderer (preserveDrawingBuffer so the summary thumbnail can snap it)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;

    // Clear existing children
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 3b. Studio environment — soft image-based lighting so the material
    // reads like a product render instead of a flat game mesh.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRenderTarget.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // 4. OrbitControls (Smooth, damping enabled; Full 360° all-direction view including bottom side)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.9;
    controls.enablePan = false; // Disable right-click pan as requested
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.NONE, // Disable right click action
    };
    controls.minDistance = 25;
    controls.maxDistance = 650;
    controls.minPolarAngle = 0.01; // Full 360° vertical freedom
    controls.maxPolarAngle = Math.PI - 0.01; // Full 360° vertical freedom to view bottom of model
    controls.target.set(0, 35, 0);
    controlsRef.current = controls;

    // 5. Lights (Full 360° balanced illumination for both top and bottom views)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdbe4f0, 0.9);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(130, 220, 150);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -240;
    keyLight.shadow.camera.right = 240;
    keyLight.shadow.camera.top = 240;
    keyLight.shadow.camera.bottom = -240;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 900;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.6;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xbfdbfe, 0.6);
    fillLight.position.set(-140, 120, -110);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(-90, 70, 190);
    scene.add(rimLight);

    // Dedicated bottom lights so underside of the model is crisp and well-lit from below
    const bottomLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    bottomLight1.position.set(-80, -180, -100);
    scene.add(bottomLight1);

    const bottomLight2 = new THREE.DirectionalLight(0xdbeafe, 0.9);
    bottomLight2.position.set(100, -160, 120);
    scene.add(bottomLight2);

    // 6. Build Plate / Grid (Clean light-gray grid matching 3Ding reference)
    const bedSize = BED_SIZE_MM;
    const divisions = 22; // 10mm per line

    const gridHelper = new THREE.GridHelper(bedSize, divisions, 0xa0aec0, 0xe2e8f0);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // FrontSide-only plate: opaque from top, completely transparent from bottom
    // so you can see the model's underside 100% clearly without the plate blocking it
    const plateGeo = new THREE.PlaneGeometry(bedSize, bedSize);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.85,
      envMapIntensity: 0.15,
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.rotation.x = -Math.PI / 2;
    plateMesh.position.y = -0.05;
    plateMesh.receiveShadow = true;
    scene.add(plateMesh);

    // Build plate border line
    const borderGeo = new THREE.BufferGeometry();
    const half = bedSize / 2;
    borderGeo.setFromPoints([
      new THREE.Vector3(-half, 0.1, -half),
      new THREE.Vector3(half, 0.1, -half),
      new THREE.Vector3(half, 0.1, half),
      new THREE.Vector3(-half, 0.1, half),
      new THREE.Vector3(-half, 0.1, -half),
    ]);
    const borderLine = new THREE.Line(
      borderGeo,
      new THREE.LineBasicMaterial({ color: 0x94a3b8 })
    );
    scene.add(borderLine);
    gridPartsRef.current = { grid: gridHelper, plate: plateMesh, border: borderLine };

    // 7. Coloured X / Y axes on the build plate (matching 3Ding reference)
    const axesGroup = new THREE.Group();
    axesGroup.position.y = 0.3;
    const axisDefs = [
      { rot: [0, 0, -Math.PI / 2], color: 0xef4444 }, // X along +X on bed (Red)
      { rot: [Math.PI / 2, 0, 0], color: 0x22c55e },  // Y along +Z on bed (Green)
      { rot: [0, 0, 0], color: 0x3b82f6 },            // Z along +Y vertical (Blue)
    ];
    axisDefs.forEach(({ rot, color }) => {
      const geo = new THREE.CylinderGeometry(0.8, 0.8, 1, 8);
      geo.translate(0, 0.5, 0);
      const axisMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      axisMesh.rotation.set(rot[0], rot[1], rot[2]);
      axesGroup.add(axisMesh);
    });
    axesGroup.visible = showAxesRef.current;
    scene.add(axesGroup);
    axesGroupRef.current = axesGroup;

    // 8. Animation loop
    const worldPoint = new THREE.Vector3();
    let lastTime = performance.now();

    const updateAxisBadges = () => {
      const { w, h } = viewSizeRef.current;
      const lens = axisLenRef.current;
      const on = showAxesRef.current;
      const badges = [
        [badgeXRef.current, lens.x, 0.3, 0], // X tip on bed
        [badgeYRef.current, 0, 0.3, lens.z], // Y tip on bed
      ];
      for (let i = 0; i < badges.length; i++) {
        const [el, x, y, z] = badges[i];
        if (!el) continue;
        if (!on || w <= 0 || h <= 0) {
          el.style.opacity = "0";
          continue;
        }
        worldPoint.set(x, y, z);
        const dist = camera.position.distanceTo(worldPoint);
        worldPoint.project(camera);
        if (worldPoint.z > 1 || worldPoint.z < -1) {
          el.style.opacity = "0";
          continue;
        }
        const px = (worldPoint.x * 0.5 + 0.5) * w;
        const py = (-worldPoint.y * 0.5 + 0.5) * h;
        const margin = 16;
        const cx = Math.min(Math.max(px, margin), w - margin);
        const cy = Math.min(Math.max(py, margin), h - margin);
        const scale = Math.min(1.7, Math.max(0.75, 320 / dist));
        el.style.opacity = "1";
        el.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) scale(${scale})`;
      }
    };

    const animate = (now) => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Smooth (eased) camera reframing — used for new models and Reset View.
      const tween = cameraTweenRef.current;
      if (tween) {
        tween.t += dt;
        const p = Math.min(1, tween.t / tween.dur);
        const e = easeInOutCubic(p);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
        if (p >= 1) cameraTweenRef.current = null;
      }

      // Model fade-in on load (thumbnail is captured once fully opaque).
      const mesh = currentMeshRef.current;
      if (mesh && typeof mesh.userData.fade === "number" && mesh.userData.fade < 1) {
        mesh.userData.fade = Math.min(1, mesh.userData.fade + dt * 2.8);
        const a = mesh.userData.fade;
        mesh.material.opacity = a;
        const edgeMesh = mesh.children.find((c) => c.userData.isEdge);
        if (edgeMesh?.material) edgeMesh.material.opacity = 0.22 * a;
        if (a >= 1) captureThumbnail();
      }

      controls.update();
      updateAxisBadges();
      renderer.render(scene, camera);
    };
    animationFrameRef.current = requestAnimationFrame(animate);

    // 9. The moment the user grabs the model, stop any scripted camera move.
    const cancelTween = () => {
      cameraTweenRef.current = null;
    };
    const handleContextMenu = (e) => e.preventDefault();
    renderer.domElement.addEventListener("pointerdown", cancelTween);
    renderer.domElement.addEventListener("wheel", cancelTween, { passive: true });
    renderer.domElement.addEventListener("contextmenu", handleContextMenu);

    // 10. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        viewSizeRef.current = { w, h };
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", cancelTween);
      renderer.domElement.removeEventListener("wheel", cancelTween);
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      envRenderTarget.dispose();
      renderer.dispose();
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [captureThumbnail]);

  /* =========================================================
     FIT CAMERA TO CURRENT MODEL (eased — every file frames exactly)
     ========================================================= */
  const fitCameraToSize = useCallback((sizeY, maxDim) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const span = Math.max(60, maxDim || 120);
    const dist = span * 1.4 + 75;
    const h = span * 0.68 + 55;

    camera.near = Math.max(0.5, span / 500);
    camera.far = Math.max(2000, span * 12);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(15, span * 0.35);
    controls.maxDistance = Math.max(600, span * 5);

    // Glide into place instead of snapping — the single biggest "smooth" win.
    cameraTweenRef.current = {
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(dist * 0.62, h, dist * 0.75),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(0, (sizeY || span) / 2, 0),
      t: 0,
      dur: 0.75,
    };
  }, []);

  /* =========================================================
     RESET CAMERA ORIENTATION
     ========================================================= */
  const handleResetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const base = baseModelDataRef.current;
    if (base?.displayMaxDim) {
      fitCameraToSize(base.displayHeight, base.displayMaxDim);
      return;
    }
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    cameraTweenRef.current = {
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(190, 160, 220),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(0, 50, 0),
      t: 0,
      dur: 0.75,
    };
  }, [fitCameraToSize]);

  /* =========================================================
     UPDATE MESH COLOR IN REALTIME (Does not reload geometry)
     ========================================================= */
  useEffect(() => {
    if (currentMeshRef.current?.material) {
      currentMeshRef.current.material.color.set(color);
      currentMeshRef.current.material.needsUpdate = true;
      captureThumbnail();
    }
  }, [color, captureThumbnail]);

  /* =========================================================
     UPDATE WEIGHT WHEN DENSITY CHANGES (solid weight only)
     Infill scaling is applied once in Printing.jsx / server calculator,
     so the viewer always reports volume × density (no infill here).
     ========================================================= */
  useEffect(() => {
    if (!baseModelDataRef.current) return;
    const { fileName, fileSizeMB, dimensions, volumeCm3, surfaceAreaCm2, supportVolumeCm3, overhangAreaCm2, isSample } = baseModelDataRef.current;

    const calculatedWeight = isSample ? 20 : Math.max(2, Math.round(volumeCm3 * density));

    const updatedStats = {
      fileName,
      fileSizeMB,
      dimensions,
      volumeCm3,
      surfaceAreaCm2,
      supportVolumeCm3,
      overhangAreaCm2,
      weightGrams: calculatedWeight,
    };

    onAnalysisRef.current?.(updatedStats);
  }, [density]);

  /* =========================================================
     VIEWER CHROME TOGGLES (Grid / Axes / Wireframe)
     ========================================================= */
  useEffect(() => {
    const parts = gridPartsRef.current;
    if (parts) {
      parts.grid.visible = showGrid;
      parts.border.visible = showGrid;
    }
  }, [showGrid]);

  useEffect(() => {
    showAxesRef.current = showAxes;
    if (axesGroupRef.current) axesGroupRef.current.visible = showAxes;
  }, [showAxes]);

  useEffect(() => {
    wireframeRef.current = wireframe;
    const mesh = currentMeshRef.current;
    const edgeMesh = mesh?.children?.find((c) => c.userData.isEdge);
    if (edgeMesh) edgeMesh.visible = wireframe;
  }, [wireframe]);

  /* =========================================================
     LOAD FILE OR SAMPLE ROCKET (Only runs when file/useSample changes)
     Every attached file renders its OWN exact geometry: all solids are
     merged with their transforms baked, stale async parses are ignored
     via loadId, and the camera reframes per model.
     ========================================================= */
  useEffect(() => {
    if (!sceneRef.current) return;

    const myLoadId = ++loadIdRef.current;
    let cancelled = false;
    const isStale = () => cancelled || loadIdRef.current !== myLoadId;

    const failLoad = (message, err) => {
      if (isStale()) return;
      if (err) console.error(message, err);
      else console.error(message);
      setLoading(false);
      setLoadError(message);
      onErrorRef.current?.(message);
    };

    const processGeometry = (geometry, fileName, fileSizeMB, isSample = false, fileSizeBytes = 0, zUp = false) => {
      if (isStale() || !sceneRef.current) return;
      if (!geometry || !geometry.attributes?.position || geometry.attributes.position.count === 0) {
        failLoad(`Could not read any mesh from ${fileName}. The file may be empty or corrupt.`);
        return;
      }

      // Remove existing model mesh (and its wireframe overlay material)
      if (currentMeshRef.current) {
        const oldMesh = currentMeshRef.current;
        sceneRef.current.remove(oldMesh);
        oldMesh.traverse((child) => {
          if (child !== oldMesh && child.material) child.material.dispose();
        });
        oldMesh.geometry?.dispose();
        oldMesh.material?.dispose();
        currentMeshRef.current = null;
      }

      // STL / 3MF / AMF store geometry Z-up (like every slicer), while this
      // viewer — and the support/overhang analysis below — work Y-up. Rotate
      // once on load so models stand on the plate exactly as they print.
      if (zUp) geometry.rotateX(-Math.PI / 2);

      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      // Measure FIRST on the original geometry (real millimetres, like a
      // slicer) — display auto-fit below must never change the weight.
      const rawSize = new THREE.Vector3();
      geometry.boundingBox.getSize(rawSize);

      // Triangle count for the stats overlay (5,180 triangles…)
      const triangleCount = Math.round(
        (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3
      );

      // Exact Volume in mm^3 of the unscaled model
      let rawVolumeMm3 = calculateMeshVolume(geometry);
      if (rawVolumeMm3 <= 0 || !Number.isFinite(rawVolumeMm3)) {
        rawVolumeMm3 = rawSize.x * rawSize.y * rawSize.z * 0.35;
      }
      const volumeCm3 = +(rawVolumeMm3 / 1000).toFixed(1);
      const volumeCm3Display = +(rawVolumeMm3 / 1000).toFixed(2);

      // Exact surface area in cm^2 of the unscaled model — slicers derive
      // the solid shell (walls + top/bottom skins) from this + the volume.
      const rawAreaMm2 = calculateMeshArea(geometry);
      const surfaceAreaCm2 = +(rawAreaMm2 / 100).toFixed(1);

      // Bambu-style support analysis on the unscaled model: overhang faces
      // get sparse support columns from the build plate + dense interface.
      const support = calculateSupportVolume(geometry, geometry.boundingBox.min.y);
      const overhangAreaCm2 = support.overhangAreaCm2;
      const supportVolumeCm3 = support.supportVolumeCm3;

      const finalDim = {
        x: Math.round(rawSize.x),
        y: Math.round(rawSize.z), // bed depth
        z: Math.round(rawSize.y), // height
      };

      // Display-only auto-fit (tiny models scaled up, huge models scaled
      // down so they frame nicely — measurement above is unaffected).
      const displaySize = rawSize.clone();
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
      if (maxDim < 5) {
        geometry.scale(1000, 1000, 1000);
        displaySize.multiplyScalar(1000);
      } else if (maxDim > 200) {
        const s = 180 / maxDim;
        geometry.scale(s, s, s);
        displaySize.multiplyScalar(s);
      }

      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      bb.getSize(displaySize);

      // Center geometry on X and Z, and place base cleanly on build plate (y = 0.05) to eliminate Z-fighting
      const center = new THREE.Vector3();
      bb.getCenter(center);
      geometry.translate(-center.x, -bb.min.y + 0.05, -center.z);
      geometry.computeBoundingBox();

      // Solid weight = volume × density (infill applied later by pricing engine)
      const calculatedWeight = isSample ? 20 : Math.max(2, Math.round(volumeCm3 * densityRef.current));

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorRef.current),
        roughness: 0.38,
        metalness: 0.08,
        envMapIntensity: 0.85,
        side: THREE.DoubleSide, // Ensure underside/bottom and inverted faces are rendered seamlessly
        transparent: true,
        opacity: 0,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.fade = 0; // animated to 1 by the render loop

      // Wireframe overlay: edges drawn OVER the solid model (not instead of
      // it), exactly like slicer previews. Shares the geometry, so it is
      // disposed together with the mesh above.
      const edgeMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0x0f172a,
          wireframe: true,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        })
      );
      edgeMesh.userData.isEdge = true;
      edgeMesh.visible = wireframeRef.current;
      mesh.add(edgeMesh);

      sceneRef.current.add(mesh);
      currentMeshRef.current = mesh;

      // Reframe so THIS file fills the viewport — different files can no
      // longer look like the "same" model stuck at a fixed distance.
      const displayMaxDim = Math.max(displaySize.x, displaySize.y, displaySize.z);
      fitCameraToSize(displaySize.y, displayMaxDim);

      // Axes track the model so their letter badges sit just past the
      // geometry: the vertical axis clears the model, the horizontal pair
      // stays a little tighter so the badges don't hit the viewport edges.
      const lenXZ = Math.max(displayMaxDim * 0.72, 24);
      const lenY = Math.max(displaySize.y * 1.12 + 8, 24);
      axisLenRef.current = { x: lenXZ, y: lenY, z: lenXZ };
      const axisMeshes = axesGroupRef.current?.children ?? [];
      if (axisMeshes[0]) axisMeshes[0].scale.y = lenXZ;
      if (axisMeshes[1]) axisMeshes[1].scale.y = lenXZ;
      if (axisMeshes[2]) axisMeshes[2].scale.y = lenY;

      // Cache base analysis data
      baseModelDataRef.current = {
        fileName,
        fileSizeMB,
        dimensions: finalDim,
        volumeCm3,
        surfaceAreaCm2,
        overhangAreaCm2,
        supportVolumeCm3,
        isSample,
        displayHeight: displaySize.y,
        displayMaxDim,
      };

      const stats = {
        fileName,
        fileSizeMB,
        dimensions: finalDim,
        volumeCm3,
        surfaceAreaCm2,
        overhangAreaCm2,
        supportVolumeCm3,
        weightGrams: calculatedWeight,
      };

      // Viewer chrome readout — real millimetres, shown in the canvas overlay.
      setViewerStats({
        dimsMm: { x: rawSize.x, y: rawSize.z, z: rawSize.y },
        triangles: triangleCount,
        volumeCm3: volumeCm3Display,
      });
      setFileInfo({ name: fileName, sizeBytes: fileSizeBytes, demo: isSample });

      onAnalysisRef.current?.(stats);
      setLoading(false);
      setLoadError(null);
      // Thumbnail is captured once the fade-in finishes (see render loop).
    };

    const parseAndShow = async (buffer, ext, fileName, fileSizeMB, fileSizeBytes) => {
      // Slicer-native formats are Z-up; OBJ / PLY / glTF are authored Y-up.
      const zUp = ext === "stl" || ext === "3mf" || ext === "amf";
      try {
        if (ext === "stl") {
          const geometry = new STLLoader().parse(buffer.slice(0));
          processGeometry(geometry, fileName, fileSizeMB, false, fileSizeBytes, zUp);
        } else if (ext === "obj") {
          const text = new TextDecoder().decode(buffer);
          const obj = new OBJLoader().parse(text);
          const merged = mergeGeometries(extractGeometriesFromObject(obj));
          if (!merged) throw new Error("empty OBJ");
          processGeometry(merged, fileName, fileSizeMB, false, fileSizeBytes, zUp);
        } else if (ext === "3mf") {
          const group = new ThreeMFLoader().parse(buffer.slice(0));
          const merged = mergeGeometries(extractGeometriesFromObject(group));
          if (!merged) throw new Error("empty 3MF");
          processGeometry(merged, fileName, fileSizeMB, false, fileSizeBytes, zUp);
        } else if (ext === "amf") {
          const group = new AMFLoader().parse(buffer.slice(0));
          const merged = mergeGeometries(extractGeometriesFromObject(group));
          if (!merged) throw new Error("empty AMF");
          processGeometry(merged, fileName, fileSizeMB, false, fileSizeBytes, zUp);
        } else if (ext === "ply") {
          const geometry = new PLYLoader().parse(buffer.slice(0));
          processGeometry(geometry.index ? geometry.toNonIndexed() : geometry, fileName, fileSizeMB, false, fileSizeBytes, zUp);
        } else if (ext === "glb" || ext === "gltf") {
          const loader = new GLTFLoader();
          const gltf = await loader.parseAsync(buffer.slice(0), "");
          const merged = mergeGeometries(extractGeometriesFromObject(gltf.scene));
          if (!merged) throw new Error("empty GLTF");
          processGeometry(merged, fileName, fileSizeMB, false, fileSizeBytes, zUp);
        } else {
          failLoad(`Unsupported file type ".${ext}". Please upload ${SUPPORTED_MODEL_EXTS.map((e) => "." + e.toUpperCase()).join(", ")}.`);
        }
      } catch (err) {
        failLoad(`Could not parse ${fileName}. The file may be corrupt or use an unsupported variant.`, err);
      }
    };

    if (file) {
      setLoading(true);
      setLoadError(null);
      setViewerStats(null);
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const fileSizeMB = +(file.size / (1024 * 1024)).toFixed(2);
      const fileName = file.name;
      // Toolbar reflects the chosen file instantly (parse can take a moment).
      setFileInfo({ name: fileName, sizeBytes: file.size, demo: false });

      if (!SUPPORTED_MODEL_EXTS.includes(ext)) {
        failLoad(`Unsupported file type ".${ext}". Please upload ${SUPPORTED_MODEL_EXTS.map((e) => "." + e.toUpperCase()).join(", ")}.`);
        return () => {
          cancelled = true;
        };
      }

      // Assign handlers BEFORE reading (correct FileReader order) and guard
      // every async hop with the load id so rapid re-uploads can't mix up.
      const reader = new FileReader();
      reader.onload = (e) => {
        if (isStale()) return;
        parseAndShow(e.target.result, ext, fileName, fileSizeMB, file.size);
      };
      reader.onerror = () => {
        failLoad(`Could not read ${fileName}. Please try again.`);
      };
      reader.readAsArrayBuffer(file);
    } else if (useSample) {
      setLoading(true);
      setLoadError(null);
      setViewerStats(null);
      const timer = setTimeout(() => {
        if (isStale()) return;
        try {
          const rocketGeo = createRocketGeometry();
          processGeometry(rocketGeo, "rocket.stl", 2.45, true, 2.45 * 1024 * 1024);
        } catch (err) {
          failLoad("Could not generate the sample model.", err);
        }
      }, 50);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      // No file and no sample (user pressed Remove): clear the viewport so a
      // stale model is never mistaken for the next upload.
      if (currentMeshRef.current && sceneRef.current) {
        const oldMesh = currentMeshRef.current;
        sceneRef.current.remove(oldMesh);
        oldMesh.traverse((child) => {
          if (child !== oldMesh && child.material) child.material.dispose();
        });
        oldMesh.geometry?.dispose();
        oldMesh.material?.dispose();
        currentMeshRef.current = null;
      }
      baseModelDataRef.current = null;
      setViewerStats(null);
      setLoading(false);
      setLoadError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [file, useSample, fitCameraToSize]);

  return (
    <div className={`model-viewer-root ${className}`}>
      {/* Toolbar: file identity + view toggles (grid / axes / wireframe) */}
      <div className="model-viewer-toolbar">
        <div className="mvt-file">
          <span className="mvt-name" title={fileInfo?.name}>
            {fileInfo?.name || "—"}
          </span>
          {fileInfo && (
            <>
              <span className="mvt-dot">•</span>
              <span className="mvt-size">{formatFileSize(fileInfo.sizeBytes)}</span>
            </>
          )}
          {fileInfo?.demo && <span className="viewer-demo-badge">Demo model</span>}
        </div>

        <div className="mvt-actions">
          <span className="mvt-label">View:</span>
          <button
            type="button"
            className={`mvt-toggle ${showGrid ? "is-on" : ""}`}
            onClick={() => setShowGrid((v) => !v)}
            aria-pressed={showGrid}
          >
            Grid
          </button>
          <button
            type="button"
            className={`mvt-toggle ${showAxes ? "is-on" : ""}`}
            onClick={() => setShowAxes((v) => !v)}
            aria-pressed={showAxes}
          >
            Axes
          </button>
          <button
            type="button"
            className={`mvt-toggle ${wireframe ? "is-on" : ""}`}
            onClick={() => setWireframe((v) => !v)}
            aria-pressed={wireframe}
          >
            Wireframe
          </button>
          <span className="mvt-sep" aria-hidden="true" />
          <div className="mvt-units" role="group" aria-label="Display units">
            <button
              type="button"
              className={unit === "mm" ? "is-on" : ""}
              onClick={() => setUnit("mm")}
              aria-pressed={unit === "mm"}
            >
              mm
            </button>
            <button
              type="button"
              className={unit === "in" ? "is-on" : ""}
              onClick={() => setUnit("in")}
              aria-pressed={unit === "in"}
            >
              Inch
            </button>
          </div>
          {onRemove && (
            <>
              <span className="mvt-sep" aria-hidden="true" />
              <button
                type="button"
                className="mvt-remove-btn"
                onClick={onRemove}
                title="Remove 3D model"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      <div className="model-viewer-wrapper">
        {/* 3D Canvas Mount Point */}
        <div className="model-viewer-canvas" ref={mountRef} />

        {/* Live model readout (top-left) matching 3Ding HUD */}
        {viewerStats && !loadError && (
          <div className="mv-stats">
            <div>{formatDimensions(viewerStats.dimsMm, unit)}</div>
            <div>{viewerStats.triangles.toLocaleString()} triangles</div>
            <div>{formatVolume(viewerStats.volumeCm3, unit)}</div>
          </div>
        )}

        {/* 3D-projected X / Y badges on bed (positioned by the render loop) */}
        <div className="mv-badges" aria-hidden="true">
          <span ref={badgeXRef} className="mv-badge mv-badge-x">X</span>
          <span ref={badgeYRef} className="mv-badge mv-badge-y">Y</span>
        </div>

        {/* Reset View (top-right) */}
        <button
          type="button"
          className="mv-reset-btn"
          onClick={handleResetCamera}
          title="Reset camera to default view"
        >
          Reset View
        </button>

        {/* Loading Overlay */}
        {loading && (
          <div className="model-viewer-loading">
            <div className="mv-load-pill">
              <div className="spinner-border spinner-border-sm" role="status" style={{ color: "#FF7508" }} />
              <span>Processing 3D geometry…</span>
            </div>
          </div>
        )}

        {/* Parse error — never silently keep the previous ("same") model */}
        {!loading && loadError && (
          <div className="model-viewer-error">
            <div className="mv-error-pill">{loadError}</div>
          </div>
        )}

        {/* Interactive Helper Hint */}
        <div className="viewer-hint">
          <span>Drag to rotate • Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}

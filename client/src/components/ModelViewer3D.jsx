import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { Box } from "lucide-react";

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

  // Place bottom on bed (y = 0)
  const minY = mergedGeo.boundingBox.min.y;
  mergedGeo.translate(0, -minY, 0);
  mergedGeo.computeVertexNormals();

  return mergedGeo;
}

export default function ModelViewer3D({
  file = null,
  color = "#1E88E5",
  materialType = "pla",
  density = 1.24,
  infillFactor = 1.0,
  useSample = true,
  onAnalysis = () => {},
  className = "",
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const currentMeshRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Stable references to avoid infinite render loops
  const onAnalysisRef = useRef(onAnalysis);
  useEffect(() => {
    onAnalysisRef.current = onAnalysis;
  }, [onAnalysis]);

  const colorRef = useRef(color);
  colorRef.current = color;

  const densityRef = useRef(density);
  densityRef.current = density;

  const infillFactorRef = useRef(infillFactor);
  infillFactorRef.current = infillFactor;

  // Stores geometry analysis base data (independent of material or infill density)
  const baseModelDataRef = useRef(null);

  const [loading, setLoading] = useState(false);

  /* =========================================================
     INIT THREE.JS SCENE (Runs only once on mount)
     ========================================================= */
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 340;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#F8FAFC");
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(150, 130, 180);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Clear existing children
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 40;
    controls.maxDistance = 600;
    controls.maxPolarAngle = Math.PI / 2 + 0.02; // prevent going below build bed
    controls.target.set(0, 50, 0);
    controlsRef.current = controls;

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.8);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(120, 220, 140);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
    fillLight.position.set(-120, 140, -100);
    scene.add(fillLight);

    // 6. Build Plate / Grid
    const bedSize = 220; // 220x220 mm build plate
    const divisions = 22; // 10mm per line

    const gridHelper = new THREE.GridHelper(bedSize, divisions, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Subtle build plate surface under grid
    const plateGeo = new THREE.PlaneGeometry(bedSize, bedSize);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.1,
      depthWrite: false,
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.rotation.x = -Math.PI / 2;
    plateMesh.position.y = -0.1;
    plateMesh.receiveShadow = true;
    scene.add(plateMesh);

    // Build plate border line
    const borderGeo = new THREE.BufferGeometry();
    const half = bedSize / 2;
    const borderPoints = [
      new THREE.Vector3(-half, 0.2, -half),
      new THREE.Vector3(half, 0.2, -half),
      new THREE.Vector3(half, 0.2, half),
      new THREE.Vector3(-half, 0.2, half),
      new THREE.Vector3(-half, 0.2, -half),
    ];
    borderGeo.setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 });
    const borderLine = new THREE.Line(borderGeo, borderMat);
    scene.add(borderLine);

    // 7. Animation Loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, []);

  /* =========================================================
     RESET CAMERA ORIENTATION
     ========================================================= */
  const handleResetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    camera.position.set(150, 130, 180);
    controls.target.set(0, 50, 0);
    controls.update();
  }, []);

  /* =========================================================
     UPDATE MESH COLOR IN REALTIME (Does not reload geometry)
     ========================================================= */
  useEffect(() => {
    if (currentMeshRef.current?.material) {
      currentMeshRef.current.material.color.set(color);
      currentMeshRef.current.material.needsUpdate = true;
    }
  }, [color]);

  /* =========================================================
     UPDATE WEIGHT WHEN DENSITY CHANGES (solid weight only)
     Infill scaling is applied once in Printing.jsx / server calculator,
     so the viewer always reports volume × density (no infill here).
     ========================================================= */
  useEffect(() => {
    if (!baseModelDataRef.current) return;
    const { fileName, fileSizeMB, dimensions, volumeCm3, isSample } = baseModelDataRef.current;

    const calculatedWeight = isSample ? 20 : Math.max(2, Math.round(volumeCm3 * density));

    const updatedStats = {
      fileName,
      fileSizeMB,
      dimensions,
      volumeCm3,
      weightGrams: calculatedWeight,
    };

    onAnalysisRef.current?.(updatedStats);
  }, [density]);

  /* =========================================================
     LOAD FILE OR SAMPLE ROCKET (Only runs when file/useSample changes)
     ========================================================= */
  useEffect(() => {
    if (!sceneRef.current) return;

    let isCancelled = false;

    const processGeometry = (geometry, fileName, fileSizeMB, isSample = false) => {
      if (isCancelled || !sceneRef.current) return;

      // Remove existing model mesh
      if (currentMeshRef.current) {
        sceneRef.current.remove(currentMeshRef.current);
        if (currentMeshRef.current.geometry) currentMeshRef.current.geometry.dispose();
        if (currentMeshRef.current.material) currentMeshRef.current.material.dispose();
        currentMeshRef.current = null;
      }

      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      let bb = geometry.boundingBox;
      const size = new THREE.Vector3();
      bb.getSize(size);

      // Auto-fit if mesh is abnormally small (e.g. in meters) or oversized (> 250mm)
      let scale = 1;
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim < 5) {
        scale = 1000;
        geometry.scale(scale, scale, scale);
      } else if (maxDim > 200) {
        scale = 180 / maxDim;
        geometry.scale(scale, scale, scale);
      }

      geometry.computeBoundingBox();
      bb = geometry.boundingBox;
      bb.getSize(size);

      // Center geometry on X and Z, and place base on build plate (y = 0)
      const center = new THREE.Vector3();
      bb.getCenter(center);
      geometry.translate(-center.x, -bb.min.y, -center.z);
      geometry.computeBoundingBox();

      const finalDim = {
        x: Math.round(size.x),
        y: Math.round(size.z), // bed depth
        z: Math.round(size.y), // height
      };

      // Exact Volume in mm^3
      let rawVolumeMm3 = calculateMeshVolume(geometry);
      if (rawVolumeMm3 <= 0 || !Number.isFinite(rawVolumeMm3)) {
        rawVolumeMm3 = size.x * size.y * size.z * 0.35;
      }
      const volumeCm3 = +(rawVolumeMm3 / 1000).toFixed(1);

      // Solid weight = volume × density (infill applied later by pricing engine)
      const calculatedWeight = isSample ? 20 : Math.max(2, Math.round(volumeCm3 * densityRef.current));

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorRef.current),
        roughness: 0.35,
        metalness: 0.15,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      sceneRef.current.add(mesh);
      currentMeshRef.current = mesh;

      // Adjust camera target to center of mesh
      if (controlsRef.current) {
        controlsRef.current.target.set(0, size.y / 2, 0);
        controlsRef.current.update();
      }

      // Cache base analysis data
      baseModelDataRef.current = {
        fileName,
        fileSizeMB,
        dimensions: finalDim,
        volumeCm3,
        isSample,
      };

      const stats = {
        fileName,
        fileSizeMB,
        dimensions: finalDim,
        volumeCm3,
        weightGrams: calculatedWeight,
      };

      onAnalysisRef.current?.(stats);
      setLoading(false);
    };

    if (file) {
      setLoading(true);
      const reader = new FileReader();
      const ext = file.name.split(".").pop().toLowerCase();
      const fileSizeMB = +(file.size / (1024 * 1024)).toFixed(2);

      if (ext === "stl") {
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => {
          try {
            const loader = new STLLoader();
            const geometry = loader.parse(e.target.result);
            processGeometry(geometry, file.name, fileSizeMB, false);
          } catch (err) {
            console.error("Error parsing STL:", err);
            setLoading(false);
          }
        };
      } else if (ext === "obj") {
        reader.readAsText(file);
        reader.onload = (e) => {
          try {
            const loader = new OBJLoader();
            const obj = loader.parse(e.target.result);
            let foundGeo = null;
            obj.traverse((child) => {
              if (child.isMesh && child.geometry && !foundGeo) {
                foundGeo = child.geometry.clone();
              }
            });
            if (foundGeo) {
              processGeometry(foundGeo, file.name, fileSizeMB, false);
            } else {
              setLoading(false);
            }
          } catch (err) {
            console.error("Error parsing OBJ:", err);
            setLoading(false);
          }
        };
      } else if (ext === "3mf") {
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => {
          try {
            const loader = new ThreeMFLoader();
            const group = loader.parse(e.target.result);
            let foundGeo = null;
            group.traverse((child) => {
              if (child.isMesh && child.geometry && !foundGeo) {
                foundGeo = child.geometry.clone();
              }
            });
            if (foundGeo) {
              processGeometry(foundGeo, file.name, fileSizeMB, false);
            } else {
              setLoading(false);
            }
          } catch (err) {
            console.error("Error parsing 3MF:", err);
            setLoading(false);
          }
        };
      } else {
        setLoading(false);
      }
    } else if (useSample) {
      setLoading(true);
      const timer = setTimeout(() => {
        try {
          const rocketGeo = createRocketGeometry();
          processGeometry(rocketGeo, "rocket.stl", 2.45, true);
        } catch (err) {
          console.error("Error generating sample rocket:", err);
          setLoading(false);
        }
      }, 50);
      return () => {
        isCancelled = true;
        clearTimeout(timer);
      };
    }

    return () => {
      isCancelled = true;
    };
  }, [file, useSample]);

  return (
    <div className={`model-viewer-wrapper ${className}`}>
      {/* 3D Canvas Mount Point */}
      <div className="model-viewer-canvas" ref={mountRef} />

      {/* Loading Overlay */}
      {loading && (
        <div className="model-viewer-loading">
          <div className="spinner-border spinner-border-sm" role="status" style={{ color: "#FF7508" }} />
          <span>Processing 3D Geometry...</span>
        </div>
      )}

      {/* Top-Right Control Buttons */}
      <div className="model-viewer-controls">
        <button
          type="button"
          className="viewer-ctrl-btn"
          onClick={handleResetCamera}
          title="Reset Camera Angle (Isometric View)"
          aria-label="Reset View"
        >
          <Box size={18} strokeWidth={2.2} />
        </button>
      </div>

      {/* Interactive Helper Hint */}
      <div className="viewer-hint">
        <span>Drag to rotate • Scroll to zoom • Right-click to pan</span>
      </div>
    </div>
  );
}

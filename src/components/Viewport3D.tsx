import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Flame,
  Focus,
  Grid3X3,
  Layers,
  RotateCw,
  Sun,
  Wand2,
} from 'lucide-react';
import {
  CameraPreset,
  MaterialPreset,
  MeshDiagnostics,
  PrinterPreset,
} from '../types/studio';

interface Viewport3DProps {
  geometry: THREE.BufferGeometry | null;
  innerCavityGeometry: THREE.BufferGeometry | null;
  printer: PrinterPreset;
  materialPreset: MaterialPreset;
  onMaterialChange: (m: MaterialPreset) => void;
  diagnostics: MeshDiagnostics | null;
  isGenerating: boolean;
  generationLabel: string;
  meshVersion: number;
}

const MATERIAL_PILLS: Array<{
  id: MaterialPreset;
  label: string;
  dot: string;
}> = [
  { id: 'silk-pla', label: 'Silk PLA', dot: '#38BDF8' },
  { id: 'matte-clay', label: 'Sculpt Clay', dot: '#E2A878' },
  { id: 'translucent-resin', label: 'SLA Resin', dot: '#10B981' },
  { id: 'metallic-bronze', label: 'Bronze', dot: '#F59E0B' },
  { id: 'lithophane-glow', label: 'Backlit Lamp', dot: '#FEF08A' },
  { id: 'overhang-heatmap', label: 'Overhangs', dot: '#FF3B8B' },
  { id: 'xray-hollow', label: 'X-Ray Hollow', dot: '#C084FC' },
  { id: 'wireframe', label: 'Wireframe', dot: '#00F0FF' },
];

export const Viewport3D: React.FC<Viewport3DProps> = ({
  geometry,
  innerCavityGeometry,
  printer,
  materialPreset,
  onMaterialChange,
  diagnostics,
  isGenerating,
  generationLabel,
  meshVersion,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoSpin, setAutoSpin] = useState(false);
  const [showBuildVolume, setShowBuildVolume] = useState(true);
  const [activeCam, setActiveCam] = useState<CameraPreset>('iso');

  // Refs to Three.js scene objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const mainMeshRef = useRef<THREE.Mesh | null>(null);
  const cavityMeshRef = useRef<THREE.Mesh | null>(null);
  const bedGroupRef = useRef<THREE.Group | null>(null);
  const backLightRef = useRef<THREE.PointLight | null>(null);
  const scanPlaneRef = useRef<THREE.Mesh | null>(null);
  const animStateRef = useRef({
    autoSpin: false,
    popProgress: 1,
    scanProgress: 2,
    modelHeight: 80,
  });

  useEffect(() => {
    animStateRef.current.autoSpin = autoSpin;
  }, [autoSpin]);

  // Initialize Three.js Studio Scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.5,
      2500
    );
    camera.position.set(135, 115, 165);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 45, 0);
    controls.maxPolarAngle = Math.PI * 0.495; // stay above floor
    controls.minDistance = 25;
    controls.maxDistance = 850;
    controlsRef.current = controls;

    // Motion-graphics Studio 3-Point Lighting Rig
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
    keyLight.position.set(120, 210, 140);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 20;
    keyLight.shadow.camera.far = 650;
    const d = 170;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const cyanRim = new THREE.DirectionalLight(0x00f0ff, 1.1);
    cyanRim.position.set(-160, 110, -110);
    scene.add(cyanRim);

    const magentaFill = new THREE.DirectionalLight(0xff3b8b, 0.65);
    magentaFill.position.set(140, 50, -150);
    scene.add(magentaFill);

    // Warm Backlight Lamp for Lithophane Preview Mode
    const backLight = new THREE.PointLight(0xffe7a8, 0, 260, 1.3);
    backLight.position.set(0, 50, -35);
    scene.add(backLight);
    backLightRef.current = backLight;

    // Shadow-receiving dark studio floor
    const floorGeo = new THREE.PlaneGeometry(1400, 1400);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.38 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    scene.add(floor);

    // Subtle Floating Ambient Starfield Particles (Motion Graphics depth)
    const starCount = 160;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 650;
      starPos[i * 3 + 1] = 15 + Math.random() * 280;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 650;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 1.6,
      transparent: true,
      opacity: 0.32,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Printer Build Plate Group
    const bedGroup = new THREE.Group();
    scene.add(bedGroup);
    bedGroupRef.current = bedGroup;

    // Model Group (for spring pop-in & turntable rotation)
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Kinetic Laser Scan Sweep Ring (animates vertically across newly generated meshes!)
    const scanGeo = new THREE.RingGeometry(42, 46, 64);
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const scanPlane = new THREE.Mesh(scanGeo, scanMat);
    scanPlane.rotation.x = -Math.PI / 2;
    scene.add(scanPlane);
    scanPlaneRef.current = scanPlane;

    // Resize observer
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // Animation loop
    let raf = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());

      // Gentle ambient particle drift
      stars.rotation.y += dt * 0.015;

      // Turntable auto-spin
      if (animStateRef.current.autoSpin && modelGroupRef.current) {
        modelGroupRef.current.rotation.y += dt * 0.65;
      }

      // Spring pop-in morph animation on new geometry
      if (animStateRef.current.popProgress < 1 && modelGroupRef.current) {
        animStateRef.current.popProgress = Math.min(
          1,
          animStateRef.current.popProgress + dt * 3.1
        );
        const t = animStateRef.current.popProgress;
        // Elastic overshoot ease-out
        const elastic =
          t === 1
            ? 1
            : 1 + Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) * 0.14;
        const s = Math.max(0.01, elastic);
        modelGroupRef.current.scale.set(s, s, s);
      }

      // Laser scanline sweep across model
      if (animStateRef.current.scanProgress < 1.15 && scanPlaneRef.current) {
        animStateRef.current.scanProgress += dt * 1.45;
        const p = animStateRef.current.scanProgress;
        const h = animStateRef.current.modelHeight;
        scanPlaneRef.current.position.y = Math.min(h + 6, p * (h + 6));
        const mat = scanPlaneRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = p < 1 ? Math.sin(p * Math.PI) * 0.85 : 0;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild Holographic Printer Build Plate when printer or bounds fit changes
  useEffect(() => {
    const bedGroup = bedGroupRef.current;
    if (!bedGroup) return;

    while (bedGroup.children.length > 0) {
      const child = bedGroup.children.pop()!;
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
      }
    }

    const w = printer.bedWidthMm;
    const d = printer.bedDepthMm;
    const h = printer.bedHeightMm;
    const outOfBounds = diagnostics ? !diagnostics.fitsBuildPlate : false;
    const accentHex = outOfBounds
      ? 0xff3b5c
      : new THREE.Color(printer.accent).getHex();

    // Translucent glass build plate base
    const plateGeo = new THREE.BoxGeometry(w, 1.8, d);
    const plateMat = new THREE.MeshPhysicalMaterial({
      color: printer.type === 'SLA' ? 0x131129 : 0x0e1526,
      roughness: 0.25,
      metalness: 0.35,
      transparent: true,
      opacity: 0.88,
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.y = -0.95;
    plateMesh.receiveShadow = true;
    bedGroup.add(plateMesh);

    // Millimeter grid lines (10mm spacing)
    const gridPoints: number[] = [];
    const halfW = w / 2;
    const halfD = d / 2;
    for (let x = -halfW; x <= halfW + 0.01; x += 10) {
      gridPoints.push(x, 0.04, -halfD, x, 0.04, halfD);
    }
    for (let z = -halfD; z <= halfD + 0.01; z += 10) {
      gridPoints.push(-halfW, 0.04, z, halfW, 0.04, z);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
    const gridMat = new THREE.LineBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.22,
    });
    bedGroup.add(new THREE.LineSegments(gridGeo, gridMat));

    // Glowing Perimeter Border
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.4, d));
    const borderMat = new THREE.LineBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: outOfBounds ? 0.95 : 0.72,
    });
    const borderLines = new THREE.LineSegments(borderGeo, borderMat);
    borderLines.position.y = 0.1;
    bedGroup.add(borderLines);

    // Front Indicator Chevron ("FRONT" direction of printer bed)
    const arrowShape = new THREE.BufferGeometry();
    const aPts = new Float32Array([
      -10, 0.12, halfD + 5,
      0, 0.12, halfD + 13,
      0, 0.12, halfD + 13,
      10, 0.12, halfD + 5,
    ]);
    arrowShape.setAttribute('position', new THREE.BufferAttribute(aPts, 3));
    bedGroup.add(
      new THREE.LineSegments(
        arrowShape,
        new THREE.LineBasicMaterial({ color: accentHex, transparent: true, opacity: 0.8 })
      )
    );

    // Optional Full Build Volume Wireframe Cage
    if (showBuildVolume) {
      const volGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
      const volMat = new THREE.LineBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: outOfBounds ? 0.55 : 0.13,
      });
      const volWire = new THREE.LineSegments(volGeo, volMat);
      volWire.position.y = h / 2;
      bedGroup.add(volWire);
    }
  }, [printer, showBuildVolume, diagnostics?.fitsBuildPlate]);

  // Create Three.js Material based on active MaterialPreset
  const createActiveMaterial = (preset: MaterialPreset): THREE.Material => {
    switch (preset) {
      case 'silk-pla':
        return new THREE.MeshPhysicalMaterial({
          color: 0x7dd3fc,
          roughness: 0.22,
          metalness: 0.28,
          clearcoat: 0.75,
          clearcoatRoughness: 0.18,
          sheen: 0.65,
          sheenColor: new THREE.Color(0xc084fc),
        });
      case 'matte-clay':
        return new THREE.MeshStandardMaterial({
          color: 0xdca57c,
          roughness: 0.78,
          metalness: 0.04,
        });
      case 'translucent-resin':
        return new THREE.MeshPhysicalMaterial({
          color: 0x2dd4bf,
          roughness: 0.14,
          metalness: 0.05,
          transmission: 0.42,
          thickness: 12,
          ior: 1.48,
          clearcoat: 0.9,
        });
      case 'metallic-bronze':
        return new THREE.MeshStandardMaterial({
          color: 0xd99b43,
          roughness: 0.26,
          metalness: 0.88,
        });
      case 'lithophane-glow':
        return new THREE.MeshPhysicalMaterial({
          color: 0xfff8e7,
          emissive: 0xffd584,
          emissiveIntensity: 0.22,
          roughness: 0.42,
          metalness: 0.0,
          transmission: 0.52,
          thickness: 3.5,
          ior: 1.46,
        });
      case 'overhang-heatmap':
        return new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.45,
          metalness: 0.08,
        });
      case 'xray-hollow':
        return new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          roughness: 0.2,
          metalness: 0.1,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        });
      case 'wireframe':
        return new THREE.MeshBasicMaterial({
          color: 0x00f0ff,
          wireframe: true,
        });
    }
  };

  // Mount & animate updated 3D Geometry + Inner Cavity
  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) return;

    if (mainMeshRef.current) {
      modelGroup.remove(mainMeshRef.current);
      if (Array.isArray(mainMeshRef.current.material)) {
        mainMeshRef.current.material.forEach((m) => m.dispose());
      } else {
        mainMeshRef.current.material.dispose();
      }
      mainMeshRef.current = null;
    }

    if (cavityMeshRef.current) {
      modelGroup.remove(cavityMeshRef.current);
      if (Array.isArray(cavityMeshRef.current.material)) {
        cavityMeshRef.current.material.forEach((m) => m.dispose());
      } else {
        cavityMeshRef.current.material.dispose();
      }
      cavityMeshRef.current = null;
    }

    if (!geometry) return;

    const mat = createActiveMaterial(materialPreset);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = materialPreset !== 'xray-hollow' && materialPreset !== 'wireframe';
    mesh.receiveShadow = true;
    modelGroup.add(mesh);
    mainMeshRef.current = mesh;

    if (innerCavityGeometry) {
      const cavityMat = new THREE.MeshStandardMaterial({
        color: 0xff3b8b,
        emissive: 0xff3b8b,
        emissiveIntensity: materialPreset === 'xray-hollow' ? 0.6 : 0.15,
        roughness: 0.4,
        side: THREE.DoubleSide,
        transparent: materialPreset !== 'xray-hollow',
        opacity: materialPreset === 'xray-hollow' ? 0.82 : 0.0,
      });
      const cavityMesh = new THREE.Mesh(innerCavityGeometry, cavityMat);
      modelGroup.add(cavityMesh);
      cavityMeshRef.current = cavityMesh;
    }

    // Update backlight intensity for Lithophane Glow mode
    if (backLightRef.current) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const h = box.max.y - box.min.y;
      backLightRef.current.position.set(0, h * 0.5, -Math.max(22, (box.max.z - box.min.z) * 1.4));
      backLightRef.current.intensity = materialPreset === 'lithophane-glow' ? 950 : 0;
      animStateRef.current.modelHeight = h;

      // Resize laser scan ring to hug the model footprint
      if (scanPlaneRef.current) {
        const radius = Math.max(20, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.65);
        scanPlaneRef.current.geometry.dispose();
        scanPlaneRef.current.geometry = new THREE.RingGeometry(radius, radius + 3.2, 64);
      }
    }
  }, [geometry, innerCavityGeometry, materialPreset]);

  // Trigger playful morph pop & laser scanline when meshVersion increments
  useEffect(() => {
    if (meshVersion > 0) {
      animStateRef.current.popProgress = 0.05;
      animStateRef.current.scanProgress = 0;
    }
  }, [meshVersion]);

  const jumpCamera = (preset: CameraPreset) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    setActiveCam(preset);

    const h = diagnostics?.sizeYMm ?? 80;
    const maxDim = Math.max(
      diagnostics?.sizeXMm ?? 80,
      h,
      diagnostics?.sizeZMm ?? 80,
      70
    );
    const dist = maxDim * 2.1;
    const targetY = h * 0.48;
    ctrl.target.set(0, targetY, 0);

    switch (preset) {
      case 'front':
        cam.position.set(0, targetY, dist);
        break;
      case 'back':
        cam.position.set(0, targetY, -dist);
        break;
      case 'side':
        cam.position.set(dist, targetY, 0);
        break;
      case 'top':
        cam.position.set(0.01, dist * 1.15, 0.01);
        break;
      case 'iso':
      default:
        cam.position.set(dist * 0.72, targetY + dist * 0.48, dist * 0.85);
        break;
    }
    ctrl.update();
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_50%_38%,_rgba(24,38,76,0.58)_0%,_rgba(7,9,17,1)_72%)]">
      {/* Ambient Animated Aurora Glows */}
      <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-[#00F0FF]/10 blur-[110px] animate-aurora" />
      <div
        className="pointer-events-none absolute -right-24 bottom-16 h-80 w-80 rounded-full bg-[#FF3B8B]/10 blur-[110px] animate-aurora"
        style={{ animationDelay: '-5s' }}
      />

      {/* WebGL Canvas Container */}
      <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating HUD Stack (Material + Camera + Contextual Notice — Zero Overlap) */}
      <div className="pointer-events-none absolute left-3.5 right-3.5 top-3 z-20 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto studio-glass flex flex-wrap items-center gap-1 rounded-xl p-1">
            {MATERIAL_PILLS.map((m) => {
              const active = materialPreset === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onMaterialChange(m.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-white/15 text-white shadow-[0_0_12px_rgba(0,240,255,0.22)]'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: m.dot,
                      boxShadow: active ? `0 0 8px ${m.dot}` : 'none',
                    }}
                  />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Camera & Stage Toggles */}
          <div className="pointer-events-auto studio-glass flex items-center gap-1 rounded-xl p-1">
            {(['iso', 'front', 'side', 'back', 'top'] as CameraPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => jumpCamera(p)}
                className={`rounded-lg px-2 py-1 font-mono-tech text-[10px] font-semibold uppercase transition cursor-pointer ${
                  activeCam === p
                    ? 'bg-[#00F0FF]/20 text-[#00F0FF]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
            <div className="mx-0.5 h-4 w-[1px] bg-white/10" />
            <button
              onClick={() => setAutoSpin((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition cursor-pointer ${
                autoSpin
                  ? 'bg-[#B8FF2C]/20 text-[#B8FF2C]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              title="Toggle 360° Turntable Spin"
            >
              <RotateCw className={`h-3 w-3 ${autoSpin ? 'animate-spin' : ''}`} />
              <span>Spin</span>
            </button>
            <button
              onClick={() => setShowBuildVolume((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition cursor-pointer ${
                showBuildVolume
                  ? 'bg-[#00F0FF]/15 text-[#00F0FF]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              title="Toggle Printer Build Volume Cage"
            >
              <Grid3X3 className="h-3 w-3" />
            </button>
            <button
              onClick={() => jumpCamera('iso')}
              className="flex items-center rounded-lg px-1.5 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white cursor-pointer"
              title="Reframe Camera"
            >
              <Focus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Live Contextual Inspector Banner (flows cleanly beneath toolbar) */}
        <AnimatePresence>
          {materialPreset === 'overhang-heatmap' && (
            <motion.div
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className="studio-glass pointer-events-auto self-start flex items-center gap-3 rounded-xl px-3 py-1.5 text-[11px]"
            >
              <Flame className="h-3.5 w-3.5 text-[#FF3B8B]" />
              <span className="font-semibold text-white">Overhang Inspector:</span>
              <span className="flex items-center gap-1 text-teal-300">
                <span className="h-2 w-2 rounded-full bg-teal-400" /> Safe
              </span>
              <span className="flex items-center gap-1 text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Caution
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Needs Supports
              </span>
            </motion.div>
          )}

          {materialPreset === 'lithophane-glow' && (
            <motion.div
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className="studio-glass pointer-events-auto self-start flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11px] text-amber-200"
            >
              <Sun className="h-3.5 w-3.5 text-amber-300" />
              <span>Virtual Warm Lamp active behind Lithophane — orbit to inspect light transmission!</span>
            </motion.div>
          )}

          {materialPreset === 'xray-hollow' && (
            <motion.div
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className="studio-glass pointer-events-auto self-start flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11px] text-purple-200"
            >
              <Eye className="h-3.5 w-3.5 text-[#FF3B8B]" />
              <span>
                {innerCavityGeometry
                  ? 'Showing pink internal hollow shell & underside resin drain tunnels.'
                  : 'Enable Resin Hollowing in the right panel to inspect the internal cavity.'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom-Left Live Dimensions & Printer HUD (positioned cleanly above Mode Dock) */}
      {diagnostics && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="studio-glass pointer-events-none absolute bottom-[78px] left-3.5 z-20 flex items-center gap-2.5 rounded-xl px-3 py-1.5 font-mono-tech text-[11px]"
        >
          <Layers className="h-3.5 w-3.5 text-[#00F0FF]" />
          <div className="flex items-center gap-2.5 text-slate-300">
            <span>
              W <strong className="text-white">{diagnostics.sizeXMm.toFixed(1)}</strong>mm
            </span>
            <span className="text-slate-600">×</span>
            <span>
              H <strong className="text-[#00F0FF]">{diagnostics.sizeYMm.toFixed(1)}</strong>mm
            </span>
            <span className="text-slate-600">×</span>
            <span>
              D <strong className="text-white">{diagnostics.sizeZMm.toFixed(1)}</strong>mm
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              {(diagnostics.triangleCount / 1000).toFixed(1)}k tris
            </span>
          </div>
        </motion.div>
      )}

      {/* Animated Kinetic Scanning Overlay during AI / Heavy Mesh Sculpting */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-[#070911]/65 backdrop-blur-sm"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#00F0FF]/35 via-[#00F0FF]/10 to-transparent animate-scan-beam" />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="studio-glass flex flex-col items-center gap-3 rounded-2xl border border-[#00F0FF]/40 px-7 py-5 text-center shadow-[0_0_40px_rgba(0,240,255,0.25)]"
            >
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00F0FF]/15">
                <Wand2 className="h-6 w-6 animate-bounce text-[#00F0FF]" />
              </div>
              <div className="text-sm font-bold text-white">{generationLabel}</div>
              <div className="font-mono-tech text-[11px] text-[#00F0FF]">
                FORGING WATERTIGHT PRINTABLE GEOMETRY...
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'framer-motion';
import { UploadCloud } from 'lucide-react';
import {
  AIProviderConfig,
  BaseConfig,
  GenerationMode,
  ImagePrepSettings,
  LithophaneSettings,
  MaterialPreset,
  MeshDiagnostics,
  PrinterPreset,
  PrintPrepSettings,
  PuffSettings,
  ReliefSettings,
  StandeeSettings,
  StudioToast,
} from './types/studio';
import { PRINTER_PRESETS } from './data/printers';
import { getSampleCharacters, SampleCharacter } from './data/sampleImages';
import { ProcessedImageData, processInputImage } from './engine/imageProcessor';
import {
  generateBasRelief,
  generateLithophane,
  generatePuffFigurine,
  generateStandee,
} from './engine/meshGenerators';
import { preparePrintMesh } from './engine/printPrep';
import {
  build3MFArchive,
  buildBinarySTL,
  buildGLBBytes,
  buildOBJBytes,
  saveExportedBytes,
} from './engine/exporters';
import { parseMeshBytes, runAI360Generation } from './engine/aiBridge';
import { TitleBar } from './components/TitleBar';
import { LeftPanel } from './components/LeftPanel';
import { Viewport3D } from './components/Viewport3D';
import { RightPanel } from './components/RightPanel';
import { ModeDock } from './components/ModeDock';
import { ToastBurst } from './components/ToastBurst';

const DEFAULT_IMAGE_PREP: ImagePrepSettings = {
  removeBackground: true,
  bgTolerance: 28,
  bgEdgeFeather: 1,
  invertDepth: false,
  contrast: 1.25,
  depthGamma: 0.95,
  detailBlur: 2,
  foregroundBoost: 0.65,
};

const DEFAULT_PUFF: PuffSettings = {
  resolution: 148,
  puffDepthMm: 24,
  profileRoundness: 0.52,
  detailReliefMm: 2.6,
  doubleSided: true,
  mirrorBackDetail: true,
  contourSmoothPasses: 6,
};

const DEFAULT_RELIEF: ReliefSettings = {
  resolution: 168,
  reliefDepthMm: 8.5,
  baseThicknessMm: 4.0,
  frameShape: 'circle',
  borderHeightMm: 4.5,
  borderWidthPct: 6,
};

const DEFAULT_LITHOPHANE: LithophaneSettings = {
  resolution: 168,
  minThicknessMm: 0.8,
  maxThicknessMm: 3.2,
  curved: true,
  curveAngleDeg: 110,
  frameThicknessMm: 3.8,
  frameWidthMm: 3.5,
};

const DEFAULT_STANDEE: StandeeSettings = {
  resolution: 144,
  thicknessMm: 7.5,
  bevelMm: 1.4,
  detailEmbossMm: 1.4,
  keychainHole: false,
  keychainHoleDiaMm: 4.5,
  contourSmoothPasses: 6,
};

const DEFAULT_BASE: BaseConfig = {
  style: 'round-plinth',
  diameterScale: 1.12,
  heightMm: 7.5,
  sinkMm: 2.0,
  bevelRatio: 0.2,
};

const DEFAULT_PREP: PrintPrepSettings = {
  targetHeightMm: 95,
  rotationXDeg: 0,
  rotationYDeg: 0,
  rotationZDeg: 0,
  flattenBottomMm: 0,
  smoothIterations: 1,
  overhangAngleDeg: 45,
  hollowEnabled: false,
  hollowWallMm: 2.2,
  drainHoleCount: 2,
  drainHoleDiaMm: 4.0,
  autoRepairOnBuild: true,
};

const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'hf-hunyuan3d',
  hfToken: '',
  customSpaceId: 'tencent/Hunyuan3D-2',
  meshyApiKey: '',
  tripoApiKey: '',
  localUrl: 'http://127.0.0.1:8765',
  resolution: 256,
  seed: 42,
};

export function App() {
  const samples = useMemo(() => getSampleCharacters(), []);

  // Core input & mode state
  const [mode, setMode] = useState<GenerationMode>('puff');
  const [projectName, setProjectName] = useState<string>('Cyber_Cat_Figurine');
  const [sourceImageUrl, setSourceImageUrl] = useState<string>(samples[0].dataUrl);
  const [activeSampleId, setActiveSampleId] = useState<string | null>(samples[0].id);
  const [processedImg, setProcessedImg] = useState<ProcessedImageData | null>(null);

  // Sculpting & Print-Prep settings
  const [imagePrep, setImagePrep] = useState<ImagePrepSettings>(DEFAULT_IMAGE_PREP);
  const [puff, setPuff] = useState<PuffSettings>(DEFAULT_PUFF);
  const [relief, setRelief] = useState<ReliefSettings>(DEFAULT_RELIEF);
  const [lithophane, setLithophane] = useState<LithophaneSettings>(DEFAULT_LITHOPHANE);
  const [standee, setStandee] = useState<StandeeSettings>(DEFAULT_STANDEE);
  const [printer, setPrinter] = useState<PrinterPreset>(PRINTER_PRESETS[0]);
  const [base, setBase] = useState<BaseConfig>(DEFAULT_BASE);
  const [prep, setPrep] = useState<PrintPrepSettings>(DEFAULT_PREP);
  const [materialPreset, setMaterialPreset] = useState<MaterialPreset>('silk-pla');
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(DEFAULT_AI_CONFIG);

  // Active 3D Geometry state
  const [rawGeometry, setRawGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [externalMesh, setExternalMesh] = useState<THREE.BufferGeometry | null>(null);
  const [preparedGeometry, setPreparedGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [innerCavityGeometry, setInnerCavityGeometry] =
    useState<THREE.BufferGeometry | null>(null);
  const [diagnostics, setDiagnostics] = useState<MeshDiagnostics | null>(null);
  const [meshVersion, setMeshVersion] = useState(0);

  // UI feedback states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLabel, setGenerationLabel] = useState('Sculpting 3D Mesh...');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ stage: string; progress: number } | null>(
    null
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toasts, setToasts] = useState<StudioToast[]>([]);

  const rawGeomRef = useRef<THREE.BufferGeometry | null>(null);
  const prepGeomRef = useRef<THREE.BufferGeometry | null>(null);
  const cavityGeomRef = useRef<THREE.BufferGeometry | null>(null);

  const pushToast = useCallback(
    (
      title: string,
      message: string,
      tone: StudioToast['tone'] = 'cyan',
      celebrate = false
    ) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, tone, celebrate }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4800);
    },
    []
  );

  // Subscribe to AI progress events from Electron Main
  useEffect(() => {
    const unsub = window.morphforge?.onAIStatus?.((status) => {
      setAiProgress(status);
      setGenerationLabel(status.stage);
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Load 2D image file (via picker, drag-drop, or clipboard paste)
  const loadImageFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSourceImageUrl(reader.result);
          setActiveSampleId(null);
          setExternalMesh(null);
          const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_');
          setProjectName(cleanName || 'Custom_Character');
          pushToast(
            '2D Photo Loaded!',
            `"${file.name}" is morphing into 3D right now.`,
            'cyan'
          );
        }
      };
      reader.readAsDataURL(file);
    },
    [pushToast]
  );

  // Global Ctrl+V Clipboard Paste support for instant workflow!
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            loadImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadImageFile]);

  // Step 1: Process 2D Image (Background cutout + Depth Map) whenever source or imagePrep changes
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await processInputImage(sourceImageUrl, imagePrep, 256);
        if (!cancelled) setProcessedImg(res);
      } catch (err) {
        console.error('Image processing failed:', err);
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sourceImageUrl, imagePrep]);

  // Step 2: Generate Raw 3D Geometry from Processed 2D Image (Offline modes) or use AI 360° / Imported Mesh
  useEffect(() => {
    if (mode === 'ai360') {
      if (externalMesh) {
        setRawGeometry(externalMesh);
      }
      return;
    }
    if (!processedImg) return;

    const timer = setTimeout(() => {
      try {
        let g: THREE.BufferGeometry;
        if (mode === 'puff') {
          g = generatePuffFigurine(processedImg, puff);
        } else if (mode === 'relief') {
          g = generateBasRelief(processedImg, relief);
        } else if (mode === 'lithophane') {
          g = generateLithophane(processedImg, lithophane);
        } else {
          g = generateStandee(processedImg, standee);
        }

        if (rawGeomRef.current && rawGeomRef.current !== externalMesh) {
          rawGeomRef.current.dispose();
        }
        rawGeomRef.current = g;
        setRawGeometry(g);
      } catch (err) {
        console.error('Mesh generation error:', err);
      }
    }, 85);

    return () => clearTimeout(timer);
  }, [mode, processedImg, puff, relief, lithophane, standee, externalMesh]);

  // Step 3: Run Print Prep Pipeline (Scale mm, Rotate, Flatten, Taubin Smooth, Pedestal, Hollow, Diagnostics)
  useEffect(() => {
    if (!rawGeometry) return;

    const timer = setTimeout(() => {
      try {
        const result = preparePrintMesh(rawGeometry, prep, base, printer);
        if (prepGeomRef.current) prepGeomRef.current.dispose();
        if (cavityGeomRef.current) cavityGeomRef.current.dispose();

        prepGeomRef.current = result.geometry;
        cavityGeomRef.current = result.innerCavityGeometry;

        setPreparedGeometry(result.geometry);
        setInnerCavityGeometry(result.innerCavityGeometry);
        setDiagnostics(result.diagnostics);
        setMeshVersion((v) => v + 1);
      } catch (err) {
        console.error('Print prep error:', err);
      }
    }, 55);

    return () => clearTimeout(timer);
  }, [rawGeometry, prep, base, printer]);

  // Smart Mode Switcher (sets ideal material & base defaults so each mode shines!)
  const handleModeChange = (nextMode: GenerationMode) => {
    setMode(nextMode);
    if (nextMode === 'lithophane') {
      setMaterialPreset('lithophane-glow');
      setBase((b) => ({ ...b, style: 'none' }));
      setPrep((p) => ({ ...p, smoothIterations: 0, flattenBottomMm: 0 }));
    } else if (nextMode === 'relief') {
      setMaterialPreset('metallic-bronze');
      setBase((b) => ({ ...b, style: 'none' }));
      setPrep((p) => ({ ...p, smoothIterations: 1 }));
    } else if (nextMode === 'standee') {
      setMaterialPreset('silk-pla');
      setBase((b) => ({ ...b, style: standee.keychainHole ? 'none' : 'beveled-coin' }));
    } else if (nextMode === 'puff') {
      setMaterialPreset('silk-pla');
      setBase((b) => ({ ...b, style: 'round-plinth' }));
    } else if (nextMode === 'ai360') {
      setMaterialPreset('matte-clay');
    }
  };

  const handleSelectSample = (sample: SampleCharacter) => {
    setActiveSampleId(sample.id);
    setSourceImageUrl(sample.dataUrl);
    setProjectName(sample.name.replace(/\s+/g, '_'));
    setExternalMesh(null);
    if (mode === 'ai360') {
      handleModeChange(sample.recommendedMode);
    } else if (sample.recommendedMode === 'relief' && mode === 'puff') {
      handleModeChange('relief');
    }
  };

  // Switch Printer preset & sync overhang threshold
  const handlePrinterChange = (next: PrinterPreset) => {
    setPrinter(next);
    setPrep((p) => ({ ...p, overhangAngleDeg: next.defaultOverhangDeg }));
    pushToast(
      `Printer Bed: ${next.brand} ${next.name}`,
      `${next.type} build volume ${next.bedWidthMm}×${next.bedDepthMm}×${next.bedHeightMm}mm active.`,
      'cyan'
    );
  };

  // Trigger 360° AI Generation
  const handleTriggerAI360 = async () => {
    if (!processedImg) return;
    setAiBusy(true);
    setIsGenerating(true);
    setGenerationLabel('Connecting to 360° AI Engine...');
    setAiProgress({ stage: 'Preparing cutout image...', progress: 8 });

    try {
      const mesh = await runAI360Generation(processedImg.cleanPngBase64, aiConfig);
      setExternalMesh(mesh);
      setRawGeometry(mesh);
      setMaterialPreset('matte-clay');
      setBase((b) => ({ ...b, style: 'round-plinth' }));
      pushToast(
        '360° AI Statue Summoned!',
        'Your character is now in the Print Prep Studio — add a base, check overhangs & export!',
        'pink',
        true
      );
    } catch (err) {
      pushToast(
        'AI 360° Generation Notice',
        err instanceof Error ? err.message : String(err),
        'amber'
      );
    } finally {
      setAiBusy(false);
      setIsGenerating(false);
      setAiProgress(null);
    }
  };

  // Import external .GLB / .OBJ / .STL into Print Prep Studio
  const handleImportMesh = async () => {
    if (!window.morphforge?.openMeshFile) {
      pushToast('Desktop Feature', 'Import dialog works in the Desktop App.', 'amber');
      return;
    }
    try {
      const res = await window.morphforge.openMeshFile();
      if (res.canceled || !res.data || !res.ext) return;
      setIsGenerating(true);
      setGenerationLabel(`Importing ${res.fileName}...`);
      const geom = await parseMeshBytes(new Uint8Array(res.data), res.ext);
      setExternalMesh(geom);
      setMode('ai360');
      setRawGeometry(geom);
      setProjectName((res.fileName || 'Imported_Model').replace(/\.[^.]+$/, ''));
      pushToast(
        '3D Model Imported!',
        `"${res.fileName}" repaired and placed onto your build plate.`,
        'lime',
        true
      );
    } catch (err) {
      pushToast(
        'Import Failed',
        err instanceof Error ? err.message : String(err),
        'amber'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // One-Click Auto-Repair & Fit Build Plate
  const handleAutoFixAll = () => {
    const maxSafeHeight = Math.min(
      prep.targetHeightMm,
      Math.floor(printer.bedHeightMm * 0.85)
    );
    setPrep((p) => ({
      ...p,
      autoRepairOnBuild: true,
      targetHeightMm: maxSafeHeight,
      flattenBottomMm: base.style === 'none' && p.flattenBottomMm === 0 ? 1.5 : p.flattenBottomMm,
    }));
    pushToast(
      'Auto-Repair Applied!',
      'Vertices welded, outward normals verified, bottom stabilized, and fitted to build volume.',
      'lime',
      true
    );
  };

  // Multi-Format Slicer Export (.STL, .3MF, .OBJ, .GLB)
  const handleExport = async (format: 'stl' | '3mf' | 'obj' | 'glb') => {
    if (!preparedGeometry) return;
    setIsExporting(true);
    try {
      let bytes: Uint8Array;
      let filterName = '3D Printable File';

      if (format === 'stl') {
        bytes = buildBinarySTL(preparedGeometry, innerCavityGeometry);
        filterName = 'STL 3D Print Mesh';
      } else if (format === '3mf') {
        bytes = await build3MFArchive(preparedGeometry, innerCavityGeometry, projectName);
        filterName = '3MF Manufacturing Package';
      } else if (format === 'obj') {
        bytes = buildOBJBytes(preparedGeometry, innerCavityGeometry, projectName);
        filterName = 'Wavefront OBJ Mesh';
      } else {
        bytes = await buildGLBBytes(preparedGeometry, innerCavityGeometry);
        filterName = 'glTF Binary GLB';
      }

      const fileStem = `${projectName}_${mode}_${Math.round(diagnostics?.sizeYMm ?? prep.targetHeightMm)}mm`;
      const result = await saveExportedBytes(bytes, fileStem, format, filterName);

      if (result.success) {
        const kb = ((result.bytes ?? bytes.byteLength) / 1024).toFixed(0);
        pushToast(
          `Exported .${format.toUpperCase()} — Print Ready!`,
          `Saved ${kb} KB (Z-Up, mm scale). Drag straight into Bambu Studio, Cura, PrusaSlicer, or Chitubox!`,
          'lime',
          true
        );
      } else if (!result.canceled) {
        pushToast('Export Error', result.error || 'Could not save file.', 'amber');
      }
    } catch (err) {
      pushToast(
        'Export Error',
        err instanceof Error ? err.message : String(err),
        'amber'
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Drag & Drop anywhere on window
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      loadImageFile(file);
    } else if (/\.(glb|gltf|obj|stl)$/i.test(file.name)) {
      file.arrayBuffer().then(async (ab) => {
        try {
          const ext = file.name.split('.').pop() || 'glb';
          const geom = await parseMeshBytes(new Uint8Array(ab), ext);
          setExternalMesh(geom);
          setMode('ai360');
          setRawGeometry(geom);
          setProjectName(file.name.replace(/\.[^.]+$/, ''));
          pushToast('3D Mesh Dropped!', `"${file.name}" loaded into Print Prep Studio.`, 'lime', true);
        } catch (err) {
          pushToast('Mesh Error', String(err), 'amber');
        }
      });
    }
  };

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#070911]"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingFile) setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingFile(false);
      }}
      onDrop={handleDrop}
    >
      {/* Top Custom Kinetic Titlebar */}
      <TitleBar
        projectName={projectName}
        onImportMesh={handleImportMesh}
        onQuickExportSTL={() => handleExport('stl')}
        isExporting={isExporting}
        isWatertight={diagnostics?.isWatertight ?? true}
      />

      {/* Main 3-Column Interactive Studio */}
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <LeftPanel
          mode={mode}
          samples={samples}
          activeSampleId={activeSampleId}
          onSelectSample={handleSelectSample}
          onUploadFile={loadImageFile}
          processedImg={processedImg}
          imagePrep={imagePrep}
          onImagePrepChange={(patch) =>
            setImagePrep((prev) => ({ ...prev, ...patch }))
          }
          puff={puff}
          onPuffChange={(patch) => setPuff((prev) => ({ ...prev, ...patch }))}
          relief={relief}
          onReliefChange={(patch) => setRelief((prev) => ({ ...prev, ...patch }))}
          lithophane={lithophane}
          onLithophaneChange={(patch) =>
            setLithophane((prev) => ({ ...prev, ...patch }))
          }
          standee={standee}
          onStandeeChange={(patch) =>
            setStandee((prev) => ({ ...prev, ...patch }))
          }
          aiConfig={aiConfig}
          onAIConfigChange={(patch) =>
            setAiConfig((prev) => ({ ...prev, ...patch }))
          }
          onTriggerAI360={handleTriggerAI360}
          aiBusy={aiBusy}
          aiProgress={aiProgress}
        />

        {/* Center Interactive 3D Viewport + Floating Mode Dock */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Viewport3D
            geometry={preparedGeometry}
            innerCavityGeometry={innerCavityGeometry}
            printer={printer}
            materialPreset={materialPreset}
            onMaterialChange={setMaterialPreset}
            diagnostics={diagnostics}
            isGenerating={isGenerating}
            generationLabel={generationLabel}
            meshVersion={meshVersion}
          />
          <ModeDock mode={mode} onChange={handleModeChange} />
        </div>

        <RightPanel
          printer={printer}
          onPrinterChange={handlePrinterChange}
          prep={prep}
          onPrepChange={(patch) => setPrep((prev) => ({ ...prev, ...patch }))}
          base={base}
          onBaseChange={(patch) => setBase((prev) => ({ ...prev, ...patch }))}
          diagnostics={diagnostics}
          materialPreset={materialPreset}
          onMaterialChange={setMaterialPreset}
          onAutoFixAll={handleAutoFixAll}
          onResetTransform={() =>
            setPrep((p) => ({
              ...p,
              rotationXDeg: 0,
              rotationYDeg: 0,
              rotationZDeg: 0,
              flattenBottomMm: 0,
            }))
          }
          onExport={handleExport}
          isExporting={isExporting}
        />
      </main>

      {/* Celebratory Toasts */}
      <ToastBurst
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* Full-Window Drag-and-Drop Overlay */}
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#070911]/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-[#00F0FF] bg-[#0B1224]/90 px-12 py-10 text-center shadow-[0_0_60px_rgba(0,240,255,0.3)]"
            >
              <UploadCloud className="h-14 w-14 text-[#00F0FF]" />
              <div className="text-xl font-bold text-white">
                Drop Your 2D Photo or 3D Mesh Anywhere!
              </div>
              <div className="font-mono-tech text-xs text-slate-300">
                Supports PNG, JPG, WEBP — or GLB, OBJ, STL for direct Print Prep
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;

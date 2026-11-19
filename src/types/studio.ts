export type GenerationMode =
  | 'puff'
  | 'relief'
  | 'lithophane'
  | 'standee'
  | 'ai360';

export type PrinterType = 'FDM' | 'SLA';

export interface PrinterPreset {
  id: string;
  name: string;
  brand: string;
  type: PrinterType;
  bedWidthMm: number;  // X
  bedDepthMm: number;  // Z in Three.js (Y in slicer)
  bedHeightMm: number; // Y in Three.js (Z in slicer)
  defaultOverhangDeg: number;
  minWallMm: number;
  accent: string;
}

export type MaterialPreset =
  | 'silk-pla'
  | 'matte-clay'
  | 'translucent-resin'
  | 'metallic-bronze'
  | 'lithophane-glow'
  | 'overhang-heatmap'
  | 'xray-hollow'
  | 'wireframe';

export type BaseStyle =
  | 'none'
  | 'round-plinth'
  | 'hex-tabletop'
  | 'beveled-coin'
  | 'square-museum'
  | 'stepped-trophy';

export type ReliefFrameShape =
  | 'rectangle'
  | 'rounded'
  | 'circle'
  | 'hexagon'
  | 'shield';

export interface ImagePrepSettings {
  removeBackground: boolean;
  bgTolerance: number;      // 5 - 80
  bgEdgeFeather: number;    // 0 - 4
  invertDepth: boolean;
  contrast: number;         // 0.5 - 2.0
  depthGamma: number;       // 0.4 - 2.2
  detailBlur: number;       // 0 - 6
  foregroundBoost: number;  // 0 - 1
}

export interface PuffSettings {
  resolution: number;       // 96 - 220
  puffDepthMm: number;      // 6 - 40
  profileRoundness: number; // 0.35 - 0.85
  detailReliefMm: number;   // 0 - 5
  doubleSided: boolean;
  mirrorBackDetail: boolean;
  contourSmoothPasses: number; // 0 - 10
}

export interface ReliefSettings {
  resolution: number;       // 96 - 240
  reliefDepthMm: number;    // 2 - 20
  baseThicknessMm: number;  // 2 - 12
  frameShape: ReliefFrameShape;
  borderHeightMm: number;   // 0 - 8
  borderWidthPct: number;   // 0 - 15
}

export interface LithophaneSettings {
  resolution: number;       // 100 - 240
  minThicknessMm: number;   // 0.6 - 1.4
  maxThicknessMm: number;   // 2.2 - 4.8
  curved: boolean;
  curveAngleDeg: number;    // 30 - 180
  frameThicknessMm: number; // 0 - 5
  frameWidthMm: number;     // 0 - 8
}

export interface StandeeSettings {
  resolution: number;       // 96 - 200
  thicknessMm: number;      // 3 - 18
  bevelMm: number;          // 0 - 3
  detailEmbossMm: number;   // 0 - 3
  keychainHole: boolean;
  keychainHoleDiaMm: number;// 3 - 8
  contourSmoothPasses: number;
}

export interface BaseConfig {
  style: BaseStyle;
  diameterScale: number;    // 0.7 - 1.8 relative to footprint
  heightMm: number;         // 3 - 18
  sinkMm: number;           // 0.5 - 5 overlap into model for watertight union
  bevelRatio: number;       // 0.05 - 0.35
}

export interface PrintPrepSettings {
  targetHeightMm: number;   // 20 - 220
  rotationXDeg: number;     // -90 - 90
  rotationYDeg: number;     // -180 - 180
  rotationZDeg: number;     // -90 - 90
  flattenBottomMm: number;  // 0 - 15 plane cut from bottom
  smoothIterations: number; // 0 - 12 Taubin smoothing
  overhangAngleDeg: number; // 30 - 70
  hollowEnabled: boolean;
  hollowWallMm: number;     // 1.5 - 4.5
  drainHoleCount: number;   // 0 - 4
  drainHoleDiaMm: number;   // 2.5 - 8
  autoRepairOnBuild: boolean;
}

export interface MeshDiagnostics {
  vertexCount: number;
  triangleCount: number;
  sizeXMm: number;
  sizeYMm: number; // Height
  sizeZMm: number;
  volumeCm3: number;
  filamentGrams: number;   // ~1.24 g/cm3 * 35% effective infill+walls
  resinMl: number;         // volumeCm3 ml
  estimatedMinutes: number;
  openEdges: number;
  nonManifoldEdges: number;
  degenerateTriangles: number;
  isWatertight: boolean;
  overhangPercent: number;
  overhangTriangles: number;
  fitsBuildPlate: boolean;
  printabilityScore: number; // 0 - 100
  warnings: string[];
}

export type AIProviderId =
  | 'hf-hunyuan3d'
  | 'hf-trellis'
  | 'hf-triposr'
  | 'hf-custom'
  | 'meshy'
  | 'tripo3d'
  | 'local-rtx';

export interface AIProviderConfig {
  provider: AIProviderId;
  hfToken: string;
  customSpaceId: string;
  meshyApiKey: string;
  tripoApiKey: string;
  localUrl: string;
  resolution: number;
  seed: number;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
  bytes?: number;
}

export interface StudioToast {
  id: string;
  title: string;
  message: string;
  tone: 'cyan' | 'lime' | 'pink' | 'amber';
  celebrate?: boolean;
}

export type CameraPreset = 'iso' | 'front' | 'back' | 'side' | 'top';

import type { ExportResult } from './studio';

export interface MorphForgeBridge {
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (val: boolean) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  saveBinaryFile: (payload: {
    defaultName: string;
    extension: string;
    filterName: string;
    data: Uint8Array;
  }) => Promise<ExportResult>;
  openMeshFile: () => Promise<{
    canceled: boolean;
    fileName?: string;
    ext?: string;
    data?: Uint8Array;
  }>;
  checkLocalAI: (localUrl: string) => Promise<{
    online: boolean;
    device?: string;
    model?: string;
    vramGb?: number;
    detail?: string;
  }>;
  generateAI3D: (req: {
    provider: string;
    imageBase64: string;
    hfToken?: string;
    customSpaceId?: string;
    meshyApiKey?: string;
    tripoApiKey?: string;
    localUrl?: string;
    resolution?: number;
    seed?: number;
  }) => Promise<{
    success: boolean;
    ext?: string;
    data?: Uint8Array;
    error?: string;
  }>;
  onAIStatus: (cb: (status: { stage: string; progress: number }) => void) => () => void;
}

declare global {
  interface Window {
    morphforge?: MorphForgeBridge;
  }
}

export {};

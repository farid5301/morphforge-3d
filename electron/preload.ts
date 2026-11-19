import { contextBridge, ipcRenderer } from 'electron';

const api = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChange: (cb: (val: boolean) => void) => {
    const handler = (_evt: unknown, val: boolean) => cb(val);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  saveBinaryFile: (payload: {
    defaultName: string;
    extension: string;
    filterName: string;
    data: Uint8Array;
  }) => ipcRenderer.invoke('file:saveBinary', payload),
  openMeshFile: () => ipcRenderer.invoke('file:openMesh'),
  checkLocalAI: (localUrl: string) => ipcRenderer.invoke('ai:checkLocal', localUrl),
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
  }) => ipcRenderer.invoke('ai:generate3d', req),
  onAIStatus: (cb: (status: { stage: string; progress: number }) => void) => {
    const handler = (_evt: unknown, status: { stage: string; progress: number }) => cb(status);
    ipcRenderer.on('ai:status', handler);
    return () => ipcRenderer.removeListener('ai:status', handler);
  },
};

contextBridge.exposeInMainWorld('morphforge', api);

export type MorphForgeAPI = typeof api;

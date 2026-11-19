import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged && !!process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1180,
    minHeight: 740,
    backgroundColor: '#070911',
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window Controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('shell:openExternal', (_evt, url: string) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return shell.openExternal(url);
  }
  return Promise.resolve();
});

// Save binary file (STL, 3MF, OBJ, GLB)
ipcMain.handle(
  'file:saveBinary',
  async (
    _evt,
    payload: {
      defaultName: string;
      extension: string;
      filterName: string;
      data: Uint8Array;
    }
  ) => {
    if (!mainWindow) return { success: false, error: 'Window unavailable' };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Export ${payload.extension.toUpperCase()} for 3D Printing`,
      defaultPath: payload.defaultName,
      filters: [{ name: payload.filterName, extensions: [payload.extension] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    try {
      const buf = Buffer.from(payload.data);
      await fs.writeFile(result.filePath, buf);
      return { success: true, filePath: result.filePath, bytes: buf.byteLength };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

// Open external 3D mesh file (.glb, .obj, .stl)
ipcMain.handle('file:openMesh', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import 3D Model into Print Prep Studio',
    properties: ['openFile'],
    filters: [
      { name: '3D Models (GLB, OBJ, STL)', extensions: ['glb', 'gltf', 'obj', 'stl'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const filePath = result.filePaths[0];
  const bytes = await fs.readFile(filePath);
  return {
    canceled: false,
    fileName: path.basename(filePath),
    ext: path.extname(filePath).toLowerCase().replace('.', ''),
    data: new Uint8Array(bytes),
  };
});

// Helper: send AI status progress to renderer
function sendAIStatus(stage: string, progress: number) {
  mainWindow?.webContents.send('ai:status', { stage, progress });
}

// Helper: convert HF Space ID (e.g. "tencent/Hunyuan3D-2") to space base URL
function spaceIdToBaseUrl(spaceId: string): string {
  const trimmed = spaceId.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (trimmed.includes('.hf.space')) {
    return `https://${trimmed}`;
  }
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const slug = `${parts[0]}-${parts[1]}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `https://${slug}.hf.space`;
  }
  return `https://${trimmed}`;
}

function extractMeshUrlFromGradioOutput(data: unknown, baseUrl: string): string | null {
  const stack: unknown[] = [data];
  const meshExts = ['.glb', '.obj', '.stl', '.gltf'];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    if (typeof cur === 'string') {
      const lower = cur.toLowerCase();
      if (meshExts.some((e) => lower.includes(e))) {
        if (cur.startsWith('http://') || cur.startsWith('https://')) return cur;
        if (cur.startsWith('/')) return `${baseUrl}${cur}`;
        return `${baseUrl}/gradio_api/file=${encodeURIComponent(cur)}`;
      }
    } else if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
    } else if (typeof cur === 'object') {
      const rec = cur as Record<string, unknown>;
      if (typeof rec.url === 'string' && meshExts.some((e) => rec.url!.toString().toLowerCase().includes(e))) {
        return rec.url;
      }
      if (typeof rec.path === 'string' && meshExts.some((e) => rec.path!.toString().toLowerCase().includes(e))) {
        const p = rec.path;
        if (p.startsWith('http')) return p;
        return `${baseUrl}/gradio_api/file=${encodeURIComponent(p)}`;
      }
      for (const val of Object.values(rec)) stack.push(val);
    }
  }
  return null;
}

// Check Local RTX 5060 GPU Bridge Health
ipcMain.handle('ai:checkLocal', async (_evt, localUrl: string) => {
  try {
    const cleanUrl = localUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${cleanUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { online: false, detail: `HTTP ${res.status}` };
    const json = (await res.json()) as Record<string, unknown>;
    return {
      online: true,
      device: String(json.device ?? 'CUDA GPU'),
      model: String(json.model ?? 'Local 3D Engine'),
      vramGb: json.vram_gb,
    };
  } catch {
    return { online: false, detail: 'Local bridge not running on this port' };
  }
});

// Unified 360° AI Image-to-3D Generator (HF Spaces, Meshy, Tripo3D, Local RTX Bridge)
ipcMain.handle(
  'ai:generate3d',
  async (
    _evt,
    req: {
      provider: string;
      imageBase64: string; // raw PNG base64 (without data: prefix)
      hfToken?: string;
      customSpaceId?: string;
      meshyApiKey?: string;
      tripoApiKey?: string;
      localUrl?: string;
      resolution?: number;
      seed?: number;
    }
  ) => {
    try {
      const pngBuffer = Buffer.from(req.imageBase64, 'base64');

      // 1) LOCAL RTX 5060 GPU BRIDGE
      if (req.provider === 'local-rtx') {
        const base = (req.localUrl || 'http://127.0.0.1:8765').replace(/\/+$/, '');
        sendAIStatus('Sending character to Local RTX GPU Bridge...', 25);
        const res = await fetch(`${base}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: req.imageBase64,
            resolution: req.resolution ?? 256,
            seed: req.seed ?? 42,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Local GPU bridge error (${res.status}): ${text.slice(0, 200)}`);
        }
        sendAIStatus('Receiving 3D mesh from GPU...', 85);
        const ext = res.headers.get('x-mesh-format') || 'glb';
        const arrayBuf = await res.arrayBuffer();
        sendAIStatus('Loaded into Print Prep Studio!', 100);
        return { success: true, ext, data: new Uint8Array(arrayBuf) };
      }

      // 2) MESHY OFFICIAL API
      if (req.provider === 'meshy') {
        if (!req.meshyApiKey?.trim()) {
          throw new Error('Please enter your Meshy API key first.');
        }
        sendAIStatus('Submitting image to Meshy Image-to-3D...', 15);
        const submitRes = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${req.meshyApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: `data:image/png;base64,${req.imageBase64}`,
            enable_pbr: false,
            should_remesh: true,
            topology: 'triangle',
          }),
        });
        if (!submitRes.ok) {
          throw new Error(`Meshy API error (${submitRes.status}): ${await submitRes.text()}`);
        }
        const submitData = (await submitRes.json()) as { result: string };
        const taskId = submitData.result;

        for (let attempt = 0; attempt < 90; attempt++) {
          await new Promise((r) => setTimeout(r, 3000));
          const pollRes = await fetch(
            `https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`,
            { headers: { Authorization: `Bearer ${req.meshyApiKey.trim()}` } }
          );
          if (!pollRes.ok) continue;
          const task = (await pollRes.json()) as {
            status: string;
            progress?: number;
            model_urls?: { glb?: string; obj?: string };
            task_error?: { message?: string };
          };
          sendAIStatus(
            `Meshy sculpting 3D mesh (${task.status})...`,
            Math.min(92, Math.max(20, task.progress ?? 30 + attempt))
          );
          if (task.status === 'SUCCEEDED' && task.model_urls?.glb) {
            const meshRes = await fetch(task.model_urls.glb);
            const buf = await meshRes.arrayBuffer();
            sendAIStatus('360° mesh ready!', 100);
            return { success: true, ext: 'glb', data: new Uint8Array(buf) };
          }
          if (task.status === 'FAILED' || task.status === 'EXPIRED') {
            throw new Error(task.task_error?.message || `Meshy task ${task.status}`);
          }
        }
        throw new Error('Meshy generation timed out.');
      }

      // 3) TRIPO3D OFFICIAL API
      if (req.provider === 'tripo3d') {
        if (!req.tripoApiKey?.trim()) {
          throw new Error('Please enter your Tripo3D API key first.');
        }
        const headers = { Authorization: `Bearer ${req.tripoApiKey.trim()}` };
        sendAIStatus('Uploading photo to Tripo3D...', 15);
        const form = new FormData();
        form.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'input.png');
        const upRes = await fetch('https://api.tripo3d.ai/v2/openapi/upload', {
          method: 'POST',
          headers,
          body: form,
        });
        if (!upRes.ok) {
          throw new Error(`Tripo3D upload failed (${upRes.status}): ${await upRes.text()}`);
        }
        const upJson = (await upRes.json()) as { data?: { image_token?: string } };
        const imageToken = upJson.data?.image_token;
        if (!imageToken) throw new Error('Tripo3D did not return an image_token.');

        sendAIStatus('Starting Tripo3D 360° reconstruction...', 30);
        const taskRes = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'image_to_model',
            file: { type: 'png', file_token: imageToken },
          }),
        });
        if (!taskRes.ok) {
          throw new Error(`Tripo3D task failed (${taskRes.status}): ${await taskRes.text()}`);
        }
        const taskJson = (await taskRes.json()) as { data?: { task_id?: string } };
        const taskId = taskJson.data?.task_id;
        if (!taskId) throw new Error('Tripo3D did not return a task_id.');

        for (let attempt = 0; attempt < 90; attempt++) {
          await new Promise((r) => setTimeout(r, 2500));
          const pollRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
            headers,
          });
          if (!pollRes.ok) continue;
          const poll = (await pollRes.json()) as {
            data?: {
              status?: string;
              progress?: number;
              output?: { model?: string; pbr_model?: string };
            };
          };
          const status = poll.data?.status ?? 'running';
          sendAIStatus(
            `Tripo3D reconstructing (${status})...`,
            Math.min(92, Math.max(30, poll.data?.progress ?? 35 + attempt))
          );
          if (status === 'success') {
            const url = poll.data?.output?.model || poll.data?.output?.pbr_model;
            if (!url) throw new Error('Tripo3D finished without model URL.');
            const meshRes = await fetch(url);
            const buf = await meshRes.arrayBuffer();
            sendAIStatus('360° mesh ready!', 100);
            return { success: true, ext: 'glb', data: new Uint8Array(buf) };
          }
          if (status === 'failed' || status === 'cancelled') {
            throw new Error(`Tripo3D task ${status}.`);
          }
        }
        throw new Error('Tripo3D generation timed out.');
      }

      // 4) HUGGING FACE SPACES (Gradio REST/SSE API: Hunyuan3D-2, TRELLIS, TripoSR, or Custom)
      const spaceMap: Record<string, string> = {
        'hf-hunyuan3d': 'tencent/Hunyuan3D-2',
        'hf-trellis': 'JeffreyXiang/TRELLIS',
        'hf-triposr': 'stabilityai/TripoSR',
        'hf-custom': req.customSpaceId || 'tencent/Hunyuan3D-2',
      };
      const spaceId = spaceMap[req.provider] || 'tencent/Hunyuan3D-2';
      const baseUrl = spaceIdToBaseUrl(spaceId);
      const authHeaders: Record<string, string> = {};
      if (req.hfToken?.trim()) {
        authHeaders.Authorization = `Bearer ${req.hfToken.trim()}`;
      }

      sendAIStatus(`Connecting to Hugging Face Space (${spaceId})...`, 12);

      // Upload image to Gradio space
      const uploadForm = new FormData();
      uploadForm.append('files', new Blob([pngBuffer], { type: 'image/png' }), 'character.png');

      let apiPrefix = '/gradio_api';
      let uploadRes = await fetch(`${baseUrl}/gradio_api/upload`, {
        method: 'POST',
        headers: authHeaders,
        body: uploadForm,
      });
      if (!uploadRes.ok) {
        apiPrefix = '';
        const retryForm = new FormData();
        retryForm.append('files', new Blob([pngBuffer], { type: 'image/png' }), 'character.png');
        uploadRes = await fetch(`${baseUrl}/upload`, {
          method: 'POST',
          headers: authHeaders,
          body: retryForm,
        });
      }
      if (!uploadRes.ok) {
        throw new Error(
          `Space "${spaceId}" rejected upload (HTTP ${uploadRes.status}). The Space may be sleeping or rate-limited — try adding a free Hugging Face Token or switch to Local RTX 5060 / Meshy / Tripo3D.`
        );
      }

      const uploadedPaths = (await uploadRes.json()) as string[];
      const uploadedPath = uploadedPaths?.[0];
      if (!uploadedPath) throw new Error('Space upload returned no file path.');

      const fileDataObj = {
        path: uploadedPath,
        orig_name: 'character.png',
        mime_type: 'image/png',
        meta: { _type: 'gradio.FileData' },
      };

      // Discover API endpoints to pick the right call signature
      sendAIStatus('Inspecting Space 3D endpoint...', 28);
      let endpointName = 'shape_generation';
      let callData: unknown[] = [fileDataObj];

      try {
        const infoRes = await fetch(`${baseUrl}${apiPrefix}/info`, { headers: authHeaders });
        if (infoRes.ok) {
          const info = (await infoRes.json()) as {
            named_endpoints?: Record<
              string,
              { parameters?: Array<{ parameter_name?: string; parameter_default?: unknown; type?: { type?: string } }> }
            >;
          };
          const endpoints = info.named_endpoints || {};
          const preferred = [
            '/shape_generation',
            '/generation_all',
            '/image_to_3d',
            '/generate',
            '/run',
            '/extract_glb',
            '/predict',
          ];
          const chosenKey =
            preferred.find((k) => endpoints[k]) ||
            Object.keys(endpoints).find((k) =>
              /shape|3d|gen|mesh|glb|predict|run/i.test(k)
            );
          if (chosenKey && endpoints[chosenKey]?.parameters) {
            endpointName = chosenKey.replace(/^\//, '');
            let imagePlaced = false;
            callData = endpoints[chosenKey].parameters!.map((p) => {
              const pName = (p.parameter_name || '').toLowerCase();
              if (!imagePlaced && (/image|img|input|photo/.test(pName) || p.type?.type === 'object')) {
                imagePlaced = true;
                return fileDataObj;
              }
              if (pName.includes('seed')) return req.seed ?? 42;
              if (p.parameter_default !== undefined) return p.parameter_default;
              return null;
            });
            if (!imagePlaced && callData.length > 0) callData[0] = fileDataObj;
          }
        }
      } catch {
        // Fallback to sensible default
      }

      sendAIStatus(`Running AI 3D inference on ${spaceId}...`, 42);
      const callRes = await fetch(`${baseUrl}${apiPrefix}/call/${endpointName}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: callData }),
      });
      if (!callRes.ok) {
        throw new Error(
          `Space call /${endpointName} failed (HTTP ${callRes.status}): ${(await callRes.text()).slice(0, 180)}`
        );
      }
      const { event_id: eventId } = (await callRes.json()) as { event_id?: string };
      if (!eventId) throw new Error('Space did not return a Gradio event_id.');

      // Stream SSE result
      sendAIStatus('Waiting in ZeroGPU queue & sculpting 360° mesh...', 58);
      const sseRes = await fetch(`${baseUrl}${apiPrefix}/call/${endpointName}/${eventId}`, {
        headers: authHeaders,
      });
      if (!sseRes.ok) {
        throw new Error(`Space stream failed (HTTP ${sseRes.status}).`);
      }
      const sseText = await sseRes.text();
      const lines = sseText.split('\n');
      let lastEvent = '';
      let completePayload: unknown = null;
      let errorDetail = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('event:')) {
          lastEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const payloadStr = line.slice(5).trim();
          if (lastEvent === 'complete') {
            try {
              completePayload = JSON.parse(payloadStr);
            } catch {
              completePayload = payloadStr;
            }
          } else if (lastEvent === 'error') {
            errorDetail = payloadStr;
          }
        }
      }

      if (errorDetail) {
        throw new Error(`Space inference error: ${errorDetail.slice(0, 220)}`);
      }
      if (!completePayload) {
        throw new Error(
          `Space "${spaceId}" did not return a completed mesh (it may require a Hugging Face token or ZeroGPU quota).`
        );
      }

      const meshUrl = extractMeshUrlFromGradioOutput(completePayload, baseUrl);
      if (!meshUrl) {
        throw new Error(
          `Space completed, but no .glb/.obj/.stl file URL was detected in its output.`
        );
      }

      sendAIStatus('Downloading 360° mesh into studio...', 88);
      const downloadRes = await fetch(meshUrl, { headers: authHeaders });
      if (!downloadRes.ok) {
        throw new Error(`Failed downloading mesh (${downloadRes.status}).`);
      }
      const meshBuf = await downloadRes.arrayBuffer();
      const extMatch = meshUrl.toLowerCase().match(/\.(glb|obj|stl|gltf)/);
      const ext = extMatch ? extMatch[1] : 'glb';
      sendAIStatus('360° AI character ready for print prep!', 100);
      return { success: true, ext, data: new Uint8Array(meshBuf) };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

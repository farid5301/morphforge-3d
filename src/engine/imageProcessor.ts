import { ImagePrepSettings } from '../types/studio';

export interface ProcessedImageData {
  width: number;
  height: number;
  /** 0..1 foreground mask (1 = inside object, 0 = background) */
  mask: Float32Array;
  /** 0..1 depth/height map (1 = highest/closest, 0 = lowest/furthest) */
  depth: Float32Array;
  /** 0..1 original grayscale luminance (for lithophanes) */
  luminance: Float32Array;
  /** RGBA cleaned pixels */
  rgba: Uint8ClampedArray;
  /** Preview URLs */
  cleanDataUrl: string;
  maskDataUrl: string;
  depthDataUrl: string;
  /** Raw base64 PNG (without prefix) for AI 360° upload */
  cleanPngBase64: string;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/** Fast separable box/Gaussian blur on a Float32Array */
export function blurFloatGrid(
  src: Float32Array,
  w: number,
  h: number,
  radius: number
): Float32Array {
  const r = Math.max(0, Math.round(radius));
  if (r <= 0) return new Float32Array(src);

  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= r && x < w; x++) {
      sum += src[row + x];
      count++;
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / count;
      const addX = x + r + 1;
      if (addX < w) {
        sum += src[row + addX];
        count++;
      }
      const remX = x - r;
      if (remX >= 0) {
        sum -= src[row + remX];
        count--;
      }
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= r && y < h; y++) {
      sum += tmp[y * w + x];
      count++;
    }
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / count;
      const addY = y + r + 1;
      if (addY < h) {
        sum += tmp[addY * w + x];
        count++;
      }
      const remY = y - r;
      if (remY >= 0) {
        sum -= tmp[remY * w + x];
        count--;
      }
    }
  }

  return dst;
}

/**
 * Exact 2D Euclidean Distance Transform (Felzenszwalb & Huttenlocher, O(W*H))
 * Returns distance in pixels to the nearest 0-valued background pixel.
 */
export function computeEuclideanDistanceTransform(
  mask: Float32Array,
  w: number,
  h: number,
  threshold = 0.45
): Float32Array {
  const INF = 1e12;
  const f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    f[i] = mask[i] >= threshold ? INF : 0;
  }

  const maxDim = Math.max(w, h);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);
  const d1 = new Float32Array(maxDim);
  const out = new Float32Array(w * h);

  const dt1d = (arr: Float32Array, n: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = 0;
      while (true) {
        const r = v[k];
        s = ((arr[q] + q * q) - (arr[r] + r * r)) / (2 * q - 2 * r);
        if (s <= z[k]) {
          k--;
          if (k < 0) {
            k = 0;
            break;
          }
        } else {
          break;
        }
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      const diff = q - r;
      d1[q] = diff * diff + arr[r];
    }
  };

  // Transform along columns
  const col = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = f[y * w + x];
    dt1d(col, h);
    for (let y = 0; y < h; y++) out[y * w + x] = d1[y];
  }

  // Transform along rows
  const row = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) row[x] = out[off + x];
    dt1d(row, w);
    for (let x = 0; x < w; x++) out[off + x] = Math.sqrt(Math.max(0, d1[x]));
  }

  return out;
}

/**
 * Process a 2D image into cleaned RGBA, foreground mask, luminance, and 3D depth map.
 */
export async function processInputImage(
  imageSrc: string,
  settings: ImagePrepSettings,
  targetMaxDim = 256
): Promise<ProcessedImageData> {
  const img = await loadImageElement(imageSrc);

  // Fit inside targetMaxDim preserving aspect ratio
  const scale = Math.min(targetMaxDim / img.naturalWidth, targetMaxDim / img.naturalHeight, 1);
  const w = Math.max(32, Math.round(img.naturalWidth * scale));
  const h = Math.max(32, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const rgba = new Uint8ClampedArray(imgData.data);
  const n = w * h;

  const mask = new Float32Array(n);
  const luminance = new Float32Array(n);

  // Detect if image already has real alpha transparency
  let transparentCount = 0;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 220) transparentCount++;
  }
  const hasNativeAlpha = transparentCount > n * 0.04;

  // Initialize mask from alpha
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] / 255;
    luminance[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    mask[i] = a > 0.25 ? 1 : 0;
  }

  // Smart Corner-Seeded Flood Fill Background Removal when requested and image is opaque
  if (settings.removeBackground && !hasNativeAlpha) {
    // Sample border colors (4 corners + midpoints of edges)
    const sampleCoords = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
      [Math.floor(w / 2), 0],
      [Math.floor(w / 2), h - 1],
      [0, Math.floor(h / 2)],
      [w - 1, Math.floor(h / 2)],
    ];
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    for (const [sx, sy] of sampleCoords) {
      const idx = (sy * w + sx) * 4;
      bgR += rgba[idx];
      bgG += rgba[idx + 1];
      bgB += rgba[idx + 2];
    }
    bgR /= sampleCoords.length;
    bgG /= sampleCoords.length;
    bgB /= sampleCoords.length;

    const tol = settings.bgTolerance * 3.1; // Euclidean RGB threshold
    const tolSq = tol * tol;
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    const trySeed = (x: number, y: number) => {
      const p = y * w + x;
      if (visited[p]) return;
      const idx = p * 4;
      const dr = rgba[idx] - bgR;
      const dg = rgba[idx + 1] - bgG;
      const db = rgba[idx + 2] - bgB;
      if (dr * dr + dg * dg + db * db <= tolSq * 1.4) {
        visited[p] = 1;
        mask[p] = 0;
        queue[tail++] = p;
      }
    };

    for (let x = 0; x < w; x++) {
      trySeed(x, 0);
      trySeed(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      trySeed(0, y);
      trySeed(w - 1, y);
    }

    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      const idxP = p * 4;
      const pr = rgba[idxP];
      const pg = rgba[idxP + 1];
      const pb = rgba[idxP + 2];

      const neighbors = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];

      for (const np of neighbors) {
        if (np < 0 || visited[np]) continue;
        const nIdx = np * 4;
        const drBg = rgba[nIdx] - bgR;
        const dgBg = rgba[nIdx + 1] - bgG;
        const dbBg = rgba[nIdx + 2] - bgB;
        const distBgSq = drBg * drBg + dgBg * dgBg + dbBg * dbBg;

        const drLoc = rgba[nIdx] - pr;
        const dgLoc = rgba[nIdx + 1] - pg;
        const dbLoc = rgba[nIdx + 2] - pb;
        const distLocSq = drLoc * drLoc + dgLoc * dgLoc + dbLoc * dbLoc;

        if (distBgSq <= tolSq || (distLocSq <= tolSq * 0.25 && distBgSq <= tolSq * 1.85)) {
          visited[np] = 1;
          mask[np] = 0;
          queue[tail++] = np;
        }
      }
    }

    // Safety check: if flood fill ate >94% of the image, restore full foreground
    let fgCount = 0;
    for (let i = 0; i < n; i++) if (mask[i] > 0.5) fgCount++;
    if (fgCount < n * 0.04) {
      mask.fill(1);
    }
  } else if (!settings.removeBackground && !hasNativeAlpha) {
    mask.fill(1);
  }

  // Optional edge feathering on mask
  let finalMask: Float32Array = mask;
  if (settings.bgEdgeFeather > 0) {
    finalMask = blurFloatGrid(mask, w, h, settings.bgEdgeFeather);
  }

  // Apply cleaned alpha to RGBA
  for (let i = 0; i < n; i++) {
    rgba[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, finalMask[i])) * 255);
  }

  // Compute heuristic 3D Depth Map:
  // Combines contrast-adjusted luminance + foreground distance dome + subtle blur
  const edt = computeEuclideanDistanceTransform(finalMask, w, h, 0.45);
  let maxDist = 1;
  for (let i = 0; i < n; i++) {
    if (edt[i] > maxDist) maxDist = edt[i];
  }

  let depth: Float32Array = new Float32Array(n);
  const contrast = settings.contrast;
  const gamma = settings.depthGamma;
  const boost = settings.foregroundBoost;

  for (let i = 0; i < n; i++) {
    let lum = luminance[i];
    if (settings.invertDepth) lum = 1 - lum;
    // Contrast curve around 0.5
    lum = Math.min(1, Math.max(0, (lum - 0.5) * contrast + 0.5));
    lum = Math.pow(lum, gamma);

    // Smooth foreground dome factor from distance transform
    const normDist = Math.min(1, edt[i] / maxDist);
    const dome = Math.sqrt(normDist);

    const blended = lum * (1 - boost * 0.55) + dome * (boost * 0.55);
    depth[i] = Math.min(1, Math.max(0, blended)) * (finalMask[i] >= 0.4 ? 1 : 0);
  }

  if (settings.detailBlur > 0) {
    depth = blurFloatGrid(depth, w, h, settings.detailBlur);
    depth = blurFloatGrid(depth, w, h, Math.max(1, Math.floor(settings.detailBlur * 0.6)));
  }

  // Render preview canvases
  const cleanCanvas = document.createElement('canvas');
  cleanCanvas.width = w;
  cleanCanvas.height = h;
  const cleanCtx = cleanCanvas.getContext('2d')!;
  const cleanImgData = new ImageData(new Uint8ClampedArray(rgba), w, h);
  cleanCtx.putImageData(cleanImgData, 0, 0);
  const cleanDataUrl = cleanCanvas.toDataURL('image/png');
  const cleanPngBase64 = cleanDataUrl.replace(/^data:image\/png;base64,/, '');

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskImg = maskCtx.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.round(finalMask[i] * 255);
    maskImg.data[i * 4] = Math.round(v * 0.15);
    maskImg.data[i * 4 + 1] = Math.round(v * 0.94);
    maskImg.data[i * 4 + 2] = v;
    maskImg.data[i * 4 + 3] = 255;
  }
  maskCtx.putImageData(maskImg, 0, 0);
  const maskDataUrl = maskCanvas.toDataURL('image/png');

  const depthCanvas = document.createElement('canvas');
  depthCanvas.width = w;
  depthCanvas.height = h;
  const depthCtx = depthCanvas.getContext('2d')!;
  const depthImg = depthCtx.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    // Plasma/turbo-like visual heatmap for depth preview
    const d = depth[i];
    depthImg.data[i * 4] = Math.round(Math.min(255, d * 280));
    depthImg.data[i * 4 + 1] = Math.round(Math.sin(d * Math.PI) * 235);
    depthImg.data[i * 4 + 2] = Math.round((1 - d) * 190 + d * 80);
    depthImg.data[i * 4 + 3] = 255;
  }
  depthCtx.putImageData(depthImg, 0, 0);
  const depthDataUrl = depthCanvas.toDataURL('image/png');

  return {
    width: w,
    height: h,
    mask: finalMask,
    depth,
    luminance,
    rgba,
    cleanDataUrl,
    maskDataUrl,
    depthDataUrl,
    cleanPngBase64,
  };
}

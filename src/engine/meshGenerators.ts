import * as THREE from 'three';
import {
  ProcessedImageData,
  blurFloatGrid,
  computeEuclideanDistanceTransform,
} from './imageProcessor';
import {
  LithophaneSettings,
  PuffSettings,
  ReliefFrameShape,
  ReliefSettings,
  StandeeSettings,
} from '../types/studio';

/**
 * Resample a Float32Array grid (srcW x srcH) to (dstW x dstH) with bilinear interpolation.
 */
function resampleGrid(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  const dst = new Float32Array(dstW * dstH);
  const xRatio = (srcW - 1) / Math.max(1, dstW - 1);
  const yRatio = (srcH - 1) / Math.max(1, dstH - 1);

  for (let y = 0; y < dstH; y++) {
    const sy = y * yRatio;
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < dstW; x++) {
      const sx = x * xRatio;
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = sx - x0;

      const v00 = src[y0 * srcW + x0];
      const v10 = src[y0 * srcW + x1];
      const v01 = src[y1 * srcW + x0];
      const v11 = src[y1 * srcW + x1];

      const top = v00 + (v10 - v00) * fx;
      const bot = v01 + (v11 - v01) * fx;
      dst[y * dstW + x] = top + (bot - top) * fy;
    }
  }
  return dst;
}

/**
 * Helper to build a 100% WATERTIGHT MANIFOLD double-surface grid mesh over active cells.
 * Every active quad cell (ix, iy) has:
 *   - A front face at (x, y, zFront) with +Z outward normal (CCW)
 *   - A back face at (x, y, zBack) with -Z outward normal (CW when viewed from +Z)
 *   - For every edge of an active cell that borders an inactive cell (or grid edge),
 *     a clean closed 2-triangle side rim wall stitching front vertex -> back vertex!
 * Additionally supports smooth perimeter XY relaxation so the 3D silhouette is buttery smooth!
 */
function buildWatertightMaskedSurface(params: {
  gridW: number;
  gridH: number;
  activeCells: Uint8Array; // size (gridW-1)*(gridH-1)
  posX: Float32Array;      // size gridW*gridH
  posY: Float32Array;      // size gridW*gridH
  zFront: Float32Array;    // size gridW*gridH (must be >= zBack)
  zBack: Float32Array;     // size gridW*gridH
  contourSmoothPasses?: number;
}): THREE.BufferGeometry {
  const { gridW, gridH, activeCells, posX, posY, zFront, zBack } = params;
  const cellsW = gridW - 1;
  const cellsH = gridH - 1;
  const totalVerts = gridW * gridH;

  // Identify boundary edges (directed CCW around active regions)
  // An edge (vA -> vB) on the front face is a boundary edge if the cell on its left is active
  // and the adjacent cell on its right is inactive (or out of bounds).
  const isCellActive = (cx: number, cy: number): boolean => {
    if (cx < 0 || cy < 0 || cx >= cellsW || cy >= cellsH) return false;
    return activeCells[cy * cellsW + cx] === 1;
  };

  interface BoundaryEdge {
    a: number;
    b: number;
  }
  const boundaryEdges: BoundaryEdge[] = [];
  const isBoundaryVertex = new Uint8Array(totalVerts);

  // Grid convention: iy=0 is TOP (+Y), iy=gridH-1 is BOTTOM (-Y), ix=0 is LEFT (-X), ix=gridW-1 is RIGHT (+X).
  // For cell (cx, cy):
  //   tl = (cx, cy), tr = (cx+1, cy), bl = (cx, cy+1), br = (cx+1, cy+1)
  // Viewed from +Z, CCW order is: tl -> bl -> br -> tr -> tl
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      if (!isCellActive(cx, cy)) continue;
      const tl = cy * gridW + cx;
      const tr = tl + 1;
      const bl = tl + gridW;
      const br = bl + 1;

      // Left edge: tl -> bl (neighbor cx-1, cy)
      if (!isCellActive(cx - 1, cy)) {
        boundaryEdges.push({ a: tl, b: bl });
        isBoundaryVertex[tl] = 1;
        isBoundaryVertex[bl] = 1;
      }
      // Bottom edge: bl -> br (neighbor cx, cy+1)
      if (!isCellActive(cx, cy + 1)) {
        boundaryEdges.push({ a: bl, b: br });
        isBoundaryVertex[bl] = 1;
        isBoundaryVertex[br] = 1;
      }
      // Right edge: br -> tr (neighbor cx+1, cy)
      if (!isCellActive(cx + 1, cy)) {
        boundaryEdges.push({ a: br, b: tr });
        isBoundaryVertex[br] = 1;
        isBoundaryVertex[tr] = 1;
      }
      // Top edge: tr -> tl (neighbor cx, cy-1)
      if (!isCellActive(cx, cy - 1)) {
        boundaryEdges.push({ a: tr, b: tl });
        isBoundaryVertex[tr] = 1;
        isBoundaryVertex[tl] = 1;
      }
    }
  }

  // Smooth boundary XY silhouette vertices along perimeter chains (eliminates pixel stair-stepping!)
  // Clamped safely to 0.30 * cell step so no front/back triangle can ever fold or become degenerate.
  const smoothPasses = params.contourSmoothPasses ?? 0;
  if (smoothPasses > 0 && boundaryEdges.length > 0) {
    const origX = new Float32Array(posX);
    const origY = new Float32Array(posY);
    const stepX = Math.abs(posX[1] - posX[0]) || 1;
    const stepY = Math.abs(posY[gridW] - posY[0]) || 1;
    const maxShiftX = stepX * 0.3;
    const maxShiftY = stepY * 0.3;

    const prevSumX = new Float32Array(totalVerts);
    const prevSumY = new Float32Array(totalVerts);
    const deg = new Uint16Array(totalVerts);

    for (let pass = 0; pass < smoothPasses; pass++) {
      prevSumX.fill(0);
      prevSumY.fill(0);
      deg.fill(0);

      for (let i = 0; i < boundaryEdges.length; i++) {
        const { a, b } = boundaryEdges[i];
        prevSumX[a] += posX[b];
        prevSumY[a] += posY[b];
        deg[a]++;
        prevSumX[b] += posX[a];
        prevSumY[b] += posY[a];
        deg[b]++;
      }

      const lambda = pass % 2 === 0 ? 0.32 : -0.24;
      for (let v = 0; v < totalVerts; v++) {
        if (isBoundaryVertex[v] && deg[v] >= 2) {
          const avgX = prevSumX[v] / deg[v];
          const avgY = prevSumY[v] / deg[v];
          const nx = posX[v] + (avgX - posX[v]) * lambda;
          const ny = posY[v] + (avgY - posY[v]) * lambda;
          posX[v] = Math.max(origX[v] - maxShiftX, Math.min(origX[v] + maxShiftX, nx));
          posY[v] = Math.max(origY[v] - maxShiftY, Math.min(origY[v] + maxShiftY, ny));
        }
      }
    }
  }

  // Assign compact vertex indices for front & back surfaces
  const frontIdx = new Int32Array(totalVerts).fill(-1);
  const backIdx = new Int32Array(totalVerts).fill(-1);
  const positions: number[] = [];

  const getFront = (g: number): number => {
    let idx = frontIdx[g];
    if (idx === -1) {
      idx = positions.length / 3;
      frontIdx[g] = idx;
      positions.push(posX[g], posY[g], zFront[g]);
    }
    return idx;
  };

  const getBack = (g: number): number => {
    let idx = backIdx[g];
    if (idx === -1) {
      idx = positions.length / 3;
      backIdx[g] = idx;
      positions.push(posX[g], posY[g], zBack[g]);
    }
    return idx;
  };

  const indices: number[] = [];

  // Front & back faces for every active cell
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      if (!isCellActive(cx, cy)) continue;
      const tl = cy * gridW + cx;
      const tr = tl + 1;
      const bl = tl + gridW;
      const br = bl + 1;

      const ftl = getFront(tl);
      const ftr = getFront(tr);
      const fbl = getFront(bl);
      const fbr = getFront(br);

      // Front CCW (+Z outward)
      indices.push(ftl, fbl, fbr);
      indices.push(ftl, fbr, ftr);

      const btl = getBack(tl);
      const btr = getBack(tr);
      const bbl = getBack(bl);
      const bbr = getBack(br);

      // Back reversed (-Z outward)
      indices.push(btl, bbr, bbl);
      indices.push(btl, btr, bbr);
    }
  }

  // Stitch boundary rim walls (Front a -> Back a -> Back b -> Front b)
  // Because (a -> b) runs CCW around the front face, outward rim normal points right of (a->b)
  for (let i = 0; i < boundaryEdges.length; i++) {
    const { a, b } = boundaryEdges[i];
    const fa = getFront(a);
    const fb = getFront(b);
    const ba = getBack(a);
    const bb = getBack(b);

    indices.push(fa, ba, bb);
    indices.push(fa, bb, fb);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Clean isolated 1-pixel pinch points on activeCells to ensure strictly 2-manifold boundary loops
 * (eliminates checkerboard diagonal vertex non-manifold pinches).
 */
function sanitizeActiveCells(cells: Uint8Array, cw: number, ch: number): void {
  // Repeat 2 passes: fill tiny 1-cell notches and resolve diagonal pinches
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let y = 0; y < ch - 1; y++) {
      for (let x = 0; x < cw - 1; x++) {
        const i00 = y * cw + x;
        const i10 = i00 + 1;
        const i01 = i00 + cw;
        const i11 = i01 + 1;
        const a = cells[i00];
        const b = cells[i10];
        const c = cells[i01];
        const d = cells[i11];
        // Checkerboard pinch: (1,0 / 0,1) or (0,1 / 1,0)
        if (a === 1 && d === 1 && b === 0 && c === 0) {
          cells[i10] = 1;
          changed = true;
        } else if (b === 1 && c === 1 && a === 0 && d === 0) {
          cells[i00] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * MODE 1: PUFF 3D FIGURINE (Inflated Chibi / Character Sculpture)
 * Uses exact Euclidean Distance Transform + smooth spherical puffing + facial/clothing detail relief.
 * Produces a 100% watertight solid character figurine standing upright (Y-up).
 */
export function generatePuffFigurine(
  img: ProcessedImageData,
  settings: PuffSettings
): THREE.BufferGeometry {
  const aspect = img.width / img.height;
  const maxGrid = Math.max(48, Math.min(240, Math.round(settings.resolution)));
  const gridW = aspect >= 1 ? maxGrid : Math.max(40, Math.round(maxGrid * aspect));
  const gridH = aspect >= 1 ? Math.max(40, Math.round(maxGrid / aspect)) : maxGrid;

  const mask = resampleGrid(img.mask, img.width, img.height, gridW, gridH);
  const depth = resampleGrid(img.depth, img.width, img.height, gridW, gridH);

  // Compute exact 2D Euclidean Distance Transform on the resampled mask
  let edt = computeEuclideanDistanceTransform(mask, gridW, gridH, 0.45);
  edt = blurFloatGrid(edt, gridW, gridH, 2);

  let maxDist = 1;
  for (let i = 0; i < edt.length; i++) {
    if (edt[i] > maxDist) maxDist = edt[i];
  }

  // Reference scale: height = 100mm initially (normalized later by printPrep)
  const heightMm = 100;
  const widthMm = heightMm * aspect;

  const posX = new Float32Array(gridW * gridH);
  const posY = new Float32Array(gridW * gridH);
  const zFront = new Float32Array(gridW * gridH);
  const zBack = new Float32Array(gridW * gridH);

  const halfThickness = settings.puffDepthMm * 0.5;
  const minEdgeBevel = 0.45; // tiny chamfer so silhouette edge is clean & manifold

  for (let iy = 0; iy < gridH; iy++) {
    const ny = 1 - iy / (gridH - 1); // 1 at top, 0 at bottom
    const yVal = ny * heightMm;
    for (let ix = 0; ix < gridW; ix++) {
      const nx = ix / (gridW - 1) - 0.5;
      const g = iy * gridW + ix;
      posX[g] = nx * widthMm;
      posY[g] = yVal;

      const dNorm = Math.min(1, edt[g] / maxDist);
      // Spherical/ellipsoidal puff profile
      const puff = Math.pow(dNorm, settings.profileRoundness);
      // Smoothly attenuate detail relief right at the outer border
      const detailEnvelope = Math.min(1, dNorm * 4.5);
      const relief = (depth[g] - 0.45) * settings.detailReliefMm * detailEnvelope;

      const frontZ = Math.max(minEdgeBevel, minEdgeBevel + puff * halfThickness + relief);
      zFront[g] = frontZ;

      if (settings.doubleSided) {
        const backRelief = settings.mirrorBackDetail ? relief * 0.55 : 0;
        const backZ = Math.max(minEdgeBevel, minEdgeBevel + puff * halfThickness * 0.92 + backRelief);
        zBack[g] = -backZ;
      } else {
        zBack[g] = -minEdgeBevel;
      }
    }
  }

  const cellsW = gridW - 1;
  const cellsH = gridH - 1;
  const activeCells = new Uint8Array(cellsW * cellsH);
  let activeCount = 0;

  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tl = cy * gridW + cx;
      const avg =
        (mask[tl] + mask[tl + 1] + mask[tl + gridW] + mask[tl + gridW + 1]) * 0.25;
      if (avg >= 0.45) {
        activeCells[cy * cellsW + cx] = 1;
        activeCount++;
      }
    }
  }

  // Fallback if mask was completely empty
  if (activeCount < 16) {
    activeCells.fill(1);
  }
  sanitizeActiveCells(activeCells, cellsW, cellsH);

  return buildWatertightMaskedSurface({
    gridW,
    gridH,
    activeCells,
    posX,
    posY,
    zFront,
    zBack,
    contourSmoothPasses: settings.contourSmoothPasses,
  });
}

/** Frame shape signed distance helper (-1 inside, +1 outside, 0 on boundary) */
function evalFrameShape(u: number, v: number, shape: ReliefFrameShape): number {
  // u, v in [-1, 1]
  const ax = Math.abs(u);
  const ay = Math.abs(v);
  switch (shape) {
    case 'circle':
      return Math.hypot(u, v) - 0.98;
    case 'rounded': {
      const r = 0.24;
      const qx = Math.max(ax - (0.98 - r), 0);
      const qy = Math.max(ay - (0.98 - r), 0);
      return Math.hypot(qx, qy) - r;
    }
    case 'hexagon': {
      const k = 0.8660254;
      return Math.max(ax * k + ay * 0.5, ay) - 0.92;
    }
    case 'shield': {
      if (v > 0.1) {
        return Math.max(ax - 0.92, v - 0.95);
      }
      // Taper bottom into classic crest shield
      const t = (0.1 - v) / 1.05; // 0 -> 1
      const halfW = 0.92 * (1 - t * t * 0.98);
      return Math.max(ax - halfW, -v - 0.96);
    }
    case 'rectangle':
    default:
      return Math.max(ax, ay) - 0.99;
  }
}

/**
 * MODE 2: BAS-RELIEF / COIN / MEDALLION PLAQUE
 * Watertight sculpted relief slab with optional raised coin/crest frame.
 */
export function generateBasRelief(
  img: ProcessedImageData,
  settings: ReliefSettings
): THREE.BufferGeometry {
  const aspect =
    settings.frameShape === 'circle' || settings.frameShape === 'hexagon'
      ? 1
      : img.width / img.height;

  const maxGrid = Math.max(64, Math.min(240, Math.round(settings.resolution)));
  const gridW = aspect >= 1 ? maxGrid : Math.max(48, Math.round(maxGrid * aspect));
  const gridH = aspect >= 1 ? Math.max(48, Math.round(maxGrid / aspect)) : maxGrid;

  const depth = resampleGrid(img.depth, img.width, img.height, gridW, gridH);
  const heightMm = 100;
  const widthMm = heightMm * aspect;

  const posX = new Float32Array(gridW * gridH);
  const posY = new Float32Array(gridW * gridH);
  const zFront = new Float32Array(gridW * gridH);
  const zBack = new Float32Array(gridW * gridH);
  const insideVert = new Uint8Array(gridW * gridH);

  const borderWidthNorm = settings.borderWidthPct / 100;

  for (let iy = 0; iy < gridH; iy++) {
    const v = 1 - (2 * iy) / (gridH - 1); // +1 top to -1 bottom
    const yVal = ((v + 1) * 0.5) * heightMm;
    for (let ix = 0; ix < gridW; ix++) {
      const u = (2 * ix) / (gridW - 1) - 1; // -1 left to +1 right
      const g = iy * gridW + ix;
      posX[g] = u * (widthMm * 0.5);
      posY[g] = yVal;

      const sd = evalFrameShape(u, v, settings.frameShape);
      insideVert[g] = sd <= 0 ? 1 : 0;

      // Sculpted relief height
      let hVal = settings.baseThicknessMm + depth[g] * settings.reliefDepthMm;

      // Optional raised beveled medallion border
      if (settings.borderHeightMm > 0 && borderWidthNorm > 0 && sd <= 0 && sd > -borderWidthNorm * 2) {
        const edgeT = 1 - Math.abs(sd + borderWidthNorm) / Math.max(0.001, borderWidthNorm);
        const rimProfile = Math.sin(Math.max(0, edgeT) * Math.PI * 0.5);
        hVal = Math.max(hVal, settings.baseThicknessMm + settings.borderHeightMm * rimProfile);
      }

      zFront[g] = hVal;
      zBack[g] = 0;
    }
  }

  const cellsW = gridW - 1;
  const cellsH = gridH - 1;
  const activeCells = new Uint8Array(cellsW * cellsH);

  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tl = cy * gridW + cx;
      const sum =
        insideVert[tl] + insideVert[tl + 1] + insideVert[tl + gridW] + insideVert[tl + gridW + 1];
      if (sum >= 3) {
        activeCells[cy * cellsW + cx] = 1;
      }
    }
  }
  sanitizeActiveCells(activeCells, cellsW, cellsH);

  return buildWatertightMaskedSurface({
    gridW,
    gridH,
    activeCells,
    posX,
    posY,
    zFront,
    zBack,
    contourSmoothPasses: settings.frameShape === 'rectangle' ? 0 : 4,
  });
}

/**
 * MODE 3: LITHOPHANE (Backlit Photo Sculpture — Flat or Curved Cylindrical Arc)
 * Dark pixels = thick plastic (blocks light), bright pixels = thin plastic (glows!).
 * Watertight closed box / curved shell ready for white PLA/Resin printing.
 */
export function generateLithophane(
  img: ProcessedImageData,
  settings: LithophaneSettings
): THREE.BufferGeometry {
  const aspect = img.width / img.height;
  const maxGrid = Math.max(64, Math.min(240, Math.round(settings.resolution)));
  const gridW = aspect >= 1 ? maxGrid : Math.max(48, Math.round(maxGrid * aspect));
  const gridH = aspect >= 1 ? Math.max(48, Math.round(maxGrid / aspect)) : maxGrid;

  const lum = resampleGrid(img.luminance, img.width, img.height, gridW, gridH);
  const heightMm = 100;
  const widthMm = heightMm * aspect;

  const minT = Math.max(0.5, settings.minThicknessMm);
  const maxT = Math.max(minT + 0.4, settings.maxThicknessMm);
  const frameW = Math.max(0, settings.frameWidthMm);
  const frameT = Math.max(maxT, settings.frameThicknessMm);

  const arcRad = (settings.curveAngleDeg * Math.PI) / 180;
  const radius = settings.curved && arcRad > 0.05 ? widthMm / arcRad : 0;

  // Build watertight front + back + 4 perimeter walls directly in 3D space
  const frontPos = new Float32Array(gridW * gridH * 3);
  const backPos = new Float32Array(gridW * gridH * 3);

  for (let iy = 0; iy < gridH; iy++) {
    const ny = 1 - iy / (gridH - 1);
    const yMm = ny * heightMm;
    const distYEdge = Math.min(yMm, heightMm - yMm);

    for (let ix = 0; ix < gridW; ix++) {
      const nx = ix / (gridW - 1);
      const xMm = (nx - 0.5) * widthMm;
      const distXEdge = Math.min(nx * widthMm, (1 - nx) * widthMm);

      const g = iy * gridW + ix;
      const isBorder = frameW > 0 && (distXEdge < frameW || distYEdge < frameW);

      // Lithophane physics: darker luminance -> thicker wall
      const thickness = isBorder
        ? frameT
        : minT + (1 - lum[g]) * (maxT - minT);

      if (settings.curved && radius > 0) {
        const theta = (nx - 0.5) * arcRad; // centered around +Z facing camera
        const rBack = radius;
        const rFront = radius + thickness;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        // Shift Z so curved lithophane centers nicely around Z = 0
        const zCenterOffset = radius * Math.cos(arcRad * 0.5);

        frontPos[g * 3] = rFront * sinT;
        frontPos[g * 3 + 1] = yMm;
        frontPos[g * 3 + 2] = rFront * cosT - zCenterOffset;

        backPos[g * 3] = rBack * sinT;
        backPos[g * 3 + 1] = yMm;
        backPos[g * 3 + 2] = rBack * cosT - zCenterOffset;
      } else {
        frontPos[g * 3] = xMm;
        frontPos[g * 3 + 1] = yMm;
        frontPos[g * 3 + 2] = thickness;

        backPos[g * 3] = xMm;
        backPos[g * 3 + 1] = yMm;
        backPos[g * 3 + 2] = 0;
      }
    }
  }

  const vertCount = gridW * gridH;
  const positions = new Float32Array(vertCount * 2 * 3);
  positions.set(frontPos, 0);
  positions.set(backPos, vertCount * 3);

  const indices: number[] = [];

  // Front & back quads
  for (let iy = 0; iy < gridH - 1; iy++) {
    for (let ix = 0; ix < gridW - 1; ix++) {
      const tl = iy * gridW + ix;
      const tr = tl + 1;
      const bl = tl + gridW;
      const br = bl + 1;

      // Front (+Z outward)
      indices.push(tl, bl, br);
      indices.push(tl, br, tr);

      // Back (-Z outward)
      const btl = vertCount + tl;
      const btr = vertCount + tr;
      const bbl = vertCount + bl;
      const bbr = vertCount + br;
      indices.push(btl, bbr, bbl);
      indices.push(btl, btr, bbr);
    }
  }

  // Top edge (iy = 0, tr -> tl)
  for (let ix = 0; ix < gridW - 1; ix++) {
    const a = ix + 1;
    const b = ix;
    indices.push(a, vertCount + a, vertCount + b);
    indices.push(a, vertCount + b, b);
  }
  // Bottom edge (iy = gridH - 1, bl -> br)
  for (let ix = 0; ix < gridW - 1; ix++) {
    const a = (gridH - 1) * gridW + ix;
    const b = a + 1;
    indices.push(a, vertCount + a, vertCount + b);
    indices.push(a, vertCount + b, b);
  }
  // Left edge (ix = 0, tl -> bl)
  for (let iy = 0; iy < gridH - 1; iy++) {
    const a = iy * gridW;
    const b = (iy + 1) * gridW;
    indices.push(a, vertCount + a, vertCount + b);
    indices.push(a, vertCount + b, b);
  }
  // Right edge (ix = gridW - 1, br -> tr)
  for (let iy = 0; iy < gridH - 1; iy++) {
    const a = (iy + 1) * gridW + (gridW - 1);
    const b = iy * gridW + (gridW - 1);
    indices.push(a, vertCount + a, vertCount + b);
    indices.push(a, vertCount + b, b);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * MODE 4: STANDEE / KEYCHAIN EXTRUSION
 * Crisp silhouette extrusion with smooth beveled edges, subtle detail emboss, and optional keychain hole!
 */
export function generateStandee(
  img: ProcessedImageData,
  settings: StandeeSettings
): THREE.BufferGeometry {
  const aspect = img.width / img.height;
  const maxGrid = Math.max(48, Math.min(220, Math.round(settings.resolution)));
  const gridW = aspect >= 1 ? maxGrid : Math.max(40, Math.round(maxGrid * aspect));
  const gridH = aspect >= 1 ? Math.max(40, Math.round(maxGrid / aspect)) : maxGrid;

  const mask = resampleGrid(img.mask, img.width, img.height, gridW, gridH);
  const depth = resampleGrid(img.depth, img.width, img.height, gridW, gridH);

  const heightMm = 100;
  const widthMm = heightMm * aspect;

  // If keychain hole is enabled, find topmost foreground point and punch a clean circular ring tab + hole
  let holeCenterX = 0;
  let holeCenterY = heightMm * 0.94;
  if (settings.keychainHole) {
    let topIy = gridH - 1;
    let sumIx = 0;
    let countIx = 0;
    for (let iy = 0; iy < gridH; iy++) {
      for (let ix = 0; ix < gridW; ix++) {
        if (mask[iy * gridW + ix] >= 0.45) {
          if (iy < topIy) {
            topIy = iy;
            sumIx = ix;
            countIx = 1;
          } else if (iy <= topIy + 3) {
            sumIx += ix;
            countIx++;
          }
        }
      }
      if (countIx > 0 && iy > topIy + 3) break;
    }
    const avgIx = countIx > 0 ? sumIx / countIx : gridW * 0.5;
    holeCenterX = (avgIx / (gridW - 1) - 0.5) * widthMm;
    const topY = (1 - topIy / (gridH - 1)) * heightMm;
    holeCenterY = Math.min(heightMm - settings.keychainHoleDiaMm * 0.9, topY - settings.keychainHoleDiaMm * 0.2);

    const innerR = settings.keychainHoleDiaMm * 0.5;
    const outerR = innerR + 3.4;

    for (let iy = 0; iy < gridH; iy++) {
      const yVal = (1 - iy / (gridH - 1)) * heightMm;
      for (let ix = 0; ix < gridW; ix++) {
        const xVal = (ix / (gridW - 1) - 0.5) * widthMm;
        const d = Math.hypot(xVal - holeCenterX, yVal - holeCenterY);
        const g = iy * gridW + ix;
        if (d <= outerR) mask[g] = 1;
        if (d <= innerR) mask[g] = 0;
      }
    }
  }

  const edt = computeEuclideanDistanceTransform(mask, gridW, gridH, 0.45);
  const pxToMm = heightMm / Math.max(1, gridH - 1);

  const posX = new Float32Array(gridW * gridH);
  const posY = new Float32Array(gridW * gridH);
  const zFront = new Float32Array(gridW * gridH);
  const zBack = new Float32Array(gridW * gridH);

  const halfT = settings.thicknessMm * 0.5;
  const bevel = Math.min(settings.bevelMm, halfT * 0.75);

  for (let iy = 0; iy < gridH; iy++) {
    const yVal = (1 - iy / (gridH - 1)) * heightMm;
    for (let ix = 0; ix < gridW; ix++) {
      const xVal = (ix / (gridW - 1) - 0.5) * widthMm;
      const g = iy * gridW + ix;
      posX[g] = xVal;
      posY[g] = yVal;

      const distMm = edt[g] * pxToMm;
      const bevelFactor = bevel > 0.05 ? Math.min(1, distMm / bevel) : 1;
      const bevelProfile = Math.sin(bevelFactor * Math.PI * 0.5);
      const localHalfT = (halfT - bevel) + bevel * bevelProfile;
      const emboss = depth[g] * settings.detailEmbossMm * bevelFactor;

      zFront[g] = Math.max(0.35, localHalfT + emboss);
      zBack[g] = -Math.max(0.35, localHalfT);
    }
  }

  const cellsW = gridW - 1;
  const cellsH = gridH - 1;
  const activeCells = new Uint8Array(cellsW * cellsH);
  let activeCount = 0;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tl = cy * gridW + cx;
      const avg = (mask[tl] + mask[tl + 1] + mask[tl + gridW] + mask[tl + gridW + 1]) * 0.25;
      if (avg >= 0.45) {
        activeCells[cy * cellsW + cx] = 1;
        activeCount++;
      }
    }
  }
  if (activeCount < 16) activeCells.fill(1);
  sanitizeActiveCells(activeCells, cellsW, cellsH);

  return buildWatertightMaskedSurface({
    gridW,
    gridH,
    activeCells,
    posX,
    posY,
    zFront,
    zBack,
    contourSmoothPasses: settings.contourSmoothPasses,
  });
}

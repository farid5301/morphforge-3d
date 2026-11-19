import * as THREE from 'three';
import {
  BaseConfig,
  BaseStyle,
  MeshDiagnostics,
  PrinterPreset,
  PrintPrepSettings,
} from '../types/studio';

/**
 * Weld nearby vertices using spatial hashing and remove degenerate triangles.
 * Ensures clean indexed BufferGeometry suitable for manifold analysis & Taubin smoothing.
 */
export function repairAndWeldMesh(
  input: THREE.BufferGeometry,
  tolerance = 1e-4
): THREE.BufferGeometry {
  const geom = input.index ? input.toNonIndexed() : input.clone();
  const posAttr = geom.getAttribute('position');
  const count = posAttr.count;

  const invTol = 1 / tolerance;
  const map = new Map<string, number>();
  const newPositions: number[] = [];
  const remap = new Int32Array(count);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const key = `${Math.round(x * invTol)}_${Math.round(y * invTol)}_${Math.round(z * invTol)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = newPositions.length / 3;
      map.set(key, idx);
      newPositions.push(x, y, z);
    }
    remap[i] = idx;
  }

  const newIndices: number[] = [];
  let signedVol6 = 0;

  for (let i = 0; i < count; i += 3) {
    const a = remap[i];
    const b = remap[i + 1];
    const c = remap[i + 2];
    if (a === b || b === c || c === a) continue;

    const ax = newPositions[a * 3];
    const ay = newPositions[a * 3 + 1];
    const az = newPositions[a * 3 + 2];
    const bx = newPositions[b * 3];
    const by = newPositions[b * 3 + 1];
    const bz = newPositions[b * 3 + 2];
    const cx = newPositions[c * 3];
    const cy = newPositions[c * 3 + 1];
    const cz = newPositions[c * 3 + 2];

    // Check degenerate area
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const crx = aby * acz - abz * acy;
    const cry = abz * acx - abx * acz;
    const crz = abx * acy - aby * acx;
    if (crx * crx + cry * cry + crz * crz < 1e-12) continue;

    // Signed tetrahedron volume * 6
    signedVol6 +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);

    newIndices.push(a, b, c);
  }

  // If mesh is completely inside-out (negative total signed volume), flip triangle winding!
  if (signedVol6 < 0) {
    for (let i = 0; i < newIndices.length; i += 3) {
      const tmp = newIndices[i + 1];
      newIndices[i + 1] = newIndices[i + 2];
      newIndices[i + 2] = tmp;
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  out.setIndex(newIndices);
  out.computeVertexNormals();
  return out;
}

/**
 * Shrinkage-free Taubin mesh smoothing (alternates +lambda and -mu Laplacian steps).
 */
export function taubinSmooth(
  input: THREE.BufferGeometry,
  iterations: number,
  lambda = 0.45,
  mu = -0.48
): THREE.BufferGeometry {
  if (iterations <= 0) return input;
  const geom = input.index ? input.clone() : repairAndWeldMesh(input);
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const idxAttr = geom.getIndex()!;
  const vCount = posAttr.count;
  const pos = new Float32Array(posAttr.array as Float32Array);

  // Build vertex adjacency lists
  const adj: number[][] = Array.from({ length: vCount }, () => []);
  const addEdge = (u: number, v: number) => {
    const list = adj[u];
    if (!list.includes(v)) list.push(v);
  };
  for (let i = 0; i < idxAttr.count; i += 3) {
    const a = idxAttr.getX(i);
    const b = idxAttr.getX(i + 1);
    const c = idxAttr.getX(i + 2);
    addEdge(a, b); addEdge(b, a);
    addEdge(b, c); addEdge(c, b);
    addEdge(c, a); addEdge(a, c);
  }

  const next = new Float32Array(pos.length);
  const step = (factor: number) => {
    for (let v = 0; v < vCount; v++) {
      const nbrs = adj[v];
      const deg = nbrs.length;
      if (deg === 0) {
        next[v * 3] = pos[v * 3];
        next[v * 3 + 1] = pos[v * 3 + 1];
        next[v * 3 + 2] = pos[v * 3 + 2];
        continue;
      }
      let sx = 0, sy = 0, sz = 0;
      for (let j = 0; j < deg; j++) {
        const nb = nbrs[j] * 3;
        sx += pos[nb];
        sy += pos[nb + 1];
        sz += pos[nb + 2];
      }
      const inv = 1 / deg;
      next[v * 3] = pos[v * 3] + (sx * inv - pos[v * 3]) * factor;
      next[v * 3 + 1] = pos[v * 3 + 1] + (sy * inv - pos[v * 3 + 1]) * factor;
      next[v * 3 + 2] = pos[v * 3 + 2] + (sz * inv - pos[v * 3 + 2]) * factor;
    }
    pos.set(next);
  };

  for (let it = 0; it < iterations; it++) {
    step(lambda);
    step(mu);
  }

  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Clean Plane Cut from Bottom (Auto-Flatten Base)
 * Clips everything below Y = cutY and caps the sliced cross-section so the bottom rests 100% flat on the print bed.
 */
export function flattenBottomPlaneCut(
  input: THREE.BufferGeometry,
  cutHeightMm: number
): THREE.BufferGeometry {
  if (cutHeightMm <= 0.05) return input;
  const src = input.index ? input.toNonIndexed() : input.clone();
  src.computeBoundingBox();
  const minY = src.boundingBox?.min.y ?? 0;
  const maxY = src.boundingBox?.max.y ?? 100;
  const cutY = Math.min(maxY - 2, minY + cutHeightMm);

  const pos = src.getAttribute('position');
  const outPos: number[] = [];
  const capSegments: Array<[number, number, number, number]> = [];

  const lerpPt = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number
  ): [number, number, number] => {
    const t = (cutY - ay) / (by - ay);
    return [ax + (bx - ax) * t, cutY, az + (bz - az) * t];
  };

  for (let i = 0; i < pos.count; i += 3) {
    const pts: Array<[number, number, number]> = [
      [pos.getX(i), pos.getY(i), pos.getZ(i)],
      [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)],
      [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)],
    ];
    const above = pts.map((p) => p[1] >= cutY);
    const nAbove = (above[0] ? 1 : 0) + (above[1] ? 1 : 0) + (above[2] ? 1 : 0);

    if (nAbove === 3) {
      outPos.push(...pts[0], ...pts[1], ...pts[2]);
    } else if (nAbove === 1) {
      // Rotate so index 0 is above
      const idx = above[0] ? 0 : above[1] ? 1 : 2;
      const a = pts[idx];
      const b = pts[(idx + 1) % 3];
      const c = pts[(idx + 2) % 3];
      const p1 = lerpPt(a[0], a[1], a[2], b[0], b[1], b[2]);
      const p2 = lerpPt(a[0], a[1], a[2], c[0], c[1], c[2]);
      outPos.push(...a, ...p1, ...p2);
      capSegments.push([p1[0], p1[2], p2[0], p2[2]]);
    } else if (nAbove === 2) {
      // Rotate so index 0 is below
      const idx = !above[0] ? 0 : !above[1] ? 1 : 2;
      const a = pts[idx];
      const b = pts[(idx + 1) % 3];
      const c = pts[(idx + 2) % 3];
      const p1 = lerpPt(a[0], a[1], a[2], b[0], b[1], b[2]);
      const p2 = lerpPt(a[0], a[1], a[2], c[0], c[1], c[2]);
      outPos.push(...p1, ...b, ...c);
      outPos.push(...p1, ...c, ...p2);
      capSegments.push([p2[0], p2[2], p1[0], p1[2]]);
    }
  }

  // Cap the bottom cross-section using fan triangulation around centroid (pointing -Y)
  if (capSegments.length > 0) {
    let cx = 0, cz = 0;
    for (const [x1, z1, x2, z2] of capSegments) {
      cx += x1 + x2;
      cz += z1 + z2;
    }
    cx /= capSegments.length * 2;
    cz /= capSegments.length * 2;

    for (const [x1, z1, x2, z2] of capSegments) {
      // Downward (-Y) normal
      outPos.push(cx, cutY, cz, x2, cutY, z2, x1, cutY, z1);
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  return repairAndWeldMesh(out);
}

/**
 * Merge multiple BufferGeometries cleanly into a single non-indexed then welded BufferGeometry.
 */
function mergeGeometriesSimple(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalFloats = 0;
  const nonIndexed = geoms.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    totalFloats += ni.getAttribute('position').count * 3;
    return ni;
  });

  const merged = new Float32Array(totalFloats);
  let offset = 0;
  for (const ni of nonIndexed) {
    const arr = ni.getAttribute('position').array as Float32Array;
    merged.set(arr, offset);
    offset += arr.length;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  out.computeVertexNormals();
  return out;
}

/**
 * Build a watertight 3D printable Display Pedestal / Base positioned from Y=0 to Y=heightMm.
 */
function buildPedestalGeometry(
  style: BaseStyle,
  footprintRadiusMm: number,
  heightMm: number,
  bevelRatio: number
): THREE.BufferGeometry | null {
  if (style === 'none') return null;

  const r = Math.max(8, footprintRadiusMm);
  const h = Math.max(2, heightMm);
  const bev = Math.min(h * 0.45, Math.max(0.5, h * bevelRatio));

  const makeLatheSolid = (profile: Array<[number, number]>, segments: number) => {
    // Strictly watertight revolved solid with shared exact center cap vertices (0 open edges)
    const positions: number[] = [];
    const indices: number[] = [];

    const rings = profile.length;
    for (let j = 0; j < rings; j++) {
      const [rad, y] = profile[j];
      for (let i = 0; i < segments; i++) {
        const phi = (i * Math.PI * 2) / segments;
        positions.push(Math.cos(phi) * rad, y, Math.sin(phi) * rad);
      }
    }

    // Bottom center vertex & top center vertex
    const botCenterIdx = positions.length / 3;
    positions.push(0, profile[0][1], 0);
    const topCenterIdx = positions.length / 3;
    positions.push(0, profile[rings - 1][1], 0);

    // Side quads between rings
    for (let j = 0; j < rings - 1; j++) {
      const r0 = j * segments;
      const r1 = (j + 1) * segments;
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const a = r0 + i;
        const b = r0 + next;
        const c = r1 + next;
        const d = r1 + i;
        // Outward winding around +Y
        indices.push(a, d, c);
        indices.push(a, c, b);
      }
    }

    // Bottom cap (-Y outward)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(botCenterIdx, i, next);
    }

    // Top cap (+Y outward)
    const topRing = (rings - 1) * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(topCenterIdx, topRing + next, topRing + i);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    return repairAndWeldMesh(g, 1e-4);
  };

  switch (style) {
    case 'round-plinth':
      return makeLatheSolid(
        [
          [r * 1.05, 0],
          [r * 1.05, h * 0.25],
          [r * 0.96, h - bev],
          [r * 0.96 - bev, h],
        ],
        64
      );
    case 'beveled-coin':
      return makeLatheSolid(
        [
          [r, 0],
          [r, h - bev],
          [r - bev, h],
        ],
        64
      );
    case 'hex-tabletop':
      return makeLatheSolid(
        [
          [r * 1.1, 0],
          [r * 1.02, h - bev],
          [r * 0.96, h],
        ],
        6
      );
    case 'square-museum': {
      const g = makeLatheSolid(
        [
          [r * 1.25, 0],
          [r * 1.25, h * 0.3],
          [r * 1.14, h - bev],
          [r * 1.06, h],
        ],
        4
      );
      g.rotateY(Math.PI / 4);
      return g;
    }
    case 'stepped-trophy':
      return makeLatheSolid(
        [
          [r * 1.16, 0],
          [r * 1.16, h * 0.32],
          [r * 1.02, h * 0.38],
          [r * 1.02, h * 0.72],
          [r * 0.9, h * 0.78],
          [r * 0.9, h - bev * 0.5],
          [r * 0.85, h],
        ],
        48
      );
    default:
      return null;
  }
}

/**
 * Create a resin-ready inward-offset hollow cavity (inverted normals inside the model)
 * + underside drain hole indicator channels.
 */
function buildHollowCavity(
  outerGeom: THREE.BufferGeometry,
  wallMm: number,
  drainCount: number,
  drainDiaMm: number
): THREE.BufferGeometry | null {
  const src = outerGeom.index ? outerGeom.clone() : repairAndWeldMesh(outerGeom);
  src.computeBoundingBox();
  src.computeVertexNormals();
  const box = src.boundingBox!;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Check if model is thick enough to hollow safely
  const minDim = Math.min(size.x, size.y, size.z);
  if (minDim < wallMm * 2.4) return null;

  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const norm = src.getAttribute('normal') as THREE.BufferAttribute;
  const innerPos = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);

    // Offset inward along vertex normal, blended gently toward centroid to avoid self-intersection
    const dx = center.x - vx;
    const dy = center.y - vy;
    const dz = center.z - vz;
    const dLen = Math.hypot(dx, dy, dz) || 1;
    const ox = -nx * 0.72 + (dx / dLen) * 0.28;
    const oy = -ny * 0.72 + (dy / dLen) * 0.28;
    const oz = -nz * 0.72 + (dz / dLen) * 0.28;
    const oLen = Math.hypot(ox, oy, oz) || 1;

    const shift = Math.min(wallMm, dLen * 0.45);
    innerPos[i * 3] = vx + (ox / oLen) * shift;
    innerPos[i * 3 + 1] = Math.max(box.min.y + wallMm * 0.6, vy + (oy / oLen) * shift);
    innerPos[i * 3 + 2] = vz + (oz / oLen) * shift;
  }

  const idxAttr = src.getIndex()!;
  const flippedIdx = new Uint32Array(idxAttr.count);
  // Flip triangle winding so inner cavity normals point INWARD (defining hollow void for slicers!)
  for (let i = 0; i < idxAttr.count; i += 3) {
    flippedIdx[i] = idxAttr.getX(i);
    flippedIdx[i + 1] = idxAttr.getX(i + 2);
    flippedIdx[i + 2] = idxAttr.getX(i + 1);
  }

  const cavity = new THREE.BufferGeometry();
  cavity.setAttribute('position', new THREE.BufferAttribute(innerPos, 3));
  cavity.setIndex(new THREE.BufferAttribute(flippedIdx, 1));
  cavity.computeVertexNormals();

  // Optional drain hole sleeves punched cleanly at the bottom (inverted cylinders)
  const parts: THREE.BufferGeometry[] = [cavity];
  if (drainCount > 0 && drainDiaMm >= 2) {
    const r = drainDiaMm * 0.5;
    const tubeH = wallMm * 1.45;
    const spread = Math.min(size.x, size.z) * 0.22;
    for (let k = 0; k < drainCount; k++) {
      const ang = (k * Math.PI * 2) / drainCount;
      const hx = center.x + (drainCount > 1 ? Math.cos(ang) * spread : 0);
      const hz = center.z + (drainCount > 1 ? Math.sin(ang) * spread : 0);
      const cyl = new THREE.CylinderGeometry(r, r, tubeH, 16, 1, true);
      // Invert cylinder normals to represent drain tunnel void
      const cIdx = cyl.getIndex()!;
      for (let i = 0; i < cIdx.count; i += 3) {
        const b = cIdx.getX(i + 1);
        const c = cIdx.getX(i + 2);
        cIdx.setX(i + 1, c);
        cIdx.setX(i + 2, b);
      }
      cyl.translate(hx, box.min.y + tubeH * 0.5, hz);
      parts.push(cyl);
    }
  }

  return mergeGeometriesSimple(parts);
}

/**
 * Full 3D Printability Diagnostics & Overhang Per-Vertex Color Attribute Builder.
 */
export function analyzeMeshForPrinting(
  geom: THREE.BufferGeometry,
  printer: PrinterPreset,
  overhangAngleDeg: number,
  hollowEnabled: boolean
): MeshDiagnostics {
  const indexed = geom.index ? geom : repairAndWeldMesh(geom);
  indexed.computeBoundingBox();
  const box = indexed.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);

  const pos = indexed.getAttribute('position') as THREE.BufferAttribute;
  const idx = indexed.getIndex()!;
  const triCount = Math.floor(idx.count / 3);

  // Edge map for manifold / watertight inspection
  const edgeCounts = new Map<string, number>();
  const addUndirectedEdge = (u: number, v: number) => {
    const a = u < v ? u : v;
    const b = u < v ? v : u;
    const k = `${a}_${b}`;
    edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
  };

  let signedVolumeMm3 = 0;
  let degenerateTriangles = 0;
  let overhangTriangles = 0;

  // Overhang threshold: downward normal Y < -sin(90 - overhangAngle) = -cos(overhangAngle)
  // Wait: vertical wall has ny = 0 (0° overhang). Horizontal ceiling has ny = -1 (90° overhang).
  // Overhang angle from vertical = asin(-ny). So overhang > thresholdDeg when -ny > sin(thresholdDeg).
  const overhangSinThreshold = Math.sin((overhangAngleDeg * Math.PI) / 180);
  const bedToleranceMm = 1.2; // triangles resting on the build plate (Y ≈ 0) are supported by the bed, NOT overhangs!

  // Track max overhang severity per vertex for live Heatmap visualization
  const vertexOverhang = new Float32Array(pos.count);

  for (let t = 0; t < triCount; t++) {
    const a = idx.getX(t * 3);
    const b = idx.getX(t * 3 + 1);
    const c = idx.getX(t * 3 + 2);

    addUndirectedEdge(a, b);
    addUndirectedEdge(b, c);
    addUndirectedEdge(c, a);

    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);

    // Volume contribution
    signedVolumeMm3 +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;

    // Face normal
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz);

    if (len < 1e-6) {
      degenerateTriangles++;
      continue;
    }

    const avgY = (ay + by + cy) / 3;
    const normY = ny / len;

    if (avgY > box.min.y + bedToleranceMm && -normY > overhangSinThreshold) {
      overhangTriangles++;
      const severity = Math.min(
        1,
        (-normY - overhangSinThreshold) / Math.max(0.05, 1 - overhangSinThreshold)
      );
      if (severity > vertexOverhang[a]) vertexOverhang[a] = severity;
      if (severity > vertexOverhang[b]) vertexOverhang[b] = severity;
      if (severity > vertexOverhang[c]) vertexOverhang[c] = severity;
    }
  }

  // Attach vertex colors to geometry for instant Overhang Heatmap material
  const heatmapColors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const sev = vertexOverhang[i];
    if (sev <= 0.01) {
      // Safe cool slate-cyan
      heatmapColors[i * 3] = 0.14;
      heatmapColors[i * 3 + 1] = 0.78;
      heatmapColors[i * 3 + 2] = 0.76;
    } else if (sev < 0.5) {
      // Warning amber-gold
      const t = sev * 2;
      heatmapColors[i * 3] = 0.98;
      heatmapColors[i * 3 + 1] = 0.76 - t * 0.32;
      heatmapColors[i * 3 + 2] = 0.08;
    } else {
      // Critical overhang hot crimson-magenta
      const t = (sev - 0.5) * 2;
      heatmapColors[i * 3] = 1.0;
      heatmapColors[i * 3 + 1] = 0.28 - t * 0.2;
      heatmapColors[i * 3 + 2] = 0.22 + t * 0.22;
    }
  }
  indexed.setAttribute('color', new THREE.BufferAttribute(heatmapColors, 3));

  let openEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) openEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  const volumeCm3 = Math.abs(signedVolumeMm3) / 1000;
  const effectiveVolumeCm3 = hollowEnabled ? volumeCm3 * 0.48 : volumeCm3;
  // PLA density 1.24 g/cm3, typical 20% infill + walls ~ 42% fill
  const filamentGrams = effectiveVolumeCm3 * 1.24 * (hollowEnabled ? 0.85 : 0.42);
  const resinMl = effectiveVolumeCm3 * 1.08;

  // Rough print time heuristic
  const estimatedMinutes =
    printer.type === 'SLA'
      ? Math.round(18 + size.y * 1.45) // resin time scales mainly with Z height
      : Math.round(14 + effectiveVolumeCm3 * 1.9 + size.y * 0.45);

  const fitsBuildPlate =
    size.x <= printer.bedWidthMm &&
    size.z <= printer.bedDepthMm &&
    size.y <= printer.bedHeightMm;

  const isWatertight = openEdges === 0 && nonManifoldEdges === 0;
  const overhangPercent = triCount > 0 ? (overhangTriangles / triCount) * 100 : 0;

  const warnings: string[] = [];
  let score = 100;

  if (!isWatertight) {
    score -= Math.min(35, openEdges > 0 ? 22 : 12);
    warnings.push(
      `Non-manifold mesh (${openEdges} open, ${nonManifoldEdges} non-manifold edges) — click Auto-Repair.`
    );
  }
  if (!fitsBuildPlate) {
    score -= 25;
    warnings.push(
      `Exceeds ${printer.brand} ${printer.name} build volume (${printer.bedWidthMm}×${printer.bedDepthMm}×${printer.bedHeightMm}mm).`
    );
  }
  if (overhangPercent > 18) {
    score -= Math.min(20, Math.round((overhangPercent - 12) * 0.6));
    warnings.push(
      `${overhangPercent.toFixed(1)}% steep overhangs (>${overhangAngleDeg}°) — enable Tree/Auto Supports in slicer.`
    );
  }
  if (Math.min(size.x, size.y, size.z) < printer.minWallMm) {
    score -= 12;
    warnings.push(`Model dimension below ${printer.minWallMm}mm minimum wall thickness.`);
  }
  if (printer.type === 'SLA' && !hollowEnabled && volumeCm3 > 55) {
    warnings.push('Large solid resin volume (>55cm³) — consider enabling Hollowing + Drain Holes.');
  }

  return {
    vertexCount: pos.count,
    triangleCount: triCount,
    sizeXMm: size.x,
    sizeYMm: size.y,
    sizeZMm: size.z,
    volumeCm3: effectiveVolumeCm3,
    filamentGrams,
    resinMl,
    estimatedMinutes,
    openEdges,
    nonManifoldEdges,
    degenerateTriangles,
    isWatertight,
    overhangPercent,
    overhangTriangles,
    fitsBuildPlate,
    printabilityScore: Math.max(15, Math.min(100, Math.round(score))),
    warnings,
  };
}

export interface PreparedPrintResult {
  geometry: THREE.BufferGeometry;
  innerCavityGeometry: THREE.BufferGeometry | null;
  diagnostics: MeshDiagnostics;
}

/**
 * Full Print-Prep Pipeline:
 * Raw mesh -> Optional Repair -> Taubin Smooth -> Rotate -> Scale to real mm ->
 * Optional Flatten Bottom Plane Cut -> Drop to Y=0 -> Optional Attach Pedestal ->
 * Optional Resin Hollowing + Drain Holes -> Overhang & Manifold Diagnostics!
 */
export function preparePrintMesh(
  rawGeometry: THREE.BufferGeometry,
  prep: PrintPrepSettings,
  base: BaseConfig,
  printer: PrinterPreset
): PreparedPrintResult {
  let g = prep.autoRepairOnBuild
    ? repairAndWeldMesh(rawGeometry)
    : rawGeometry.clone();

  // 1. Optional shrinkage-free Taubin smoothing
  if (prep.smoothIterations > 0) {
    g = taubinSmooth(g, prep.smoothIterations);
  }

  // 2. Center and apply user rotation
  g.computeBoundingBox();
  const center = new THREE.Vector3();
  g.boundingBox!.getCenter(center);
  g.translate(-center.x, -center.y, -center.z);

  if (prep.rotationXDeg !== 0 || prep.rotationYDeg !== 0 || prep.rotationZDeg !== 0) {
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(prep.rotationXDeg),
      THREE.MathUtils.degToRad(prep.rotationYDeg),
      THREE.MathUtils.degToRad(prep.rotationZDeg),
      'XYZ'
    );
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
  }

  // 3. Scale uniformly to exact target height in millimeters
  g.computeBoundingBox();
  const size = new THREE.Vector3();
  g.boundingBox!.getSize(size);
  const currentH = Math.max(0.001, size.y);
  const scaleFactor = prep.targetHeightMm / currentH;
  g.scale(scaleFactor, scaleFactor, scaleFactor);

  // 4. Optional Auto-Flatten Bottom Plane Cut
  if (prep.flattenBottomMm > 0.1) {
    g = flattenBottomPlaneCut(g, prep.flattenBottomMm);
  }

  // 5. Drop flush onto Build Plate (Y = 0) centered on X=0, Z=0
  g.computeBoundingBox();
  const boxAfter = g.boundingBox!;
  const cx = (boxAfter.min.x + boxAfter.max.x) * 0.5;
  const cz = (boxAfter.min.z + boxAfter.max.z) * 0.5;
  g.translate(-cx, -boxAfter.min.y, -cz);

  // 6. Optional Display Base / Pedestal attachment
  if (base.style !== 'none') {
    g.computeBoundingBox();
    const bSize = new THREE.Vector3();
    g.boundingBox!.getSize(bSize);
    const footprintR = Math.max(bSize.x, bSize.z) * 0.5 * base.diameterScale;
    const pedestal = buildPedestalGeometry(
      base.style,
      footprintR,
      base.heightMm,
      base.bevelRatio
    );
    if (pedestal) {
      // Lift figurine by (base.heightMm - base.sinkMm) so its feet embed solidly into the pedestal
      const liftY = Math.max(0.5, base.heightMm - base.sinkMm);
      g.translate(0, liftY, 0);
      g = repairAndWeldMesh(mergeGeometriesSimple([g, pedestal]));
    }
  }

  // 7. Optional Resin Hollowing + Drain Holes
  let innerCavityGeometry: THREE.BufferGeometry | null = null;
  if (prep.hollowEnabled) {
    innerCavityGeometry = buildHollowCavity(
      g,
      prep.hollowWallMm,
      prep.drainHoleCount,
      prep.drainHoleDiaMm
    );
  }

  // 8. Final Diagnostics & Overhang Vertex Color Heatmap
  const diagnostics = analyzeMeshForPrinting(
    g,
    printer,
    prep.overhangAngleDeg,
    prep.hollowEnabled
  );

  // Ensure normals are fresh
  g.computeVertexNormals();

  return {
    geometry: g,
    innerCavityGeometry,
    diagnostics,
  };
}

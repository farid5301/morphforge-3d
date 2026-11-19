import * as THREE from 'three';
import JSZip from 'jszip';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ExportResult } from '../types/studio';

/**
 * Collect triangles from primary mesh (+ optional hollow inner cavity mesh)
 * and convert from Three.js Y-Up to 3D Slicer Z-Up:
 *   (x, y, z) -> (x, -z, y)
 * This is a +90° rotation around +X (determinant +1), preserving outward triangle winding!
 * Also shifts Z so the bottom of the mesh rests flush at Z = 0.000 mm.
 */
function extractSlicerTrianglesZUp(
  outerGeom: THREE.BufferGeometry,
  innerCavityGeom?: THREE.BufferGeometry | null
): {
  vertices: Float32Array;
  triangles: Uint32Array;
} {
  const sources = [outerGeom, ...(innerCavityGeom ? [innerCavityGeom] : [])];

  // First find minY across outer geometry so Z=0 aligns flush with build plate
  outerGeom.computeBoundingBox();
  const minY = outerGeom.boundingBox?.min.y ?? 0;

  let totalVerts = 0;
  let totalIdx = 0;

  const prepared = sources.map((src) => {
    const pos = src.getAttribute('position') as THREE.BufferAttribute;
    const idx = src.getIndex();
    const vCount = pos.count;
    const iCount = idx ? idx.count : vCount;
    const res = { pos, idx, vCount, iCount, vOffset: totalVerts };
    totalVerts += vCount;
    totalIdx += iCount;
    return res;
  });

  const vertices = new Float32Array(totalVerts * 3);
  const triangles = new Uint32Array(totalIdx);

  let triOffset = 0;
  for (const part of prepared) {
    const { pos, idx, vCount, iCount, vOffset } = part;
    for (let i = 0; i < vCount; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i) - minY;
      const z = pos.getZ(i);
      // Y-Up -> Z-Up (+90° around X)
      vertices[(vOffset + i) * 3] = x;
      vertices[(vOffset + i) * 3 + 1] = -z;
      vertices[(vOffset + i) * 3 + 2] = y;
    }

    if (idx) {
      for (let i = 0; i < iCount; i++) {
        triangles[triOffset++] = vOffset + idx.getX(i);
      }
    } else {
      for (let i = 0; i < iCount; i++) {
        triangles[triOffset++] = vOffset + i;
      }
    }
  }

  return { vertices, triangles };
}

/**
 * 1) BINARY STL EXPORTER (Universal Slicer Standard: Bambu Studio, Cura, PrusaSlicer, OrcaSlicer, Chitubox, Lychee)
 */
export function buildBinarySTL(
  outerGeom: THREE.BufferGeometry,
  innerCavityGeom?: THREE.BufferGeometry | null
): Uint8Array {
  const { vertices, triangles } = extractSlicerTrianglesZUp(outerGeom, innerCavityGeom);
  const triCount = Math.floor(triangles.length / 3);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  // 80-byte ASCII header
  const header = 'MorphForge 3D Studio - Watertight Slicer-Ready Binary STL (mm)';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 32);
  }
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const ia = triangles[t * 3] * 3;
    const ib = triangles[t * 3 + 1] * 3;
    const ic = triangles[t * 3 + 2] * 3;

    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    // Facet normal
    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    // Vertices A, B, C
    view.setFloat32(offset, ax, true); offset += 4;
    view.setFloat32(offset, ay, true); offset += 4;
    view.setFloat32(offset, az, true); offset += 4;

    view.setFloat32(offset, bx, true); offset += 4;
    view.setFloat32(offset, by, true); offset += 4;
    view.setFloat32(offset, bz, true); offset += 4;

    view.setFloat32(offset, cx, true); offset += 4;
    view.setFloat32(offset, cy, true); offset += 4;
    view.setFloat32(offset, cz, true); offset += 4;

    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * 2) SPEC-COMPLIANT 3MF EXPORTER (Modern Slicer Format with Millimeter Units & Metadata)
 */
export async function build3MFArchive(
  outerGeom: THREE.BufferGeometry,
  innerCavityGeom: THREE.BufferGeometry | null | undefined,
  modelName = 'MorphForge_Model'
): Promise<Uint8Array> {
  const { vertices, triangles } = extractSlicerTrianglesZUp(outerGeom, innerCavityGeom);
  const vCount = vertices.length / 3;
  const tCount = Math.floor(triangles.length / 3);

  const vertLines: string[] = new Array(vCount);
  for (let i = 0; i < vCount; i++) {
    vertLines[i] =
      `<vertex x="${vertices[i * 3].toFixed(4)}" y="${vertices[i * 3 + 1].toFixed(4)}" z="${vertices[i * 3 + 2].toFixed(4)}"/>`;
  }

  const triLines: string[] = new Array(tCount);
  for (let t = 0; t < tCount; t++) {
    triLines[t] =
      `<triangle v1="${triangles[t * 3]}" v2="${triangles[t * 3 + 1]}" v3="${triangles[t * 3 + 2]}"/>`;
  }

  const safeTitle = modelName.replace(/[<>&"']/g, '');

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${safeTitle}</metadata>
  <metadata name="Application">MorphForge 3D Portable Studio</metadata>
  <resources>
    <object id="1" type="model" name="${safeTitle}">
      <mesh>
        <vertices>
${vertLines.join('\n')}
        </vertices>
        <triangles>
${triLines.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.folder('_rels')!.file('.rels', relsXml);
  zip.folder('3D')!.file('3dmodel.model', modelXml);

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * 3) WAVEFRONT OBJ EXPORTER (Great for Blender / ZBrush further sculpting)
 */
export function buildOBJBytes(
  outerGeom: THREE.BufferGeometry,
  innerCavityGeom?: THREE.BufferGeometry | null,
  modelName = 'MorphForge_Model'
): Uint8Array {
  const { vertices, triangles } = extractSlicerTrianglesZUp(outerGeom, innerCavityGeom);
  const vCount = vertices.length / 3;
  const tCount = Math.floor(triangles.length / 3);

  const lines: string[] = [
    '# Exported by MorphForge 3D Studio (Units: Millimeters, Z-Up)',
    `o ${modelName.replace(/\s+/g, '_')}`,
  ];

  for (let i = 0; i < vCount; i++) {
    lines.push(
      `v ${vertices[i * 3].toFixed(4)} ${vertices[i * 3 + 1].toFixed(4)} ${vertices[i * 3 + 2].toFixed(4)}`
    );
  }
  for (let t = 0; t < tCount; t++) {
    lines.push(
      `f ${triangles[t * 3] + 1} ${triangles[t * 3 + 1] + 1} ${triangles[t * 3 + 2] + 1}`
    );
  }

  return new TextEncoder().encode(lines.join('\n'));
}

/**
 * 4) BINARY GLB EXPORTER (glTF 2.0)
 */
export async function buildGLBBytes(
  outerGeom: THREE.BufferGeometry,
  innerCavityGeom?: THREE.BufferGeometry | null
): Promise<Uint8Array> {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    roughness: 0.35,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(outerGeom.clone(), mat);
  mesh.name = 'MorphForge_Printable_Model';
  group.add(mesh);

  if (innerCavityGeom) {
    const cavityMesh = new THREE.Mesh(innerCavityGeom.clone(), mat);
    cavityMesh.name = 'Hollow_Cavity';
    group.add(cavityMesh);
  }

  const exporter = new GLTFExporter();
  const arrayBuf = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('Expected binary GLB ArrayBuffer'));
      },
      (err) => reject(err),
      { binary: true }
    );
  });

  return new Uint8Array(arrayBuf);
}

/**
 * Unified Save Helper — uses Electron native Save Dialog when available, falls back to browser download.
 */
export async function saveExportedBytes(
  data: Uint8Array,
  baseName: string,
  extension: 'stl' | '3mf' | 'obj' | 'glb',
  filterName: string
): Promise<ExportResult> {
  const defaultName = `${baseName}.${extension}`;

  if (window.morphforge?.saveBinaryFile) {
    return window.morphforge.saveBinaryFile({
      defaultName,
      extension,
      filterName,
      data,
    });
  }

  // Fallback for browser dev mode
  const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { success: true, filePath: defaultName, bytes: data.byteLength };
}

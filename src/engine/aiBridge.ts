import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { AIProviderConfig } from '../types/studio';
import { repairAndWeldMesh } from './printPrep';

/**
 * Extract and merge all mesh geometries from a loaded Three.js Object3D hierarchy
 * into a single clean BufferGeometry in world space.
 */
function flattenObjectToGeometry(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const chunks: Float32Array[] = [];
  let totalFloats = 0;

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      const cloned = obj.geometry.clone();
      cloned.applyMatrix4(obj.matrixWorld);
      const nonIdx = cloned.index ? cloned.toNonIndexed() : cloned;
      const pos = nonIdx.getAttribute('position');
      if (pos && pos.count >= 3) {
        const arr = new Float32Array(pos.array as Float32Array);
        chunks.push(arr);
        totalFloats += arr.length;
      }
      cloned.dispose();
    }
  });

  if (totalFloats === 0) {
    throw new Error('No 3D mesh geometry found inside imported file.');
  }

  const merged = new Float32Array(totalFloats);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  return repairAndWeldMesh(out);
}

/**
 * Parse raw bytes of a .GLB / .GLTF / .OBJ / .STL file into a clean BufferGeometry.
 */
export async function parseMeshBytes(
  bytes: Uint8Array,
  ext: string
): Promise<THREE.BufferGeometry> {
  const cleanExt = ext.toLowerCase().replace(/^\./, '');

  if (cleanExt === 'stl') {
    const loader = new STLLoader();
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const geom = loader.parse(ab);
    // Most STLs are Z-up; rotate -90° X into Three.js Y-up
    geom.rotateX(-Math.PI / 2);
    return repairAndWeldMesh(geom);
  }

  if (cleanExt === 'obj') {
    const loader = new OBJLoader();
    const text = new TextDecoder().decode(bytes);
    const obj = loader.parse(text);
    return flattenObjectToGeometry(obj);
  }

  // GLB / GLTF
  const loader = new GLTFLoader();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.parse(ab, '', resolve, reject);
  });
  return flattenObjectToGeometry(gltf.scene);
}

/**
 * Invoke Electron Main Process 360° AI Generator (Hugging Face Spaces, Meshy, Tripo3D, or Local RTX 5060 GPU)
 */
export async function runAI360Generation(
  imageBase64: string,
  config: AIProviderConfig
): Promise<THREE.BufferGeometry> {
  if (!window.morphforge?.generateAI3D) {
    throw new Error(
      'AI 360° Bridge requires the MorphForge 3D Desktop App (Electron).'
    );
  }

  const res = await window.morphforge.generateAI3D({
    provider: config.provider,
    imageBase64,
    hfToken: config.hfToken,
    customSpaceId: config.customSpaceId,
    meshyApiKey: config.meshyApiKey,
    tripoApiKey: config.tripoApiKey,
    localUrl: config.localUrl,
    resolution: config.resolution,
    seed: config.seed,
  });

  if (!res.success || !res.data) {
    throw new Error(res.error || 'AI 360° generation failed.');
  }

  return parseMeshBytes(new Uint8Array(res.data), res.ext || 'glb');
}

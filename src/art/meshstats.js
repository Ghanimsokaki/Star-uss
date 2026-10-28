/**
 * Hull measurements — the numbers that decide whether a model is game-ready.
 *
 * Shared by the hull viewer (which displays them) and the tests (which check
 * them against the models that actually ship), so the viewer cannot quietly
 * disagree with what the game will do with a mesh.
 */
import * as THREE from 'three';

/**
 * @param {THREE.Object3D} root
 * @returns {{
 *   triangles: number, meshes: number, materials: number, textures: number,
 *   skinned: boolean, size: {x:number,y:number,z:number},
 *   longestAxis: 'X'|'Y'|'Z', needsRotation: boolean, empty: boolean
 * }}
 */
export function analyseModel(root) {
  let triangles = 0;
  let meshes = 0;
  let skinned = false;
  const materials = new Set();
  const textures = new Set();

  root?.traverse?.((o) => {
    if (o.isSkinnedMesh) skinned = true;
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    if (g) triangles += (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      materials.add(m.uuid);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        if (m[k]) textures.add(m[k].uuid);
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const empty = box.isEmpty();
  const size = empty
    ? { x: 0, y: 0, z: 0 }
    : { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };

  // The game wants the hull's long axis on Z, nose toward +Z.
  const longestAxis = size.x >= size.y && size.x >= size.z ? 'X' : size.y >= size.z ? 'Y' : 'Z';

  return {
    triangles: Math.round(triangles),
    meshes,
    materials: materials.size,
    textures: textures.size,
    skinned,
    size,
    longestAxis,
    needsRotation: !empty && longestAxis !== 'Z',
    empty,
  };
}

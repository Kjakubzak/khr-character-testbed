import * as THREE from 'three';

export interface KHRNodeCameraHint {
  node: THREE.Object3D;
  role: string;
  label?: string;
  targetNode?: THREE.Object3D;
  projection?: THREE.Camera;
}

/** Initial camera frame uses the global node transform with scaling removed. */
export function getInitialCameraFrame(hint: KHRNodeCameraHint): THREE.Matrix4 | null {
  hint.node.updateWorldMatrix(true, false);
  for (let node: THREE.Object3D | null = hint.node; node; node = node.parent) {
    const determinant = node.matrix.determinant();
    if (!Number.isFinite(determinant) || determinant === 0) return null;
  }
  const determinant = hint.node.matrixWorld.determinant();
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const scale = new THREE.Vector3(...[0, 1, 2].map((column) =>
    new THREE.Vector3().setFromMatrixColumn(hint.node.matrixWorld, column).length()) as [number, number, number]);
  if (determinant < 0) scale.x *= -1;
  if (scale.x === 0 || scale.y === 0 || scale.z === 0) return null;
  const frame = hint.node.matrixWorld.clone();
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) frame.elements[4 * column + row] /= scale.getComponent(column);
  }
  return frame;
}

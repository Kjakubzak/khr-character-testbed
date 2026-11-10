import * as THREE from 'three';

export const LOOKAT_TARGET_EXTENSION = 'KHR_node_lookat_target';

/** One KHR_node_lookat_target marker: a glTF node and its optional advisory hint. */
export interface KHRNodeLookatTargetMarker {
  nodeIndex: number;
  /** Advisory label; no standard values. An unrecognized or omitted hint does not affect the target point. */
  hint?: string;
  /** Every evaluated instance of the node in the loaded scenes. A node with no instance has no target point. */
  instances: THREE.Object3D[];
}

/**
 * Target point of one marker instance: the translation of the instance's global transform under
 * the current evaluation state. The node's own rotation and scale define no direction or size.
 */
export function getLookatTargetPoint(instance: THREE.Object3D, target = new THREE.Vector3()): THREE.Vector3 {
  instance.updateWorldMatrix(true, false);
  return target.setFromMatrixPosition(instance.matrixWorld);
}

/** Read the optional hint; an invalid value is reported and treated as omitted, never rejecting the marker. */
export function parseLookatTargetHint(extension: unknown, where: string): string | undefined {
  const hint = (extension as { hint?: unknown } | null)?.hint;
  if (hint === undefined) return undefined;
  if (typeof hint === 'string' && hint.length > 0) return hint;
  console.warn(`${where}: "hint" must be a nonempty string. Treating it as omitted.`);
  return undefined;
}

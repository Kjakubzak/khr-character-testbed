import * as THREE from 'three';
import type { ResolvedNodePose, ResolvedReferencePose } from './resolveReferencePoses.ts';

/**
 * One tagged reference-pose animation with its resolved per-node values.
 * Tagging changes neither ordinary playback nor any node property; `withPose`
 * applies the pose only for the duration of a callback.
 */
export class KHRCharacterReferencePose {
  public readonly animationIndex: number;
  public readonly animationName: string | undefined;
  public readonly poseType: string;
  public readonly isStandardPoseType: boolean;
  /** Resolved local value for every node index. */
  public readonly nodes: readonly ResolvedNodePose[];
  /** Runtime objects per node index (undefined when the loader created none). */
  public readonly nodeObjects: readonly (THREE.Object3D | undefined)[];
  private readonly parents: readonly (number | undefined)[];

  public constructor(resolved: ResolvedReferencePose, nodeObjects: readonly (THREE.Object3D | undefined)[], parents: readonly (number | undefined)[]) {
    this.animationIndex = resolved.animationIndex;
    this.animationName = resolved.animationName;
    this.poseType = resolved.poseType;
    this.isStandardPoseType = resolved.isStandardPoseType;
    this.nodes = resolved.nodes;
    this.nodeObjects = nodeObjects;
    this.parents = parents;
  }

  /** The node's resolved reference-pose value as a local matrix. */
  public getLocalMatrix(nodeIndex: number, target = new THREE.Matrix4()): THREE.Matrix4 {
    const pose = this.nodes[nodeIndex];
    if (pose.matrix != null) return target.fromArray(pose.matrix);
    return target.compose(new THREE.Vector3().fromArray(pose.translation),
      new THREE.Quaternion().fromArray(pose.rotation), new THREE.Vector3().fromArray(pose.scale));
  }

  /** Global reference-pose transform: the core glTF global transform using resolved local values. */
  public getGlobalMatrix(nodeIndex: number, target = new THREE.Matrix4()): THREE.Matrix4 {
    this.getLocalMatrix(nodeIndex, target);
    const local = new THREE.Matrix4();
    for (let parent = this.parents[nodeIndex]; parent != null; parent = this.parents[parent]) {
      target.premultiply(this.getLocalMatrix(parent, local));
    }
    return target;
  }

  /**
   * Run `fn` with every node object set to its resolved reference-pose value, then restore the
   * previous local transforms, even if `fn` throws.
   */
  public withPose<T>(fn: () => T): T {
    const saved: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3]> = [];
    const matrix = new THREE.Matrix4();
    this.nodeObjects.forEach((object, index) => {
      if (object == null) return;
      saved.push([object, object.position.clone(), object.quaternion.clone(), object.scale.clone()]);
      this.getLocalMatrix(index, matrix).decompose(object.position, object.quaternion, object.scale);
    });
    try {
      return fn();
    } finally {
      for (const [object, position, quaternion, scale] of saved) {
        object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale);
      }
    }
  }
}

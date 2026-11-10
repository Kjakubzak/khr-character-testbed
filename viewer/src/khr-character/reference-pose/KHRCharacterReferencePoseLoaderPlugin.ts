import type * as THREE from 'three';
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF as GLTFSchema } from '@gltf-transform/core';
import { KHRCharacterReferencePose } from './KHRCharacterReferencePose.ts';
import { REFERENCE_POSE_EXTENSION, nodeParents, resolveReferencePoses } from './resolveReferencePoses.ts';

/**
 * Identifies every animation tagged with KHR_character_reference_pose and exposes it, its
 * `poseType` and its resolved values as `gltf.userData.khrCharacterReferencePoses`.
 */
export class KHRCharacterReferencePoseLoaderPlugin implements GLTFLoaderPlugin {
  public readonly parser: GLTFParser;
  public get name(): string { return REFERENCE_POSE_EXTENSION; }
  public constructor(parser: GLTFParser) { this.parser = parser; }

  public async afterRoot(gltf: GLTF): Promise<void> {
    gltf.userData.khrCharacterReferencePoses = await this._import();
  }

  private async _import(): Promise<KHRCharacterReferencePose[] | null> {
    const json = this.parser.json as GLTFSchema.IGLTF;
    if (!json.extensionsUsed?.includes(REFERENCE_POSE_EXTENSION)) return null;
    const { poses, errors } = await resolveReferencePoses(json, async (index) => {
      const accessor = await this.parser.getDependency('accessor', index) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      const values: number[] = [];
      for (let i = 0; i < accessor.count; i++) for (let c = 0; c < accessor.itemSize; c++) values.push(accessor.getComponent(i, c));
      return values;
    });
    for (const error of errors) console.warn(error);
    if (poses.length === 0) return [];
    const nodeObjects = await Promise.all((json.nodes ?? []).map(async (_, index) =>
      await this.parser.getDependency('node', index) as THREE.Object3D | undefined));
    const parents = nodeParents(json);
    return poses.map((pose) => new KHRCharacterReferencePose(pose, nodeObjects, parents));
  }
}

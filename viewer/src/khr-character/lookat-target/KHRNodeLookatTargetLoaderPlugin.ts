import type * as THREE from 'three';
import type { GLTF, GLTFLoaderPlugin, GLTFParser, GLTFReference } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF as GLTFSchema } from '@gltf-transform/core';
import { LOOKAT_TARGET_EXTENSION, parseLookatTargetHint, type KHRNodeLookatTargetMarker } from './KHRNodeLookatTarget.ts';

interface GLTFNodeReference extends GLTFReference { nodes?: number; }

/**
 * Recognizes every KHR_node_lookat_target marker and exposes it with its instances as
 * `gltf.userData.khrNodeLookatTargets`. The marker has no side effects; selecting and using a
 * point is left to host logic.
 */
export class KHRNodeLookatTargetLoaderPlugin implements GLTFLoaderPlugin {
  public readonly parser: GLTFParser;
  public get name(): string { return LOOKAT_TARGET_EXTENSION; }
  public constructor(parser: GLTFParser) { this.parser = parser; }

  public async afterRoot(gltf: GLTF): Promise<void> {
    const json = this.parser.json as GLTFSchema.IGLTF;
    if (!json.extensionsUsed?.includes(LOOKAT_TARGET_EXTENSION)) { gltf.userData.khrNodeLookatTargets = null; return; }
    const markers = new Map<number, KHRNodeLookatTargetMarker>();
    (json.nodes ?? []).forEach((node, nodeIndex) => {
      const extension = node.extensions?.[LOOKAT_TARGET_EXTENSION];
      if (extension == null) return;
      const hint = parseLookatTargetHint(extension, `${LOOKAT_TARGET_EXTENSION} on node #${nodeIndex}`);
      markers.set(nodeIndex, { nodeIndex, ...(hint != null ? { hint } : {}), instances: [] });
    });
    for (const scene of gltf.scenes) scene.traverse((object: THREE.Object3D) => {
      const index = (this.parser.associations.get(object) as GLTFNodeReference | undefined)?.nodes;
      if (index != null) markers.get(index)?.instances.push(object);
    });
    gltf.userData.khrNodeLookatTargets = [...markers.values()];
  }
}

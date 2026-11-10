import type { GLTF } from '@gltf-transform/core';
import type { VRMCVRM } from '@pixiv/types-vrmc-vrm-1.0';
import type { KHRCharacterReferencePose } from '../../schematypes/KHRCharacterReferencePose.ts';
import { appendInputAccessor, appendOutputAccessor } from './expressions/appendAnimationAccessors.ts';
import { logVerbose } from './logVerbose.ts';

const EXTENSION_NAME = 'KHR_character_reference_pose';

/**
 * Appends a `KHR_character_reference_pose` animation labeled `t_pose`.
 *
 * VRM 1.0 requires the model's rest pose, its authored node transforms, to be the "VRM T-pose"
 * (upright, facing +Z, arms along X), which also meets the extension's up and facing convention.
 * The animation holds one STEP key per humanoid bone node with that node's authored rotation
 * and translation; untargeted nodes and properties resolve to their authored values anyway.
 * Nodes that author `matrix` cannot be animated and are skipped.
 *
 * Nothing is written when the input has no VRM humanoid, when no bone node can be targeted, or
 * when an animation already carries the extension.
 */
export function appendKHRCharacterReferencePose(gltf: GLTF.IGLTF, binChunkBox: [Uint8Array]): void {
  const vrm = gltf.extensions?.['VRMC_vrm'] as VRMCVRM | undefined;
  const humanBones = vrm?.humanoid?.humanBones;
  if (humanBones == null) return;
  if (gltf.animations?.some((animation) => animation.extensions?.[EXTENSION_NAME] != null)) {
    logVerbose(`${EXTENSION_NAME}: The input already has a tagged animation, skipping`);
    return;
  }

  const nodes = gltf.nodes ?? [];
  const nodeIndices: number[] = [];
  for (const bone of Object.values(humanBones)) {
    const index = bone?.node;
    if (index == null || nodeIndices.includes(index)) continue;
    const node = nodes[index];
    if (node == null) continue;
    if (node.matrix != null) {
      logVerbose(`${EXTENSION_NAME}: Node #${index} defines matrix and cannot be targeted, skipping`);
      continue;
    }
    nodeIndices.push(index);
  }
  nodeIndices.sort((a, b) => a - b);
  if (nodeIndices.length === 0) return;

  const input = appendInputAccessor(new Float32Array([0]), gltf, binChunkBox);
  const animation: GLTF.IAnimation = {
    name: 'ReferencePose_t_pose',
    channels: [],
    samplers: [],
    extensions: { [EXTENSION_NAME]: { poseType: 't_pose' } satisfies KHRCharacterReferencePose },
  };
  for (const nodeIndex of nodeIndices) {
    const node = nodes[nodeIndex];
    const rotation = appendOutputAccessor(new Float32Array(node.rotation ?? [0, 0, 0, 1]), 'VEC4', gltf, binChunkBox);
    const translation = appendOutputAccessor(new Float32Array(node.translation ?? [0, 0, 0]), 'VEC3', gltf, binChunkBox);
    animation.samplers.push({ input, output: rotation, interpolation: 'STEP' }, { input, output: translation, interpolation: 'STEP' });
    animation.channels.push(
      { sampler: animation.samplers.length - 2, target: { node: nodeIndex, path: 'rotation' } },
      { sampler: animation.samplers.length - 1, target: { node: nodeIndex, path: 'translation' } },
    );
  }
  gltf.animations ||= [];
  gltf.animations.push(animation);
  gltf.extensionsUsed ||= [];
  if (!gltf.extensionsUsed.includes(EXTENSION_NAME)) gltf.extensionsUsed.push(EXTENSION_NAME);
  logVerbose(`${EXTENSION_NAME}: Appended t_pose animation #${gltf.animations.length - 1} with ${animation.channels.length} channels`);
}

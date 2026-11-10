import type { GLTF as GLTFSchema } from '@gltf-transform/core';

export const REFERENCE_POSE_EXTENSION = 'KHR_character_reference_pose';

/** Standard pose labels: exact and case-sensitive. Any other nonempty label is custom. */
export const STANDARD_POSE_TYPES: readonly string[] = ['t_pose', 'a_pose', 'i_pose'];

/** One node's resolved reference-pose value: a local transform. */
export interface ResolvedNodePose {
  /** Column-major local matrix when the node authors `matrix` (never targeted by a valid tagged animation). */
  matrix?: number[];
  translation: number[];
  rotation: number[];
  scale: number[];
}

export interface ResolvedReferencePose {
  /** Animation array index; the authoritative identity of the tagged animation. */
  animationIndex: number;
  animationName?: string;
  poseType: string;
  isStandardPoseType: boolean;
  /** Resolved local value for every node, indexed like `nodes`. */
  nodes: ResolvedNodePose[];
}

/** Reads a decoded accessor (normalized integers already converted to floats). */
export type AccessorReader = (accessorIndex: number) => Promise<readonly number[]>;

const TRS = { translation: 'VEC3', rotation: 'VEC4', scale: 'VEC3' } as const;
type TRSPath = keyof typeof TRS;

/** A node's authored initial local value, with core defaults for omitted TRS properties. */
export function authoredNodePose(node: GLTFSchema.INode | undefined): ResolvedNodePose {
  const pose: ResolvedNodePose = {
    translation: [...(node?.translation ?? [0, 0, 0])],
    rotation: [...(node?.rotation ?? [0, 0, 0, 1])],
    scale: [...(node?.scale ?? [1, 1, 1])],
  };
  if (node?.matrix != null) pose.matrix = [...node.matrix];
  return pose;
}

/**
 * Identify every tagged animation and resolve its reference pose (KHR_character_reference_pose,
 * Reference-pose validity). Invalid tagged animations are reported in `errors` and not returned.
 * Targeted TRS properties use the single sampled output; everything else uses the authored
 * initial value, never the live node state.
 */
export async function resolveReferencePoses(
  json: GLTFSchema.IGLTF, readAccessor: AccessorReader,
): Promise<{ poses: ResolvedReferencePose[]; errors: string[] }> {
  const poses: ResolvedReferencePose[] = [];
  const errors: string[] = [];
  const nodes = json.nodes ?? [];
  for (const [animationIndex, animation] of (json.animations ?? []).entries()) {
    const extension = animation.extensions?.[REFERENCE_POSE_EXTENSION] as { poseType?: unknown } | undefined;
    if (extension == null) continue;
    const where = `${REFERENCE_POSE_EXTENSION} on animation #${animationIndex}`;
    try {
      const poseType = extension.poseType;
      if (typeof poseType !== 'string' || poseType.length === 0) throw new Error('"poseType" must be a nonempty string');
      if (animation.channels.length === 0) throw new Error('the animation must contain at least one channel');
      const resolved = nodes.map(authoredNodePose);
      const seen = new Set<string>();
      for (const [channelIndex, channel] of animation.channels.entries()) {
        const target = channel.target as { node?: number; path: string; extensions?: Record<string, unknown> };
        const path = target.path as TRSPath;
        if (!(path in TRS) || target.extensions?.KHR_animation_pointer != null) {
          throw new Error(`channel #${channelIndex} must target node translation, rotation or scale`);
        }
        const nodeIndex = target.node;
        if (nodeIndex == null || !Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) {
          throw new Error(`channel #${channelIndex} has an invalid target node`);
        }
        if (nodes[nodeIndex].matrix != null) throw new Error(`channel #${channelIndex} targets node #${nodeIndex}, which defines matrix`);
        const key = `${nodeIndex}/${path}`;
        if (seen.has(key)) throw new Error(`node #${nodeIndex} ${path} is targeted more than once`);
        seen.add(key);
        const sampler = animation.samplers[channel.sampler];
        if (sampler == null) throw new Error(`channel #${channelIndex} has an invalid sampler`);
        const interpolation = sampler.interpolation ?? 'LINEAR';
        if (interpolation !== 'LINEAR' && interpolation !== 'STEP') throw new Error(`channel #${channelIndex} uses ${interpolation}; only LINEAR or STEP is allowed`);
        const input = json.accessors?.[sampler.input];
        const output = json.accessors?.[sampler.output];
        if (input == null || input.count !== 1) throw new Error(`channel #${channelIndex} input accessor must have count 1`);
        if (output == null || output.count !== 1 || output.type !== TRS[path]) {
          throw new Error(`channel #${channelIndex} output accessor must hold one ${TRS[path]}`);
        }
        const value = [...await readAccessor(sampler.output)];
        if (value.length !== (path === 'rotation' ? 4 : 3) || !value.every(Number.isFinite)) {
          throw new Error(`channel #${channelIndex} output is not a finite ${TRS[path]}`);
        }
        if (path === 'rotation' && Math.abs(Math.hypot(...value) - 1) > 1e-3) throw new Error(`channel #${channelIndex} rotation is not a unit quaternion`);
        resolved[nodeIndex][path] = value;
      }
      poses.push({ animationIndex, ...(animation.name != null ? { animationName: animation.name } : {}),
        poseType, isStandardPoseType: STANDARD_POSE_TYPES.includes(poseType), nodes: resolved });
    } catch (error) {
      errors.push(`${where}: ${(error as Error).message}. The tagged animation is ignored.`);
    }
  }
  return { poses, errors };
}

/** Parent node index for each node, from `children` (undefined for roots). */
export function nodeParents(json: GLTFSchema.IGLTF): (number | undefined)[] {
  const parents: (number | undefined)[] = (json.nodes ?? []).map(() => undefined);
  (json.nodes ?? []).forEach((node, index) => node.children?.forEach((child) => { parents[child] = index; }));
  return parents;
}

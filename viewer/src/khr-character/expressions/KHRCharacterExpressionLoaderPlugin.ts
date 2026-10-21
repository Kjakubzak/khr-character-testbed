import * as THREE from 'three';
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF as GLTFSchema } from '@gltf-transform/core';
import type { KHRCharacterExpression as ExpressionSchema } from '../../../../schematypes/KHRCharacterExpression.ts';
import type { KHRCharacterExpressionMapping } from '../../../../schematypes/KHRCharacterExpressionMapping.ts';
import type { KHRCharacterExpressionSuppression } from '../../../../schematypes/KHRCharacterExpressionSuppression.ts';
import { KHRCharacterExpressionManager } from './KHRCharacterExpressionManager.ts';
import { KHRCharacterExpression, type ExpressionChannel, type ExpressionBinding } from './KHRCharacterExpression.ts';
import { createExpressionSampler } from './sampleExpressionChannel.ts';

const classifiers = ['KHR_character_expression_joint', 'KHR_character_expression_morphtarget', 'KHR_character_expression_texture_transform'] as const;
const textureSlots: Record<string, string[]> = {
  'pbrMetallicRoughness/baseColorTexture': ['map'],
  'pbrMetallicRoughness/metallicRoughnessTexture': ['metalnessMap', 'roughnessMap'],
  normalTexture: ['normalMap'], occlusionTexture: ['aoMap'], emissiveTexture: ['emissiveMap'],
  'extensions/KHR_materials_anisotropy/anisotropyTexture': ['anisotropyMap'],
  'extensions/KHR_materials_clearcoat/clearcoatTexture': ['clearcoatMap'],
  'extensions/KHR_materials_clearcoat/clearcoatRoughnessTexture': ['clearcoatRoughnessMap'],
  'extensions/KHR_materials_clearcoat/clearcoatNormalTexture': ['clearcoatNormalMap'],
  'extensions/KHR_materials_iridescence/iridescenceTexture': ['iridescenceMap'],
  'extensions/KHR_materials_iridescence/iridescenceThicknessTexture': ['iridescenceThicknessMap'],
  'extensions/KHR_materials_sheen/sheenColorTexture': ['sheenColorMap'],
  'extensions/KHR_materials_sheen/sheenRoughnessTexture': ['sheenRoughnessMap'],
  'extensions/KHR_materials_specular/specularTexture': ['specularIntensityMap'],
  'extensions/KHR_materials_specular/specularColorTexture': ['specularColorMap'],
  'extensions/KHR_materials_transmission/transmissionTexture': ['transmissionMap'],
  'extensions/KHR_materials_volume/thicknessTexture': ['thicknessMap'],
};
const readAccessor = (accessor: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number[] => {
  const values: number[] = [];
  for (let i = 0; i < accessor.count; i++) for (let c = 0; c < accessor.itemSize; c++) values.push(accessor.getComponent(i, c));
  return values;
};
const objectAt = (root: unknown, path: string): any => path.split('/').reduce((v: any, token) => v?.[token.replaceAll('~1', '/').replaceAll('~0', '~')], root);

/** Loads response channels independently, preserving ordinary animation clips. */
export class KHRCharacterExpressionLoaderPlugin implements GLTFLoaderPlugin {
  public readonly parser: GLTFParser;
  public get name(): string { return 'KHR_character_expression'; }
  constructor(parser: GLTFParser) { this.parser = parser; }
  public async afterRoot(gltf: GLTF): Promise<void> {
    gltf.userData.khrCharacterExpressionManager = await this._import(gltf);
  }
  public async _import(gltf: GLTF): Promise<KHRCharacterExpressionManager | null> {
    const json = this.parser.json as GLTFSchema.IGLTF;
    const used = json.extensionsUsed ?? [];
    if (!used.includes('KHR_character_expression')) return null;
    const root = json.extensions?.['KHR_character_expression'] as ExpressionSchema | undefined;
    if (root == null || !used.includes('KHR_character') || json.extensions?.['KHR_character'] == null) throw new Error('Expression extension requires its declared character marker and top-level objects.');
    const mapping = json.extensions?.['KHR_character_expression_mapping'] as KHRCharacterExpressionMapping | undefined;
    if (mapping != null && (!used.includes('KHR_character_expression_mapping') || mapping.expressionSetMappings == null)) throw new Error('Expression mapping requires the sole expressionSetMappings operation.');
    const manager = new KHRCharacterExpressionManager(gltf, mapping);
    for (const [index, definition] of root.expressions.entries()) {
      const animation = json.animations?.[definition.animation];
      if (animation == null) throw new Error(`Invalid expression animation index ${definition.animation}`);
      if (typeof definition.name !== 'string' || definition.name.length === 0) throw new Error('Expression labels must be nonempty strings.');
      // Target uniqueness belongs to each animation, never to distinct entries.
      const targets: string[] = [];
      for (const channel of animation.channels) {
        const target = channel.target;
        const pointer = (target.path as string) === 'pointer'
            ? (target.extensions?.['KHR_animation_pointer'] as {pointer?: string} | undefined)?.pointer
            : target.node == null ? undefined : `/nodes/${target.node}/${target.path}`;
        if (pointer == null) continue; // Unknown target semantics remain unsupported.
        const overlaps = (a: string, b: string) => a === b ||
            a.startsWith(`${b}/`) && /^(0|[1-9]\d*)$/.test(a.slice(b.length + 1)) ||
            b.startsWith(`${a}/`) && /^(0|[1-9]\d*)$/.test(b.slice(a.length + 1));
        if (targets.some(previous => overlaps(previous, pointer))) throw new Error('Duplicate concrete targets within one expression animation.');
        targets.push(pointer);
      }
      // T includes all channel-referenced samplers, including unsupported/unlisted channels.
      const inputs = new Map<number, number[]>();
      for (const channel of animation.channels) {
        if (!inputs.has(channel.sampler)) {
          const sampler = animation.samplers[channel.sampler];
          if (sampler == null) throw new Error('Invalid expression sampler index.');
          const accessor = await this.parser.getDependency('accessor', sampler.input) as THREE.BufferAttribute;
          const times = readAccessor(accessor);
          if (accessor.itemSize !== 1 || times.length < 2 || times.some((t, i) => !Number.isFinite(t) || t < 0 || (i > 0 && t <= times[i - 1]))) throw new Error('Expression input keys are invalid.');
          inputs.set(channel.sampler, times);
        }
      }
      const duration = Math.max(0, ...[...inputs.values()].map(times => times[times.length - 1]));
      const expression = new KHRCharacterExpression(definition.name, index, duration);
      const suppressions = definition.extensions?.['KHR_character_expression_suppression'] as KHRCharacterExpressionSuppression | undefined;
      expression.suppressions = suppressions?.suppressions ?? [];
      const owned = new Set<number>();
      for (const classifier of classifiers) {
        const metadata = definition.extensions?.[classifier] as {channels: number[]} | undefined;
        if (metadata == null) continue;
        if (!used.includes(classifier)) throw new Error(`Undeclared expression type ${classifier}`);
        for (const channelIndex of metadata.channels) {
          if (owned.has(channelIndex)) throw new Error('A channel belongs to multiple expression classifications.');
          owned.add(channelIndex);
          const channel = animation.channels[channelIndex];
          if (channel == null) throw new Error('Invalid classified expression channel index.');
          const resolved = await this.resolveTarget(classifier, channel.target, json);
          if (resolved == null) {
            console.warn(`Expression ${index} channel ${channelIndex}: unsupported target extension; preserving metadata without a response.`);
            continue;
          }
          const sampler = animation.samplers[channel.sampler];
          const output = await this.parser.getDependency('accessor', sampler.output) as THREE.BufferAttribute;
          const sample = createExpressionSampler(inputs.get(channel.sampler)!, readAccessor(output), resolved.components.length,
              sampler.interpolation ?? 'LINEAR', resolved.kind === 'quaternion');
          expression.channels.push({...resolved, channelIndex, sample});
        }
      }
      manager.registerExpression(expression);
    }
    return manager;
  }

  private async resolveTarget(classifier: string, target: GLTFSchema.IAnimationChannelTarget, json: GLTFSchema.IGLTF): Promise<Omit<ExpressionChannel, 'channelIndex' | 'sample'> | null> {
    const rawPointer = (target.extensions?.['KHR_animation_pointer'] as {pointer?: string} | undefined)?.pointer;
    const pointer = (target.path as string) === 'pointer' ? rawPointer : target.node == null ? undefined : `/nodes/${target.node}/${target.path}`;
    if (pointer == null) throw new Error('Expression requires a concrete mutable target.');
    if ((target.path as string) === 'pointer' && (target.node != null || !json.extensionsUsed?.includes('KHR_animation_pointer'))) throw new Error('Invalid or undeclared expression pointer target.');
    const nodeMatch = /^\/nodes\/(0|[1-9]\d*)\/(translation|rotation|scale|weights)(?:\/(0|[1-9]\d*))?$/.exec(pointer);
    if (nodeMatch != null) {
      const nodeIndex = Number(nodeMatch[1]);
      const property = nodeMatch[2];
      const element = nodeMatch[3] == null ? undefined : Number(nodeMatch[3]);
      const nodeDef = json.nodes?.[nodeIndex];
      if (nodeDef == null || (property !== 'weights' && nodeDef.matrix != null)) throw new Error('Expression target node is missing or defines matrix.');
      if ((property === 'weights') !== (classifier === 'KHR_character_expression_morphtarget') || (property !== 'weights' && classifier !== 'KHR_character_expression_joint') || (element != null && property !== 'weights')) throw new Error('Expression classifier does not match its target.');
      const node = await this.parser.getDependency('node', nodeIndex) as THREE.Object3D;
      if (property === 'weights') {
        const mesh = nodeDef.mesh == null ? undefined : json.meshes?.[nodeDef.mesh];
        const count = mesh?.primitives[0]?.targets?.length ?? 0;
        if (count === 0 || (element != null && element >= count)) throw new Error('Morph expression requires a valid instantiated node morph weight.');
        const initial = [...(nodeDef.weights ?? mesh?.weights ?? Array<number>(count).fill(0))];
        type MorphObject = THREE.Object3D & {morphTargetInfluences: number[]};
        const objects: MorphObject[] = [];
        const collect = (object: THREE.Object3D) => {
          // A descendant glTF node instantiates its own mesh and weights.
          const association = this.parser.associations.get(object);
          if (object !== node && association?.nodes != null) return;
          if ((object as MorphObject).morphTargetInfluences != null) objects.push(object as MorphObject);
          for (const child of object.children) collect(child);
        };
        collect(node);
        // Three's loader applies node.weights only to Mesh objects. A glTF
        // POINTS/line primitive has the same instantiated-weight contract.
        for (const object of objects) initial.forEach((value, i) => object.morphTargetInfluences[i] = value);
        const bindings: ExpressionBinding[] = objects.map(object => ({id: `${object.uuid}/weights`,
          read: () => [...object.morphTargetInfluences!],
          write: value => value.forEach((v, i) => object.morphTargetInfluences![i] = v)}));
        return {target: `/nodes/${nodeIndex}/weights`, components: element == null ? Array.from({length: count}, (_, i) => i) : [element], initial, kind: 'additive', bindings};
      }
      const runtimeProperty = property === 'translation' ? node.position : property === 'rotation' ? node.quaternion : node.scale;
      const initial = [...((nodeDef as any)[property] ?? (property === 'rotation' ? [0,0,0,1] : property === 'scale' ? [1,1,1] : [0,0,0]))];
      const binding: ExpressionBinding = {id: `${node.uuid}/${property}`, read: () => runtimeProperty.toArray(), write: value => { runtimeProperty.fromArray(value as number[]); }};
      return {target: pointer, components: initial.map((_, i) => i), initial, kind: property === 'rotation' ? 'quaternion' : property === 'scale' ? 'scale' : 'additive', bindings: [binding]};
    }
    if (classifier !== 'KHR_character_expression_texture_transform') throw new Error('Joint/morph expression target is incompatible.');
    const textureMatch = /^\/materials\/(0|[1-9]\d*)\/(.+)\/extensions\/KHR_texture_transform\/(offset|scale|rotation)$/.exec(pointer);
    if (textureMatch == null || !json.extensionsUsed?.includes('KHR_texture_transform')) throw new Error('UV expression requires an authored textureInfo transform pointer.');
    const materialIndex = Number(textureMatch[1]);
    const texturePath = textureMatch[2];
    const property = textureMatch[3];
    const materialDef = json.materials?.[materialIndex];
    const info = objectAt(materialDef, texturePath);
    const transform = info?.extensions?.KHR_texture_transform;
    const slots = textureSlots[texturePath];
    if (transform == null || info.index == null) throw new Error('UV transform must be authored on a textureInfo.');
    const ownerExtension = /^extensions\/([^/]+)\//.exec(texturePath)?.[1];
    if (ownerExtension != null && !json.extensionsUsed?.includes(ownerExtension)) throw new Error('Undeclared UV textureInfo owner extension.');
    if (slots == null) {
      const extension = /^extensions\/([^/]+)\//.exec(texturePath)?.[1];
      if (extension != null && json.extensionsUsed?.includes(extension)) return null;
      throw new Error('UV pointer owner is not a permitted textureInfo.');
    }
    const initial = property === 'rotation' ? [transform.rotation ?? 0] : [...(transform[property] ?? (property === 'scale' ? [1,1] : [0,0]))];
    const material = await this.parser.getDependency('material', materialIndex) as THREE.Material;
    const textures = [...new Set(slots.map(slot => (material as any)[slot] as THREE.Texture | undefined).filter((t): t is THREE.Texture => t != null))];
    const bindings: ExpressionBinding[] = textures.map(texture => ({id: `${texture.uuid}/${property}`,
      read: () => property === 'rotation' ? [texture.rotation] : (property === 'offset' ? texture.offset : texture.repeat).toArray(),
      write: value => {
        if (property === 'rotation') texture.rotation = value[0];
        else (property === 'offset' ? texture.offset : texture.repeat).fromArray(value as number[]);
        texture.updateMatrix();
      }}));
    return {target: pointer, components: initial.map((_, i) => i), initial, kind: property === 'scale' ? 'scale' : 'additive', bindings};
  }
}

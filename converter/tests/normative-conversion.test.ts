import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendKHRCharacter } from '../converter/appendKHRCharacter.ts';
import { appendKHRCharacterExpression } from '../converter/expressions/appendKHRCharacterExpression.ts';
import { appendKHRCharacterSkeleton } from '../converter/appendKHRCharacterSkeleton.ts';
import { appendKHRNodeVisibilityHint } from '../converter/appendKHRNodeVisibilityHint.ts';
import { appendKHRCharacterReferencePose } from '../converter/appendKHRCharacterReferencePose.ts';
import { appendTextureAnimation } from '../converter/expressions/appendTextureAnimation.ts';
import { constructGLB } from '../converter/constructGLB.ts';
import { convertVRMToKHRCharacter } from '../converter/convertVRMToKHRCharacter.ts';
import { extractGLB } from '../converter/extractGLB.ts';

function fixture(): any {
  return {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: 'face', mesh: 0, weights: [0.25, 0] }, { name: 'hips' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, targets: [{ POSITION: 1 }, { POSITION: 2 }] }] }],
    extensions: { VRMC_vrm: { humanoid: { humanBones: { hips: { node: 1 } } }, expressions: { preset: {
      happy: { morphTargetBinds: [{ node: 0, index: 0, weight: 0.8 }], overrideBlink: 'blend' },
      blink: { morphTargetBinds: [{ node: 0, index: 1, weight: 1 }] },
    } } } },
    buffers: [{ byteLength: 0 }], accessors: [], bufferViews: [],
  };
}

function floats(gltf: any, bin: Uint8Array, accessorIndex: number): number[] {
  const accessor = gltf.accessors[accessorIndex], view = gltf.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type as 'SCALAR'];
  const bytes = new DataView(bin.buffer, bin.byteOffset + start, accessor.count * size * 4);
  return Array.from({ length: accessor.count * size }, (_, index) => bytes.getFloat32(index * 4, true));
}

test('marker neither requires nor rewrites a single scene root', () => {
  const gltf = fixture(); const roots = [...gltf.scenes[0].nodes];
  appendKHRCharacter(gltf); appendKHRCharacter(gltf);
  assert.deepEqual(gltf.extensions.KHR_character, {});
  assert.deepEqual(gltf.scenes[0].nodes, roots);
  assert.equal(gltf.extensionsUsed.filter((name: string) => name === 'KHR_character').length, 1);
});

test('conversion emits current input mapping, expression labels and indexed suppressions', () => {
  const gltf = fixture(), bin: [Uint8Array] = [new Uint8Array()];
  appendKHRCharacterExpression(gltf, bin, {});
  const expressions = gltf.extensions.KHR_character_expression.expressions;
  assert.deepEqual(expressions.map((entry: any) => entry.name), ['happy', 'blink']);
  assert.equal(expressions.some((entry: any) => 'expression' in entry), false);
  assert.deepEqual(gltf.extensions.KHR_character_expression_mapping.expressionSetMappings.vrm1_expressions.happy,
    [{ source: 0, name: 'happy', weight: 1 }]);
  assert.equal(gltf.extensions.KHR_character_expression_mapping.expressionSetInputMappings, undefined);
  assert.deepEqual(expressions[0].extensions.KHR_character_expression_suppression.suppressions,
    [{ target: 1, type: 'blend' }]);
  assert.equal(gltf.extensionsUsed.includes('KHR_character_expression_mask'), false);
  const sampler = gltf.animations[expressions[0].animation].samplers[0];
  const values = floats(gltf, bin[0], sampler.output);
  assert.ok(Math.abs(values[0] - 0.25) < 1e-6);
  assert.ok(Math.abs(values[1] - 1.05) < 1e-6);
});

test('generated native names reject preset/custom collisions before publishing index bindings', () => {
  const gltf = fixture(), bin: [Uint8Array] = [new Uint8Array()];
  gltf.extensions.VRMC_vrm.expressions.custom = {
    happy: {morphTargetBinds: [{node: 0, index: 1, weight: 0.5}]},
  };
  assert.throws(() => appendKHRCharacterExpression(gltf, bin, {}), /Duplicate native expression name "happy"/);
  assert.equal(gltf.extensions.KHR_character_expression, undefined);
  assert.equal(gltf.extensions.KHR_character_expression_mapping, undefined);
});

test('custom names compare exactly and retain separate native indices', () => {
  const gltf = fixture(), bin: [Uint8Array] = [new Uint8Array()];
  gltf.extensions.VRMC_vrm.expressions.custom = Object.fromEntries(
    ['Happy', 'é', 'e\u0301', '__proto__', 'toString'].map(name => [name,
      {morphTargetBinds: [{node: 0, index: 0, weight: 0.5}]}]),
  );
  appendKHRCharacterExpression(gltf, bin, {});
  const expressions = gltf.extensions.KHR_character_expression.expressions;
  assert.deepEqual(expressions.map((entry: any) => entry.name), ['happy', 'blink', 'Happy', 'é', 'e\u0301', '__proto__', 'toString']);
  assert.equal(new Set(expressions.map((entry: any) => entry.name)).size, expressions.length);
  assert.equal(gltf.extensions.KHR_character_expression_mapping.expressionSetMappings.vrm1_expressions.happy[0].source, 0);
});

test('standard skeleton identifier is exact and association index remains authoritative', () => {
  const gltf = fixture(); appendKHRCharacterSkeleton(gltf);
  assert.deepEqual(gltf.extensions.KHR_character_skeleton_mapping.skeletalRigMappings.vrm1_humanoid.hips,
    { node: 1, name: 'hips' });
});

test('texture responses preserve distinct authored neutrals at each textureInfo', () => {
  const gltf = fixture(), bin: [Uint8Array] = [new Uint8Array()];
  gltf.materials = [{
    normalTexture: { index: 0, extensions: { KHR_texture_transform: { offset: [0.1, 0.2] } } },
    pbrMetallicRoughness: { baseColorTexture: { index: 1, extensions: { KHR_texture_transform: { offset: [0.3, 0.4] } } } },
  }];
  const animation: any = { channels: [], samplers: [] };
  appendTextureAnimation({ material: 0, offset: [0.8, 0.9] }, false, gltf, bin, animation, new Set());
  assert.equal(animation.channels.length, 2);
  const neutral = animation.samplers.map((sampler: any) => floats(gltf, bin[0], sampler.output).slice(0, 2));
  assert.ok(Math.abs(neutral[0][0] - 0.1) < 1e-6);
  assert.ok(Math.abs(neutral[1][0] - 0.3) < 1e-6);
});

test('full library conversion preserves multiple roots and removes retired declarations', () => {
  const input: any = { asset: { version: '2.0' }, nodes: [{}, {}], scenes: [{ nodes: [0, 1] }],
    extensionsUsed: ['KHR_character_expression_mask', 'KHR_character_expression_texture'] };
  const result = convertVRMToKHRCharacter(constructGLB(input, new Uint8Array()));
  const [decoded] = extractGLB(result.glb);
  assert.deepEqual(decoded.scenes![0].nodes, [0, 1]);
  assert.deepEqual(decoded.extensions!.KHR_character, {});
  assert.equal(decoded.extensionsUsed!.some((name) => name === 'KHR_character_expression_mask'), false);
  const again = convertVRMToKHRCharacter(result.glb);
  assert.equal(new Set(again.gltf.extensionsUsed).size, again.gltf.extensionsUsed!.length);
});

test('conversion without usable VRM expression data preserves legacy payload declarations', () => {
  const legacy = {expressions:[{name:'old',animation:0,extensions:{KHR_character_expression_mask:{masks:[{target:0}]}}}]};
  const input: any = {asset:{version:'2.0'},nodes:[{}],scenes:[{nodes:[0]}],extensionsUsed:['KHR_character_expression_mask'],extensionsRequired:['KHR_character_expression_mask'],extensions:{KHR_character_expression:legacy}};
  const result = convertVRMToKHRCharacter(constructGLB(input,new Uint8Array()));
  assert.deepEqual(result.gltf.extensions!.KHR_character_expression,legacy);
  assert.ok(result.gltf.extensionsUsed!.includes('KHR_character_expression_mask'));
  assert.ok(result.gltf.extensionsRequired!.includes('KHR_character_expression_mask'));
});

test('custom-only regeneration removes prior mappings to the replaced native array', () => {
  const gltf = fixture(), bin: [Uint8Array] = [new Uint8Array()];
  gltf.extensions.VRMC_vrm.expressions = {custom:{customSmile:{morphTargetBinds:[{node:0,index:0,weight:1}]}}};
  gltf.extensions.KHR_character_expression_mapping = {expressionSetMappings:{old_set:{input:[{source:1,weight:1}]}}};
  gltf.extensionsUsed = ['KHR_character_expression_mapping'];
  gltf.extensionsRequired = ['KHR_character_expression_mapping'];
  appendKHRCharacterExpression(gltf,bin,{});
  assert.equal(gltf.extensions.KHR_character_expression.expressions.length,1);
  assert.equal(gltf.extensions.KHR_character_expression_mapping,undefined);
  assert.equal(gltf.extensionsUsed.includes('KHR_character_expression_mapping'),false);
  assert.equal(gltf.extensionsRequired.includes('KHR_character_expression_mapping'),false);
});

test('auto visibility writes a roles array and never lists hints in extensionsRequired', () => {
  const gltf = fixture();
  gltf.nodes[0].name = 'Face';
  appendKHRNodeVisibilityHint(gltf, ['Face', 'Hair']);
  assert.deepEqual(gltf.nodes[0].extensions.KHR_node_visibility_hint, { roles: ['third_person'] });
  assert.equal('role' in gltf.nodes[0].extensions.KHR_node_visibility_hint, false);
  assert.ok(gltf.extensionsUsed.includes('KHR_node_visibility_hint'));
  assert.equal(gltf.extensionsRequired, undefined);
  const input: any = { asset: { version: '2.0' }, nodes: [{}], scenes: [{ nodes: [0] }],
    extensionsUsed: ['KHR_node_visibility_hint', 'KHR_mesh_primitive_visibility_hint'],
    extensionsRequired: ['KHR_node_visibility_hint', 'KHR_mesh_primitive_visibility_hint'] };
  const result = convertVRMToKHRCharacter(constructGLB(input, new Uint8Array()));
  assert.deepEqual(result.gltf.extensionsRequired, []);
  assert.ok(result.gltf.extensionsUsed!.includes('KHR_node_visibility_hint'));
});

test('VRM rest pose is emitted as a t_pose reference pose with one STEP key per humanoid bone node', () => {
  const gltf = fixture(), bin: [Uint8Array] = [new Uint8Array()];
  gltf.nodes[1].translation = [0, 1, 0];
  gltf.nodes.push({ name: 'spine', rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }, { name: 'chest', matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] });
  gltf.extensions.VRMC_vrm.humanoid.humanBones.spine = { node: 2 };
  gltf.extensions.VRMC_vrm.humanoid.humanBones.chest = { node: 3 };
  appendKHRCharacterReferencePose(gltf, bin);
  const animation = gltf.animations.at(-1);
  assert.deepEqual(animation.extensions, { KHR_character_reference_pose: { poseType: 't_pose' } });
  assert.ok(gltf.extensionsUsed.includes('KHR_character_reference_pose'));
  assert.deepEqual(animation.channels.map((c: any) => [c.target.node, c.target.path]),
    [[1, 'rotation'], [1, 'translation'], [2, 'rotation'], [2, 'translation']]); // matrix node 3 skipped
  for (const sampler of animation.samplers) {
    assert.equal(sampler.interpolation, 'STEP');
    assert.equal(gltf.accessors[sampler.input].count, 1);
    assert.equal(gltf.accessors[sampler.output].count, 1);
  }
  const value = (i: number) => floats(gltf, bin[0], animation.samplers[i].output);
  assert.deepEqual(value(0), [0, 0, 0, 1]);
  assert.deepEqual(value(1), [0, 1, 0]);
  assert.ok(Math.abs(value(2)[1] - Math.SQRT1_2) < 1e-6);
  assert.deepEqual(floats(gltf, bin[0], animation.samplers[0].input), [0]);
  const count = gltf.animations.length;
  appendKHRCharacterReferencePose(gltf, bin);
  assert.equal(gltf.animations.length, count); // an existing tagged animation is not duplicated
});

test('no reference pose is written without a VRM humanoid', () => {
  const input: any = { asset: { version: '2.0' }, nodes: [{}], scenes: [{ nodes: [0] }] };
  const result = convertVRMToKHRCharacter(constructGLB(input, new Uint8Array()));
  assert.equal(result.gltf.animations?.some((a: any) => a.extensions?.KHR_character_reference_pose != null) ?? false, false);
  assert.equal(result.gltf.extensionsUsed!.includes('KHR_character_reference_pose'), false);
});

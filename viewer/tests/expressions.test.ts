import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KHRCharacterExpression } from '../src/khr-character/expressions/KHRCharacterExpression.ts';
import { KHRCharacterExpressionManager } from '../src/khr-character/expressions/KHRCharacterExpressionManager.ts';
import { KHRCharacterExpressionLoaderPlugin } from '../src/khr-character/expressions/KHRCharacterExpressionLoaderPlugin.ts';
import { createExpressionSampler } from '../src/khr-character/expressions/sampleExpressionChannel.ts';

const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const manager = (mapping?: any) => new KHRCharacterExpressionManager({scene: new THREE.Group()} as GLTF, mapping);
function add(m: KHRCharacterExpressionManager, index: number, label = 'same') {
  const e = new KHRCharacterExpression(label, index, 2);
  m.registerExpression(e);
  return e;
}

// GLTFLoader's embedded-buffer path reports progress through this DOM event.
if (globalThis.ProgressEvent == null) globalThis.ProgressEvent = class extends Event {} as any;
function fixture() {
  const bytes = Buffer.alloc(32);
  [0,2, 0,0,0, 4,0,0].forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  return {asset: {version: '2.0'}, extensionsUsed: ['KHR_character', 'KHR_character_expression', 'KHR_character_expression_joint'],
    extensions: {KHR_character: {}, KHR_character_expression: {expressions: [{name: 'same', animation: 0, extensions: {KHR_character_expression_joint: {channels: [0]}}}]}},
    nodes: [{name: 'Node', translation: [10,0,0]}], scenes: [{nodes: [0]}], scene: 0,
    buffers: [{byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString('base64')}`}],
    bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 8}, {buffer: 0, byteOffset: 8, byteLength: 24}],
    accessors: [{bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [2]}, {bufferView: 1, componentType: 5126, count: 2, type: 'VEC3'}],
    animations: [{channels: [{sampler: 0, target: {node: 0, path: 'translation'}}], samplers: [{input: 0, output: 1}]}]};
}
async function load(json: any) {
  const loader = new GLTFLoader();
  loader.register(parser => new KHRCharacterExpressionLoaderPlugin(parser));
  return loader.parseAsync(JSON.stringify(json), '');
}

test('native indices retain duplicate labels and refuse ambiguous label resolution', () => {
  const m = manager(); add(m, 0); add(m, 1);
  assert.equal(m.expressions.size, 2);
  assert.equal(m.getValue('same'), null);
  m.setValue(0, 0.2); m.setValue(1, 0.8);
  assert.equal(m.getValue(0), 0.2); assert.equal(m.getValue(1), 0.8);
  assert.throws(() => m.setValue('same', 1));
  assert.throws(() => m.setValue(0, Infinity));
  assert.throws(() => m.evaluate([NaN, 0]));
});

test('sole mapping sums duplicate occurrences, clamps before summing and compares exact IDs', () => {
  const mapping = {expressionSetMappings: JSON.parse('{"demo_v1":{"happy":[{"source":0,"name":"Independent","weight":0.6},{"source":0,"weight":0.6}],"toString":[{"source":1,"weight":1}]}}')};
  const m = manager(mapping); add(m, 0); add(m, 1);
  assert.deepEqual(m.evaluateMappedInputs('demo_v1', {happy: 2}), [1,0]);
  assert.deepEqual(m.evaluateMappedInputs('demo_v1', {happy: -1, toString: 0.2}), [0,0.2]);
  assert.throws(() => m.evaluateMappedInputs('DEMO_V1', {}));
  assert.throws(() => m.evaluateMappedInputs('constructor', {}));
  assert.throws(() => m.evaluateMappedInputs('demo_v1', {happy: NaN}));
  assert.throws(() => m.evaluateMappedInputs('demo_v1', {unknown: Infinity}));
  assert.throws(() => m.evaluateMappedInputs('demo_v1', {unknown: NaN}));
  m.setValue(1, 1); m.setMappedValues('demo_v1', {happy: 0.5});
  close(m.getValue(0)!, 0.6); assert.equal(m.getValue(1), 0);
});

test('suppression uses immutable inputs, strict block threshold, duplicate products and unknown identity', () => {
  const m = manager(); const a = add(m, 0); const b = add(m, 1);
  a.suppressions = [{target: 0, amount: 0.5, threshold: 0}, {target: 1, amount: 0.5}, {target: 1, amount: 0.5}, {target: 1, type: 'ACME_curve', amount: 1}];
  b.suppressions = [{target: 0, type: 'block', amount: 1, threshold: 0.8}];
  const e = m.evaluate([0.5,0.8]);
  close(e.effectiveDrivers[0], 0.375); close(e.effectiveDrivers[1], 0.45);
  const reversed = [...a.suppressions].reverse(); a.suppressions = reversed;
  close(m.evaluate([0.5,0.8]).effectiveDrivers[1], 0.45);
  assert.equal(m.evaluate([0.5,0.81]).effectiveDrivers[0], 0);
});

test('linear, step and cubic samplers hold endpoints and preserve angle winding', () => {
  const linear = createExpressionSampler([1,3], [2,10], 1);
  assert.deepEqual(linear(0), [2]); assert.deepEqual(linear(2), [6]); assert.deepEqual(linear(4), [10]);
  const step = createExpressionSampler([0,2], [2,10], 1, 'STEP');
  assert.deepEqual(step(1.999), [2]); assert.deepEqual(step(2), [10]);
  const cubic = createExpressionSampler([0,2], [0,0,2, 0,4,0], 1, 'CUBICSPLINE');
  close(cubic(1)[0], 2.5);
  const angle = createExpressionSampler([0,2], [0,4 * Math.PI], 1);
  close(angle(1)[0], 2 * Math.PI);
  assert.throws(() => createExpressionSampler([0,0], [0,1], 1));
  assert.throws(() => createExpressionSampler([0,1], [0], 1));
});

test('linear quaternions handle opposite signs, cubic values normalize without sign repair', () => {
  const linear = createExpressionSampler([0,2], [0,0,0,1,0,0,0,-1], 4, 'LINEAR', true);
  close(Math.abs(linear(1)[3]), 1);
  const held = createExpressionSampler([1,2], [0,0,0,0.99995,0,0,0,0.99995], 4, 'STEP', true);
  close(held(0)[3], 1); close(held(1.5)[3], 1);
  const cubic = createExpressionSampler([0,2], [0,0,0,0, 0,0,0,1, 0,0,0,0,
    0,0,0,0, 0,0,0,-1, 0,0,0,0], 4, 'CUBICSPLINE', true);
  assert.throws(() => cubic(1), /no valid rotation/);
});

test('absolute responses and mandatory additive aggregation remain distinct from host live base', () => {
  const m = manager(); const a = add(m, 0); const b = add(m, 1);
  const state = [20];
  const channel = {channelIndex: 0, target: '/custom/value', components: [0], initial: [10], kind: 'additive' as const,
    sample: (time: number) => [2 + time], bindings: [{id: 'state', read: () => [...state], write: (v: readonly number[]) => {state[0] = v[0];}}]};
  a.channels = [channel]; b.channels = [{...channel, sample: (time: number) => [5 + time * 2]}];
  m.setValue(0, 0.5); m.setValue(1, 0.5);
  const e = m.evaluate();
  assert.deepEqual(e.responses.map(r => r.sample), [[3],[7]]);
  assert.deepEqual(e.responses.map(r => r.neutral), [[2],[5]]);
  assert.deepEqual(e.aggregates[0].value, [13]);
  assert(Object.isFrozen(e.inputDrivers)); assert(Object.isFrozen(e.responses[0].sample));
  assert(Object.isFrozen(e.aggregates[0].value));
  m.update(100); assert.equal(state[0], 23);
  m.update(0); assert.equal(state[0], 23);
  m.prepareFrame(); state[0] = 30; // ordinary animation writes this frame's host base
  m.update(0); assert.equal(state[0], 33);
  m.setValue(0, 0); m.setValue(1, 0); m.update(0);
  assert.equal(state[0], 30); assert.equal(m.lastEvaluation!.responses.length, 0);
});

test('array and individual-element contributions aggregate together without duplicate application', () => {
  const m = manager(); const a = add(m, 0); const b = add(m, 1);
  a.channels = [{channelIndex: 0, target: '/nodes/0/weights', components: [0,1], initial: [0,0], kind: 'additive', sample: t => [t, t * 2], bindings: []}];
  b.channels = [{channelIndex: 0, target: '/nodes/0/weights', components: [1], initial: [0,0], kind: 'additive', sample: t => [t], bindings: []}];
  m.setValue(0, 0.5); m.setValue(1, 0.5);
  assert.deepEqual(m.evaluate().aggregates[0].value, [1,3]);
});

test('host scale and quaternion composition selects highest active serialized index', () => {
  const m = manager(); const b = add(m, 1); const a = add(m, 0);
  a.channels = [{channelIndex: 0, target: '/nodes/0/scale', components: [0,1,2], initial: [1,1,1], kind: 'scale', sample: () => [2,2,2], bindings: []}];
  b.channels = [{...a.channels[0], sample: () => [4,4,4]}];
  assert.deepEqual(m.evaluate([1,1]).aggregates[0].value, [4,4,4]);
  assert.deepEqual(m.evaluate([1,0]).aggregates[0].value, [2,2,2]);
  a.channels.push({channelIndex: 1, target: '/nodes/0/rotation', components: [0,1,2,3], initial: [0,0,0,1], kind: 'quaternion', sample: () => [0,0,0,1], bindings: []});
  b.channels.push({...a.channels[1], sample: () => [0,0,1,0]});
  assert.deepEqual(m.evaluate([1,1]).aggregates.find(a => a.target.endsWith('/rotation'))!.value, [0,0,1,0]);
});

test('actual GLTF loader preserves ordinary clip and samples driver times duration statelessly', async () => {
  const json = fixture();
  const gltf = await load(json);
  const m = gltf.userData.khrCharacterExpressionManager as KHRCharacterExpressionManager;
  const clip = gltf.animations[0]; const original = Array.from(clip.tracks[0].values);
  assert.equal([...m.expressions][0].duration, 2);
  m.setValue(0, 0.5); m.update(0.01);
  close(gltf.scene.children[0].position.x, 12); // b=10 plus (sample 2 − neutral 0)
  assert.deepEqual(m.lastEvaluation!.responses[0].sample, [2,0,0]);
  m.update(500); close(gltf.scene.children[0].position.x, 12);
  assert.deepEqual(Array.from(clip.tracks[0].values), original);
  m.setValue(0, 0); m.update(); close(gltf.scene.children[0].position.x, 10);
});

test('unclassified channels determine duration but emit no responses; unused samplers do not', async () => {
  const json: any = fixture();
  const a = json.animations[0];
  a.channels.push({sampler: 1, target: {node: 0, path: 'scale'}});
  a.samplers.push({input: 2, output: 1}, {input: 3, output: 1});
  json.accessors.push({componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [5]}, {componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [99]});
  // An accessor without a bufferView is zero-filled; supply decoded data with separate buffers.
  for (const [index, end] of [[2,5],[3,99]]) {
    const bytes = Buffer.alloc(8); bytes.writeFloatLE(end, 4);
    json.bufferViews.push({buffer: json.buffers.length, byteLength: 8});
    json.buffers.push({byteLength: 8, uri: `data:application/octet-stream;base64,${bytes.toString('base64')}`});
    json.accessors[index].bufferView = json.bufferViews.length - 1;
  }
  const gltf = await load(json);
  const m = gltf.userData.khrCharacterExpressionManager as KHRCharacterExpressionManager;
  assert.equal([...m.expressions][0].duration, 5);
  const e = m.evaluate([1]); assert.equal(e.responses.length, 1); assert.deepEqual(e.responses[0].sample, [4,0,0]);
});

test('actual pointer decoding applies normalized values and preserves label/index identities', async () => {
  const json: any = fixture();
  json.extensionsUsed.push('KHR_animation_pointer');
  json.animations[0].channels[0].target = {path: 'pointer', extensions: {KHR_animation_pointer: {pointer: '/nodes/0/translation'}}};
  const values = Buffer.from([0,0,0,255,0,0]);
  json.buffers.push({byteLength: values.length, uri: `data:application/octet-stream;base64,${values.toString('base64')}`});
  json.bufferViews.push({buffer: 1, byteLength: values.length});
  json.accessors[1] = {bufferView: 2, componentType: 5121, normalized: true, count: 2, type: 'VEC3'};
  const duplicate = structuredClone(json.extensions.KHR_character_expression.expressions[0]);
  json.extensions.KHR_character_expression.expressions.push(duplicate);
  const gltf = await load(json);
  const m = gltf.userData.khrCharacterExpressionManager as KHRCharacterExpressionManager;
  assert.equal(m.expressions.size, 2); assert.equal(m.getValue('same'), null);
  m.setValue(0, 0.5); m.update(); close(gltf.scene.children[0].position.x, 10.5);
  m.setValue(1, 0.5); m.update(); close(gltf.scene.children[0].position.x, 11);
});

test('actual grouped morph primitives receive array/element aggregates once per primitive', async () => {
  const json: any = fixture();
  json.nodes[0].mesh = 0; json.nodes[0].weights = [0.2];
  json.accessors.push({componentType: 5126, count: 1, type: 'VEC3', min: [0,0,0], max: [0,0,0]});
  json.meshes = [{weights: [0.4], primitives: [0,1].map(() => ({mode: 0, attributes: {POSITION: 2}, targets: [{POSITION: 2}]}))}];
  json.extensionsUsed.push('KHR_animation_pointer', 'KHR_character_expression_morphtarget');
  json.animations[0].channels[0].target = {node: 0, path: 'weights'};
  const bytes = Buffer.alloc(8); bytes.writeFloatLE(1, 4);
  json.buffers.push({byteLength: 8, uri: `data:application/octet-stream;base64,${bytes.toString('base64')}`});
  json.bufferViews.push({buffer: 1, byteLength: 8});
  json.accessors[1] = {bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR'};
  json.nodes[0].children = [1];
  json.nodes.push({name: 'UnrelatedDescendant', mesh: 1, weights: [0.9]});
  json.accessors.push({componentType: 5126, count: 3, type: 'VEC3', min: [0,0,0], max: [0,0,0]});
  json.meshes.push({primitives: [{mode: 4, attributes: {POSITION: 3}, targets: [{POSITION: 3}]}]});
  const first = json.extensions.KHR_character_expression.expressions[0];
  first.extensions = {KHR_character_expression_morphtarget: {channels: [0]}};
  const second = structuredClone(json.animations[0]);
  second.channels[0].target = {path: 'pointer', extensions: {KHR_animation_pointer: {pointer: '/nodes/0/weights/0'}}};
  json.animations.push(second);
  json.extensions.KHR_character_expression.expressions.push({name: 'element', animation: 1, extensions: {KHR_character_expression_morphtarget: {channels: [0]}}});
  const gltf = await load(json);
  const m = gltf.userData.khrCharacterExpressionManager as KHRCharacterExpressionManager;
  m.setValue(0, 0.5); m.setValue(1, 0.5); m.update();
  const meshes: Array<THREE.Object3D & {morphTargetInfluences: number[]}> = [];
  gltf.scene.traverse(o => {if ((o as any).morphTargetInfluences != null) meshes.push(o as any);});
  assert.equal(meshes.length, 3);
  const own = meshes.filter(mesh => mesh.name !== 'UnrelatedDescendant');
  assert.equal(own.length, 2);
  for (const mesh of own) close(mesh.morphTargetInfluences![0], 1.2);
  // A descendant glTF node's separate morph state is untouched.
  const descendant = meshes.find(mesh => mesh.name === 'UnrelatedDescendant')!;
  close(descendant.morphTargetInfluences[0], 0.9);
  m.update(1); for (const mesh of own) close(mesh.morphTargetInfluences![0], 1.2);
});

test('loader resolves UV scalar rotation and cubic data without mutating ordinary clips', async () => {
  const json: any = fixture();
  json.extensionsUsed.push('KHR_animation_pointer', 'KHR_texture_transform', 'KHR_character_expression_texture_transform');
  json.materials = [{pbrMetallicRoughness: {baseColorTexture: {index: 0, extensions: {KHR_texture_transform: {rotation: 1}}}}}];
  json.animations[0].channels[0].target = {path: 'pointer', extensions: {KHR_animation_pointer: {pointer: '/materials/0/pbrMetallicRoughness/baseColorTexture/extensions/KHR_texture_transform/rotation'}}};
  json.animations[0].samplers[0].interpolation = 'CUBICSPLINE';
  json.extensions.KHR_character_expression.expressions[0].extensions = {KHR_character_expression_texture_transform: {channels: [0]}};
  const texture = new THREE.Texture(); texture.rotation = 1;
  const material = new THREE.MeshStandardMaterial({map: texture});
  const parser = {json, getDependency: async (kind: string, index: number) => {
    if (kind === 'material') return material;
    return index === 0 ? new THREE.Float32BufferAttribute([0,2], 1) : new THREE.Float32BufferAttribute([0,0,2, 0,4,0], 1);
  }};
  const gltf = {scene: new THREE.Group(), parser, animations: []} as unknown as GLTF;
  const m = await new KHRCharacterExpressionLoaderPlugin(parser as any)._import(gltf);
  m!.setValue(0, 0.5); m!.update(); close(texture.rotation, 3.5);
  close(m!.lastEvaluation!.responses[0].sample[0], 2.5);
  assert.deepEqual(m!.lastEvaluation!.responses[0].neutral, [0]);
  m!.update(); close(texture.rotation, 3.5);
});

test('unknown declared UV owner is retained without responses and still determines T', async () => {
  const json: any = fixture();
  json.extensionsUsed.push('KHR_animation_pointer', 'KHR_texture_transform', 'KHR_character_expression_texture_transform', 'ACME_material');
  json.materials = [{extensions: {ACME_material: {customTexture: {index: 0, extensions: {KHR_texture_transform: {offset: [0,0]}}}}}}];
  json.animations[0].channels[0].target = {path: 'pointer', extensions: {KHR_animation_pointer: {pointer: '/materials/0/extensions/ACME_material/customTexture/extensions/KHR_texture_transform/offset'}}};
  json.extensions.KHR_character_expression.expressions[0].extensions = {KHR_character_expression_texture_transform: {channels: [0]}};
  const parser = {json, getDependency: async () => new THREE.Float32BufferAttribute([0,2], 1)};
  const gltf = {scene: new THREE.Group(), parser, animations: []} as unknown as GLTF;
  const m = await new KHRCharacterExpressionLoaderPlugin(parser as any)._import(gltf);
  assert.equal([...m!.expressions][0].duration, 2);
  assert.equal(m!.evaluate([1]).responses.length, 0);
  assert.equal(json.materials[0].extensions.ACME_material.customTexture.extensions.KHR_texture_transform.offset[0], 0);
});

test('loader rejects within-animation aliases while allowing the same animation across entries', async () => {
  const json: any = fixture(); json.extensionsUsed.push('KHR_animation_pointer');
  json.animations[0].channels.push({sampler: 0, target: {path: 'pointer', extensions: {KHR_animation_pointer: {pointer: '/nodes/0/translation'}}}});
  await assert.rejects(load(json), /Duplicate concrete targets/);
});

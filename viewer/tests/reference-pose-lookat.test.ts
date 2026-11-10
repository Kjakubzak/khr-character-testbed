import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveReferencePoses, nodeParents } from '../src/khr-character/reference-pose/resolveReferencePoses.ts';
import { KHRCharacterReferencePose } from '../src/khr-character/reference-pose/KHRCharacterReferencePose.ts';
import { KHRCharacterReferencePoseLoaderPlugin } from '../src/khr-character/reference-pose/KHRCharacterReferencePoseLoaderPlugin.ts';
import { getLookatTargetPoint, parseLookatTargetHint, type KHRNodeLookatTargetMarker } from '../src/khr-character/lookat-target/KHRNodeLookatTarget.ts';
import { KHRNodeLookatTargetLoaderPlugin } from '../src/khr-character/lookat-target/KHRNodeLookatTargetLoaderPlugin.ts';

const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const closeAll = (actual: ArrayLike<number>, expected: ArrayLike<number>) => Array.from(expected).forEach((v, i) => close(actual[i], v));
// GLTFLoader's embedded-buffer path reports progress through this DOM event.
if (globalThis.ProgressEvent == null) globalThis.ProgressEvent = class extends Event {} as any;
const quiet = async <T>(fn: () => Promise<T> | T): Promise<{ result: T; warnings: string[] }> => {
  const warn = console.warn; const warnings: string[] = []; console.warn = (...args) => { warnings.push(args.join(' ')); };
  try { return { result: await fn(), warnings }; } finally { console.warn = warn; }
};

const quarterY = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
/** Spec-like hierarchy: Hips(0,1,0) > Spine(0,0.3,0) > Head(0,0.4,0); tagged animation rotates Hips. */
function poseJSON(): any {
  return {
    asset: { version: '2.0' }, extensionsUsed: ['KHR_character', 'KHR_character_reference_pose'], extensions: { KHR_character: {} },
    nodes: [
      { name: 'Hips', children: [1], translation: [0, 1, 0] },
      { name: 'Spine', children: [2], translation: [0, 0.3, 0], scale: [2, 2, 2] },
      { name: 'Head', translation: [0, 0.4, 0] },
      { name: 'Matrix', matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 5,0,0,1] },
    ],
    accessors: [
      { componentType: 5126, count: 1, type: 'SCALAR', min: [0], max: [0] },
      { componentType: 5126, count: 1, type: 'VEC4' },
      { componentType: 5126, count: 1, type: 'VEC3' },
      { componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
    ],
    animations: [
      { name: 'Ordinary', channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }], samplers: [{ input: 0, output: 2 }] },
      { name: 'Ref', extensions: { KHR_character_reference_pose: { poseType: 't_pose' } },
        channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }, { sampler: 1, target: { node: 2, path: 'translation' } }],
        samplers: [{ input: 0, output: 1, interpolation: 'STEP' }, { input: 0, output: 2 }] },
    ],
  };
}
const values: Record<number, number[]> = { 0: [0], 1: quarterY, 2: [0, 0.5, 0], 3: [0, 1] };
const read = async (index: number) => values[index];

test('reference pose resolves targeted TRS from the single key and everything else from authored values', async () => {
  const { poses, errors } = await resolveReferencePoses(poseJSON(), read);
  assert.deepEqual(errors, []);
  assert.equal(poses.length, 1);
  const [pose] = poses;
  assert.equal(pose.animationIndex, 1); assert.equal(pose.animationName, 'Ref');
  assert.equal(pose.poseType, 't_pose'); assert.equal(pose.isStandardPoseType, true);
  assert.deepEqual(pose.nodes[0], { translation: [0, 1, 0], rotation: quarterY, scale: [1, 1, 1] });
  assert.deepEqual(pose.nodes[1], { translation: [0, 0.3, 0], rotation: [0, 0, 0, 1], scale: [2, 2, 2] });
  assert.deepEqual(pose.nodes[2].translation, [0, 0.5, 0]);
  assert.deepEqual(pose.nodes[3].matrix, [1,0,0,0, 0,1,0,0, 0,0,1,0, 5,0,0,1]);
});

test('standard pose labels are exact; other nonempty labels are custom and still resolve', async () => {
  for (const [label, standard] of [['a_pose', true], ['i_pose', true], ['T_POSE', false], ['ACME_relaxed_pose', false]] as const) {
    const json = poseJSON(); json.animations[1].extensions.KHR_character_reference_pose.poseType = label;
    const { poses } = await resolveReferencePoses(json, read);
    assert.equal(poses[0].poseType, label); assert.equal(poses[0].isStandardPoseType, standard);
  }
  const json = poseJSON(); json.animations.push(structuredClone(json.animations[1]));
  assert.deepEqual((await resolveReferencePoses(json, read)).poses.map((p) => p.animationIndex), [1, 2]);
});

test('invalid tagged animations are reported and not exposed', async () => {
  const cases: Array<[string, (json: any) => void]> = [
    ['empty poseType', (j) => { j.animations[1].extensions.KHR_character_reference_pose.poseType = ''; }],
    ['missing poseType', (j) => { j.animations[1].extensions.KHR_character_reference_pose = {}; }],
    ['no channels', (j) => { j.animations[1].channels = []; }],
    ['weights target', (j) => { j.animations[1].channels[0].target.path = 'weights'; }],
    ['pointer target', (j) => { j.animations[1].channels[0].target = { path: 'pointer', extensions: { KHR_animation_pointer: { pointer: '/nodes/0/rotation' } } }; }],
    ['two keys', (j) => { j.animations[1].samplers[0].input = 3; }],
    ['cubic', (j) => { j.animations[1].samplers[0].interpolation = 'CUBICSPLINE'; }],
    ['matrix node', (j) => { j.animations[1].channels[1].target.node = 3; }],
    ['duplicate target', (j) => { j.animations[1].channels[1].target = { node: 0, path: 'rotation' }; }],
    ['wrong output type', (j) => { j.animations[1].samplers[0].output = 2; }],
  ];
  for (const [name, mutate] of cases) {
    const json = poseJSON(); mutate(json);
    const { poses, errors } = await resolveReferencePoses(json, read);
    assert.equal(poses.length, 0, name); assert.equal(errors.length, 1, name);
  }
  const nonUnit = { ...values, 1: [0, 0, 0, 2] };
  assert.equal((await resolveReferencePoses(poseJSON(), async (i) => nonUnit[i])).poses.length, 0);
});

test('global reference-pose transforms compose resolved locals; withPose applies them temporarily', async () => {
  const json = poseJSON();
  const { poses } = await resolveReferencePoses(json, read);
  const objects = json.nodes.map(() => new THREE.Object3D());
  objects[0].add(objects[1]); objects[1].add(objects[2]);
  objects.forEach((object: THREE.Object3D, i: number) => object.position.set(9, 9, i)); // live state differs from authored
  const pose = new KHRCharacterReferencePose(poses[0], objects, nodeParents(json));
  const head = new THREE.Vector3().setFromMatrixPosition(pose.getGlobalMatrix(2));
  // Hips (0,1,0) turned 90 degrees about Y; Spine (0,0.3,0) scale 2; Head (0,0.5,0) in Spine space -> y = 1 + 0.3 + 1.0
  closeAll(head.toArray(), [0, 2.3, 0]);
  const inside = pose.withPose(() => {
    objects[0].updateWorldMatrix(false, true);
    return { hips: objects[0].quaternion.toArray(), spine: objects[1].position.toArray(), head: objects[2].getWorldPosition(new THREE.Vector3()).toArray() };
  });
  closeAll(inside.hips, quarterY); closeAll(inside.spine, [0, 0.3, 0]); closeAll(inside.head, [0, 2.3, 0]);
  objects.forEach((object: THREE.Object3D, i: number) => { closeAll(object.position.toArray(), [9, 9, i]); closeAll(object.quaternion.toArray(), [0, 0, 0, 1]); });
  assert.throws(() => pose.withPose(() => { throw new Error('render failure'); }));
  closeAll(objects[0].position.toArray(), [9, 9, 0]);
});

function embed(json: any, floats: number[]): any {
  const bytes = Buffer.alloc(floats.length * 4); floats.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  json.buffers = [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString('base64')}` }];
  return json;
}

test('loader exposes tagged animations with resolved values and leaves ordinary clips intact', async () => {
  const json = embed({
    asset: { version: '2.0' }, extensionsUsed: ['KHR_character', 'KHR_character_reference_pose'], extensions: { KHR_character: {} },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Hips', children: [1], translation: [0, 1, 0] }, { name: 'Head', translation: [0, 0.5, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }, { buffer: 0, byteOffset: 4, byteLength: 16 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: 'SCALAR', min: [2], max: [2] }, { bufferView: 1, componentType: 5126, count: 1, type: 'VEC4' }],
    animations: [{ name: 'Ref', extensions: { KHR_character_reference_pose: { poseType: 'ACME_relaxed_pose' } },
      channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }], samplers: [{ input: 0, output: 1 }] }],
  }, [2, ...quarterY]);
  const loader = new GLTFLoader(); loader.register((parser) => new KHRCharacterReferencePoseLoaderPlugin(parser));
  const gltf = await loader.parseAsync(JSON.stringify(json), '');
  const poses = gltf.userData.khrCharacterReferencePoses as KHRCharacterReferencePose[];
  assert.equal(poses.length, 1);
  assert.equal(poses[0].poseType, 'ACME_relaxed_pose'); assert.equal(poses[0].isStandardPoseType, false);
  closeAll(poses[0].nodes[0].rotation, quarterY);
  const hips = gltf.scene.getObjectByName('Hips')!;
  closeAll(hips.quaternion.toArray(), [0, 0, 0, 1]); // tagging changes no node property
  assert.equal(poses[0].nodeObjects[0], hips);
  assert.equal(gltf.animations.length, 1);
});

test('lookat target point is the instance global translation; own rotation and scale do not matter', () => {
  const root = new THREE.Object3D(), marker = new THREE.Object3D();
  root.add(marker); root.position.set(1, 0, 0); marker.position.set(0, 1.5, 2);
  closeAll(getLookatTargetPoint(marker).toArray(), [1, 1.5, 2]);
  marker.rotation.set(1, 2, 3); marker.scale.set(4, 4, 4);
  closeAll(getLookatTargetPoint(marker).toArray(), [1, 1.5, 2]);
  root.rotation.y = Math.PI / 2; // parent transforms affect the point
  closeAll(getLookatTargetPoint(marker).toArray(), [3, 1.5, 0]);
  root.position.x = 5; // animated ancestor: evaluated per call
  closeAll(getLookatTargetPoint(marker).toArray(), [7, 1.5, 0]);
});

test('lookat hints are advisory: invalid values are reported and treated as omitted', async () => {
  const { result, warnings } = await quiet(() => [
    parseLookatTargetHint({ hint: 'ACME_eye_target' }, 't'), parseLookatTargetHint({}, 't'),
    parseLookatTargetHint({ hint: '' }, 't'), parseLookatTargetHint({ hint: 3 }, 't')]);
  assert.deepEqual(result, ['ACME_eye_target', undefined, undefined, undefined]);
  assert.equal(warnings.length, 2);
});

test('loader recognizes every marker with its hint and instances, including markers with content', async () => {
  const json = embed({
    asset: { version: '2.0' }, extensionsUsed: ['KHR_node_lookat_target'], scene: 0, scenes: [{ nodes: [0, 3] }],
    nodes: [
      { name: 'ObjectRoot', translation: [1, 0, 0], children: [1, 2] },
      { name: 'FocusPoint', translation: [0, 1.5, 2], extensions: { KHR_node_lookat_target: { hint: 'ACME_eye_target' } } },
      { name: 'Unhinted', extensions: { KHR_node_lookat_target: {} } },
      { name: 'Other', translation: [0, 0, -1], extensions: { KHR_node_lookat_target: { hint: 'acme_eye_target' } } },
      { name: 'NotInScene', extensions: { KHR_node_lookat_target: {} } },
    ],
  }, [0]);
  const loader = new GLTFLoader(); loader.register((parser) => new KHRNodeLookatTargetLoaderPlugin(parser));
  const gltf = await loader.parseAsync(JSON.stringify(json), '');
  const markers = gltf.userData.khrNodeLookatTargets as KHRNodeLookatTargetMarker[];
  assert.deepEqual(markers.map((m) => [m.nodeIndex, m.hint, m.instances.length]),
    [[1, 'ACME_eye_target', 1], [2, undefined, 1], [3, 'acme_eye_target', 1], [4, undefined, 0]]);
  closeAll(getLookatTargetPoint(markers[0].instances[0]).toArray(), [1, 1.5, 2]);
  closeAll(getLookatTargetPoint(markers[1].instances[0]).toArray(), [1, 0, 0]);
  closeAll(getLookatTargetPoint(markers[2].instances[0]).toArray(), [0, 0, -1]);
});

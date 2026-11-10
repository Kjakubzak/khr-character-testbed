import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { KHRNodeVisibilityHint } from '../src/khr-character/node-visibility-hint/KHRNodeVisibilityHint.ts';
import { KHRMeshPrimitiveVisibilityHint } from '../src/khr-character/mesh-primitive-visibility-hint/KHRMeshPrimitiveVisibilityHint.ts';
import { KHRCoreNodeVisibilityLoaderPlugin } from '../src/khr-character/node-visibility-hint/KHRCoreNodeVisibilityLoaderPlugin.ts';
import { isVisibilityHintRoleVisible } from '../src/khr-character/visibility-hint/isVisibilityHintRoleVisible.ts';
import { parseVisibilityHintRoles } from '../src/khr-character/visibility-hint/parseVisibilityHintRoles.ts';
import { getInitialCameraFrame } from '../src/khr-character/camera-hint/KHRNodeCameraHint.ts';

const views = [[], ['first_person'], ['third_person'], ['first_person', 'third_person']];
const cases: [string | undefined, string | undefined, boolean[]][] = [
  [undefined, undefined, [true, true, true, true]],
  ['always', 'always', [true, true, true, true]],
  ['third_person', undefined, [false, false, true, true]],
  ['third_person', 'always', [false, false, true, true]],
  ['first_person', 'always', [false, true, false, true]],
  ['third_person', 'first_person', [false, false, false, true]],
  ['first_person', 'third_person', [false, false, false, true]],
  ['first_person', 'first_person', [false, true, false, true]],
  ['always', 'third_person', [false, false, true, true]],
];
for (const [parentRole, childRole, expected] of cases) {
  test(`ancestor intersection: ${parentRole}/${childRole}`, () => {
    const parent = new THREE.Group(), child = new THREE.Group();
    parent.add(child);
    const hints = new KHRNodeVisibilityHint([
      ...(parentRole ? [{ node: parent, roles: [parentRole] }] : []),
      ...(childRole ? [{ node: child, roles: [childRole] }] : []),
    ]);
    views.forEach((tags, index) => assert.equal(hints.shouldRenderVisualContent(child, tags), expected[index]));
    assert.equal(parent.visible, true); assert.equal(child.visible, true);
  });
}

test('exact roles; unrecognized custom roles are ignored; recognized custom roles restrict', () => {
  assert.equal(isVisibilityHintRoleVisible(['third_person'], []), false);
  assert.equal(isVisibilityHintRoleVisible(['third_person'], ['THIRD_PERSON']), false);
  assert.equal(isVisibilityHintRoleVisible(['unknown'], ['first_person']), true);
  assert.equal(isVisibilityHintRoleVisible(['ACME_mirror'], [], { recognizedCustomRoles: ['ACME_mirror'] }), false);
  assert.equal(isVisibilityHintRoleVisible(['ACME_mirror'], ['ACME_mirror'], { recognizedCustomRoles: ['ACME_mirror'] }), true);
  const parent = new THREE.Group(), child = new THREE.Group(); parent.add(child);
  const hints = new KHRNodeVisibilityHint([{ node: parent, roles: ['third_person'] }, { node: child, roles: ['ACME_custom'] }]);
  assert.equal(hints.isHintVisible(child, ['first_person']), false);
  assert.equal(hints.isHintVisible(child, ['third_person']), true);
  assert.equal(hints.isHintVisible(child, ['third_person'], { recognizedCustomRoles: ['ACME_custom'] }), false);
  assert.equal(hints.isHintVisible(child, ['third_person', 'ACME_custom'], { recognizedCustomRoles: ['ACME_custom'] }), true);
});

test('roles are ORed within one hint', () => {
  const roles = ['first_person', 'ACME_mirror_only'];
  const acme = { recognizedCustomRoles: ['ACME_mirror_only'] };
  assert.equal(isVisibilityHintRoleVisible(roles, ['first_person']), true);
  assert.equal(isVisibilityHintRoleVisible(roles, ['third_person']), false);
  assert.equal(isVisibilityHintRoleVisible(roles, ['third_person'], acme), false);
  assert.equal(isVisibilityHintRoleVisible(roles, ['third_person', 'ACME_mirror_only'], acme), true);
  assert.equal(isVisibilityHintRoleVisible(['always', 'first_person'], ['third_person']), true);
  assert.equal(isVisibilityHintRoleVisible(['ACME_a', 'ACME_b'], []), true);
});

test('a standard role without application logic applies in every view', () => {
  const none = { standardRolesWithLogic: [] };
  for (const view of [[], ['first_person'], ['third_person']]) {
    assert.equal(isVisibilityHintRoleVisible(['first_person'], view, none), true);
    assert.equal(isVisibilityHintRoleVisible(['third_person'], view, none), true);
  }
  const firstOnly = { standardRolesWithLogic: ['first_person'] };
  assert.equal(isVisibilityHintRoleVisible(['first_person'], ['third_person'], firstOnly), false);
  assert.equal(isVisibilityHintRoleVisible(['third_person'], ['first_person'], firstOnly), true);
});

test('roles parsing ignores malformed and pre-normative single-role hints', () => {
  const warn = console.warn; const warnings: unknown[] = []; console.warn = (...args) => { warnings.push(args); };
  try {
    assert.deepEqual(parseVisibilityHintRoles({ roles: ['third_person'] }, 'test'), ['third_person']);
    assert.deepEqual(parseVisibilityHintRoles({ roles: ['always', 'always'] }, 'test'), ['always']);
    assert.equal(parseVisibilityHintRoles({ role: 'third_person' }, 'test'), undefined);
    assert.equal(parseVisibilityHintRoles({ roles: [] }, 'test'), undefined);
    assert.equal(parseVisibilityHintRoles({ roles: [''] }, 'test'), undefined);
    assert.equal(parseVisibilityHintRoles({ roles: 'third_person' }, 'test'), undefined);
    assert.equal(warnings.length, 5);
  } finally { console.warn = warn; }
});

test('live reparenting changes ancestry without flattening metadata', () => {
  const parent = new THREE.Group(), alternate = new THREE.Group(), child = new THREE.Group(); parent.add(child);
  const entry = { node: child, roles: ['always'] };
  const hints = new KHRNodeVisibilityHint([{ node: parent, roles: ['third_person'] }, entry]);
  assert.equal(hints.isHintVisible(child, ['first_person']), false);
  alternate.add(child);
  assert.equal(hints.isHintVisible(child, ['first_person']), true);
  assert.deepEqual(entry.roles, ['always']);
});

test('primitive and node hints on the same object compose before scoped drawing', () => {
  const mesh = new THREE.Mesh();
  const hints = new KHRNodeVisibilityHint([{ node: mesh, roles: ['first_person'] }]);
  const primitives = [{ object: mesh, roles: ['third_person'] }];
  hints.withView(['first_person'], () => assert.equal(mesh.visible, false), primitives);
  hints.withView(views[3], () => assert.equal(mesh.visible, true), primitives);
  assert.equal(mesh.visible, true);
});

test('always primitive cannot reopen ancestor hint or core false', () => {
  const parent = new THREE.Group(), mesh = new THREE.Mesh(); parent.add(mesh);
  const hints = new KHRNodeVisibilityHint([{ node: parent, roles: ['third_person'] }]);
  const primitives = [{ object: mesh, roles: ['always'] }];
  hints.withView(['first_person'], () => assert.equal(mesh.visible, false), primitives);
  parent.visible = false;
  hints.withView(['third_person'], () => assert.equal(hints.shouldRenderVisualContent(mesh, ['third_person']), false), primitives);
  assert.equal(parent.visible, false); assert.equal(mesh.visible, true);
});

test('nested views and exceptions restore prior state and preserve Boolean queries', () => {
  const parent = new THREE.Group();
  const hints = new KHRNodeVisibilityHint([{ node: parent, roles: ['third_person'] }]);
  hints.withView(['first_person'], () => {
    assert.equal(parent.visible, false);
    assert.equal(hints.shouldRenderVisualContent(parent, ['third_person']), true);
    hints.withView(['third_person'], () => assert.equal(parent.visible, true));
    assert.equal(parent.visible, false);
  });
  assert.throws(() => hints.withView([], () => { throw Error('render failure'); }));
  assert.equal(parent.visible, true);
  hints.setView([]); assert.equal(parent.visible, true);
});

test('shared geometry and material do not share instance visibility results', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry, material);
  const hints = new KHRNodeVisibilityHint([{ node: a, roles: ['first_person'] }, { node: b, roles: ['third_person'] }]);
  hints.withView(['first_person'], () => { assert.equal(a.visible, true); assert.equal(b.visible, false); });
  hints.withView(['third_person'], () => { assert.equal(a.visible, false); assert.equal(b.visible, true); });
  assert.equal(a.material, b.material); assert.equal(a.visible, true); assert.equal(b.visible, true);
  geometry.dispose(); material.dispose();
});

test('hint pruning preserves transform animation and camera evaluation', () => {
  const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera(); parent.add(camera);
  const mixer = new THREE.AnimationMixer(parent);
  mixer.clipAction(new THREE.AnimationClip('move', 2, [new THREE.VectorKeyframeTrack(`${camera.uuid}.position`, [0, 2], [0, 0, 0, 2, 0, 0])])).play();
  const hints = new KHRNodeVisibilityHint([{ node: parent, roles: ['third_person'] }]);
  hints.withView(['first_person'], () => {
    mixer.update(1); parent.updateMatrixWorld(true);
    assert.equal(camera.matrixWorld.elements[12], 1);
    assert.equal(camera.visible, true);
  });
  assert.equal(parent.visible, true); mixer.stopAllAction();
});

test('core import retains cameras while importing own Boolean visibility', async () => {
  const scene = new THREE.Group(), parent = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  scene.add(parent); parent.add(camera);
  const parser = { json: { nodes: [{ extensions: { KHR_node_visibility: { visible: false } } }, {}] }, associations: new Map([[parent, { nodes: 0 }], [camera, { nodes: 1 }]]) };
  await new KHRCoreNodeVisibilityLoaderPlugin(parser as any).afterRoot({ scenes: [scene] } as any);
  assert.equal(parent.visible, false); assert.equal(camera.visible, true);
  camera.position.x = 2; scene.updateMatrixWorld(true); assert.equal(camera.matrixWorld.elements[12], 2);
});

test('imported Boolean pointer values animate actual false/true rather than numeric visibility', async () => {
  const scene = new THREE.Group(), node = new THREE.Group(); scene.add(node);
  const track = new THREE.BooleanKeyframeTrack(`${node.uuid}.visible`, [0, 1], [false, true]);
  // Reproduce the pointer helper's numeric values in its declared Boolean track.
  (track as unknown as {values:number[]}).values = [0, 1];
  const clip = new THREE.AnimationClip('visibility', 1, [track]);
  const parser = {json:{nodes:[{extensions:{KHR_node_visibility:{visible:false}}}]},associations:new Map([[node,{nodes:0}]])};
  await new KHRCoreNodeVisibilityLoaderPlugin(parser as any).afterRoot({scenes:[scene],animations:[clip]} as any);
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce,1); action.clampWhenFinished=true; action.play();
  mixer.setTime(0); assert.equal(node.visible,false);
  mixer.setTime(1); assert.equal(node.visible,true);
  assert.equal(typeof node.visible,'boolean'); mixer.stopAllAction();
});

test('primitive-only support has no dependency on node hints', () => {
  const mesh = new THREE.Mesh();
  const hints = new KHRMeshPrimitiveVisibilityHint([{ object: mesh, roles: ['first_person'] }]);
  hints.withView([], () => assert.equal(mesh.visible, false));
  assert.equal(mesh.visible, true);
});

test('a single-use view iterator applies the same snapshot to every primitive instance', () => {
  const a = new THREE.Mesh(), b = new THREE.Mesh();
  const hints = new KHRMeshPrimitiveVisibilityHint([{object:a,roles:['first_person']}, {object:b,roles:['first_person']}]);
  function* tags() { yield 'first_person'; }
  hints.withView(tags(), () => { assert.equal(a.visible,true); assert.equal(b.visible,true); });
});

test('camera frame ignores scale, leaves target independent, and rejects singular transform', () => {
  const parent = new THREE.Group(), node = new THREE.Group(), target = new THREE.Group();
  parent.scale.set(2, 3, 4); node.position.set(1, 2, 3); parent.add(node);
  const hint = { node, role: 'first_person', targetNode: target };
  const first = getInitialCameraFrame(hint)!;
  assert.deepEqual(first.elements.slice(12, 15), [2, 6, 12]);
  for (let col = 0; col < 3; col++) assert.equal(new THREE.Vector3().setFromMatrixColumn(first, col).length(), 1);
  target.position.set(100, 50, -30); assert.deepEqual(getInitialCameraFrame(hint)!.elements, first.elements);
  parent.scale.x = 0; assert.equal(getInitialCameraFrame(hint), null);
});

test('camera frame distinguishes a zero ancestor scale from a small nonzero scale', () => {
  const parent = new THREE.Group(), child = new THREE.Group(); parent.add(child);
  parent.rotation.set(0.3, 0.7, 0.2); child.rotation.set(0.4, 0.2, 0.8);
  parent.scale.set(0, 2, 3);
  assert.equal(getInitialCameraFrame({node:child,role:'first_person'}), null);
  parent.scale.x = 0.00001;
  assert.notEqual(getInitialCameraFrame({node:child,role:'first_person'}), null);
});

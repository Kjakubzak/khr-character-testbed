// Shared KHR_character conformance fixtures (vendored from Kjakubzak/khr_character_testbed, see
// tests/fixtures/conformance/SOURCE.json), loaded through the viewer's real loadGLTF path and checked
// against every expected.json case. SHOULD cases the viewer does not implement are skipped with a reason.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import * as THREE from 'three';

const viewerRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('./fixtures/conformance/', import.meta.url));
const source = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'SOURCE.json'), 'utf8'));

/** SHOULD cases this viewer does not implement: fixture -> case name -> reason. */
const EXPECTED_SKIPS: Record<string, Record<string, string>> = {
  'CAM-Default': {
    'several default_view hints: the lowest node index wins':
      'the viewer does not choose a default view from camera hints; it only shows the first_person hint',
    'unrecognized custom roles stay out of default affordances':
      'the viewer has no default camera affordances (no camera-hint menu)',
    'a host that recognizes the custom role may surface it':
      'the viewer has no default camera affordances (no camera-hint menu)',
  },
};

// --- Node environment for the browser loader -------------------------------------------------------
// GLTFLoader reports progress with ProgressEvent and decodes images with fetch + createImageBitmap.
// Images are irrelevant to these checks, so bitmaps are stubbed and blob: URLs are served from memory.
(globalThis as any).ProgressEvent ??= class ProgressEvent extends Event {
  constructor(type: string, options: object = {}) { super(type); Object.assign(this, options); }
};
(globalThis as any).self ??= globalThis; // GLTFLoader reads self.URL for embedded images
(globalThis as any).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
const blobs = new Map<string, Blob>();
let blobCount = 0;
URL.createObjectURL = (blob: Blob) => { const id = `blob:conformance/${blobCount++}`; blobs.set(id, blob); return id; };
URL.revokeObjectURL = (id: string) => { blobs.delete(id); };
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const blob = blobs.get(url);
  return blob != null ? Promise.resolve(new Response(blob)) : realFetch(input, init);
}) as typeof fetch;

let server: ViteDevServer;
let loadGLTF: (url: string) => Promise<any>;
before(async () => {
  server = await createServer({ root: viewerRoot, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  ({ loadGLTF } = await server.ssrLoadModule('/src/loadGLTF.ts'));
});

// --- Report -----------------------------------------------------------------------------------------
const report = new Map<string, { pass: number; fail: number; skip: number }>();
const tally = (fixture: string, key: 'pass' | 'fail' | 'skip') => {
  const entry = report.get(fixture) ?? { pass: 0, fail: 0, skip: 0 };
  entry[key]++; report.set(fixture, entry);
};
after(async () => {
  await server?.close();
  const lines = [...report].map(([fixture, r]) => `${fixture.padEnd(18)} pass ${r.pass}  fail ${r.fail}  skip ${r.skip}`);
  console.log(`Conformance fixtures (${source.repository}@${source.commit.slice(0, 12)}):\n${lines.join('\n')}`);
});

// --- Helpers ----------------------------------------------------------------------------------------
async function loadFixture(name: string) {
  const text = fs.readFileSync(path.join(fixtureRoot, name, `${name}.gltf`));
  return loadGLTF('data:model/gltf+json;base64,' + text.toString('base64'));
}
const DEFAULT_TOLERANCE = 1e-6;
function assertClose(actual: ArrayLike<number> | number, expected: ArrayLike<number> | number, tolerance = DEFAULT_TOLERANCE, what = '') {
  const a = typeof actual === 'number' ? [actual] : Array.from(actual);
  const e = typeof expected === 'number' ? [expected] : Array.from(expected);
  assert.equal(a.length, e.length, `${what}: length ${a.length} != ${e.length}`);
  e.forEach((value, i) => assert(Math.abs(a[i] - value) <= tolerance, `${what}: [${a}] != [${e}] (tolerance ${tolerance})`));
}
function nodeIndexByName(gltf: any, name: string): number {
  const index = (gltf.parser.json.nodes ?? []).findIndex((node: any) => node.name === name);
  assert(index >= 0, `node ${name} not found`);
  return index;
}
function objectForNode(gltf: any, index: number): THREE.Object3D {
  let found: THREE.Object3D | undefined;
  gltf.scene.traverse((object: THREE.Object3D) => {
    const association = gltf.parser.associations.get(object);
    if (found == null && association?.nodes === index) found = object;
  });
  assert(found != null, `no instance of node #${index}`);
  return found!;
}
/** The Mesh drawing primitive `primitive` of a node instance. */
function primitiveObject(gltf: any, nodeObject: THREE.Object3D, primitive: number): THREE.Object3D {
  const candidates = [nodeObject, ...nodeObject.children];
  const match = candidates.find((object) => {
    const association = gltf.parser.associations.get(object);
    return (object as THREE.Mesh).isMesh && association?.primitives === primitive;
  });
  assert(match != null, `primitive #${primitive} of ${nodeObject.name} not found`);
  return match!;
}
/** Drawn when the object and every ancestor up to the glTF scene are visible during the view scope. */
function isDrawn(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current != null; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) break;
  }
  return true;
}
function applyState(gltf: any, state: { animation: string | null; time?: number } | undefined) {
  if (state?.animation == null) return;
  const clip = gltf.animations.find((c: THREE.AnimationClip) => c.name === state.animation);
  assert(clip != null, `animation ${state.animation} not found`);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  mixer.setTime(state.time ?? 0);
  gltf.scene.updateMatrixWorld(true);
}
function withHost<T>(loaded: any, host: { logic: string[]; applies: string[] }, fn: () => T): T {
  const standard = ['first_person', 'third_person'];
  const options = {
    standardRolesWithLogic: host.logic.filter((role) => standard.includes(role)),
    recognizedCustomRoles: host.logic.filter((role) => role !== 'always' && !standard.includes(role)),
  };
  if (loaded.nodeVisibilityHint) return loaded.nodeVisibilityHint.withView(host.applies, fn, loaded.meshPrimitiveVisibilityHint?.items ?? [], options);
  if (loaded.meshPrimitiveVisibilityHint) return loaded.meshPrimitiveVisibilityHint.withView(host.applies, fn, options);
  return fn();
}
function driverVector(manager: any, drivers: Record<string, number>): number[] {
  const byName = manager.expressionMap as Map<string, { index: number }>;
  const count = Math.max(0, ...[...byName.values()].map((e) => e.index + 1));
  const vector = Array<number>(count).fill(0);
  for (const [name, value] of Object.entries(drivers)) {
    const entry = byName.get(name);
    assert(entry != null, `expression ${name} not found`);
    vector[entry.index] = value;
  }
  return vector;
}
function rotationVectorDeg(q: ArrayLike<number>): number[] {
  const quaternion = new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize();
  if (quaternion.w < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
  const angle = 2 * Math.acos(Math.min(1, quaternion.w));
  const s = Math.sqrt(Math.max(0, 1 - quaternion.w * quaternion.w));
  if (s < 1e-12) return [0, 0, 0];
  return [quaternion.x, quaternion.y, quaternion.z].map((v) => THREE.MathUtils.radToDeg((v / s) * angle));
}

// --- Case runners by kind ---------------------------------------------------------------------------
type Case = { name: string; level: 'MUST' | 'SHOULD'; input: any; expected: any };

async function runVisibility(fixture: string, c: Case) {
  const loaded = await loadFixture(fixture);
  const { gltf } = loaded;
  applyState(gltf, c.input.state);
  withHost(loaded, c.input.host, () => {
    for (const [name, expected] of Object.entries(c.expected.nodes ?? {})) {
      const object = objectForNode(gltf, nodeIndexByName(gltf, name));
      assert.equal(isDrawn(object, gltf.scene), expected, `node ${name}`);
    }
    for (const [key, expected] of Object.entries(c.expected.primitives ?? {})) {
      const [name, primitive] = key.split('#');
      const object = primitiveObject(gltf, objectForNode(gltf, nodeIndexByName(gltf, name)), Number(primitive));
      assert.equal(isDrawn(object, gltf.scene), expected, `primitive ${key}`);
    }
  });
}

async function runSuppression(fixture: string, c: Case) {
  const { expressionManager: manager } = await loadFixture(fixture);
  const evaluation = manager.evaluate(driverVector(manager, c.input.drivers));
  for (const [name, expected] of Object.entries(c.expected.effective as Record<string, number>)) {
    const index = manager.expressionMap.get(name).index;
    assertClose(evaluation.effectiveDrivers[index], expected, DEFAULT_TOLERANCE, `effective ${name}`);
  }
}

async function runExpression(fixture: string, c: Case) {
  const { expressionManager: manager } = await loadFixture(fixture);
  const evaluation = manager.evaluate(driverVector(manager, c.input.drivers));
  for (const property of c.expected.properties) {
    const aggregate = evaluation.aggregates.find((a: any) => a.target === property.target);
    if ('rotation_vector_deg' in property) {
      assert(aggregate != null, `no response for ${property.target}`);
      assertClose(rotationVectorDeg(aggregate.value), property.rotation_vector_deg, property.tolerance_deg, property.target);
    } else if (property.value === null) {
      assert.equal(aggregate, undefined, `${property.target} should have no response`);
    } else {
      assert(aggregate != null, `no response for ${property.target}`);
      assertClose(aggregate.value, property.value, property.tolerance ?? DEFAULT_TOLERANCE, property.target);
    }
  }
}

async function runCamera(fixture: string, c: Case) {
  assert.equal(c.input.query, 'pose', `unsupported camera query ${c.input.query}`);
  const { cameraHints } = await loadFixture(fixture);
  const { getInitialCameraFrame } = await server.ssrLoadModule('/src/khr-character/camera-hint/KHRNodeCameraHint.ts');
  const tolerance = c.expected.tolerance ?? DEFAULT_TOLERANCE;
  for (const [name, expected] of Object.entries(c.expected.hints as Record<string, any>)) {
    const hint = cameraHints.find((h: any) => h.node.name === name);
    assert(hint != null, `camera hint ${name} not found`);
    const frame = getInitialCameraFrame(hint) as THREE.Matrix4;
    assert(frame != null, `camera hint ${name} has no initial pose`);
    assertClose(frame.elements.slice(12, 15), expected.position, tolerance, `${name} position`);
    assertClose(frame.elements.slice(8, 11).map((v) => -v), expected.forward, tolerance, `${name} forward`);
    const subject = hint.targetNode?.getWorldPosition(new THREE.Vector3()).toArray() ?? null;
    if (expected.subject_point === null) assert.equal(subject, null, `${name} subject point`);
    else assertClose(subject, expected.subject_point, tolerance, `${name} subject point`);
  }
}

async function runLookat(fixture: string, c: Case) {
  const { getLookatTargetPoint } = await server.ssrLoadModule('/src/khr-character/lookat-target/KHRNodeLookatTarget.ts');
  const tolerance = c.expected.tolerance ?? DEFAULT_TOLERANCE;
  // One loaded asset instance per evaluation state, so the instances are independent.
  const instances = await Promise.all(c.input.instances.map(async (instance: any) => {
    const loaded = await loadFixture(fixture);
    applyState(loaded.gltf, instance.state);
    return loaded;
  }));
  instances.forEach((loaded: any, i: number) => {
    for (const [name, expected] of Object.entries(c.expected.instances[i] as Record<string, number[]>)) {
      const marker = loaded.lookatTargets.find((m: any) => loaded.gltf.parser.json.nodes[m.nodeIndex].name === name);
      assert(marker != null, `marker ${name} not found`);
      assert.equal(marker.instances.length, 1, `${name} instances`);
      assertClose(getLookatTargetPoint(marker.instances[0]).toArray(), expected, tolerance, `instance ${i} ${name}`);
    }
  });
}

async function runReferencePose(fixture: string, c: Case) {
  const { gltf, referencePoses } = await loadFixture(fixture);
  const poses = referencePoses ?? [];
  if (c.input.query === 'tagged_animations') {
    assert.deepEqual(poses.map((p: any) => p.animationName), c.expected.animations);
    return;
  }
  const pose = poses.find((p: any) => p.animationName === c.input.animation);
  assert(pose != null, `tagged animation ${c.input.animation} not exposed`);
  assert.equal(pose.poseType, c.expected.poseType);
  const tolerance = c.expected.tolerance ?? DEFAULT_TOLERANCE;
  for (const [name, expected] of Object.entries(c.expected.local as Record<string, any>)) {
    const resolved = pose.nodes[nodeIndexByName(gltf, name)];
    if (expected.matrix != null) assertClose(resolved.matrix, expected.matrix, tolerance, `${name} matrix`);
    else for (const key of ['translation', 'rotation', 'scale']) assertClose(resolved[key], expected[key], tolerance, `${name} ${key}`);
  }
  for (const [name, expected] of Object.entries((c.expected.global_translation ?? {}) as Record<string, number[]>)) {
    const global = pose.getGlobalMatrix(nodeIndexByName(gltf, name)) as THREE.Matrix4;
    assertClose(global.elements.slice(12, 15), expected, tolerance, `${name} global translation`);
  }
}

const runners: Record<string, (fixture: string, c: Case) => Promise<void>> = {
  visibility: runVisibility, suppression: runSuppression, expression: runExpression,
  camera_hint: runCamera, lookat_target: runLookat, reference_pose: runReferencePose,
};

// --- Tests ------------------------------------------------------------------------------------------
test('vendored fixtures match SOURCE.json (pinned commit and SHA-256 per file)', () => {
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  const listed = Object.keys(source.files).sort();
  const present: string[] = [];
  const walk = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (full !== path.join(fixtureRoot, 'SOURCE.json')) present.push(path.relative(fixtureRoot, full).split(path.sep).join('/'));
  });
  walk(fixtureRoot);
  assert.deepEqual(present.sort(), listed);
  for (const file of listed) {
    const digest = createHash('sha256').update(fs.readFileSync(path.join(fixtureRoot, file))).digest('hex');
    assert.equal(digest, source.files[file], `${file} differs from ${source.commit}`);
  }
});

const fixtures = fs.readdirSync(fixtureRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^[A-Z]/.test(entry.name)).map((entry) => entry.name).sort();

test('every fixture is covered', () => assert.equal(fixtures.length, 12));

for (const fixture of fixtures) {
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, fixture, 'expected.json'), 'utf8'));
  test(`${fixture} (${expected.kind})`, async (t) => {
    const runner = runners[expected.kind];
    assert(runner != null, `unknown fixture kind ${expected.kind}`);
    for (const c of expected.cases as Case[]) {
      const skip = EXPECTED_SKIPS[fixture]?.[c.name];
      if (skip != null) {
        assert.equal(c.level, 'SHOULD', 'only SHOULD cases may be skipped');
        tally(fixture, 'skip');
        await t.test(`[${c.level}] ${c.name}`, { skip: `expected skip: ${skip}` }, () => {});
        continue;
      }
      await t.test(`[${c.level}] ${c.name}`, async () => {
        try { await runner(fixture, c); tally(fixture, 'pass'); } catch (error) { tally(fixture, 'fail'); throw error; }
      });
    }
  });
}

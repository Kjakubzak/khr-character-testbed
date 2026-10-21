import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import * as THREE from 'three';
import { createFixture } from './fixture.mjs';

// The browser GLTF loader needs ProgressEvent; these GLBs have no external textures or DOM dependencies.
globalThis.ProgressEvent ??= class ProgressEvent extends Event {
  constructor(type, options = {}) { super(type); Object.assign(this, options); }
};
const fixture = createFixture();
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { loadGLTF } = await server.ssrLoadModule('/src/loadGLTF.ts');
  const bytes = fs.readFileSync(fixture.output);
  const loaded = await loadGLTF('data:model/gltf-binary;base64,' + bytes.toString('base64'));
  const core = loaded.gltf.scene.getObjectByName('CoreFalse');
  const camera = loaded.gltf.scene.getObjectByName('CameraUnderCoreFalse');
  assert.equal(core.visible, false); assert.equal(camera.parent, core); assert.equal(camera.isCamera, true);
  const clip = loaded.gltf.animations.find((clip) => clip.name === 'CoreVisibility');
  assert.equal(clip.tracks[0].ValueTypeName, 'bool');
  const mixer = new THREE.AnimationMixer(loaded.gltf.scene), action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  mixer.setTime(0); assert.equal(core.visible, false);
  mixer.setTime(1); assert.equal(core.visible, true); assert.equal(typeof core.visible, 'boolean');
  assert.equal(camera.parent, core);
  loaded.expressionManager.setValue(0, .5); loaded.expressionManager.setValue(1, .5); loaded.expressionManager.update(0);
  assert.equal(loaded.gltf.scene.getObjectByName('ExpressionMesh').position.x, 1);
  assert.deepEqual(loaded.expressionManager.evaluateMappedInputs('demo_v1', { Together: 1 }), [.5, .5]);
  const { convertVRMToKHRCharacter } = await server.ssrLoadModule(path.resolve('../converter/converter/index.ts'));
  const converted = convertVRMToKHRCharacter(fs.readFileSync(fixture.converterInput), { autoVisibility: true });
  assert.deepEqual(converted.gltf.extensions.KHR_character, {});
  assert.ok(converted.gltf.extensions.KHR_character_expression_mapping.expressionSetMappings.vrm1_expressions.happy);
  assert.equal(converted.gltf.extensions.KHR_character_expression_mapping.expressionSetInputMappings, undefined);
  const report = { passed: true, actualGLBBytes: bytes.length, ordinaryBooleanTrack: 'bool',
    coreStates: [false, true], cameraPreserved: true, nativeTranslationX: 1, mappedDrivers: [.5, .5],
    vrmConversionBytes: converted.glb.length, browserRenderingExecuted: false };
  if (process.env.KHR_BROWSER_PREFLIGHT_REPORT) fs.writeFileSync(process.env.KHR_BROWSER_PREFLIGHT_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
 } catch (error) {
  if (process.env.KHR_BROWSER_PREFLIGHT_REPORT) fs.writeFileSync(process.env.KHR_BROWSER_PREFLIGHT_REPORT,
    JSON.stringify({ passed: false, error: error.message, browserRenderingExecuted: false }, null, 2) + '\n');
  throw error;
} finally { await server.close(); }

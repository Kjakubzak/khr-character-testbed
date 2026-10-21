import * as THREE from 'three';
import { loadGLTF } from '../../src/loadGLTF.ts';

const loaded = await loadGLTF('/tests/browser/fixtures/integration.glb');
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, preserveDrawingBuffer: true });
renderer.setSize(256, 256); renderer.setPixelRatio(1); renderer.setClearColor(0, 1);
const scene = new THREE.Scene(); scene.add(loaded.gltf.scene);
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 10); camera.position.z = 3;
// Draw behind candidate geometry, but AFTER it. Hidden depth writers would occlude this green witness.
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({ color: 0x00ff00, toneMapped: false }));
backdrop.position.z = -.1; backdrop.renderOrder = 1; scene.add(backdrop);
const target = new THREE.WebGLRenderTarget(256, 256);
const core = loaded.gltf.scene.getObjectByName('CoreFalse')!;
const mesh = loaded.gltf.scene.getObjectByName('ExpressionMesh')!;
const importedCamera = loaded.gltf.scene.getObjectByName('CameraUnderCoreFalse')!;

function render(view: string[], drivers = [0, 0], coreVisible = false, custom = false) {
  core.visible = coreVisible;
  drivers.forEach((driver, index) => loaded.expressionManager!.setValue(index, driver));
  loaded.expressionManager!.update(0);
  const before = [] as boolean[];
  loaded.gltf.scene.traverse((object) => before.push(object.visible));
  loaded.nodeVisibilityHint!.withView(view, () => {
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(scene, camera);
  }, loaded.meshPrimitiveVisibilityHint?.items ?? [], custom ? {
    resolveCustomRole: (role) => role === 'ACME_preview',
  } : {});
  const pixels = new Uint8Array(256 * 256 * 4); renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
  let redPixels = 0, greenPixels = 0, sumX = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > 100 && pixels[index + 1] < 30 && pixels[index + 2] < 30) {
      redPixels++; sumX += (index / 4) % 256;
    }
    if (pixels[index + 1] > 100 && pixels[index] < 30 && pixels[index + 2] < 30) greenPixels++;
  }
  const after = [] as boolean[];
  loaded.gltf.scene.traverse((object) => after.push(object.visible));
  return { redPixels, greenPixels, coreBackdropPixel: Array.from(pixels.slice((128 * 256 + 64) * 4, (128 * 256 + 64) * 4 + 4)),
    centroidX: redPixels ? sumX / redPixels : null, position: mesh.position.toArray(),
    restored: before.every((value, index) => value === after[index]),
    coreOwn: core.visible, cameraAttached: importedCamera.parent === core, cameraIsCamera: !!(importedCamera as THREE.Camera).isCamera,
    expressionCount: loaded.expressionManager!.expressions.size,
    mappingDrivers: loaded.expressionManager!.evaluateMappedInputs('demo_v1', { Together: 1 }),
  };
}

const mixer = new THREE.AnimationMixer(loaded.gltf.scene);
const coreClip = loaded.gltf.animations.find((clip) => clip.name === 'CoreVisibility')!;
const action = mixer.clipAction(coreClip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
function animateCore(time: number) {
  action.enabled = true; action.paused = false; mixer.setTime(time);
  return { ...render([], [0, 0], core.visible), coreTrackType: coreClip.tracks[0].ValueTypeName,
    coreValueType: typeof core.visible, time };
}
(window as any).browserHarness = { render, animateCore };
document.querySelector('#status')!.textContent = 'Ready: loaded actual GLB through the viewer loader';
render(['first_person', 'third_person']);

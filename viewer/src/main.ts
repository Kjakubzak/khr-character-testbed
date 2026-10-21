import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import './style.css';
import sampleGltf from './assets/khr-character-example.glb?url';
import { VRMAnimation } from '@pixiv/three-vrm-animation';
import { loadGLTF } from './loadGLTF';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KHRCharacterExpressionManager } from './khr-character/expressions/KHRCharacterExpressionManager';
import { VRMUtils } from '@pixiv/three-vrm';
import type { VRMCCharacterExpressionLookat } from './khr-character/lookat/VRMCCharacterExpressionLookat';
import { createKHRCharacterHumanoidAnimationTracks } from './createKHRCharacterHumanoidAnimationTracks';
import { createKHRCharacterVRMHumanoidRestPose } from './createKHRCharacterVRMHumanoidRestPose';
import type { KHRCharacterVRMHumanoidRestPose } from './KHRCharacterVRMHumanoidRestPose';
import smartphoneVrma from './assets/smartphone.vrma?url';
import { handleDragAndDrop } from './utils/handleDragAndDrop';
import { getInitialCameraFrame, type KHRNodeCameraHint } from './khr-character/camera-hint/KHRNodeCameraHint';
import { KHRNodeCameraHintHelper } from './khr-character/camera-hint/KHRNodeCameraHintHelper';
import { checkMaxTextureArrayLayers } from './utils/checkMaxTextureArrayLayers';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { KHRCharacterSkeletonMappingHelper } from './KHRCharacterSkeletonMappingHelper';
import type { KHRMeshPrimitiveVisibilityHint } from './khr-character/mesh-primitive-visibility-hint/KHRMeshPrimitiveVisibilityHint';
import type { KHRNodeVisibilityHint } from './khr-character/node-visibility-hint/KHRNodeVisibilityHint';

// == basic Three.js stuff =========================================================================
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const css2DElement = document.getElementById('css2d-element') as HTMLDivElement;

const maxTextureArrayLayers = await checkMaxTextureArrayLayers();
console.log(maxTextureArrayLayers);

const renderer = new WebGPURenderer({
  canvas,
  antialias: true,
  requiredLimits: {
    maxTextureArrayLayers,
  },
});
renderer.setClearColor(0x000000, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
await renderer.init();

const css2dRenderer = new CSS2DRenderer({
  element: css2DElement,
});
css2dRenderer.setSize(window.innerWidth, window.innerHeight);

const gui = new GUI();

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20);
camera.position.set(0, 1, 3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

const scene = new THREE.Scene();

const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(1, 2, 3);
scene.add(light);

// == gui for skeletons ============================================================================
const paramsSkeleton: Record<string, any> = {
  'vrmAnimation': 'none',
  'showHelper': false,
};
const guiSkeletons = gui.addFolder('Skeleton');

guiSkeletons.add(paramsSkeleton, 'vrmAnimation', [ 'none', 'smartphone' ]).onChange((value) => {
  if (value === 'none') {
    currentVRMAnimation = null;
    playVRMAnimation();
  } else if (value === 'smartphone') {
    handleLoadGLTF(smartphoneVrma);
  }
});

guiSkeletons.add(paramsSkeleton, 'showHelper').onChange(() => {
  updateSkeletonMappingHelperVisibility();
});

// == gui for visibility ===========================================================================
const paramsVisibility = {
  view: 'third_person',
};
const guiVisibility = gui.addFolder('Visibility');
guiVisibility.add(paramsVisibility, 'view', ['first_person', 'third_person', 'both', 'none']).onChange(() => {
  updateVisibility();
});

// == gui for expressions ==========================================================================
const paramsExpressions: Record<string, number> = {};
const guiExpressions = gui.addFolder('Expressions');

const paramsLookat = {
  lookAtMode: 'none' as 'none' | 'camera',
};
const guiLookat = gui.addFolder('Look-at');
guiLookat.add(paramsLookat, 'lookAtMode', [ 'none', 'camera' ]).onChange((value) => {
  if (value !== 'none' && currentLookat == null) {
    console.warn('VRMC_character_expression_lookat extension is not available in this model.');
  }

  if (value === 'none' && currentLookat != null && currentExpressionManager != null) {
    // reset
    currentLookat.target = null;
    currentLookat.applyFromYawPitchToExpressionManager(currentExpressionManager, 0.0, 0.0);
  }
});

function setupExpressionsGUI() {
  for (const controller of guiExpressions.controllersRecursive()) controller.destroy();
  for (const label of Object.keys(paramsExpressions)) delete paramsExpressions[label];

  // add expression parameters to the GUI
  for (const expression of currentExpressionManager?.expressions ?? []) {
    const label = `${expression.expressionName} (${expression.index})`;
    paramsExpressions[label] = expression.weight;
    guiExpressions.add(paramsExpressions, label, 0, 1).onChange((value) => {
      currentExpressionManager?.setValue(expression.index, value);
    });
  }
}

// == gui for camera hint ==========================================================================
const paramsCameraHint = {
  showCameraHint: false,
};
const guiCameraHint = gui.addFolder('Camera Hint');

guiCameraHint.add(paramsCameraHint, 'showCameraHint');

// == gltf =========================================================================================
let currentGLTF: GLTF | null = null;
let currentSkeletonMappingHelper: KHRCharacterSkeletonMappingHelper | null = null;
let currentExpressionManager: KHRCharacterExpressionManager | null = null;
let currentLookat: VRMCCharacterExpressionLookat | null = null;
let currentVRMHumanoidRestPose: KHRCharacterVRMHumanoidRestPose | null = null;
let currentVRMAnimation: VRMAnimation | null = null;
let currentAnimationMixer: THREE.AnimationMixer | null = null;
let currentCameraHints: KHRNodeCameraHint[] | null = null;
let currentNodeVisibilityHint: KHRNodeVisibilityHint | null = null;
let currentMeshPrimitiveVisibilityHint: KHRMeshPrimitiveVisibilityHint | null = null;

function playVRMAnimation() {
  // stop existing animation
  if (currentAnimationMixer != null) {
    currentAnimationMixer.stopAllAction();
  }

  // play new animation, if both character and animation are available
  if (currentVRMAnimation != null) {
    if (currentVRMHumanoidRestPose == null || currentAnimationMixer == null) {
      console.warn('Unable to play VRM animation. Skeletal rig mapping "vrm1_humanoid" is not available in this model.');
      return;
    }

    const humanoidTracks = createKHRCharacterHumanoidAnimationTracks(currentVRMAnimation, currentVRMHumanoidRestPose);
    const clip = new THREE.AnimationClip('Clip', currentVRMAnimation.duration, [...humanoidTracks.translation.values(), ...humanoidTracks.rotation.values()]);
    currentAnimationMixer.clipAction(clip).play();
  }
}

async function handleLoadGLTF(url: string) {
  const {
    gltf,
    skeletonMapping,
    expressionManager,
    lookat,
    cameraHints,
    nodeVisibilityHint,
    meshPrimitiveVisibilityHint,
    vrmAnimations,
  } = await loadGLTF(url);

  // when loaded GLTF is animation, skip setting character stuff
  if (vrmAnimations != null) {
    currentVRMAnimation = vrmAnimations[0];
  } else {
    // when loaded GLTF is character

    // dispose current resources
    if (currentGLTF != null) {
      scene.remove(currentGLTF.scene);
      VRMUtils.deepDispose(currentGLTF.scene);
    }

    if (currentSkeletonMappingHelper != null) {
      currentSkeletonMappingHelper.dispose();
    }

    // assign new resources
    currentGLTF = gltf;
    currentSkeletonMappingHelper = skeletonMapping != null
      ? new KHRCharacterSkeletonMappingHelper(skeletonMapping)
      : null;
    currentExpressionManager = expressionManager ?? null;
    currentLookat = lookat ?? null;
    currentVRMHumanoidRestPose = skeletonMapping != null
      ? createKHRCharacterVRMHumanoidRestPose(skeletonMapping)
      : null;
    currentAnimationMixer = currentVRMHumanoidRestPose != null
      ? new THREE.AnimationMixer(gltf.scene)
      : null;
    currentCameraHints = cameraHints ?? null;
    currentNodeVisibilityHint = nodeVisibilityHint ?? null;
    currentMeshPrimitiveVisibilityHint = meshPrimitiveVisibilityHint ?? null;

    // setup GUI
    setupExpressionsGUI();
    updateVisibility();
    updateSkeletonMappingHelperVisibility();

    // add the gltf root to the scene
    scene.add(gltf.scene);
  }

  playVRMAnimation();
}

// load sample GLTF at the beginning
await handleLoadGLTF(sampleGltf);

// == camera hint helper ===========================================================================
const cameraHintHelper = new KHRNodeCameraHintHelper();
cameraHintHelper.matrixAutoUpdate = false;
scene.add(cameraHintHelper);

function updateCameraHintHelperTransform(hint: KHRNodeCameraHint): void {
  const frame = getInitialCameraFrame(hint);
  if (frame == null) { cameraHintHelper.visible = false; return; }
  cameraHintHelper.matrix.copy(frame);
  cameraHintHelper.matrixWorldNeedsUpdate = true;
}

function updateCameraHintHelper() {
  const hint = currentCameraHints?.find((h) => h.role === 'first_person');

  if (!paramsCameraHint.showCameraHint || hint == null) {
    cameraHintHelper.visible = false;
    return;
  }

  cameraHintHelper.visible = true;
  updateCameraHintHelperTransform(hint);
}

function updateVisibility() {
  currentNodeVisibilityHint?.setView(paramsVisibility.view);
  currentMeshPrimitiveVisibilityHint?.setView(paramsVisibility.view);
}

function updateSkeletonMappingHelperVisibility() {
  currentSkeletonMappingHelper?.setVisible(paramsSkeleton.showHelper);
}

// == animation loop ===============================================================================
const timer = new THREE.Timer();
const lookatTarget = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  timer.update();
  const delta = timer.getDelta();
  currentExpressionManager?.prepareFrame();

  if (currentLookat != null && currentExpressionManager != null) {
    if (paramsLookat.lookAtMode === 'camera') {
      camera.getWorldPosition(lookatTarget);
      currentLookat.target = lookatTarget;
      currentLookat.applyFromTargetToExpressionManager(currentExpressionManager);
    }
  }

  currentAnimationMixer?.update(delta);
  currentExpressionManager?.update(delta);
  updateCameraHintHelper();
  const tags = paramsVisibility.view === 'both' ? ['first_person', 'third_person']
    : paramsVisibility.view === 'none' ? [] : [paramsVisibility.view];
  const render = () => { css2dRenderer.render(scene, camera); renderer.render(scene, camera); };
  if (currentNodeVisibilityHint) {
    currentNodeVisibilityHint.withView(tags, render, currentMeshPrimitiveVisibilityHint?.items);
  } else if (currentMeshPrimitiveVisibilityHint) {
    currentMeshPrimitiveVisibilityHint.withView(tags, render);
  } else render();
});

// == handle dnd ===================================================================================
handleDragAndDrop((url) => handleLoadGLTF(url));

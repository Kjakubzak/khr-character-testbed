import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { getLookatTargetPoint, type KHRNodeLookatTargetMarker } from './KHRNodeLookatTarget.ts';

const RENDER_ORDER = 10000;

/** Debug overlay: a small marker and a label (node index and hint) at each instance's target point. */
export class KHRNodeLookatTargetHelper extends THREE.Group {
  private readonly geometry = new THREE.OctahedronGeometry(0.015);
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xff7f00, depthTest: false, depthWrite: false, transparent: true });
  private readonly entries: Array<{ instance: THREE.Object3D; mesh: THREE.Mesh; label: CSS2DObject }> = [];

  public constructor(markers: readonly KHRNodeLookatTargetMarker[]) {
    super();
    this.matrixAutoUpdate = true;
    for (const marker of markers) for (const instance of marker.instances) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.renderOrder = RENDER_ORDER;
      const element = document.createElement('div');
      element.textContent = `#${marker.nodeIndex}${marker.hint != null ? ` ${marker.hint}` : ''}`;
      element.style.cssText = 'color:#ff7f00;font:11px monospace;transform:translateY(-14px);';
      const label = new CSS2DObject(element);
      mesh.add(label);
      this.add(mesh);
      this.entries.push({ instance, mesh, label });
    }
  }

  /** Place each overlay marker at its instance's current global translation. Call after animation updates. */
  public update(): void {
    // The helper is added at the scene root, so world and local positions coincide.
    for (const { instance, mesh } of this.entries) getLookatTargetPoint(instance, mesh.position);
  }

  public dispose(): void {
    for (const { label } of this.entries) label.element.remove();
    this.geometry.dispose();
    this.material.dispose();
  }
}

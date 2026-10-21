import type * as THREE from 'three';
import { isVisibilityHintRoleVisible, type ViewTags, type VisibilityRoleOptions } from '../visibility-hint/isVisibilityHintRoleVisible.ts';
import { withVisibilityForView, getAuthoredVisibility, type VisualHintItem } from '../visibility-hint/withVisibilityForView.ts';
import type { KHRNodeVisibilityHintItem } from './KHRNodeVisibilityHintItem.ts';

export class KHRNodeVisibilityHint {
  public readonly items: readonly KHRNodeVisibilityHintItem[];
  private readonly entries = new Map<THREE.Object3D, KHRNodeVisibilityHintItem>();
  private readonly roots: Set<THREE.Object3D>;
  public selectedView: ViewTags = [];

  public constructor(items: readonly KHRNodeVisibilityHintItem[], roots: readonly THREE.Object3D[] = []) {
    this.items = items;
    this.roots = new Set(roots);
    for (const item of items) this.entries.set(item.node, item);
  }

  /** Pure query, evaluated through the current instance's ancestors. */
  public isHintVisible(node: THREE.Object3D, view: ViewTags, options: VisibilityRoleOptions = {}): boolean {
    const tags = new Set(typeof view === 'string' ? [view] : view);
    for (let current: THREE.Object3D | null = node; current != null; current = current.parent) {
      if (!isVisibilityHintRoleVisible(this.entries.get(current)?.role, tags, options)) return false;
      if (this.roots.has(current)) break;
    }
    return true;
  }

  public shouldRenderVisualContent(node: THREE.Object3D, view: ViewTags, options: VisibilityRoleOptions = {}): boolean {
    for (let current: THREE.Object3D | null = node; current != null; current = current.parent) {
      if (!getAuthoredVisibility(current)) return false;
      if (this.roots.has(current)) break;
    }
    return this.isHintVisible(node, view, options);
  }

  /** Store a view choice; applying it is scoped to withView, preserving authored/animated visibility. */
  public setView(view: ViewTags): void { this.selectedView = new Set(typeof view === 'string' ? [view] : view); }

  public withView<T>(view: ViewTags, render: () => T, primitiveItems: readonly VisualHintItem[] = [], options: VisibilityRoleOptions = {}): T {
    const tags = new Set(typeof view === 'string' ? [view] : view);
    return withVisibilityForView(this.items.map((item) => ({ object: item.node, role: item.role })),
      primitiveItems, (node) => this.isHintVisible(node, tags, options), tags, render, options);
  }
}

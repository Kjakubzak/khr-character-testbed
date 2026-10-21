import type { KHRMeshPrimitiveVisibilityHintItem } from './KHRMeshPrimitiveVisibilityHintItem.ts';
import { type ViewTags, type VisibilityRoleOptions } from '../visibility-hint/isVisibilityHintRoleVisible.ts';
import { withVisibilityForView } from '../visibility-hint/withVisibilityForView.ts';

export class KHRMeshPrimitiveVisibilityHint {
  public readonly items: readonly KHRMeshPrimitiveVisibilityHintItem[];
  public selectedView: ViewTags = [];

  public constructor(items: readonly KHRMeshPrimitiveVisibilityHintItem[]) {
    this.items = items;
  }

  public setView(view: ViewTags): void { this.selectedView = new Set(typeof view === 'string' ? [view] : view); }

  public withView<T>(view: ViewTags, render: () => T, options: VisibilityRoleOptions = {}): T {
    return withVisibilityForView([], this.items, () => true, view, render, options);
  }
}

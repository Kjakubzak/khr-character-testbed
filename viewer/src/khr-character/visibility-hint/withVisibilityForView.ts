import type * as THREE from 'three';
import { isVisibilityHintRoleVisible, type ViewTags, type VisibilityRoleOptions } from './isVisibilityHintRoleVisible.ts';

export interface VisualHintItem { object: THREE.Object3D; role: string; }
const scopes = new Map<THREE.Object3D, { authoredVisible: boolean; depth: number }>();

/** Read actual Boolean visibility even while another view is inside a temporary render scope. */
export function getAuthoredVisibility(object: THREE.Object3D): boolean {
  return scopes.get(object)?.authoredVisible ?? object.visible;
}

/** Run a synchronous render scope; compose predicates first and restore even when rendering throws. */
export function withVisibilityForView<T>(
  nodeItems: readonly VisualHintItem[], primitiveItems: readonly VisualHintItem[],
  hintVisible: (node: THREE.Object3D) => boolean, view: ViewTags,
  render: () => T, options: VisibilityRoleOptions = {},
): T {
  const tags = new Set(typeof view === 'string' ? [view] : view);
  const saved = new Map<THREE.Object3D, boolean>();
  for (const item of [...nodeItems, ...primitiveItems]) saved.set(item.object, item.object.visible);
  const primitiveRoles = new Map(primitiveItems.map((item) => [item.object, item.role]));
  const effective = new Map<THREE.Object3D, boolean>();
  for (const [object] of saved) {
    effective.set(object, getAuthoredVisibility(object) && hintVisible(object)
      && isVisibilityHintRoleVisible(primitiveRoles.get(object), tags, options));
  }
  for (const [object, visible] of saved) {
    const entry = scopes.get(object);
    if (entry) entry.depth++;
    else scopes.set(object, { authoredVisible: visible, depth: 1 });
  }
  try {
    for (const [object, visible] of effective) object.visible = visible;
    return render();
  } finally {
    for (const [object, visible] of saved) {
      object.visible = visible;
      const entry = scopes.get(object)!;
      if (--entry.depth === 0) scopes.delete(object);
    }
  }
}

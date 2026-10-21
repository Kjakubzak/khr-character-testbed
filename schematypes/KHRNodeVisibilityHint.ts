import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Adds a local view predicate for this node and its subtree. Effective hint
 * visibility ANDs every ancestor predicate. Hint rendering does not rewrite
 * actual KHR_node_visibility, animation, or hierarchy activation state.
 */
export interface KHRNodeVisibilityHint extends GLTFProperty {
  /**
   * The view context in which this node is visible. Standard vocabulary values ('always', 'first_person', 'third_person') provide interoperability guarantees; custom, vendor-prefixed values are permitted for domain-specific view contexts.
   */
  role: string;

  /**
   * Human-readable label for this visibility annotation. Used for UI display in authoring tools and inspectors.
   */
  label?: string;
}

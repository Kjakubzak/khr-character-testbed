import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Adds a local primitive predicate, ANDed with cumulative node hints and actual
 * Boolean visibility. It cannot reopen an ancestor-hidden primitive.
 */
export interface KHRMeshPrimitiveVisibilityHint extends GLTFProperty {
  /**
   * The view context in which this primitive is visible. Standard vocabulary values ('always', 'first_person', 'third_person') provide interoperability guarantees; custom, vendor-prefixed values are permitted for domain-specific view contexts.
   */
  role: string;

  /**
   * Human-readable label for this visibility annotation. Used for UI display in authoring tools and inspectors.
   */
  label?: string;
}

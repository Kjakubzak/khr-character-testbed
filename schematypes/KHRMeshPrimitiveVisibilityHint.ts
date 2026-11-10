import type { GLTFProperty } from './GLTFProperty.ts';
import type { KHRVisibilityHintStandardRole } from './KHRNodeVisibilityHint.ts';

/**
 * Associates one mesh primitive, in every instance of the mesh, with one or
 * more visibility roles. Not inherited. It adds a restriction (AND) to the
 * containing node's ancestor-inclusive hints and KHR_node_visibility; it
 * cannot reopen content they hide. This extension MUST NOT be listed in
 * `extensionsRequired`.
 */
export interface KHRMeshPrimitiveVisibilityHint extends GLTFProperty {
  /**
   * One or more distinct nonempty roles, with the same rules as
   * KHR_node_visibility_hint.roles.
   */
  roles: (KHRVisibilityHintStandardRole | (string & {}))[];

  /**
   * Nonempty human-readable label, preferred over the roles when presenting
   * the hint to a user. It has no effect on visibility.
   */
  label?: string;
}

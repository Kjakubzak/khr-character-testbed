import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Standard visibility roles. Exact and case-sensitive; any other value is a custom role.
 */
export type KHRVisibilityHintStandardRole = 'always' | 'first_person' | 'third_person';

/**
 * Associates a node, and by inheritance its subtree, with one or more
 * visibility roles. The application's logic decides which roles apply in each
 * render view. The node's own hint and every ancestor hint apply together
 * (AND); a descendant hint cannot restore content an ancestor hides.
 * Applying hints does not alter authored or animated node state, and
 * KHR_node_visibility can always hide content. This extension MUST NOT be
 * listed in `extensionsRequired`.
 */
export interface KHRNodeVisibilityHint extends GLTFProperty {
  /**
   * One or more distinct nonempty roles; order has no meaning. The hint allows
   * a view when at least one recognized role applies there. A standard role
   * the application has no logic for applies in every view; unrecognized
   * custom roles are ignored; a hint that includes 'always', or has no
   * recognized role, imposes no restriction.
   */
  roles: (KHRVisibilityHintStandardRole | (string & {}))[];

  /**
   * Nonempty human-readable label, preferred over node.name and the roles when
   * presenting the hint to a user. It has no effect on visibility.
   */
  label?: string;
}

import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Identifies a node as a passive positional marker. Its evaluated per-instance
 * global translation is the target point. The marker selects no downstream
 * system and causes no orientation behavior.
 */
export interface KHRNodeLookatTarget extends GLTFProperty {
  /**
   * Optional nonempty advisory label suggesting an intended use, exact and
   * case-sensitive. No standard values are defined; vendor-qualified values
   * such as 'ACME_eye_target' are recommended.
   */
  hint?: string;
}

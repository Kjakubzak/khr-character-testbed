import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Standard camera hint roles. Exact and case-sensitive; any other value is a custom role.
 */
export type KHRNodeCameraHintStandardRole =
  | 'default_view'
  | 'detail'
  | 'first_person'
  | 'framing_view'
  | 'full_body'
  | 'orbit_view'
  | 'portrait'
  | 'third_person';

/**
 * Associates a node with a passive, advisory camera descriptor. For every
 * role, the initial camera pose comes from the node's global transform using
 * the core glTF camera view-matrix rules; if those leave the view matrix
 * undefined, no initial pose is defined.
 */
export interface KHRNodeCameraHint extends GLTFProperty {
  /**
   * Nonempty semantic role. Roles classify authored intent and never select or
   * activate a camera. Hosts that pick a default view automatically should
   * choose deterministically among 'default_view' hints, and should not
   * surface hints with unrecognized custom roles in default camera affordances.
   */
  role: KHRNodeCameraHintStandardRole | (string & {});

  /**
   * Advisory index of a glTF camera whose projection is associated with this
   * hint. It does not instantiate the camera or override node.camera.
   */
  camera?: number;

  /**
   * Index of a different node whose global translation is the subject point
   * (point of interest, framing subject or orbit center). It does not change
   * the initial camera pose or define any orientation. A reference to the hint
   * node itself is not usable.
   */
  targetNode?: number;

  /**
   * Nonempty human-readable label, preferred over node.name when presenting
   * the hint to a user. It has no camera behavior.
   */
  label?: string;
}

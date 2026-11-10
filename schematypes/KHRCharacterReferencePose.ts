import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Standard reference pose labels. Exact and case-sensitive; any other value is a custom label.
 */
export type KHRCharacterReferencePoseStandardType = 't_pose' | 'a_pose' | 'i_pose';

/**
 * Animation extension identifying a static one-key node TRS animation as a character reference pose.
 */
export interface KHRCharacterReferencePose extends GLTFProperty {
  /**
   * Required nonempty classification label for this reference pose.
   */
  poseType: KHRCharacterReferencePoseStandardType | (string & {});
}

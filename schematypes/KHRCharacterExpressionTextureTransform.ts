import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Classifies listed expression-animation channels as KHR_texture_transform
 * property channels (offset, scale or rotation through KHR_animation_pointer).
 */
export interface KHRCharacterExpressionTextureTransform extends GLTFProperty {
  /**
   * Nonempty array of unique channel indices in the entry's animation.
   */
  channels: number[];
}

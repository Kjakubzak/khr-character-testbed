import type { GLTFProperty } from './GLTFProperty.ts';

export interface KHRCharacterExpressionExpression extends GLTFProperty {
  /**
   * Nonempty descriptive label. Expression identity is its array index; labels may repeat.
   */
  name: string;

  /**
   * Index into the glTF animations array representing an expression animation.
   */
  animation: number;
}

/**
 * glTF extension that provides a common interface for facial expression animations.
 */
export interface KHRCharacterExpression extends GLTFProperty {
  /**
   * Array of mappings between animation/channels and expression labels.
   */
  expressions: KHRCharacterExpressionExpression[];
}

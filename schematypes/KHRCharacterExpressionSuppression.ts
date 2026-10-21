import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * Defines how the parent expression affects a target expression.
 */
export interface KHRCharacterExpressionSuppressionItem extends GLTFProperty {
  /**
   * Index of the native expression receiving this suppression.
   */
  target: number;

  /**
   * 'blend' and 'block' use the current immutable native-driver snapshot.
   * Custom types require host support; an unsupported type contributes factor 1.
   */
  type?: string;

  /**
   * Suppression strength in [0, 1], defaulting to 1.
   */
  amount?: number;

  /**
   * For 'block' type suppressions, the threshold value above which the target expression is blocked. When this expression's value exceeds the threshold, the target is reduced by the amount.
   */
  threshold?: number;
}

/**
 * Per-entry suppressions targeting native expression indices.
 */
export interface KHRCharacterExpressionSuppression extends GLTFProperty {
  /**
   * Suppression entries evaluated independently from one immutable snapshot.
   */
  suppressions: KHRCharacterExpressionSuppressionItem[];
}

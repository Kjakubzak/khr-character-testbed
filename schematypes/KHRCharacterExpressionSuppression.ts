import type { GLTFProperty } from './GLTFProperty.ts';

/**
 * One attenuation contribution from the containing (source) expression to a target expression.
 * All contributions to one target are summed and clamped:
 * `v[t] = u[t] * (1 - clamp(sum, 0, 1))`.
 */
export interface KHRCharacterExpressionSuppressionItem extends GLTFProperty {
  /**
   * Index of the native expression driver attenuated by this suppression.
   * Resolution always uses this index.
   */
  target: number;

  /**
   * Optional name of this suppression. It is independent of the target
   * expression's name and is never used to resolve the target.
   */
  name?: string;

  /**
   * 'blend' (default) contributes `amount * u[source]`. 'block' contributes
   * `amount` when `u[source] > threshold`, otherwise 0. Any other value is a
   * custom type shaped like a vendor extension name; it contributes 0 unless a
   * supported companion extension on this suppression, keyed by the same
   * value, defines its attenuation.
   */
  type?: 'blend' | 'block' | (string & {});

  /**
   * Attenuation amount in [0, 1] used by 'blend' and 'block'. Default 1.
   */
  amount?: number;

  /**
   * Strict source-driver threshold in [0, 1] for 'block'. Default 0.
   * Exporters MUST NOT write it when `type` is 'blend' or omitted; importers
   * MUST ignore it there.
   */
  threshold?: number;
}

/**
 * Nonempty array of suppressions whose implicit source is the containing expression entry.
 */
export interface KHRCharacterExpressionSuppression extends GLTFProperty {
  suppressions: KHRCharacterExpressionSuppressionItem[];
}

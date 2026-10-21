import type { GLTFProperty } from './GLTFProperty.ts';

export interface KHRCharacterExpressionMappingExpressionSetMapping {
  /**
   * Entries receiving this external input's contribution.
   */
  [inputKey: string]: Array<GLTFProperty & {
    /**
     * Index of the native expression to drive in KHR_character_expression.expressions.
     */
    source: number;

    /**
     * Optional name of this mapping entry, independent of the native expression label.
     */
    name?: string;

    /**
     * Nonnegative contribution coefficient in [0, 1].
     */
    weight: number;
  }>;
}

export interface KHRCharacterExpressionMappingExpressionSetMappings {
  /**
   * External vocabulary identifiers, compared exactly without normalization or fetching.
   */
  [expressionSetName: string]: KHRCharacterExpressionMappingExpressionSetMapping;
}

/**
 * External input keys contribute to native expression drivers through authored weights.
 */
export interface KHRCharacterExpressionMapping extends GLTFProperty {
  /**
   * Nonempty mapping sets. The host chooses a vocabulary and arbitrates other driver sources.
   */
  expressionSetMappings: KHRCharacterExpressionMappingExpressionSetMappings;
}

import * as THREE from 'three';
import type { KHRCharacterExpressionSuppressionItem } from '../../../../schematypes/KHRCharacterExpressionSuppression.ts';

/** Raw suppression metadata; target identity remains its native array index. */
export type KHRCharacterExpressionSuppression = KHRCharacterExpressionSuppressionItem;
export type ExpressionCompositionKind = 'additive' | 'quaternion' | 'scale' | 'discrete';

export interface ExpressionBinding {
  id: string;
  read(): number[];
  write(values: readonly number[]): void;
}

export interface ExpressionChannel {
  channelIndex: number;
  /** Canonical AOM property. Array elements share their complete-array key. */
  target: string;
  components: readonly number[];
  initial: readonly number[];
  kind: ExpressionCompositionKind;
  sample(time: number): number[];
  bindings: readonly ExpressionBinding[];
}

/** Native identity is the serialized expression-array index; names are unique within the asset. */
export class KHRCharacterExpression extends THREE.Object3D {
  public readonly expressionName: string;
  public readonly index: number;
  public weight = 0;
  public duration: number;
  public channels: ExpressionChannel[] = [];
  public suppressions: KHRCharacterExpressionSuppression[] = [];
  public readonly isKHRCharacterExpression = true;

  constructor(expressionName: string, index: number, duration = 0) {
    super();
    this.expressionName = expressionName;
    this.index = index;
    this.duration = duration;
    this.name = `KHRCharacterExpression_${index}`;
    this.visible = false;
  }
}

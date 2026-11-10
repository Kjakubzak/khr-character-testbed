import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KHRCharacterExpressionMapping } from '../../../../schematypes/KHRCharacterExpressionMapping.ts';
import { saturate } from '../../utils/saturate.ts';
import { KHRCharacterExpression, type ExpressionChannel, type ExpressionBinding, type ExpressionCompositionKind, type KHRCharacterExpressionSuppression } from './KHRCharacterExpression.ts';

export interface ExpressionResponse {
  entryIndex: number;
  channelIndex: number;
  target: string;
  components: readonly number[];
  kind: ExpressionCompositionKind;
  sample: readonly number[];
  neutral: readonly number[];
  initial: readonly number[];
}
export interface ExpressionAggregate {
  target: string;
  kind: ExpressionCompositionKind;
  value: readonly number[];
  initial: readonly number[];
}
export interface ExpressionEvaluation {
  inputDrivers: readonly number[];
  effectiveDrivers: readonly number[];
  responses: readonly ExpressionResponse[];
  aggregates: readonly ExpressionAggregate[];
}
const finiteDriver = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('Expression driver must be finite.');
  return saturate(value);
};

/**
 * Attenuation contributed by one suppression for a source driver `u`:
 * 'blend' adds amount * u; 'block' adds amount when u > threshold (strict), else 0.
 * A custom type contributes 0 because this viewer supports no companion extension.
 * `threshold` is read only for 'block'.
 */
export function suppressionAttenuation(suppression: KHRCharacterExpressionSuppression, source: number): number {
  const amount = suppression.amount ?? 1;
  const type = suppression.type ?? 'blend';
  if (type === 'blend') return amount * source;
  if (type === 'block') return source > (suppression.threshold ?? 0) ? amount : 0;
  return 0;
}

/** Apply the aggregate rotation change (value * initial^-1) onto the live host base rotation. */
function applyRotationChange(value: readonly number[], initial: readonly number[], base: readonly number[]): number[] {
  const change = new THREE.Quaternion().fromArray(value as number[]).multiply(new THREE.Quaternion().fromArray(initial as number[]).invert());
  return change.multiply(new THREE.Quaternion().fromArray(base as number[])).normalize().toArray();
}

/** Normative evaluator plus an explicit host policy for application to Three.js. */
export class KHRCharacterExpressionManager {
  /** Kept as a host surface; expression evaluation never plays/mutates clips. */
  public readonly animationMixer: THREE.AnimationMixer;
  public readonly mapping: KHRCharacterExpressionMapping | undefined;
  public lastEvaluation: ExpressionEvaluation | undefined;
  private readonly _expressions = new Map<number, KHRCharacterExpression>();
  private _restore: Array<{binding: ExpressionBinding; value: number[]}> = [];

  constructor(gltf: GLTF, mapping?: KHRCharacterExpressionMapping) {
    this.animationMixer = new THREE.AnimationMixer(gltf.scene);
    this.mapping = mapping;
  }
  public get expressions(): Set<KHRCharacterExpression> {
    return new Set([...this._expressions.values()].sort((a, b) => a.index - b.index));
  }
  /** Exact asset-local name lookup; serialized identity remains the native index. */
  public get expressionMap(): Map<string, KHRCharacterExpression> {
    const result = new Map<string, KHRCharacterExpression>();
    for (const e of this.expressions) {
      result.set(e.expressionName, e);
    }
    return result;
  }
  public registerExpression(expression: KHRCharacterExpression): void {
    if (!Number.isInteger(expression.index) || expression.index < 0) throw new Error('Native expression index must be a nonnegative integer.');
    if (this._expressions.has(expression.index)) throw new Error(`Duplicate native expression index ${expression.index}`);
    if (typeof expression.expressionName !== 'string' || expression.expressionName.length === 0) throw new Error('Native expression names must be nonempty strings.');
    if (this.expressionMap.has(expression.expressionName)) throw new Error(`Duplicate native expression name ${JSON.stringify(expression.expressionName)}`);
    this._expressions.set(expression.index, expression);
  }
  public unregisterExpression(expression: KHRCharacterExpression): void {
    if (this._expressions.get(expression.index) === expression) this._expressions.delete(expression.index);
  }
  private get driverCount(): number { return this._expressions.size ? Math.max(...this._expressions.keys()) + 1 : 0; }
  private resolve(reference: number | string): KHRCharacterExpression | undefined {
    return typeof reference === 'number' ? this._expressions.get(reference) : this.expressionMap.get(reference);
  }
  public getValue(reference: number | string): number | null { return this.resolve(reference)?.weight ?? null; }
  public setValue(reference: number | string, weight: number): void {
    const value = finiteDriver(weight);
    const expression = this.resolve(reference);
    if (expression == null) throw new Error(`Unknown native expression: ${reference}`);
    expression.weight = value;
  }
  /** Sole mapping equation: clamp each input, sum every authored occurrence, clamp native result. */
  public evaluateMappedInputs(setId: string, inputs: Readonly<Record<string, number>>): readonly number[] {
    for (const value of Object.values(inputs)) finiteDriver(value);
    const sets = this.mapping?.expressionSetMappings;
    const set = sets != null && Object.hasOwn(sets, setId) ? sets[setId] : undefined;
    if (set == null) throw new Error(`Unknown expression mapping set: ${setId}`);
    const drivers = Array<number>(this.driverCount).fill(0);
    for (const [key, associations] of Object.entries(set)) {
      const input = finiteDriver(Object.hasOwn(inputs, key) ? inputs[key] : 0);
      for (const association of associations) {
        if (!this._expressions.has(association.source) || !Number.isFinite(association.weight) || association.weight < 0 || association.weight > 1) {
          throw new Error('Invalid native mapping association.');
        }
        drivers[association.source] += input * association.weight;
      }
    }
    return Object.freeze(drivers.map(saturate));
  }
  /** Host arbitration policy: selected mapped inputs replace the direct native vector. */
  public setMappedValues(setId: string, inputs: Readonly<Record<string, number>>): void {
    const drivers = this.evaluateMappedInputs(setId, inputs);
    for (const e of this.expressions) e.weight = drivers[e.index] ?? 0;
  }
  public evaluate(drivers?: readonly number[]): ExpressionEvaluation {
    const inputDrivers = Array.from({length: this.driverCount}, (_, i) => finiteDriver(drivers == null ? this._expressions.get(i)?.weight ?? 0 : drivers[i] ?? 0));
    // KHR_character_expression_suppression: sum every attenuation contribution per
    // target from the immutable input snapshot, then v[t] = u[t] * (1 - clamp(sum, 0, 1)).
    // Targets resolve by index only; a suppression's optional name is never used.
    const attenuation = Array<number>(this.driverCount).fill(0);
    for (const e of this.expressions) for (const suppression of e.suppressions) {
      if (!this._expressions.has(suppression.target)) throw new Error('Invalid suppression target index.');
      attenuation[suppression.target] += suppressionAttenuation(suppression, inputDrivers[e.index]);
    }
    const effectiveDrivers = inputDrivers.map((u, i) => u * (1 - saturate(attenuation[i])));
    const responses: ExpressionResponse[] = [];
    const aggregates = new Map<string, Omit<ExpressionAggregate, 'value'> & {value: number[]}>();
    for (const e of this.expressions) {
      const driver = effectiveDrivers[e.index];
      if (driver === 0) continue;
      for (const c of e.channels) {
        const sample = c.sample(driver * e.duration);
        const neutral = c.sample(0);
        const response = {entryIndex: e.index, channelIndex: c.channelIndex, target: c.target,
          components: [...c.components], kind: c.kind, sample, neutral, initial: [...c.initial]};
        responses.push(response);
        let aggregate = aggregates.get(c.target);
        if (aggregate == null) {
          aggregate = {target: c.target, kind: c.kind, value: [...c.initial], initial: [...c.initial]};
          aggregates.set(c.target, aggregate);
        }
        if (c.kind === 'additive' || c.kind === 'scale') {
          // Required for additive properties; node and texture-transform scale use the
          // same b + sum(s - n) per component as recommended (SHOULD) by
          // KHR_character_expression_joint and KHR_character_expression_texture_transform.
          c.components.forEach((component, i) => aggregate.value[component] += sample[i] - neutral[i]);
        } else if (c.kind === 'quaternion') {
          // Host policy for rotation (approximately additive for small rotations, as
          // recommended by KHR_character_expression_joint): each response contributes
          // its change from its own neutral sample, delta = s * n^-1, pre-multiplied
          // onto the aggregate in ascending entry order.
          const delta = new THREE.Quaternion().fromArray(sample).multiply(new THREE.Quaternion().fromArray(neutral).invert());
          const value = delta.multiply(new THREE.Quaternion().fromArray(aggregate.value)).normalize().toArray();
          aggregate.value.splice(0, 4, ...value);
        } else {
          // Host policy for Boolean and integer values: highest active serialized entry
          // index wins. Evaluation remains absolute.
          c.components.forEach((component, i) => aggregate.value[component] = sample[i]);
        }
      }
    }
    return Object.freeze({inputDrivers: Object.freeze(inputDrivers), effectiveDrivers: Object.freeze(effectiveDrivers),
      responses: Object.freeze(responses.map(r => Object.freeze({...r, components: Object.freeze([...r.components]),
        sample: Object.freeze([...r.sample]), neutral: Object.freeze([...r.neutral]), initial: Object.freeze([...r.initial])}))),
      aggregates: Object.freeze([...aggregates.values()].map(a => Object.freeze({...a,
        value: Object.freeze([...a.value]), initial: Object.freeze([...a.initial])}))) });
  }
  /** Restore last host base before ordinary animation or another runtime writer updates it. */
  public prepareFrame(): void {
    for (const {binding, value} of this._restore) binding.write(value);
    this._restore = [];
  }
  public restoreBaseValues(): void { this.prepareFrame(); }
  /** Host application: additive and scale changes add to the current host base, rotation changes pre-multiply it, Boolean/integer values use index override. */
  public update(_delta = 0): void {
    this.prepareFrame();
    const evaluation = this.evaluate();
    const channels = new Map<string, ExpressionChannel[]>();
    for (const e of this.expressions) for (const c of e.channels) {
      const list = channels.get(c.target) ?? [];
      list.push(c);
      channels.set(c.target, list);
    }
    for (const a of evaluation.aggregates) {
      const bindings = new Map<string, ExpressionBinding>();
      for (const c of channels.get(a.target) ?? []) for (const b of c.bindings) bindings.set(b.id, b);
      for (const binding of bindings.values()) {
        const base = binding.read();
        this._restore.push({binding, value: base});
        const value = a.kind === 'additive' || a.kind === 'scale' ? a.value.map((v, i) => base[i] + v - a.initial[i])
          : a.kind === 'quaternion' ? applyRotationChange(a.value, a.initial, base)
          : a.value;
        binding.write(value);
      }
    }
    this.lastEvaluation = evaluation;
  }
}

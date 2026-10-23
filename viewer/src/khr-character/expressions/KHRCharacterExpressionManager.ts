import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KHRCharacterExpressionMapping } from '../../../../schematypes/KHRCharacterExpressionMapping.ts';
import { saturate } from '../../utils/saturate.ts';
import { KHRCharacterExpression, type ExpressionChannel, type ExpressionBinding, type ExpressionCompositionKind } from './KHRCharacterExpression.ts';

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
    const factors = Array<number>(this.driverCount).fill(1);
    for (const e of this.expressions) for (const suppression of e.suppressions) {
      if (!this._expressions.has(suppression.target)) throw new Error('Invalid suppression target index.');
      const source = inputDrivers[e.index];
      const amount = suppression.amount ?? 1;
      const type = suppression.type ?? 'blend';
      const factor = type === 'blend' ? 1 - amount * source
        : type === 'block' ? (source > (suppression.threshold ?? 0) ? 1 - amount : 1) : 1;
      factors[suppression.target] *= factor;
    }
    const effectiveDrivers = inputDrivers.map((u, i) => u * factors[i]);
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
        if (c.kind === 'additive') {
          c.components.forEach((component, i) => aggregate.value[component] += sample[i] - neutral[i]);
        } else {
          // Host policy: highest active serialized entry index wins. Evaluation remains absolute.
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
  /** Host application: additive changes on current host base; other types use index override. */
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
        const value = a.kind === 'additive' ? a.value.map((v, i) => base[i] + v - a.initial[i]) : a.value;
        binding.write(value);
      }
    }
    this.lastEvaluation = evaluation;
  }
}

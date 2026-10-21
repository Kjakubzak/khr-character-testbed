import { Quaternion } from 'three';

/** Decoded values are logical per-key values, including scalar-packed arrays. */
export function createExpressionSampler(
  times: readonly number[], values: readonly number[], dimension: number,
  interpolation: string = 'LINEAR', quaternion = false,
): (time: number) => number[] {
  if (times.length < 2 || times.some((t, i) => !Number.isFinite(t) || t < 0 || (i > 0 && t <= times[i - 1]))) {
    throw new Error('Expression inputs require at least two finite, nonnegative, increasing keys.');
  }
  if (!['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation)) throw new Error(`Unsupported interpolation: ${interpolation}`);
  const cubic = interpolation === 'CUBICSPLINE';
  const stride = dimension * (cubic ? 3 : 1);
  if (values.length !== times.length * stride || values.some(v => !Number.isFinite(v))) {
    throw new Error('Expression output dimensions/count or decoded values are invalid.');
  }
  const key = (i: number) => values.slice(i * stride + (cubic ? dimension : 0), i * stride + (cubic ? 2 * dimension : dimension));
  const normalize = (v: number[]) => {
    const length = Math.hypot(...v);
    if (length === 0 || !Number.isFinite(length)) throw new Error('Expression quaternion evaluation produced no valid rotation.');
    return v.map(x => x / length);
  };
  if (quaternion) {
    if (dimension !== 4) throw new Error('Quaternion target requires four components.');
    for (let i = 0; i < times.length; i++) {
      if (Math.abs(Math.hypot(...key(i)) - 1) > 1e-4) throw new Error('Expression rotation key is not a unit quaternion.');
    }
  }
  return (time: number): number[] => {
    if (!Number.isFinite(time)) throw new Error('Sample time must be finite.');
    if (time <= times[0]) return quaternion ? normalize(key(0)) : key(0);
    if (time >= times[times.length - 1]) return quaternion ? normalize(key(times.length - 1)) : key(times.length - 1);
    let i = 0;
    while (times[i + 1] <= time) i++;
    const a = key(i);
    if (interpolation === 'STEP') return quaternion ? normalize(a) : a;
    const b = key(i + 1);
    const dt = times[i + 1] - times[i];
    const alpha = (time - times[i]) / dt;
    if (!cubic && quaternion) {
      const result = [0, 0, 0, 1];
      Quaternion.slerpFlat(result, 0, a, 0, b, 0, alpha);
      return normalize(result);
    }
    let result: number[];
    if (cubic) {
      const a2 = alpha * alpha;
      const a3 = a2 * alpha;
      result = a.map((v, c) => (2 * a3 - 3 * a2 + 1) * v
        + (a3 - 2 * a2 + alpha) * dt * values[i * stride + 2 * dimension + c]
        + (-2 * a3 + 3 * a2) * b[c]
        + (a3 - a2) * dt * values[(i + 1) * stride + c]);
    } else result = a.map((v, c) => v + alpha * (b[c] - v));
    if (result.some(v => !Number.isFinite(v))) throw new Error('Expression sample is not finite.');
    return quaternion ? normalize(result) : result;
  };
}

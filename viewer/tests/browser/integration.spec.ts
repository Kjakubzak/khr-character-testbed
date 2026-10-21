import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import { createFixture } from './fixture.mjs';

const fixture = createFixture();
const viewer = 'http://127.0.0.1:5186';
const converter = 'http://127.0.0.1:5187';

test('the actual viewer loads and renders its converted sample', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(viewer);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Expressions', { exact: true }).first()).toBeVisible();
  // Inspect the renderer without counting text, blue GUI controls or profiler graphs as model pixels.
  await page.addStyleTag({ content: '#info, #profiler-shell, #css2d-element { visibility: hidden !important; }' });
  let screenshot: Buffer;
  let counts = { colored: 0, dark: 0 };
  await expect.poll(async () => {
    screenshot = await page.screenshot({ clip: { x: 350, y: 80, width: 450, height: 700 } });
    const image = PNG.sync.read(screenshot); counts = { colored: 0, dark: 0 };
    for (let index = 0; index < image.data.length; index += 4) {
      const rgb = [image.data[index], image.data[index + 1], image.data[index + 2]];
      if (Math.max(...rgb) > 25 && Math.max(...rgb) - Math.min(...rgb) > 8) counts.colored++;
      if (Math.max(...rgb) < 20) counts.dark++;
    }
    return counts.dark > 50_000 ? counts.colored : 0;
  }, { timeout: 30_000, message: 'the actual sample must produce >500 colored pixels on >50,000 dark canvas pixels, with UI overlays hidden' }).toBeGreaterThan(500);
  expect(counts.dark).toBeGreaterThan(50_000);
  expect(errors).toEqual([]);
  await info.attach('viewer-render.png', { body: screenshot, contentType: 'image/png' });
  await info.attach('viewer-pixels.json', { body: JSON.stringify(counts), contentType: 'application/json' });
});

test('real GLB ancestor hints and core Boolean veto change framebuffer without mutating authored state', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(viewer + '/tests/browser/harness.html');
  await expect(page.locator('#status')).toContainText('Ready');
  const render = (view: string[], core = false, custom = false) => page.evaluate(({ view, core, custom }) =>
    (window as any).browserHarness.render(view, [0, 0], core, custom), { view, core, custom });
  const first = await render(['first_person']); const third = await render(['third_person']);
  expect(first.redPixels).toBe(0); expect(third.redPixels).toBe(0);
  expect(first.greenPixels).toBe(256 * 256); expect(third.greenPixels).toBe(256 * 256);
  const both = await render(['first_person', 'third_person']);
  expect(both.redPixels).toBeGreaterThan(500); expect(both.centroidX).toBeCloseTo(127.5, 0);
  expect(both.coreOwn).toBe(false); expect(both.cameraAttached).toBe(true); expect(both.cameraIsCamera).toBe(true);
  expect(both.coreBackdropPixel).toEqual([0, 255, 0, 255]);
  const coreAllowed = await render([], true); expect(coreAllowed.redPixels).toBeGreaterThan(500);
  expect(coreAllowed.coreBackdropPixel).toEqual([255, 0, 0, 255]);
  expect(coreAllowed.greenPixels + coreAllowed.redPixels).toBe(256 * 256);
  const customAllowed = await render([], false, true); expect(customAllowed.redPixels).toBeGreaterThan(500);
  expect(customAllowed.centroidX).toBeGreaterThan(180); expect(coreAllowed.centroidX).toBeLessThan(80);
  for (const result of [first, third, both, coreAllowed, customAllowed]) expect(result.restored).toBe(true);
  await render(['first_person', 'third_person']);
  await info.attach('ancestor-render.png', { body: await page.locator('canvas').screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('ordinary Boolean pointer animation changes drawing while preserving the descendant camera', async ({ page }) => {
  await page.goto(viewer + '/tests/browser/harness.html'); await expect(page.locator('#status')).toContainText('Ready');
  const sample = (time: number) => page.evaluate((time) => (window as any).browserHarness.animateCore(time), time);
  const hidden = await sample(0); const visible = await sample(1);
  expect(hidden.redPixels).toBe(0); expect(hidden.coreOwn).toBe(false);
  expect(hidden.greenPixels).toBe(256 * 256); expect(hidden.coreBackdropPixel).toEqual([0, 255, 0, 255]);
  expect(visible.redPixels).toBeGreaterThan(500); expect(visible.coreOwn).toBe(true);
  expect(visible.coreBackdropPixel).toEqual([255, 0, 0, 255]);
  expect(visible.greenPixels + visible.redPixels).toBe(256 * 256);
  expect(visible.coreTrackType).toBe('bool'); expect(visible.coreValueType).toBe('boolean');
  expect(hidden.cameraAttached).toBe(true); expect(visible.cameraAttached).toBe(true);
  expect(visible.restored).toBe(true);
});

test('native and mapped drivers produce additive movement in the rendered GLB', async ({ page }, info) => {
  await page.goto(viewer + '/tests/browser/harness.html'); await expect(page.locator('#status')).toContainText('Ready');
  const render = (drivers: number[]) => page.evaluate((drivers) =>
    (window as any).browserHarness.render(['first_person', 'third_person'], drivers), drivers);
  const neutral = await render([0, 0]); const moved = await render([.5, .5]);
  expect(moved.expressionCount).toBe(2); expect(moved.mappingDrivers).toEqual([.5, .5]);
  expect(moved.position[0]).toBeCloseTo(1, 5);
  expect(moved.centroidX - neutral.centroidX).toBeCloseTo(64, 0);
  expect(moved.redPixels).toBeGreaterThan(500); expect(moved.restored).toBe(true);
  await info.attach('expression-render.png', { body: await page.locator('canvas').screenshot(), contentType: 'image/png' });
});

test('converter UI worker downloads exactly the library conversion bytes', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(converter);
  await page.locator('#input-file').setInputFiles(process.env.KHR_BROWSER_VRM ?? fixture.converterInput);
  await page.locator('#checkbox-auto-visibility').check();
  const expected = await page.evaluate(async () => {
    const file = (document.querySelector('#input-file') as HTMLInputElement).files![0];
    const module = await import('/converter/index.ts');
    const converted = module.convertVRMToKHRCharacter(await file.arrayBuffer(), { autoVisibility: true });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', converted.glb));
    return { hash: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''), length: converted.glb.length,
      marker: converted.gltf.extensions.KHR_character, mapping: converted.gltf.extensions.KHR_character_expression_mapping };
  });
  const workerCreated = page.waitForEvent('worker');
  await page.locator('#button-convert').click(); await workerCreated;
  await expect(page.locator('#textarea-log')).toHaveValue(/Conversion successful/, { timeout: 120_000 });
  const downloadPromise = page.waitForEvent('download'); await page.locator('#a-download').click();
  const download = await downloadPromise; const filename = info.outputPath('converted.glb'); await download.saveAs(filename);
  const bytes = await fs.readFile(filename);
  expect(bytes.length).toBe(expected.length); expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.hash);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67); expect(expected.marker).toEqual({});
  expect(expected.mapping.expressionSetMappings.vrm1_expressions).toBeDefined();
  expect(expected.mapping.expressionSetInputMappings).toBeUndefined();
  expect(errors).toEqual([]);
  await info.attach('converter.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await info.attach('conversion.json', { body: JSON.stringify(expected, null, 2), contentType: 'application/json' });
});

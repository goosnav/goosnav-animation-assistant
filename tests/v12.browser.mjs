import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { unzipSync } from 'fflate';

// The v12 people (goosnav-3D-assets) talk with baked puppet-jaw mouths. Each pair must load, speak,
// and yield reference drawings whose mouths actually differ.
const PAIRS = [['v12', 'v12-beady'], ['v12-fat', 'v12-fat-glasses'], ['billy-v2', 'v12']];

test('v12 characters load, talk and produce distinct mouth references', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    for (const [a, b] of PAIRS) {
      const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:8793');
      await page.locator('select[data-actor="0"][data-key="model"]').selectOption(a);
      await page.locator('select[data-actor="1"][data-key="model"]').selectOption(b);
      await page.getByRole('button', { name: 'Speech', exact: true }).click();
      await page.getByRole('button', { name: 'Generate speech', exact: true }).click();
      await page.getByText('Speech ready.', { exact: false }).waitFor({ timeout: 60000 });
      const count = Number(await page.locator('#drawing-count').textContent());
      assert.ok(count > 4, `${a}/${b}: expected several distinct mouth drawings, got ${count}`);
      await page.getByRole('button', { name: 'Draw', exact: true }).click();
      await page.locator('#drawing-video').click();
      await page.getByText('References ready.', { exact: true }).waitFor({ timeout: 60000 });
      await page.getByText('Other formats', { exact: true }).click();
      const zip = page.waitForEvent('download');
      await page.getByRole('button', { name: 'PNG ZIP', exact: true }).click();
      const archive = unzipSync(await fs.readFile(await (await zip).path()));
      const pngs = Object.entries(archive).filter(([n]) => n.endsWith('.png')).sort(([x], [y]) => x.localeCompare(y));
      await fs.mkdir('.work/v12', { recursive: true });
      for (const [n, bytes] of pngs) await fs.writeFile(`.work/v12/${a}__${b}__${n.split('/').pop()}`, bytes);
      // Distinct drawings must really differ (a mouth that never moves would make identical images).
      const sizes = new Set(pngs.map(([, bytes]) => bytes.length));
      assert.ok(sizes.size >= Math.min(4, pngs.length), `${a}/${b}: reference drawings look identical`);
      assert.deepEqual(errors, [], `${a}/${b}: page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
});

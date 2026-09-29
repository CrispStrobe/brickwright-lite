#!/usr/bin/env node
// MEASURES what BLOCKED.md's arena entry asked for: run the reference solution
// against a served build while varying CDP CPU throttling, and see whether the
// verdict moves. Before lib/spike-arena/arena-clock.js it did — the same content
// went pass/fail/fail/pass/fail/pass/fail in CI inside half an hour, because
// simulated time came from requestAnimationFrame deltas while the program came
// from a VM on its own schedule. With one clock the verdict must be a fact about
// the program, so throttling the CPU must not change it.
//
// NOT a CI gate: it launches the mission once per rate and is minutes long. It is
// the instrument you reach for when someone doubts the coupling, or after
// touching either clock.
//
// Usage: PROOF_URL=http://localhost:8617/ node scripts/measure-arena-clock-stability.mjs [rates...]
//   rates default to 1 2 4 6 8 (1 = no throttling). Exit 1 if verdicts disagree.
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const rates = (process.argv.slice(2).length ? process.argv.slice(2) : ['1', '2', '4', '6', '8'])
    .map(Number).filter(n => Number.isFinite(n) && n >= 1);
const CHALLENGE = 'rb07-stop-at-the-line';
const solution = await readFile(resolve('overlay/scratch-gui/static/spike-arena/rover-basics',
    `${CHALLENGE}.bw`), 'utf8');
const starter = `DEVICE SPIKE\n\nWHEN flag clicked:\n  display text "GO"\n`;

const browser = await chromium.launch({headless: true});

/** Runs the mission once at one throttling rate. @returns {{verdict: string, ms: number}} */
const runAt = async rate => {
    const pane = await browser.newPage({viewport: {width: 1600, height: 1000}});
    const cdp = await pane.context().newCDPSession(pane);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate});
    await pane.addInitScript(source => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-code-autosave', JSON.stringify({lang: 'pseudocode', code: source}));
    }, starter);
    try {
        await pane.goto(url, {waitUntil: 'domcontentloaded', timeout: 120000});
        await pane.waitForFunction(() => Boolean(window.__brickwrightVirtualSpike?.hubState), null, {timeout: 120000});
        await pane.getByRole('tab', {name: 'Code', exact: true}).click();
        await pane.locator('[data-testid="bw-open-spike-arena"]').click();
        await pane.locator('[data-testid="bw-spike-arena-pane"]').waitFor({timeout: 120000});
        await pane.waitForFunction(() => document.querySelectorAll('[data-testid="bw-spike-arena-select"] option').length >= 8,
            null, {timeout: 120000});
        await pane.evaluate(id => window.dispatchEvent(new CustomEvent('bw-spike-arena-select', {detail: {id}})), CHALLENGE);
        await pane.waitForFunction(id => window.__bwSpikeArena?._pane?.world?.id === id, CHALLENGE, {timeout: 60000});
        await pane.locator('[data-testid="bw-spike-arena-load-solution"]').click();
        const sensorLine = solution.split('\n').map(l => l.trim()).find(l => l.startsWith('wait until'));
        await pane.waitForFunction(line => (document.querySelector('.cm-content')?.textContent || '').includes(line),
            sensorLine, {timeout: 120000});
        await pane.locator('[data-testid="bw-spike-arena-start"]').click();
        await pane.waitForFunction(() => document.querySelector('[data-testid="bw-spike-arena-banner"]')?.dataset.verdict,
            null, {timeout: 180000});
        const banner = pane.locator('[data-testid="bw-spike-arena-banner"]');
        const verdict = await banner.getAttribute('data-verdict');
        // Mission time the arena itself believes elapsed — the number that used to
        // depend on the wall clock.
        const ms = await pane.evaluate(() => window.__bwSpikeArena?.snapshot?.timeMs ?? null);
        return {verdict, ms, text: (await banner.textContent() || '').trim()};
    } finally {
        await cdp.detach().catch(() => {});
        await pane.close();
    }
};

const results = [];
for (const rate of rates) {
    const r = await runAt(rate);
    results.push({rate, ...r});
    console.log(`  rate ${String(rate).padStart(2)}x  verdict=${r.verdict}  arenaTime=${r.ms}ms  "${r.text}"`);
}
await browser.close();

const verdicts = [...new Set(results.map(r => r.verdict))];
if (verdicts.length !== 1) {
    console.error(`\nFAILED: the verdict depends on CPU speed — ${verdicts.join(' vs ')}.\n` +
        'That is the two-clock coupling; see BLOCKED.md, the SPIKE arena entry.');
    process.exit(1);
}
// Arena time is nominal per VM step, so it should also be stable. Report the
// spread rather than asserting a bound: a wide spread with a stable verdict is
// worth seeing, and is not by itself the defect this measures.
const times = results.map(r => r.ms).filter(n => typeof n === 'number');
if (times.length) {
    const spread = Math.max(...times) - Math.min(...times);
    console.log(`\narena time spread across ${times.length} rates: ${spread} ms ` +
        `(min ${Math.min(...times)}, max ${Math.max(...times)})`);
}
console.log(`verdict is ${verdicts[0]} at every rate tested (${rates.join('x, ')}x) — one clock holds.`);

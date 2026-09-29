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
        // WAIT FOR THE PROGRAM TO EXIST AS BLOCKS. Omitting this is how the first
        // version of this script produced a beautiful null result: it clicked Start
        // before the solution had compiled, so every rate timed out at exactly
        // 15000 ms with a 0 ms spread. That looks like perfect determinism and is
        // really the measurement of an empty program. The gate itself waits on the
        // same opcodes; so must this, or it is not running the mission at all.
        await pane.waitForFunction(() => {
            const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
            const opcodes = new Set((vm?.runtime?.targets || []).flatMap(target =>
                Object.values(target.blocks?._blocks || {}).map(block => block.opcode)));
            return opcodes.has('spikeprime_isColor') && opcodes.has('spikeprime_steer') &&
                opcodes.has('spikeprime_stopMovement') && !opcodes.has('spikeprime_displayText');
        }, null, {timeout: 120000});
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
// AGREEING VERDICTS ARE NOT THE SAME AS ONE CLOCK, and conflating them was a
// real defect in the first version of this script. Measured 2026-09-29: the
// PRE-FIX build returned pass at 1x/4x/8x — verdicts agreed — while its arena
// time drifted 5195 -> 5245 -> 5395 ms, monotonically with the throttling. The
// verdict agreed only because that mission finishes in 5.2 s of a 15 s budget
// and had slack to absorb the drift. The drift IS the mechanism; a mission with
// less headroom is where it flips. So the spread is a first-class result here,
// not a footnote, and a non-zero spread is reported as drift even when every
// verdict matches.
const times = results.map(r => r.ms).filter(n => typeof n === 'number');
const spread = times.length ? Math.max(...times) - Math.min(...times) : null;
if (spread !== null) {
    console.log(`\narena time: ${times.join(' / ')} ms across rates ${rates.join(' / ')}x ` +
        `— spread ${spread} ms`);
}
if (spread) {
    console.error(`\nDRIFT: simulated time moved ${spread} ms with CPU speed while every verdict ` +
        `still read ${verdicts[0]}.\nThat is the two-clock coupling with enough headroom to hide it: ` +
        `the verdict flips on a mission with less slack.\nSee BLOCKED.md, the SPIKE arena entry.`);
    process.exit(1);
}
console.log(`verdict is ${verdicts[0]} and simulated time is identical at every rate tested ` +
    `(${rates.join('x, ')}x) — one clock holds.`);

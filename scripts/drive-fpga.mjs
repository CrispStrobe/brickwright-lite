#!/usr/bin/env node
/**
 * Drive the flag-on FPGA surface in a real browser.
 *
 * The source-text gates prove the wiring is PRESENT; only a browser proves it
 * runs. Getting one open turns out to be six traps deep, and this session
 * re-derived every one of them the hard way more than once. They are encoded
 * here so nobody has to again:
 *
 *  1. The surface is behind a build flag. `localStorage['bw-fpga-enabled']='1'`
 *     must be set BEFORE navigation, via addInitScript.
 *  2. The app opens on a welcome starter picker whose backdrop swallows every
 *     later click. It must be dismissed AND removed.
 *  3. The tab strip is `[role=tab]`. `.react-tabs__tab-list` does not exist
 *     here and waiting on it hangs.
 *  4. The FPGA panel is forceRenderTabPanel: its controls stay in the DOM while
 *     another tab shows, so `count() > 0` answers "yes" for a tab that is not
 *     open. Wait for VISIBLE, never for presence.
 *  5. Building a circuit switches to the Circuit tab. Coming back, the lazy
 *     gate builder can take seconds to remount — poll, do not assume.
 *  6. Text locators are treacherous: `text=Parts list` matched the FPGA tab's
 *     own build message, which mentions the parts list. Prefer data-testid and
 *     accessible names.
 *
 * Usage:
 *   node scripts/drive-fpga.mjs <baseUrl> [--locale de] [--shots <dir>]
 * As a module:
 *   import {openFpga} from './scripts/drive-fpga.mjs';
 *   const {page, gradeChallenge, buildCircuit, close} = await openFpga(url);
 */
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Index of the Circuit tab in gui.jsx's list; FPGA follows it. */
export const CIRCUIT_TAB_INDEX = 4;
export const FPGA_TAB_INDEX = 5;

const loadPlaywright = async () => {
    for (const spec of ['playwright', path.join(ROOT, 'node_modules/playwright/index.mjs')]) {
        try { return await import(spec); } catch (e) { /* try the next */ }
    }
    throw new Error('playwright is not installed here; run the drive from a tree that has it');
};

/**
 * Open the app with the FPGA surface on, past the starter picker, on the FPGA
 * tab, with the gate builder mounted.
 *
 * @param {string} baseUrl
 * @param {{locale?: string, progress?: string[], headless?: boolean, shots?: string,
 *   autosave?: {lang: string, code: string}}} [opts]
 */
export async function openFpga (baseUrl, opts = {}) {
    const {chromium} = await loadPlaywright();
    const browser = await chromium.launch({
        headless: opts.headless !== false,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 300)));

    // (1) the flag, and any pre-banked challenge progress, before navigation
    await page.addInitScript(({progress, autosave}) => {
        localStorage.setItem('bw-fpga-enabled', '1');
        if (progress) localStorage.setItem('bw-fpga-progress', JSON.stringify(progress));
        // The Code tab restores its buffer from here, which is the only way to
        // put a program in front of it without typing one character at a time.
        if (autosave) localStorage.setItem('bw-code-autosave', JSON.stringify(autosave));
    }, {progress: opts.progress || null, autosave: opts.autosave || null});

    const url = opts.locale ? `${baseUrl}/?locale=${opts.locale}` : baseUrl;
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 120000});
    await page.waitForTimeout(7000);

    // (2) the starter picker: click what is clickable, then remove the rest
    for (const name of [/^×$/, /Not now/i, /Jetzt nicht/i]) {
        const b = page.getByRole('button', {name}).first();
        if (await b.count().catch(() => 0)) await b.click({timeout: 2500}).catch(() => {});
    }
    await page.evaluate(() => {
        const sel = '[data-testid="bw-starter-backdrop"],[class*="starter-journeys_backdrop"],[class*="starter-journeys_modal"]';
        for (const el of document.querySelectorAll(sel)) el.remove();
    });

    // (3) the tab strip, by role
    const tab = re => page.locator('[role=tab]').filter({hasText: re}).first();

    /** Show a tab and WAIT for a control that only exists when it is showing. */
    const showFpga = async () => {
        for (let i = 0; i < 8; i++) {
            if (await page.locator('[data-testid="bw-fpga-ic-gate"]').isVisible().catch(() => false)) return;
            // (4)+(5) clicking the strip is not always enough after a round
            // trip; the app's own activation event is what the tab itself uses.
            if (i % 2 === 0) await tab(/FPGA/).click().catch(() => {});
            else {
                await page.evaluate(idx => window.dispatchEvent(
                    new CustomEvent('bw-activate-tab', {detail: {index: idx}})), FPGA_TAB_INDEX);
            }
            await page.waitForTimeout(2000);
        }
        throw new Error('the FPGA tab never became visible');
    };
    await showFpga();

    /** Open the learning-path panel, waiting for it rather than guessing. */
    const openLearn = async () => {
        await showFpga();
        const learn = page.locator('[data-testid="bw-fpga-rf-learn"]');
        await learn.waitFor({state: 'visible', timeout: 60000});
        const panel = page.locator('[data-testid="bw-fpga-challenges"]');
        if (await panel.isVisible().catch(() => false)) return;   // already open
        // Prove it is GONE before claiming the toggle opened it. Without this
        // the helper would pass on a panel that was already up, and any later
        // failure would be blamed on the wrong thing.
        await panel.waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
        for (let i = 0; i < 4; i++) {
            if (await panel.isVisible().catch(() => false)) return;
            await learn.click();
            await page.waitForTimeout(1500);
        }
        // Say WHICH of the two failures happened. count() answers yes for a
        // panel that is present but HIDDEN (trap 4), so a flat "never opened"
        // message would be wrong half the time.
        const present = await panel.count();
        throw new Error(present
            ? 'the learning-path panel is in the DOM but hidden; is the FPGA tab actually showing?'
            : 'the learning-path panel never rendered');
    };

    /** Build one of the ⚙ picker's circuits and wait for it on the board. */
    const buildCircuit = async key => {
        await showFpga();
        await page.selectOption('[data-testid="bw-fpga-ic-circuit"]', key);
        await page.click('[data-testid="bw-fpga-build-circuit"]');
        await page.waitForFunction(() => window.__circuit &&
            window.__circuit.parts.some(p => String(p.kind).startsWith('74hc')), null, {timeout: 45000});
        await page.waitForTimeout(800);
        return page.evaluate(() => {
            const kinds = {};
            for (const p of window.__circuit.parts) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
            return kinds;
        });
    };

    /** Select a challenge, press Check, and return the rendered verdict. */
    const gradeChallenge = async id => {
        await openLearn();
        const chal = page.locator(`[data-testid="bw-fpga-challenge-${id}"]`);
        await chal.waitFor({state: 'visible', timeout: 30000});
        await chal.click();
        await page.waitForTimeout(500);
        const button = page.locator('[data-testid="bw-fpga-check"]');
        await button.click();
        const result = page.locator('[data-testid="bw-fpga-result"]');
        await result.waitFor({state: 'visible', timeout: 120000});
        // And the pending state must GO AWAY. Grading is async now; a grade
        // that never resolves leaves the button counting forever, which reads
        // as "still working" and never as a failure. Waiting only for the
        // verdict to appear would not notice that at all.
        await page.waitForFunction(() => {
            const b = document.querySelector('[data-testid="bw-fpga-check"]');
            return b && !/Checking|Prufe|Prüfe/.test(b.innerText) && !b.disabled;
        }, null, {timeout: 120000});
        await page.waitForTimeout(400);
        return page.evaluate(() => {
            const panel = document.querySelector('[data-testid="bw-fpga-challenges"]');
            const r = document.querySelector('[data-testid="bw-fpga-result"]');
            const a = r.getBoundingClientRect();
            const b = panel.getBoundingClientRect();
            return {text: r.innerText, onScreen: a.top >= b.top - 1 && a.bottom <= b.bottom + 1};
        });
    };

    const shot = async name => {
        if (!opts.shots) return null;
        const file = path.join(opts.shots, `${name}.png`);
        await page.screenshot({path: file});
        return file;
    };

    return {page, browser, errors, tab, showFpga, openLearn, buildCircuit, gradeChallenge, shot,
        close: () => browser.close()};
}

// Run directly: open, build the named circuit, grade the named challenge.
if (process.argv[1] && process.argv[1].endsWith('drive-fpga.mjs')) {
    const [, , baseUrl, ...rest] = process.argv;
    if (!baseUrl) {
        console.error('usage: node scripts/drive-fpga.mjs <baseUrl> [--locale de] [--circuit dff] [--challenge register_real] [--shots dir]');
        process.exit(2);
    }
    const arg = name => {
        const i = rest.indexOf(`--${name}`);
        return i >= 0 ? rest[i + 1] : undefined;
    };
    const ALL = ['wire', 'not', 'and', 'or', 'nand', 'xor', 'mux2', 'half_adder', 'full_adder',
        'mux4', 'absorb', 'consensus', 'majority_min', 'register', 'toggle',
        'not_real', 'and_real', 'or_real', 'nand_real', 'nor_real', 'xor_real',
        'half_adder_real', 'full_adder_real', 'ripple_adder_real', 'adder_chip_real',
        'register_real', 'toggle_real', 'counter_real', 'counter4_real'];
    const d = await openFpga(baseUrl, {locale: arg('locale'), shots: arg('shots'), progress: ALL});
    try {
        const circuit = arg('circuit');
        if (circuit) console.log('built:', JSON.stringify(await d.buildCircuit(circuit)));
        const challenge = arg('challenge');
        if (challenge) {
            const v = await d.gradeChallenge(challenge);
            console.log('verdict:', v.text);
            console.log('on screen:', v.onScreen);
        }
        await d.shot('drive');
        if (d.errors.length) console.log('page errors:', d.errors.slice(0, 3));
    } finally {
        await d.close();
    }
}

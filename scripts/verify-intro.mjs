/**
 * Playwright: intro.md rendering in the examples browser.
 *
 * Checks:
 * - Navigate to Circuit tab, open Examples panel
 * - Find an example card with an (i) toggle
 * - Click the toggle → intro panel appears
 * - Intro panel contains "What you see" heading (from intro.md)
 * - Level/age badges are present
 *
 * Usage:
 *   node scripts/verify-intro.mjs
 *   PROOF_URL=http://localhost:8601 node scripts/verify-intro.mjs
 */
import { chromium } from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';

async function verify () {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({viewport: {width: 1280, height: 720}});
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    page.on('dialog', d => d.accept());
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));

    let ok = true;
    const fail = msg => { ok = false; console.error(`  FAIL: ${msg}`); };
    const pass = msg => console.log(`  ok: ${msg}`);

    try {
        console.log(`Opening ${URL} ...`);
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.getByRole('tab', {name: /Circuit/}).waitFor({state: 'visible', timeout: 60000});

        // Navigate to Circuit tab
        const circuitTab = page.getByRole('tab', {name: /Circuit/});
        await circuitTab.click();
        const designer = page.locator('.bw-circuit-designer:visible').last();
        await designer.waitFor({state: 'visible', timeout: 60000});

        // Open Examples panel
        const examplesBtn = designer.getByRole('button', {name: /Expand Examples/});
        if (await examplesBtn.count()) await examplesBtn.click();

        // Find an (i) toggle button on an example card
        const introToggle = designer.getByTestId('bw-example-intro-toggle').first();
        const hasIntro = await introToggle.waitFor({state: 'visible', timeout: 15000})
            .then(() => true).catch(() => false);
        if (hasIntro) {
            pass('Intro toggle found on example card');

            // Click to expand
            await introToggle.click();

            // Check intro panel appeared
            const introPanel = page.getByTestId('bw-example-intro-panel');
            await introPanel.waitFor({state: 'visible', timeout: 10000});
            if (await introPanel.count() > 0) {
                pass('Intro panel rendered');

                const text = await introPanel.innerText();
                // Check for "What you see" heading (from intro.md)
                if (text.includes('What you see') || text.includes('Was du siehst')) {
                    pass('Intro contains "What you see" section');
                } else if (text.includes('Loading') || text.includes('geladen')) {
                    // Wait for the fetch to resolve to real content or an
                    // explicit no-introduction result; elapsed time proves nothing.
                    await page.waitForFunction(() => {
                        const panel = document.querySelector('[data-testid="bw-example-intro-panel"]');
                        const value = panel?.innerText || '';
                        return /What you see|Was du siehst|No introduction|Keine Einführung/i.test(value);
                    }, null, {timeout: 5000});
                    const text2 = await introPanel.innerText();
                    if (text2.includes('What you see') || text2.includes('Was du siehst')) {
                        pass('Intro contains "What you see" section (after wait)');
                    } else {
                        fail(`Intro panel text does not contain "What you see": ${text2.slice(0, 200)}`);
                    }
                } else if (text.includes('No introduction')) {
                    console.log('  note: first example has no intro.md — the rendering works but no content');
                } else {
                    fail(`Unexpected intro panel content: ${text.slice(0, 200)}`);
                }

                // Check for level/age badges
                const levelBadge = introPanel.getByText(/^(Level|Stufe):/);
                const ageBadge = introPanel.getByText(/^(Age|Alter):/);
                await levelBadge.waitFor({state: 'visible', timeout: 5000})
                    .then(() => pass('Level badge present'))
                    .catch(() => fail('Level badge missing'));
                await ageBadge.waitFor({state: 'visible', timeout: 5000})
                    .then(() => pass('Age badge present'))
                    .catch(() => fail('Age badge missing'));
            } else {
                fail('Intro panel not found after clicking toggle');
            }
        } else {
            fail('No intro toggle found on any example card');
        }
        if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);

    } catch (err) {
        fail(err.message);
    } finally {
        if (!ok) {
            await mkdir(path.resolve('artifacts'), {recursive: true});
            await page.screenshot({path: path.resolve('artifacts/verify-intro-failure.png'), fullPage: true}).catch(() => {});
            await writeFile(path.resolve('artifacts/verify-intro-page-errors.txt'), `${pageErrors.join('\n')}\n`).catch(() => {});
        }
        await browser.close();
    }

    console.log(ok ? '\nAll intro checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

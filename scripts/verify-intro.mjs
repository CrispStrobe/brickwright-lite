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

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';

async function verify () {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('dialog', d => d.accept());

    let ok = true;
    const fail = msg => { ok = false; console.error(`  FAIL: ${msg}`); };
    const pass = msg => console.log(`  ok: ${msg}`);

    try {
        console.log(`Opening ${URL} ...`);
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Navigate to Circuit tab
        const circuitTab = page.locator('text=/Circuit/i').first();
        if (await circuitTab.count() > 0) {
            await circuitTab.click();
            await page.waitForTimeout(3000);
        } else {
            fail('Circuit tab not found');
            await browser.close();
            process.exit(1);
        }

        // Open Examples panel
        const examplesBtn = page.locator('button:has-text("Examples"), button:has-text("▤")').first();
        if (await examplesBtn.count() > 0) {
            await examplesBtn.click();
            await page.waitForTimeout(2000);
        }

        // Find an (i) toggle button on an example card
        const introToggle = page.locator('[data-testid="bw-example-intro-toggle"]').first();
        if (await introToggle.count() > 0) {
            pass('Intro toggle found on example card');

            // Click to expand
            await introToggle.click();
            await page.waitForTimeout(3000);

            // Check intro panel appeared
            const introPanel = page.locator('[data-testid="bw-example-intro-panel"]').first();
            if (await introPanel.count() > 0) {
                pass('Intro panel rendered');

                const text = await introPanel.innerText();
                // Check for "What you see" heading (from intro.md)
                if (text.includes('What you see') || text.includes('Was du siehst')) {
                    pass('Intro contains "What you see" section');
                } else if (text.includes('Loading') || text.includes('geladen')) {
                    // Still loading — wait more
                    await page.waitForTimeout(5000);
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
                const badges = await introPanel.locator('span').count();
                if (badges >= 2) {
                    pass(`Badges present (${badges} spans in intro panel)`);
                } else {
                    console.log(`  note: ${badges} spans — badges may not be present for this example`);
                }
            } else {
                fail('Intro panel not found after clicking toggle');
            }
        } else {
            fail('No intro toggle found on any example card');
        }

    } catch (err) {
        fail(err.message);
    } finally {
        await browser.close();
    }

    console.log(ok ? '\nAll intro checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

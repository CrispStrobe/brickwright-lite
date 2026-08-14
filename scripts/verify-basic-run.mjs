/**
 * Playwright: BASIC Run button on real emulated machines.
 *
 * Both profiles: type `10 PRINT 2+2`, Run, expect `4` in output.
 *
 * Usage:
 *   node scripts/verify-basic-run.mjs
 *   PROOF_URL=http://localhost:8601 node scripts/verify-basic-run.mjs
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

        // Navigate to Code tab
        const codeTab = page.locator('text=/^Code$/i').first();
        if (await codeTab.count() > 0) {
            await codeTab.click();
            await page.waitForTimeout(2000);
        }

        // Switch to BASIC tab
        const basicTab = page.locator('button:has-text("BAS")').first();
        if (await basicTab.count() === 0) {
            fail('BASIC tab not found');
            await browser.close();
            process.exit(1);
        }
        await basicTab.click();
        await page.waitForTimeout(1500);

        // ── Test 1: 6502 BASIC profile ──
        // Switch to ms (6502) profile
        const profileSelect = page.locator('select:has(option[value="ms"])').first();
        if (await profileSelect.count() > 0) {
            await profileSelect.selectOption('ms');
            await page.waitForTimeout(500);
        }

        // Type the program
        const cmContent = page.locator('.cm-content').first();
        if (await cmContent.count() > 0) {
            await cmContent.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(200);
            await page.keyboard.type('10 PRINT 2+2', { delay: 20 });
            await page.waitForTimeout(300);
        }

        // Click Run BASIC
        const runBtn = page.locator('[data-testid="bw-basic-run"]').first();
        if (await runBtn.count() > 0 && await runBtn.isEnabled()) {
            await runBtn.click();
            // Wait for execution — the 6502 machine boots, types the program, runs
            await page.waitForTimeout(15000);

            // Check output contains 4
            const output = await page.locator('pre').first().innerText().catch(() => '');
            if (output.includes('4')) {
                pass('6502 BASIC: 10 PRINT 2+2 → output contains 4');
            } else {
                fail(`6502 BASIC: expected 4 in output, got: ${output.slice(0, 200)}`);
            }
        } else {
            fail('Run BASIC button not found or disabled');
        }

        // ── Test 2: BBC BASIC profile ──
        if (await profileSelect.count() > 0) {
            await profileSelect.selectOption('bbc');
            await page.waitForTimeout(500);
        }

        // Re-type the program (profile change clears buffer)
        const cmContent2 = page.locator('.cm-content').first();
        if (await cmContent2.count() > 0) {
            await cmContent2.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(200);
            await page.keyboard.type('10 PRINT 2+2', { delay: 20 });
            await page.waitForTimeout(300);
        }

        // Click Run BASIC again
        const runBtn2 = page.locator('[data-testid="bw-basic-run"]').first();
        if (await runBtn2.count() > 0 && await runBtn2.isEnabled()) {
            await runBtn2.click();
            // Wait for execution — Z80 boots BBC BASIC, types and runs
            await page.waitForTimeout(10000);

            const output2 = await page.locator('pre').first().innerText().catch(() => '');
            if (output2.includes('4')) {
                pass('BBC BASIC: 10 PRINT 2+2 → output contains 4');
            } else {
                fail(`BBC BASIC: expected 4 in output, got: ${output2.slice(0, 200)}`);
            }
        } else {
            fail('Run BASIC button not found for BBC profile');
        }

    } catch (err) {
        fail(err.message);
    } finally {
        await browser.close();
    }

    console.log(ok ? '\nAll BASIC run checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

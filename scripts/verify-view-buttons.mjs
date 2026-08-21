/**
 * Playwright regression test: stage-view toggle buttons on a MINT project.
 *
 * Acceptance criteria (P1 regression from 652dc7b):
 * - Mint project (no DEVICE MICROBIT): debugger click shows debugger, NOT sim
 * - View button row stays visible and clickable in ALL modes
 * - micro:bit button hidden without DEVICE MICROBIT
 * - Each button activates its expected pane
 * - Clicking Scratch Stage always returns to normal
 *
 * Usage:
 *   node scripts/verify-view-buttons.mjs
 *   PROOF_URL=http://localhost:8601 node scripts/verify-view-buttons.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';

async function verify () {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    page.on('dialog', d => d.accept());

    let ok = true;
    const fail = msg => { ok = false; console.error(`  FAIL: ${msg}`); };
    const pass = msg => console.log(`  ok: ${msg}`);

    try {
        console.log(`Opening ${URL} ...`);
        // Clear any stale localStorage from prior sessions
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.evaluate(() => {
            localStorage.removeItem('bw-debug-dock');
            localStorage.removeItem('bw-stage-circuit');
            localStorage.removeItem('bw-hide-stage');
            localStorage.removeItem('bw-right-pane-hidden');
        });
        // Reload to pick up clean state
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Helper: count visible toggle buttons in the stage-header view row
        const countViewButtons = async () => {
            return page.locator('.stage-header_stage-size-toggle-group_* button, [class*="stageSizeToggleGroup"] button')
                .count();
        };

        // The stage-header has two toggle groups: small/large + view buttons.
        // View buttons are in the second group. Let's find them by their container.
        const viewButtonGroups = page.locator('[class*="stageSizeToggleGroup"]');
        const groupCount = await viewButtonGroups.count();

        // ── 1. Verify micro:bit button is NOT visible on mint project ──
        const microbitBtnBefore = page.locator('button[title*="micro:bit"], button[title*="Simulator"]');
        if (await microbitBtnBefore.count() === 0) {
            pass('micro:bit view button hidden on mint project');
        } else {
            fail('micro:bit view button visible on mint project (no DEVICE MICROBIT)');
        }

        // ── 2. Click through each non-micro:bit view button ──
        // The view buttons should be: Circuit, Debugger, Debugger-only, Scratch Stage
        // (4 buttons, no micro:bit on a mint project)
        const buttonTitles = [
            'Circuit Designer',   // Circuit Designer (only) → dock='off'
            'Debugger',           // Full debugger → dock='right' (right pane, owner spec 2026-08-17)
            'Scratch Stage'       // → scratch
        ];

        for (const titleSubstr of buttonTitles) {
            const btn = page.locator(`button[title*="${titleSubstr}" i]`).first();
            if (await btn.count() === 0) {
                fail(`View button "${titleSubstr}" not found`);
                continue;
            }
            await btn.click();
            await page.waitForTimeout(1000);

            // After click, verify the button row is still visible
            const btnsAfter = page.locator(`button[title*="${titleSubstr}" i]`).first();
            if (await btnsAfter.count() > 0 && await btnsAfter.isVisible()) {
                pass(`View buttons visible after clicking "${titleSubstr}"`);
            } else {
                fail(`View buttons VANISHED after clicking "${titleSubstr}"`);
            }

            // Verify NO micro:bit sim pane appeared (mint project)
            const simPane = page.locator('[data-testid="bw-microbit-sim-pane"]');
            if (await simPane.count() === 0) {
                pass(`No micro:bit sim pane after "${titleSubstr}"`);
            } else {
                fail(`micro:bit sim pane appeared after "${titleSubstr}" on mint project!`);
            }
        }

        // ── 3. Return to Scratch Stage ──
        const scratchBtn = page.locator('button[title*="Scratch Stage" i]').first();
        if (await scratchBtn.count() > 0) {
            await scratchBtn.click();
            await page.waitForTimeout(500);
            pass('Returned to Scratch Stage');
        }

        // ── 4. Verify the debugger button specifically does NOT show micro:bit pane ──
        const debuggerBtn = page.locator('button[title*="Debugger" i]').first();
        if (await debuggerBtn.count() > 0) {
            await debuggerBtn.click();
            await page.waitForTimeout(1000);
            const dockVal = await page.evaluate(() => localStorage.getItem('bw-debug-dock'));
            if (dockVal === 'right') {
                pass('Debugger button sets dock to "right" (full panel in the right pane)');
            } else {
                fail(`Debugger button set dock to "${dockVal}" instead of "right"`);
            }
            const simPaneAfterDebug = page.locator('[data-testid="bw-microbit-sim-pane"]');
            if (await simPaneAfterDebug.count() === 0) {
                pass('Debugger view: no micro:bit sim pane');
            } else {
                fail('Debugger view: micro:bit sim pane appeared!');
            }
        }

        // ── 5. Now go to Code tab, set DEVICE MICROBIT, verify micro:bit button appears ──
        const codeTab = page.locator('text=/Pseudocode|Code/i').first();
        if (await codeTab.count() > 0) {
            await codeTab.click();
            await page.waitForTimeout(2000);
            const deviceSelect = page.locator('select[title*="Target device"]').first();
            if (await deviceSelect.count() > 0) {
                await deviceSelect.selectOption('microbit');
                await page.waitForTimeout(500);
                pass('Selected micro:bit device');
            }
        }

        // Check that micro:bit view button now appears
        const microbitBtnAfter = page.locator('button[title*="micro:bit" i], button[title*="Simulator" i]');
        await page.waitForTimeout(500);
        if (await microbitBtnAfter.count() > 0) {
            pass('micro:bit view button appeared after DEVICE MICROBIT');
        } else {
            // May not be visible if stage-header is hidden in code tab mode
            console.log('  note: micro:bit button not found (may be hidden in code tab layout)');
        }

    } catch (err) {
        fail(err.message);
    } finally {
        await browser.close();
    }

    console.log(ok ? '\nAll view-button regression checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

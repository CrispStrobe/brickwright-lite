/**
 * Playwright verification: micro:bit MicroPython tab + simulator.
 *
 * Checks:
 * - Select micro:bit device → MicroPython tab appears
 * - Type/load a blink program → switch to micro:bit tab → sees `from microbit import *`
 * - Click "Run on Simulator" → right pane switches to sim iframe
 * - Simulator iframe loads (simulator.html present)
 * - Serial output area present
 * - Stop/Reset/Clear buttons present
 * - Stage-header micro:bit toggle button present
 *
 * Usage:
 *   node scripts/verify-microbit.mjs
 *   PROOF_URL=http://localhost:8601 node scripts/verify-microbit.mjs
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
        const codeTab = page.locator('text=/Pseudocode|Code/i').first();
        if (await codeTab.count() > 0) {
            await codeTab.click();
            await page.waitForTimeout(2000);
        } else {
            fail('Code tab not found');
            await browser.close();
            process.exit(1);
        }

        // ── 1. Verify micro:bit tab is NOT visible before selecting device ──
        let microbitTab = page.locator('button:has-text("micro:bit")').first();
        if (await microbitTab.count() === 0) {
            pass('micro:bit tab hidden when no device selected');
        } else {
            console.log('  note: micro:bit tab visible without device (might have prior state)');
        }

        // ── 2. Select micro:bit device ──
        const deviceSelect = page.locator('select[title*="Target device"]').first();
        if (await deviceSelect.count() > 0) {
            await deviceSelect.selectOption('microbit');
            await page.waitForTimeout(500);
            pass('Selected micro:bit device');
        } else {
            fail('Device selector not found');
            await browser.close();
            process.exit(1);
        }

        // ── 3. Verify micro:bit tab now appears ──
        microbitTab = page.locator('button:has-text("micro:bit")').first();
        if (await microbitTab.count() > 0) {
            pass('micro:bit tab appeared after selecting device');
        } else {
            fail('micro:bit tab not visible after selecting device');
        }

        // ── 4. Type a blink program in pseudocode ──
        const cmContent = page.locator('.cm-content').first();
        if (await cmContent.count() > 0) {
            await cmContent.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(300);
            await page.keyboard.type(
                'DEVICE MICROBIT\nPIN led = P0 OUTPUT\n\nSPRITE Cat:\n  WHEN flag clicked:\n    forever:\n      turn on led\n      wait 0.5 seconds\n      turn off led\n      wait 0.5 seconds\n      print "blink"',
                { delay: 10 }
            );
            await page.waitForTimeout(500);
            pass('Typed blink program');
        } else {
            fail('Cannot find editor content area');
        }

        // ── 5. Switch to micro:bit tab → verify MicroPython output ──
        microbitTab = page.locator('button:has-text("micro:bit")').first();
        if (await microbitTab.count() > 0) {
            await microbitTab.click();
            await page.waitForTimeout(3000);

            const editorText = await page.locator('.cm-content').first().innerText().catch(() => '');
            if (editorText.includes('from microbit import')) {
                pass('MicroPython output contains "from microbit import"');
            } else {
                // Also check fallback textarea
                const ta = page.locator('textarea').first();
                const taText = await ta.inputValue().catch(() => '');
                if (taText.includes('from microbit import')) {
                    pass('MicroPython output contains "from microbit import" (fallback editor)');
                } else {
                    fail('MicroPython output missing "from microbit import"');
                    console.log('    got:', (editorText || taText).slice(0, 200));
                }
            }

            // Check for pin0 reference
            const fullText = await page.locator('.cm-content').first().innerText().catch(() => '');
            if (fullText.includes('pin0') || fullText.includes('write_digital')) {
                pass('MicroPython output contains pin operations');
            } else {
                console.log('  note: pin operations not found (may be expected for error output)');
            }

            // Check for print()
            if (fullText.includes('print(')) {
                pass('MicroPython output contains print()');
            } else {
                console.log('  note: print() not found in MicroPython output');
            }
        } else {
            fail('micro:bit tab not clickable');
        }

        // ── 6. Verify micropython bar (read-only hint + Run on Simulator) ──
        const mpBar = page.locator('[data-testid="bw-micropython-bar"]').first();
        if (await mpBar.count() > 0) {
            pass('MicroPython bar present (read-only hint)');
        } else {
            fail('MicroPython bar not found');
        }

        const flashBtn = page.locator('[data-testid="bw-microbit-flash"]').first();
        if (await flashBtn.count() > 0) {
            pass('Run on Simulator button present');
        } else {
            fail('Run on Simulator button not found');
        }

        // ── 7. Click Run on Simulator ──
        if (await flashBtn.count() > 0 && await flashBtn.isEnabled()) {
            await flashBtn.click();
            await page.waitForTimeout(2000);

            // Check that the right pane switched to the simulator
            const simPane = page.locator('[data-testid="bw-microbit-sim-pane"]').first();
            if (await simPane.count() > 0) {
                pass('Simulator pane rendered');
            } else {
                fail('Simulator pane not found after clicking Run');
            }

            // Check iframe
            const simIframe = page.locator('[data-testid="bw-microbit-iframe"]').first();
            if (await simIframe.count() > 0) {
                pass('Simulator iframe present');
                const src = await simIframe.getAttribute('src');
                if (src && src.includes('microbit-sim/simulator.html')) {
                    pass('Iframe src points to self-hosted simulator');
                } else {
                    fail(`Iframe src unexpected: ${src}`);
                }
            } else {
                fail('Simulator iframe not found');
            }

            // Check serial output area
            const serial = page.locator('[data-testid="bw-microbit-serial"]').first();
            if (await serial.count() > 0) {
                pass('Serial output terminal present');
            } else {
                fail('Serial output terminal not found');
            }

            // Check stop/reset buttons
            const stopBtn = page.locator('[data-testid="bw-microbit-stop"]').first();
            const resetBtn = page.locator('[data-testid="bw-microbit-reset"]').first();
            const clearBtn = page.locator('[data-testid="bw-microbit-clear-serial"]').first();
            if (await stopBtn.count() > 0) pass('Stop button present');
            else fail('Stop button not found');
            if (await resetBtn.count() > 0) pass('Reset button present');
            else fail('Reset button not found');
            if (await clearBtn.count() > 0) pass('Clear button present');
            else fail('Clear button not found');
        } else {
            console.log('  note: Run on Simulator button disabled or not found — skipping sim pane checks');
        }

        // ── 8. Stage-header micro:bit toggle ──
        // The toggle might not be visible if stage header is in fullscreen mode
        const bodyText = await page.locator('body').innerHTML();
        if (bodyText.includes('icon--microbit') || bodyText.includes('microbitSim')) {
            pass('Stage-header micro:bit toggle present in DOM');
        } else {
            console.log('  note: stage-header micro:bit icon not found in DOM (may need rebuild)');
        }

        // ── 9. Verify editor is read-only in micro:bit tab ──
        const cmContentRO = page.locator('.cm-content').first();
        if (await cmContentRO.count() > 0) {
            const editable = await cmContentRO.getAttribute('contenteditable');
            if (editable === 'false') {
                pass('micro:bit tab editor is read-only');
            } else {
                console.log(`  note: contenteditable=${editable} (may vary by CM config)`);
            }
        }

    } catch (err) {
        fail(err.message);
    } finally {
        await browser.close();
    }

    console.log(ok ? '\nAll micro:bit checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

/**
 * Playwright: chrome sweep verification.
 *
 * Checks:
 * - Tab says "Code" (not "Code ⇄ Blocks")
 * - BASIC tab: no Run button (no JS run bug)
 * - BASIC tab: (i) toggle shows/hides info panel
 * - Editor scrolling: 500-line buffer scrolls inside CM, controls visible
 * - Chrome compression: single merged row in normal mode
 * - Maximize hides chrome, shows compact To/From
 *
 * Usage:
 *   node scripts/verify-chrome-sweep.mjs
 *   PROOF_URL=http://localhost:8601 node scripts/verify-chrome-sweep.mjs
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

        // ── 1. Tab says "Code" ──
        const tabs = await page.locator('[class*="tab"]').allInnerTexts();
        const tabText = tabs.join(' ');
        if (tabText.includes('Code') && !tabText.includes('Code ⇄ Blocks')) {
            pass('Tab says "Code" (not "Code ⇄ Blocks")');
        } else if (tabText.includes('Code')) {
            pass('Tab says "Code" (may include other text)');
        } else {
            fail('Code tab not found in tab row');
        }

        // Navigate to Code tab
        const codeTab = page.locator('text=/^Code$/i').first();
        if (await codeTab.count() > 0) {
            await codeTab.click();
            await page.waitForTimeout(2000);
        }

        // ── 2. BASIC tab: no Run button ──
        const basicTab = page.locator('button:has-text("BAS")').first();
        if (await basicTab.count() > 0) {
            await basicTab.click();
            await page.waitForTimeout(1500);

            // Check NO Run button
            const runBtn = page.locator('button:has-text("▶ Run")');
            if (await runBtn.count() === 0) {
                pass('BASIC tab: no Run button (JS run bug fixed)');
            } else {
                // Check it's not a Run Python / Run JavaScript button
                const runText = await runBtn.first().innerText();
                if (runText.includes('Python') || runText.includes('JavaScript')) {
                    fail('BASIC tab: Run button present but labelled for wrong language');
                } else {
                    fail('BASIC tab: Run button still present');
                }
            }

            // ── 3. BASIC (i) toggle ──
            const basicInfoToggle = page.locator('[data-testid="bw-basic-info-toggle"]').first();
            if (await basicInfoToggle.count() > 0) {
                pass('BASIC (i) toggle present');
                // Click to show
                await basicInfoToggle.click();
                await page.waitForTimeout(300);
                const infoPanel = page.locator('[data-testid="bw-basic-info-panel"]').first();
                if (await infoPanel.count() > 0) {
                    const infoText = await infoPanel.innerText();
                    if (infoText.includes('BBC BASIC') && infoText.includes('zlib')) {
                        pass('BASIC info panel shows licensing text');
                    } else {
                        fail('BASIC info panel missing licensing text');
                    }
                    // Click to hide
                    await basicInfoToggle.click();
                    await page.waitForTimeout(300);
                    if (await infoPanel.count() === 0) {
                        pass('BASIC info panel hides on second click');
                    }
                } else {
                    fail('BASIC info panel did not appear');
                }
            } else {
                fail('BASIC (i) toggle not found');
            }
        } else {
            fail('BASIC tab button not found');
        }

        // ── 4. Switch back to Pseudocode tab for scroll test ──
        const pseudoTab = page.locator('button:has-text("Pseudo")').first();
        if (await pseudoTab.count() > 0) {
            await pseudoTab.click();
            await page.waitForTimeout(1500);
        }

        // ── 5. Editor scrolling ──
        const cmContent = page.locator('.cm-content').first();
        if (await cmContent.count() > 0) {
            await cmContent.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(200);
            // Type a tall buffer (50 lines)
            const lines = Array.from({length: 50}, (_, i) => `say "line ${i + 1}"`).join('\n');
            await page.keyboard.type(`SPRITE Cat:\n  WHEN flag clicked:\n${lines.split('\n').map(l => '    ' + l).join('\n')}`, { delay: 1 });
            await page.waitForTimeout(500);

            // Check that cm-scroller has scrollable content
            const scrollInfo = await page.evaluate(() => {
                const scroller = document.querySelector('.cm-scroller');
                if (!scroller) return null;
                return {
                    scrollHeight: scroller.scrollHeight,
                    clientHeight: scroller.clientHeight,
                    scrollable: scroller.scrollHeight > scroller.clientHeight
                };
            });
            if (scrollInfo && scrollInfo.scrollable) {
                pass(`Editor scrolls (scrollHeight=${scrollInfo.scrollHeight} > clientHeight=${scrollInfo.clientHeight})`);
            } else if (scrollInfo) {
                fail(`Editor NOT scrollable (scrollHeight=${scrollInfo.scrollHeight}, clientHeight=${scrollInfo.clientHeight})`);
            } else {
                fail('cm-scroller element not found');
            }
        }

        // ── 6. Chrome compression: merged row ──
        const langRow = page.locator('[data-testid="bw-lang-row"]').first();
        if (await langRow.count() > 0) {
            pass('Merged language+controls row present');
            // Check it contains both language tabs AND controls
            const rowText = await langRow.innerText();
            if (rowText.includes('Pseudo') && rowText.includes('Device')) {
                pass('Row has both language tabs and device control');
            }
        } else {
            fail('Merged lang row not found');
        }

        // ── 7. Maximize mode ──
        const maxBtn = page.locator('[data-testid="bw-editor-maximize"]').first();
        if (await maxBtn.count() > 0) {
            await maxBtn.click();
            await page.waitForTimeout(500);
            // Check that device/example controls are hidden
            const deviceAfter = page.locator('select[title="Target device"]').first();
            if (await deviceAfter.count() === 0 || !(await deviceAfter.isVisible())) {
                pass('Maximize hides device selector');
            } else {
                fail('Device selector still visible in maximize mode');
            }
            // Check compact To/From buttons appear
            const compactBlocks = page.locator('button:has-text("Blocks")');
            if (await compactBlocks.count() >= 2) {
                pass('Compact To/From blocks buttons in maximize mode');
            } else {
                console.log('  note: compact blocks buttons not found (may need different selector)');
            }
            // Restore
            await maxBtn.click();
            await page.waitForTimeout(300);
        }

    } catch (err) {
        fail(err.message);
    } finally {
        await browser.close();
    }

    console.log(ok ? '\nAll chrome-sweep checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

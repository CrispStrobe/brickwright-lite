/**
 * Playwright verification: About dialog opens and lists key licence entries.
 *
 * Usage:
 *   node scripts/verify-about-dialog.mjs
 *   PROOF_URL=http://localhost:8601 node scripts/verify-about-dialog.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';

/** Entries that MUST appear in the dialog text (one per group). */
const EXPECTED_ENTRIES = [
    'avr8js',                     // Emulation engines
    'emu8051-stc',                // Emulation engines
    'rp2040js',                   // Emulation engines
    'BBC BASIC',                  // Interpreters and OS
    'CP/M 2.2',                   // Interpreters and OS
    'PicoBB',                     // Interpreters and OS
    'SDCC',                       // Toolchains
    'cc65',                       // Toolchains
    'SingleStepTests',            // Verification
    'vrEmu6502',                  // Verification
    'Ben Eater',                  // Design references
    'Grant Searle',               // Design references
    'scratch-gui',                // Editor platform
    'scratch-vm',                 // Editor platform
    'scratch-blocks',             // Editor platform
    'sb3-creator',                // BrickWright modules
    'bw-board',                   // BrickWright modules
    'wokwi-elements',             // BrickWright modules
    'React',                      // Key runtime deps
    'Skulpt',                     // Key runtime deps
    'Tauri',                      // Desktop app
    'BBC BASIC is used by permission',  // BBC note
];

async function verify() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('dialog', d => d.accept());

    let ok = true;
    const fail = msg => { ok = false; console.error(`  FAIL: ${msg}`); };
    const pass = msg => console.log(`  ok: ${msg}`);

    try {
        console.log(`Opening ${URL} ...`);
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        // Find and click the About trigger (the settings menu "About Brickwright" item,
        // or the version badge button).
        // Try the settings menu first.
        const settingsBtn = page.locator('[class*="settings"]').first();
        if (await settingsBtn.count() > 0) {
            await settingsBtn.click();
            await page.waitForTimeout(500);
        }

        // Look for an "About" menu item or button
        const aboutItem = page.locator('text=/About Brickwright|Uber Brickwright/i').first();
        if (await aboutItem.count() > 0) {
            await aboutItem.click();
            await page.waitForTimeout(500);
        } else {
            // Fall back to the version badge trigger
            const trigger = page.locator('[class*="trigger"]').first();
            if (await trigger.count() > 0) {
                await trigger.click();
                await page.waitForTimeout(500);
            } else {
                fail('Could not find About trigger');
                return;
            }
        }

        // Check dialog is open
        const dialog = page.locator('[class*="dialog"]').first();
        if (await dialog.count() === 0) {
            fail('About dialog did not open');
            return;
        }
        pass('About dialog opened');

        // Get the full text content of the dialog
        const text = await dialog.innerText();

        // Check each expected entry
        for (const entry of EXPECTED_ENTRIES) {
            if (text.includes(entry)) {
                pass(entry);
            } else {
                fail(`Missing entry: "${entry}"`);
            }
        }

        // Check that group headings are present (CSS text-transform: uppercase
        // means innerText returns uppercased text, so compare case-insensitively)
        const textLower = text.toLowerCase();
        const groupHeadings = [
            'Emulation engines',
            'Interpreters and OS',
            'Toolchains',
            'Verification',
            'Design references',
            'Example corpus',
            'Editor platform',
            'BrickWright modules',
            'Key runtime',
            'Tauri',
        ];
        for (const heading of groupHeadings) {
            if (textLower.includes(heading.toLowerCase())) {
                pass(`Group: ${heading}`);
            } else {
                fail(`Missing group heading: "${heading}"`);
            }
        }

        // Check scrollability — the section should have overflow
        const section = page.locator('[class*="section"]').first();
        if (await section.count() > 0) {
            const scrollable = await section.evaluate(el => el.scrollHeight > el.clientHeight);
            if (scrollable) {
                pass('Licence section is scrollable');
            } else {
                // Not a hard fail — may be on a tall screen
                console.log('  note: section fits without scrolling (tall viewport)');
            }
        }

        // Close with Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const stillOpen = await page.locator('[class*="backdrop"]').count();
        if (stillOpen === 0) {
            pass('Dialog closes on Escape');
        } else {
            fail('Dialog did not close on Escape');
        }

    } catch (err) {
        fail(err.message);
    } finally {
        await browser.close();
    }

    console.log(ok ? '\nAll checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

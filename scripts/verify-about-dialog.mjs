/**
 * Playwright verification: About dialog opens and lists key licence entries.
 *
 * Usage:
 *   node scripts/verify-about-dialog.mjs
 *   PROOF_URL=http://localhost:8601 node scripts/verify-about-dialog.mjs
 */
import { chromium } from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

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
        await page.getByText('Settings', {exact: true}).waitFor({state: 'visible', timeout: 60000});

        // Use the labelled menu surface, not CSS-module class fragments shared
        // by unrelated settings content.
        const settingsBtn = page.getByText('Settings', {exact: true});
        await settingsBtn.click();

        // The label is intentionally bilingual; this is the user-facing action.
        const aboutItem = page.getByText(/About Brickwright|Über Brickwright/i, {exact: false});
        await aboutItem.waitFor({state: 'visible', timeout: 10000});
        await aboutItem.click();

        // Check dialog is open
        const groups = page.getByTestId('about-licence-groups');
        await groups.waitFor({state: 'visible', timeout: 10000});
        pass('About dialog opened');

        // Get the full text content of the dialog
        const text = await groups.innerText();

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
        const scrollable = await groups.evaluate(el => {
            let node = el.parentElement;
            while (node && node !== document.body) {
                if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
                node = node.parentElement;
            }
            return false;
        });
        scrollable ? pass('Licence section is scrollable') : fail('Licence section is not inside a scrollable viewport');

        // Close with Escape
        await page.keyboard.press('Escape');
        await groups.waitFor({state: 'detached', timeout: 5000})
            .then(() => pass('Dialog closes on Escape'))
            .catch(() => fail('Dialog did not close on Escape'));

        if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);

    } catch (err) {
        fail(err.message);
    } finally {
        if (!ok) {
            await mkdir(path.resolve('artifacts'), {recursive: true});
            await page.screenshot({path: path.resolve('artifacts/verify-about-dialog-failure.png'), fullPage: true}).catch(() => {});
            await writeFile(path.resolve('artifacts/verify-about-dialog-page-errors.txt'), `${pageErrors.join('\n')}\n`).catch(() => {});
        }
        await browser.close();
    }

    console.log(ok ? '\nAll checks passed.' : '\nSome checks failed.');
    process.exit(ok ? 0 : 1);
}

verify();

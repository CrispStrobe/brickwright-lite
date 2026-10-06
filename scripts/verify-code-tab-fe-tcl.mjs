#!/usr/bin/env node
/**
 * Browser acceptance for the Code tab's fe and Tcl tabs: blocks ⇄ text and ▶
 * Run, in the built editor, on the real 8086 DOS bench.
 *
 *   1. Pseudocode typed in the Pseudo tab → the Tcl tab derives partcl → ▶ Run
 *      prints what Scratch would.
 *   2. The fe tab derives from that Tcl (Tcl → pseudocode → fe) → ▶ Run prints
 *      the same lines.
 *   3. Hand-written partcl → ⇦ To blocks → ▣ ⇨ From blocks → the fe tab holds
 *      the program as Lisp, and running it prints what the partcl printed.
 *
 * The unit and bench tests (test/code-tab-fe-tcl*.test.mjs) prove the
 * converters and the interpreters; this proves the TAB wires them: the
 * buffers, the derive-on-switch, compile() and fromBlocks().
 *
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-code-tab-fe-tcl.mjs
 */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const URL = process.env.PROOF_URL || 'http://localhost:8617/';
const ARTIFACTS = path.resolve('artifacts/code-tab-fe-tcl');

const PSEUDO = [
    'GLOBAL n',
    'GLOBAL total',
    'WHEN flag clicked:',
    '  set n to 5',
    '  set total to 0',
    '  REPEAT n + 1:',
    '    change total by n',
    '  say total',
    '  REPEAT 3:',
    '    change n by -1',
    '    say n'
].join('\n');
const PSEUDO_OUT = ['30', '4', '3', '2'];

const HAND_TCL = [
    'set count 0',
    'while {< $count 4} {',
    '  set count [+ $count 1]',
    '  if {== $count 2} {puts "two"} {>= $count 3} {puts $count}',
    '}'
].join('\n');
const HAND_OUT = ['two', '3', '4'];

// BW_BROWSER: a Chromium to use instead of Playwright's own download (the
// convention the other verify-*.mjs gates follow).
const browser = await chromium.launch({headless: true, ...(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 960}});
const diagnostics = [];
const failures = [];
page.on('dialog', dialog => dialog.accept());
page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
});

const check = (condition, message, detail = '') => {
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}${detail ? ` — ${detail}` : ''}`);
    if (!condition) failures.push(`${message}${detail ? ` — ${detail}` : ''}`);
};
const editorText = () => page.locator('.cm-content:visible').first().innerText();
const tab = label => page.getByTestId('bw-lang-row').getByRole('button', {name: label, exact: true});
const idle = () => page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="bw-code-action-row"] button');
    return b && !document.querySelector('[data-testid="bw-lang-row"] button[disabled]');
}, null, {timeout: 30000});

const typeInto = async text => {
    await page.locator('.cm-content:visible').first().click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText(text);
};

/** Click ▶ Run on the active fe/Tcl tab; resolve to the printed lines. */
const runAndRead = async lang => {
    await page.getByTestId(`bw-${lang}-run`).click();
    await page.waitForFunction(id => {
        const run = document.querySelector(`[data-testid="bw-${id}-run"]`);
        const out = document.querySelector(`[data-testid="bw-${id}-output"]`);
        return run && !run.disabled && out && out.textContent.trim() && out.textContent.trim() !== '…';
    }, lang, {timeout: 60000});
    const text = await page.getByTestId(`bw-${lang}-output`).innerText();
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
};

const shot = async name => {
    await mkdir(ARTIFACTS, {recursive: true});
    await page.screenshot({path: path.join(ARTIFACTS, `${name}.png`), fullPage: true}).catch(() => {});
};

try {
    await mkdir(ARTIFACTS, {recursive: true});
    await page.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.removeItem('bw-code-autosave');
        sessionStorage.clear();
    });
    console.log(`Opening ${URL} ...`);
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await tab('🧩 Pseudo').waitFor({timeout: 30000});
    await tab('🧩 Pseudo').click();
    await page.locator('.cm-content:visible').first().waitFor({timeout: 30000});

    // 1. Pseudocode → Tcl → run.
    await typeInto(PSEUDO);
    await tab('○ Tcl').click();
    await page.waitForFunction(() => /puts \$total/.test(
        document.querySelector('.cm-content')?.innerText || ''), null, {timeout: 30000});
    const tcl = await editorText();
    check(/proc # \{\} \{\}/.test(tcl) && /while \{< \$_r\d+ \$_n\d+\} \{/.test(tcl),
        'Pseudo → Tcl tab derives partcl (helpers, counter loop)', tcl.replace(/\s+/g, ' ').slice(0, 160));
    const tclOut = await runAndRead('tcl');
    check(JSON.stringify(tclOut) === JSON.stringify(PSEUDO_OUT), '▶ Run Tcl prints what Scratch would',
        JSON.stringify(tclOut));
    await shot('1-tcl');

    // 2. Tcl → fe (derived through pseudocode) → run.
    await tab('λ fe').click();
    await page.waitForFunction(() => /\(print total\)/.test(
        document.querySelector('.cm-content')?.innerText || ''), null, {timeout: 30000});
    const fe = await editorText();
    check(/\(while \(< _r\d+ _n\d+\)/.test(fe), 'Tcl → fe tab derives Lisp (counter loop)',
        fe.replace(/\s+/g, ' ').slice(0, 160));
    const feOut = await runAndRead('fe');
    check(JSON.stringify(feOut) === JSON.stringify(PSEUDO_OUT), '▶ Run fe prints the same lines',
        JSON.stringify(feOut));
    await shot('2-fe');

    // 3. Hand-written Tcl → blocks → From blocks → fe → run.
    await tab('○ Tcl').click();
    await typeInto(HAND_TCL);
    const handOut = await runAndRead('tcl');
    check(JSON.stringify(handOut) === JSON.stringify(HAND_OUT), 'hand-written partcl runs', JSON.stringify(handOut));
    await page.getByRole('button', {name: '⇦ To blocks', exact: true}).click();
    await idle();
    await page.getByRole('button', {name: 'From blocks ⇨', exact: true}).click();
    await idle();
    await tab('🧩 Pseudo').click();
    const pseudo = await editorText();
    check(/REPEAT UNTIL/.test(pseudo) && /say "two"/.test(pseudo),
        'Tcl → blocks: the project read back as pseudocode', pseudo.replace(/\s+/g, ' ').slice(0, 200));
    await tab('λ fe').click();
    const fromBlocksFe = await editorText();
    check(/\(print "two"\)/.test(fromBlocksFe), 'From blocks fills the fe tab', fromBlocksFe.replace(/\s+/g, ' ').slice(0, 160));
    const roundOut = await runAndRead('fe');
    check(JSON.stringify(roundOut) === JSON.stringify(HAND_OUT),
        'Tcl → blocks → fe runs and prints what the Tcl printed', JSON.stringify(roundOut));
    await shot('3-roundtrip');
} catch (error) {
    check(false, 'fe/Tcl Code-tab journey completes', error.message);
    await shot('failure');
} finally {
    try {
        await writeFile(path.join(ARTIFACTS, 'diagnostics.txt'),
            diagnostics.length ? `${diagnostics.join('\n')}\n` : 'No page errors or console errors.\n');
    } finally {
        await browser.close();
    }
}

check(!diagnostics.some(line => line.startsWith('pageerror:')), 'no page errors',
    diagnostics.filter(line => line.startsWith('pageerror:')).join(' | '));
console.log(failures.length ? `\n${failures.length} fe/Tcl check(s) failed.` : '\nAll fe/Tcl Code-tab checks passed.');
process.exit(failures.length ? 1 : 0);

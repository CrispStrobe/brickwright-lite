#!/usr/bin/env node
/** Browser acceptance for the Code editor's compact chrome and scrolling. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const INFO_TOKEN = process.env.CHROME_INFO_TOKEN || 'zlib';
const ARTIFACTS = path.resolve('artifacts/chrome-sweep');
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 960}});
const failures = [];
const diagnostics = [];

page.on('dialog', dialog => dialog.accept());
page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
        diagnostics.push(`console.${message.type()}: ${message.text()}`);
    }
});

const check = (condition, message, detail = '') => {
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}${detail ? ` — ${detail}` : ''}`);
    if (!condition) failures.push(`${message}${detail ? ` — ${detail}` : ''}`);
};

try {
    await mkdir(ARTIFACTS, {recursive: true});
    await page.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    console.log(`Opening ${URL} ...`);
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60000});

    const codeTab = page.getByRole('tab', {name: 'Code', exact: true});
    await codeTab.waitFor({timeout: 30000});
    check(await codeTab.innerText() === 'Code', 'main tab is exactly "Code"');
    await codeTab.click();

    const langRow = page.getByTestId('bw-lang-row');
    await langRow.waitFor({timeout: 15000});
    const languageButtons = langRow.getByRole('button', {pressed: false});
    check(await languageButtons.count() >= 5, 'merged row contains the language tabs',
        `${await languageButtons.count()} inactive language buttons`);
    check(await langRow.getByTestId('bw-device-select').count() === 1,
        'merged row contains the device selector');

    await langRow.getByRole('button', {name: /BAS/}).click();
    const profile = page.getByRole('combobox', {name: /Profile/i});
    await profile.waitFor({timeout: 10000});
    // A profile change deliberately clears the BASIC buffer. This makes the
    // absence of a run control attributable, not dependent on project state.
    await profile.selectOption((await profile.inputValue()) === 'ms' ? 'bbc' : 'ms');
    await page.waitForFunction(() =>
        (document.querySelector('.cm-content')?.textContent || '').trim() === '',
    null, {timeout: 10000});
    check(await page.getByTestId('bw-basic-run').count() === 0,
        'empty BASIC buffer has no Run control');
    check(await page.getByRole('button', {name: /Run (Python|JavaScript)/i}).count() === 0,
        'BASIC tab never exposes a wrong-language Run control');

    const infoToggle = page.getByTestId('bw-basic-info-toggle');
    await infoToggle.click();
    const infoPanel = page.getByTestId('bw-basic-info-panel');
    await infoPanel.waitFor({state: 'visible', timeout: 10000});
    const infoText = await infoPanel.innerText();
    check(infoText.includes('BBC BASIC') && infoText.includes(INFO_TOKEN),
        `BASIC info names BBC BASIC and ${INFO_TOKEN}`, infoText);
    await infoToggle.click();
    await infoPanel.waitFor({state: 'detached', timeout: 10000});
    check(await infoPanel.count() === 0, 'BASIC info hides on its second click');

    await langRow.getByRole('button', {name: /Pseudo/}).click();
    const editor = page.locator('.cm-content:visible');
    await editor.click();
    await page.keyboard.press('Control+a');
    const lines = Array.from({length: 500}, (_, index) => `    say "line ${index + 1}"`).join('\n');
    const source = `SPRITE Cat:\n  WHEN flag clicked:\n${lines}`;
    await page.keyboard.insertText(source);
    await page.waitForFunction(expected =>
        (document.querySelector('.cm-content')?.textContent || '').includes(expected),
    'line 500', {timeout: 15000});

    const scrollInfo = await page.locator('.cm-scroller:visible').evaluate(scroller => ({
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight
    }));
    check(scrollInfo.scrollHeight > scrollInfo.clientHeight, '500-line editor buffer scrolls internally',
        `${scrollInfo.scrollHeight} > ${scrollInfo.clientHeight}`);
    check(await langRow.isVisible(), 'editor controls remain visible above a tall buffer');

    const maximize = page.getByTestId('bw-editor-maximize');
    await maximize.click();
    await page.getByTitle('Restore panels').waitFor({state: 'visible', timeout: 10000});
    // The merged row is deliberately retained in maximize mode; only the
    // expanded chrome below it is replaced by compact conversion controls.
    check(await page.getByTestId('bw-device-select').isVisible(),
        'maximize retains the compact target selector');
    check(await page.getByRole('button', {name: '⇦ Blocks', exact: true}).isVisible() &&
        await page.getByRole('button', {name: 'Blocks ⇨', exact: true}).isVisible(),
    'maximize exposes both compact block-conversion controls');
    await page.getByTitle('Restore panels').click();
    await page.getByTitle('Maximize editor').waitFor({state: 'visible', timeout: 10000});
    check(await page.getByTestId('bw-device-select').isVisible(), 'restoring returns the normal editor chrome');
} catch (error) {
    check(false, 'chrome sweep journey completes', error.message);
} finally {
    try {
        await mkdir(ARTIFACTS, {recursive: true});
        await writeFile(path.join(ARTIFACTS, 'diagnostics.txt'),
            diagnostics.length ? `${diagnostics.join('\n')}\n` : 'No page errors or console warnings/errors.\n');
        if (failures.length || diagnostics.some(line => line.startsWith('pageerror:'))) {
            await page.screenshot({path: path.join(ARTIFACTS, 'failure.png'), fullPage: true}).catch(() => {});
        }
    } finally {
        await browser.close();
    }
}

check(!diagnostics.some(line => line.startsWith('pageerror:')), 'no page errors',
    diagnostics.filter(line => line.startsWith('pageerror:')).join(' | '));
console.log(failures.length ? `\n${failures.length} chrome-sweep check(s) failed.` : '\nAll chrome-sweep checks passed.');
process.exit(failures.length ? 1 : 0);

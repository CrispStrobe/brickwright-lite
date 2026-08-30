#!/usr/bin/env node
/** Browser acceptance for both BASIC profiles on their real emulated machines. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const EXPECTED = process.env.BASIC_EXPECTED || '4';
const ARTIFACTS = path.resolve('artifacts/basic-run');
const PROGRAM = '10 PRINT 2+2';

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 960}});
const diagnostics = [];
const failures = [];

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
const hasStandaloneLine = (output, expected) => output.split(/\r?\n/)
    .some(line => line.trim() === expected);
const outputLocator = () => page.getByTestId('bw-basic-output')
    // Compatibility with production while the new test id waits to deploy.
    .or(page.locator('[data-testid="bw-lang-row"] ~ pre')).last();

const writeProfileArtifacts = async (profile, output) => {
    await mkdir(ARTIFACTS, {recursive: true});
    await writeFile(path.join(ARTIFACTS, `${profile}-terminal.txt`), output || '(no output)');
    await page.screenshot({path: path.join(ARTIFACTS, `${profile}.png`), fullPage: true});
};

const runProfile = async ({value, label, artifact}) => {
    const profile = page.getByRole('combobox', {name: /Profile/i});
    const editor = page.locator('.cm-content:visible');
    const run = page.getByTestId('bw-basic-run');
    let output = '';
    try {
        await profile.selectOption(value);
        await page.waitForFunction(expected => {
            const select = [...document.querySelectorAll('select')]
                .find(node => [...node.options].some(option => option.value === 'ms'));
            return select?.value === expected;
        }, value, {timeout: 10000});
        await editor.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.insertText(PROGRAM);
        await page.waitForFunction(expected =>
            (document.querySelector('.cm-content')?.textContent || '').trim() === expected,
        PROGRAM, {timeout: 10000});

        await run.click();
        await page.waitForFunction(() =>
            document.querySelector('[data-testid="bw-basic-run"]')?.disabled === true,
        null, {timeout: 10000});
        await page.waitForFunction(expected => {
            const node = document.querySelector('[data-testid="bw-basic-output"]') ||
                document.querySelector('[data-testid="bw-lang-row"] ~ pre');
            const lines = (node?.textContent || '').split(/\r?\n/);
            const done = document.querySelector('[data-testid="bw-basic-run"]')?.disabled === false;
            return done && lines.some(line => line.trim() === expected);
        }, EXPECTED, {timeout: 45000});
        output = await outputLocator().innerText();
        check(hasStandaloneLine(output, EXPECTED),
            `${label}: ${PROGRAM} prints standalone line ${EXPECTED}`,
            output.replace(/\s+/g, ' ').slice(0, 180));
    } catch (error) {
        output = await outputLocator().innerText().catch(() => '');
        check(false, `${label} BASIC journey completes`, error.message);
    } finally {
        await writeProfileArtifacts(artifact, output);
    }
};

try {
    await mkdir(ARTIFACTS, {recursive: true});
    await page.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    console.log(`Opening ${URL} ...`);
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-lang-row').getByRole('button', {name: /BAS/}).click();
    await page.getByRole('combobox', {name: /Profile/i}).waitFor({timeout: 15000});
    await runProfile({value: 'ms', label: '6502', artifact: 'ms'});
    await runProfile({value: 'bbc', label: 'BBC', artifact: 'bbc'});
} catch (error) {
    check(false, 'BASIC browser setup completes', error.message);
    await mkdir(ARTIFACTS, {recursive: true});
    await page.screenshot({path: path.join(ARTIFACTS, 'setup-failure.png'), fullPage: true}).catch(() => {});
} finally {
    try {
        await writeFile(path.join(ARTIFACTS, 'diagnostics.txt'),
            diagnostics.length ? `${diagnostics.join('\n')}\n` : 'No page errors or console warnings/errors.\n');
    } finally {
        await browser.close();
    }
}

check(!diagnostics.some(line => line.startsWith('pageerror:')), 'no page errors',
    diagnostics.filter(line => line.startsWith('pageerror:')).join(' | '));
console.log(failures.length ? `\n${failures.length} BASIC check(s) failed.` : '\nAll BASIC run checks passed.');
process.exit(failures.length ? 1 : 0);

/** Browser gate for the first-run chooser and its three real project paths. */
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'http://127.0.0.1:8765/';
const browser = await chromium.launch({headless: true});

const check = (value, message) => {
    if (!value) throw new Error(message);
    console.log(`  ok: ${message}`);
};

try {
    let context = await browser.newContext();
    let page = await context.newPage();
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    const dialog = page.getByTestId('bw-starter-dialog');
    await dialog.waitFor({timeout: 30000});
    check(await dialog.getAttribute('role') === 'dialog', 'first run opens an accessible dialog');
    check(await page.locator('[data-starter-id]').count() === 3, 'three journeys are shown');

    await page.getByRole('button', {name: 'Not now'}).click();
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(500);
    check(await dialog.count() === 0, 'dismissal survives reload');
    await page.getByText('Settings', {exact: true}).click();
    await page.getByText('Getting started…', {exact: true}).click();
    await dialog.waitFor();
    check(true, 'Settings reopens the chooser');
    await context.close();

    for (const id of ['circuit', 'board', 'lego']) {
        context = await browser.newContext();
        page = await context.newPage();
        page.on('dialog', prompt => prompt.accept());
        await page.goto(`${url}${url.includes('?') ? '&' : '?'}journey=${id}`, {
            waitUntil: 'domcontentloaded'
        });
        await page.getByTestId('bw-starter-dialog').waitFor({timeout: 30000});
        await page.locator(`[data-starter-id="${id}"]`).click();
        await page.getByTestId('bw-starter-dialog').waitFor({
            state: 'detached',
            timeout: 45000
        });
        const selected = (await page.locator('[role="tab"][aria-selected="true"]')
            .allTextContents()).join(' ').toLowerCase();
        const expected = id === 'lego' ? 'code' : 'circuit';
        check(selected.includes(expected), `${id} opens the ${expected} editor`);
        await context.close();
    }
} finally {
    await browser.close();
}

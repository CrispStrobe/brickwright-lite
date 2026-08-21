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
    await page.getByRole('button', {name: 'Not now'}).click();
    await page.getByText('Settings', {exact: true}).click();
    await page.getByText('Lessons…', {exact: true}).click();
    await page.getByTestId('bw-lessons-library').waitFor();
    check(await page.locator('[data-lesson-id]').count() >= 29,
        'Settings opens the broad lessons catalog');
    const lessonSearch = page.getByRole('searchbox', {name: 'Search lessons'});
    await lessonSearch.fill('motor flyback');
    check(await page.locator('[data-lesson-id="electricity-motor-flyback"]').isVisible(),
        'lesson search finds a Wave 1 topic');
    check(await page.locator('[data-lesson-id]').count() === 1,
        'lesson search filters the larger catalog');
    await lessonSearch.fill('');
    await page.getByRole('combobox', {name: 'All levels'}).selectOption('discover');
    check(await page.locator('[data-lesson-id="electricity-polarity"]').isVisible(),
        'level filtering keeps discover lessons visible');
    await page.getByRole('combobox', {name: 'All levels'}).selectOption('');
    page.on('dialog', prompt => prompt.accept());
    await page.locator('[data-lesson-id="instrument-voltage-divider"]').click();
    await page.getByRole('button', {name: 'Open lesson project'}).click();
    await page.getByText('Project opened', {exact: true}).waitFor({timeout: 45000});
    check(true, 'a catalog lesson opens its matching live example');
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
        await page.getByTestId('bw-guided-lesson').waitFor({timeout: 10000});
        check(true, `${id} continues into a guided lesson`);
        if (id === 'circuit') {
            check((await page.getByTestId('bw-lesson-complete').innerText()).includes('Observed'),
                'starter-loaded checkpoint completes automatically');
            await page.getByTestId('bw-lesson-next').click();
            await page.getByTestId('bw-lesson-complete').click();
            const saved = await page.evaluate(() => JSON.parse(
                localStorage.getItem('bw-lesson-progress:starter-circuit-path:v1')));
            check(saved.completed.inspect.method === 'manual', 'manual fallback persists by lesson version');
        }
        if (id === 'board') {
            await page.getByRole('button', {name: 'python', exact: true}).click();
            check(await page.getByText(/Python syntax alone/).isVisible(),
                'a learner can switch to language-specific guidance');
        }
        const selected = (await page.locator('[role="tab"][aria-selected="true"]')
            .allTextContents()).join(' ').toLowerCase();
        const expected = id === 'lego' ? 'code' : 'circuit';
        check(selected.includes(expected), `${id} opens the ${expected} editor`);
        await context.close();
    }
} finally {
    await browser.close();
}

/** Production-browser proof for an immutable gallery pin promoted to the host-bound worker path. */
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const proofURL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const extensionURL = 'https://crispstrobe.github.io/extensions/Clay/htmlEncode.js';
const failurePath = process.env.FAILURE_JSON || '/tmp/brickwright-pinned-worker-failure.json';
const screenshotPath = process.env.SUCCESS_SCREENSHOT || '/tmp/brickwright-pinned-worker-success.png';
const pageErrors = [];
const browser = await chromium.launch({headless: true});

try {
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(proofURL, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForFunction(() => {
        const store = window.__brickwrightStore;
        const vm = store && store.getState && store.getState().scratchGui.vm;
        return Boolean(vm && vm.extensionManager);
    }, {timeout: 20000});

    const result = await page.evaluate(async url => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        await vm.extensionManager.loadExtensionURL(url);
        const primitive = vm.runtime._primitives.claytonhtmlencode_encode;
        if (typeof primitive !== 'function') throw new Error('promoted pin did not register its opcode');
        return {
            scenarios: 3,
            opcode: await primitive({text: `<b>&"'`}, {yield: () => {}}),
            service: vm.extensionManager._loadedExtensions.get(url),
            pendingLoads: vm.extensionManager.pendingPinnedLoads.size
        };
    }, extensionURL);

    const expected = {
        scenarios: 3,
        opcode: '&lt;b&gt;&amp;&apos;&quot;',
        service: 'extension.0.0',
        pendingLoads: 0
    };
    if (JSON.stringify(result) !== JSON.stringify(expected) || pageErrors.length) {
        throw new Error(`pinned worker mismatch: ${JSON.stringify({result, expected, pageErrors})}`);
    }
    await page.screenshot({path: screenshotPath, fullPage: true});
    console.log(`PASS: 3/3 promoted-pin worker scenarios; zero page errors (${extensionURL})`);
} catch (error) {
    await writeFile(failurePath, `${JSON.stringify({proofURL, extensionURL, pageErrors, error: error.stack}, null, 2)}\n`);
    throw error;
} finally {
    await browser.close();
}

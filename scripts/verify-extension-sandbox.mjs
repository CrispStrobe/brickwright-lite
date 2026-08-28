/**
 * Browser proof that the built extension-worker.js imports, registers and runs
 * an unpinned extension without page/editor/native globals.
 */
import {chromium} from 'playwright';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const fixtureURL = new URL('static/test-fixtures/sandbox-probe.js', URL).href;

const browser = await chromium.launch({headless: true});
try {
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60000});

    const result = await page.evaluate(async extensionURL => {
        const deadline = Date.now() + 20000;
        let vm = null;
        while (Date.now() < deadline) {
            const store = window.__brickwrightStore;
            vm = store && store.getState && store.getState().scratchGui.vm;
            if (vm && vm.extensionManager) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!vm || !vm.extensionManager) throw new Error('Scratch VM did not become ready');

        await vm.extensionManager.loadExtensionURL(extensionURL);
        let primitive = null;
        while (Date.now() < deadline) {
            primitive = vm.runtime._primitives.sandboxprobe_inspect;
            if (primitive) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!primitive) throw new Error('sandbox probe did not register its reporter');
        return JSON.parse(await primitive({}, {yield: () => {}}));
    }, fixtureURL);

    const expected = {
        unsandboxed: false,
        document: 'undefined',
        editor: 'undefined',
        nativeBridge: 'undefined',
        webSocket: 'blocked'
    };
    if (JSON.stringify(result) !== JSON.stringify(expected)) {
        throw new Error(`sandbox boundary mismatch: ${JSON.stringify(result)}`);
    }
    console.log(`PASS: unpinned extension registered and executed in the restricted worker (${fixtureURL})`);
} finally {
    await browser.close();
}

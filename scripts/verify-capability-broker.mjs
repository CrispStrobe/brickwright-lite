/** Production-browser proof for declared capability enforcement through real pinned workers/opcodes. */
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const proofURL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const declaredURL = 'https://crispstrobe.github.io/brickwright-lite/static/test-fixtures/capability-probe-declared.js';
const noneURL = 'https://crispstrobe.github.io/brickwright-lite/static/test-fixtures/capability-probe-none.js';
const failurePath = process.env.FAILURE_JSON || '/tmp/brickwright-capability-broker-failure.json';
const screenshotPath = process.env.SUCCESS_SCREENSHOT || '/tmp/brickwright-capability-broker-success.png';
const pageErrors = [];
let browser = null;
let fixture = null;

const runOpcode = async (page, url, opcode) => page.evaluate(async ({extensionURL, opcodeName}) => {
    const vm = window.__brickwrightStore.getState().scratchGui.vm;
    await vm.extensionManager.loadExtensionURL(extensionURL);
    const primitive = vm.runtime._primitives[`capabilityprobe_${opcodeName}`];
    if (typeof primitive !== 'function') throw new Error(`missing capability probe opcode ${opcodeName}`);
    return {
        value: await primitive({}, {yield: () => {}}),
        service: vm.extensionManager._loadedExtensions.get(extensionURL),
        pending: vm.extensionManager.pendingPinnedLoads.size
    };
}, {extensionURL: url, opcodeName: opcode});

try {
    fixture = await readFile(new URL('../overlay/scratch-gui/static/test-fixtures/capability-probe.js', import.meta.url));
    const proofPins = JSON.parse(await readFile(new URL(
        '../overlay/scratch-vm/src/extension-support/gallery-proof-pins.json', import.meta.url), 'utf8'));
    const digest = createHash('sha256').update(fixture).digest('hex');
    for (const url of [declaredURL, noneURL]) {
        if (proofPins[url]?.served !== digest) throw new Error(`capability fixture pin mismatch for ${url}`);
    }
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    const fulfillFixture = route => route.fulfill({status: 200, contentType: 'text/javascript', body: fixture});
    // CONTEXT routing, not page routing. `page.route` does not intercept requests initiated by a
    // WORKER, and the second extension load is fetched worker-side once a worker already exists.
    // Measured 2026-09-03: against deployed Pages the handler fired for capability-probe-declared
    // and never for capability-probe-none, which then took a real 404 —
    //     ROUTED: ["capability-probe-declared.js"]
    // — while the same run against a local build passed, because there the timing put both loads
    // page-side. A gate whose interception depends on which context happens to fetch is a gate
    // that passes or fails on something it is not testing.
    await page.context().route(declaredURL, fulfillFixture);
    await page.context().route(noneURL, fulfillFixture);
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    const ready = async () => {
        await page.goto(proofURL, {waitUntil: 'domcontentloaded', timeout: 60000});
        await page.waitForFunction(() => {
            const store = window.__brickwrightStore;
            const vm = store && store.getState && store.getState().scratchGui.vm;
            return Boolean(vm && vm.extensionManager);
        }, {timeout: 20000});
    };
    await ready();

    const allowed = await runOpcode(page, declaredURL, 'allowed');
    const sequence = await runOpcode(page, declaredURL, 'sequence');
    const undeclared = await runOpcode(page, noneURL, 'undeclared');
    await page.reload({waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForFunction(() => Boolean(window.__brickwrightStore?.getState?.().scratchGui.vm?.extensionManager),
        {timeout: 20000});
    const reloaded = await runOpcode(page, declaredURL, 'allowed');

    const expectedRefusal = JSON.stringify({
        code: 'undeclared-operation', message: 'Capability was not declared'
    });
    const scenarios = {
        declaredWorkerRegistered: /^extension\.\d+\.0$/.test(allowed.service),
        declaredOperationAllowed: allowed.value === 'en',
        sequentialRequestsAllowed: sequence.value === 'capability-browser-proof|en',
        noCapabilityWorkerDistinct: /^extension\.\d+\.0$/.test(undeclared.service) &&
            undeclared.service !== allowed.service,
        undeclaredOperationRefused: undeclared.value === expectedRefusal,
        pendingLoadsClosed: [allowed, sequence, undeclared, reloaded].every(item => item.pending === 0),
        teardownReloadFreshAndAllowed: reloaded.value === 'en' && /^extension\.\d+\.0$/.test(reloaded.service)
    };
    // The exact list, compared by ORDER as well as membership, so a scenario cannot be dropped
    // or renamed without this failing.
    const expectedScenarioNames = [
        'declaredWorkerRegistered', 'declaredOperationAllowed', 'sequentialRequestsAllowed',
        'noCapabilityWorkerDistinct', 'undeclaredOperationRefused', 'pendingLoadsClosed',
        'teardownReloadFreshAndAllowed'
    ];
    if (JSON.stringify(Object.keys(scenarios)) !== JSON.stringify(expectedScenarioNames) ||
        !Object.values(scenarios).every(Boolean) || pageErrors.length) {
        throw new Error(`capability browser mismatch: ${JSON.stringify({
            scenarios, observations: {allowed, sequence, undeclared, reloaded}, pageErrors
        })}`);
    }
    await page.screenshot({path: screenshotPath, fullPage: true});
    console.log(`PASS: ${Object.values(scenarios).filter(Boolean).length}/${expectedScenarioNames.length} ` +
        'declared capability scenarios; teardown/reload clean; zero page errors');
} catch (error) {
    await writeFile(failurePath,
        `${JSON.stringify({proofURL, declaredURL, noneURL, pageErrors, error: error.stack}, null, 2)}\n`);
    throw error;
} finally {
    if (browser) await browser.close();
}

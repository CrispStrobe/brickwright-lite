/**
 * Production-browser proof for an immutable gallery pin promoted to the host-bound worker path,
 * and (task E5) for a TurboWarp project file naming gallery extensions: pinned copies load,
 * the save writes their pinned URLs, a stranger's URL is refused and never requested.
 */
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const proofURL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const extensionURL = 'https://crispstrobe.github.io/extensions/Clay/htmlEncode.js';
const failurePath = process.env.FAILURE_JSON || '/tmp/brickwright-pinned-worker-failure.json';
const screenshotPath = process.env.SUCCESS_SCREENSHOT || '/tmp/brickwright-pinned-worker-success.png';
const pageErrors = [];
// Task E5: requests the page makes to a host a project file named. A refused
// project URL must never be fetched, so this must stay empty.
const strangerRequests = [];
const STRANGER = 'https://stranger.invalid/';
const browser = await chromium.launch({headless: true});

try {
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
        if (request.url().startsWith(STRANGER)) strangerRequests.push(request.url());
    });
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(proofURL, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForFunction(() => {
        const store = window.__brickwrightStore;
        const vm = store && store.getState && store.getState().scratchGui.vm;
        return Boolean(vm && vm.extensionManager);
    }, {timeout: 20000});

    const result = await page.evaluate(async ({url, stranger}) => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        await vm.extensionManager.loadExtensionURL(url);
        const primitive = vm.runtime._primitives.claytonhtmlencode_encode;
        if (typeof primitive !== 'function') throw new Error('promoted pin did not register its opcode');
        const opcode = await primitive({text: `<b>&"'`}, {yield: () => {}});
        const service = vm.extensionManager._loadedExtensions.get(url);

        // Task E5, scenarios 4-6: a TurboWarp file names its gallery extensions by
        // id plus TurboWarp's own URL. Lite loads its pinned copy of each, writes
        // the pinned URLs back on save, and refuses (never fetches) a URL that is
        // not a pinned gallery copy of the id it is filed under.
        const costumes = [{name: 'backdrop1', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
            md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg',
            rotationCenterX: 240, rotationCenterY: 180}];
        const turbowarpProject = {
            targets: [
                {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
                    comments: {}, currentCostume: 0, costumes, sounds: [], volume: 100, layerOrder: 0},
                {isStage: false, name: 'Sprite1', variables: {}, lists: {}, broadcasts: {}, comments: {},
                    blocks: {
                        enc: {opcode: 'Encoding_encode', next: null, parent: null,
                            inputs: {string: [1, [10, 'apple']], code: [1, [10, 'Base64']]}, fields: {},
                            shadow: false, topLevel: true, x: 0, y: 0},
                        html: {opcode: 'claytonhtmlencode_encode', next: null, parent: null,
                            inputs: {text: [1, [10, '<i>']]}, fields: {}, shadow: false, topLevel: true, x: 0, y: 80}
                    },
                    currentCostume: 0, costumes, sounds: [], volume: 100, layerOrder: 1, visible: true,
                    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
            ],
            monitors: [],
            // lmsmcutils is declared (so it is asked for) but has no blocks, so the
            // refusal leaves nothing unrenderable in the editor.
            extensions: ['Encoding', 'claytonhtmlencode', 'lmsmcutils'],
            extensionURLs: {
                Encoding: 'https://extensions.turbowarp.org/encoding.js',
                claytonhtmlencode: 'https://extensions.turbowarp.org/Clay/htmlEncode.js',
                lmsmcutils: `${stranger}Lily/McUtils.js`
            },
            meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
        };
        await vm.loadProject(JSON.stringify(turbowarpProject));
        const encode = vm.runtime._primitives.Encoding_encode;
        const saved = JSON.parse(vm.toJSON());
        return {
            scenarios: 6,
            opcode,
            service,
            pendingLoads: vm.extensionManager.pendingPinnedLoads.size,
            turbowarpFile: typeof encode === 'function' ?
                await encode({string: 'apple', code: 'Base64'}, {yield: () => {}}) : null,
            savedURLs: saved.extensionURLs || null,
            refused: vm.extensionManager.isExtensionLoaded('lmsmcutils') ? 'loaded' : 'refused'
        };
    }, {url: extensionURL, stranger: STRANGER});

    const expected = {
        scenarios: 6,
        // Input is `<b>&"'`, so the tail is the double quote THEN the
        // apostrophe. It used to be the other way round here because
        // Clay/htmlEncode had its two cases crossed -- `"` returned &apos;
        // and `'` returned &quot; -- and this gate faithfully pinned the
        // bug. TurboWarp fixed the switch upstream and the 2026-09-21 sync
        // brought the fix in, so the corrected order is what a correct
        // encoder produces. Changed because the behaviour got RIGHTER, not
        // to quiet the gate.
        opcode: '&lt;b&gt;&amp;&quot;&apos;',
        service: 'extension.0.0',
        pendingLoads: 0,
        turbowarpFile: 'YXBwbGU=',
        // Clay/htmlEncode was already loaded by URL above; the file's TurboWarp
        // spelling resolves to the same pinned copy, so both are saved as ours.
        savedURLs: {
            Encoding: 'https://crispstrobe.github.io/extensions/encoding.js',
            claytonhtmlencode: extensionURL
        },
        refused: 'refused'
    };
    if (JSON.stringify(result) !== JSON.stringify(expected) || pageErrors.length || strangerRequests.length) {
        throw new Error(`pinned worker mismatch: ${JSON.stringify({result, expected, pageErrors, strangerRequests})}`);
    }
    await page.screenshot({path: screenshotPath, fullPage: true});
    console.log(`PASS: 6/6 promoted-pin worker scenarios (3 gallery pick, 3 TurboWarp-file load/save/refusal); ` +
        `zero page errors (${extensionURL})`);
} catch (error) {
    await writeFile(failurePath, `${JSON.stringify({proofURL, extensionURL, pageErrors, error: error.stack}, null, 2)}\n`);
    throw error;
} finally {
    await browser.close();
}

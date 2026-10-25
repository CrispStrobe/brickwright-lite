#!/usr/bin/env node
/**
 * Browser acceptance for the complete Aurora-65 workstation.
 *
 * Unit tests prove the extractor, ROM, PS/2 frames, VIA capture, OLED I2C
 * decoder and VGA model independently. This gate proves the part users can
 * otherwise still lose: the published gallery entry loads those exact files,
 * exposes the physical keyboard, boots the drawn machine, and mirrors both
 * display devices into its shipped Controller faceplate.
 */
import {createRequire} from 'node:module';

let chromium;
for (const base of ['../package.json',
    process.env.PLAYWRIGHT_PACKAGE_JSON]) {
    if (!base) continue;
    try {
        ({chromium} = createRequire(new URL(base, import.meta.url))('playwright'));
        break;
    } catch { /* try the shared development checkout; CI uses the first path */ }
}
if (!chromium) throw new Error('Playwright is not installed');

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1800, height: 1100}});
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    page.on('dialog', dialog => dialog.accept());
    await page.goto(url, {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.getByRole('tab', {name: /circuit/i}).click();

    // CircuitTab owns the normal gallery loader. Reach the mounted instance
    // instead of duplicating its fetch/application logic in this proof.
    const found = await page.waitForFunction(() => {
        const gui = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        if (!gui) return false;
        const key = Object.keys(gui).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (!key) return false;
        const queue = [gui[key]];
        for (let i = 0; i < 8000 && queue.length; i++) {
            const fiber = queue.shift();
            const node = fiber && fiber.stateNode;
            if (node && typeof node.loadExample === 'function' &&
                Array.isArray(node.state && node.state.examples)) {
                window.__bwAuroraCircuitTab = node;
                return node.state.examples.some(example => example.id === 'aurora65-workstation');
            }
            if (fiber && fiber.child) queue.push(fiber.child);
            if (fiber && fiber.sibling) queue.push(fiber.sibling);
        }
        return false;
    }, null, {timeout: 30000});
    check('Aurora-65 is published in the circuit gallery', !!found);

    const loaded = await page.evaluate(async () => {
        const tab = window.__bwAuroraCircuitTab;
        const example = tab && tab.state.examples.find(item => item.id === 'aurora65-workstation');
        if (!example) return {ok: false, error: 'gallery entry unavailable'};
        return tab.loadExample(example);
    });
    check('normal gallery loader opens the complete workstation', loaded && loaded.ok,
        loaded && loaded.error ? loaded.error : '');

    await page.locator('[data-ps2-key]').first().waitFor({timeout: 20000});
    const circuit = await page.evaluate(() => {
        const tab = window.__bwAuroraCircuitTab;
        const parts = tab.state.circuitData && tab.state.circuitData.parts || [];
        const panel = tab.props.vm.runtime.controllerPanel;
        return {
            kinds: parts.map(part => part.kind),
            widgets: panel.getWidgets().map(widget => ({
                name: widget.name,
                type: widget.type,
                binding: widget.binding,
            })),
        };
    });
    for (const kind of ['w65c02', 'w65c22', 'ssd1306', 'ps2', 'simplevga_card']) {
        check(`drawn circuit contains ${kind}`, circuit.kinds.includes(kind));
    }
    const oledFace = page.locator('[data-part-face="ssd1306"]');
    await oledFace.waitFor({state: 'visible', timeout: 10000});
    check('physical circuit renders the SSD1306 face', await oledFace.count() === 1,
        `${await oledFace.count()} visible face(s)`);
    const expectedWidgets = [
        ['vgaMonitor', 'simplevga', 'vga'],
        ['statusOled', 'oled', 'oled1'],
        ['ps2Keyboard', 'keyboard', 'kbd'],
    ];
    for (const [name, type, partId] of expectedWidgets) {
        const widget = circuit.widgets.find(item => item.name === name);
        check(`${name} is a part-bound ${type} widget`,
            !!widget && widget.type === type && widget.binding &&
            widget.binding.target === 'part' && widget.binding.partId === partId);
    }

    const keyNames = await page.locator('[data-ps2-key]').evaluateAll(nodes =>
        [...new Set(nodes.map(node => node.getAttribute('data-ps2-key')))]);
    check('physical circuit keyboard exposes all 74 keys', keyNames.length === 74,
        `${keyNames.length} unique keys`);

    // Boot through the same two visible controls a learner uses. Build Machine
    // publishes the extracted bus; Sim starts the runner with the ROM that the
    // gallery loader already placed in the machine-media slot.
    await page.getByRole('button', {name: /build machine/i}).click({force: true});
    await page.waitForFunction(() => document.querySelector('[data-build-machine]')?.textContent?.includes('✓'),
        null, {timeout: 15000});
    check('Build Machine accepts the drawn address decode', true);
    await page.getByRole('radio', {name: /sim mode/i}).click({force: true});

    await page.waitForFunction(() => {
        const board = window.__activeBoard;
        const oled = board && board.getDeviceState && board.getDeviceState('oled1');
        const vga = board && board.getDeviceState && board.getDeviceState('vga');
        const frame = vga && vga.videoFrame && vga.videoFrame();
        return oled && oled.displayOn && oled.fb && oled.fb.some(byte => byte !== 0) &&
            frame && frame.signal && frame.rgba && frame.rgba.some(byte => byte !== 0);
    }, null, {timeout: Number(process.env.AURORA_BOOT_TIMEOUT || 30000)});
    check('shipped ROM drives real OLED GDDRAM and a live VGA frame', true);

    await page.locator('[data-testid="bw-ctl-oled-statusOled"][data-pixels="1"]').waitFor({timeout: 10000});
    await page.locator('[data-testid="bw-ctl-simplevga-vgaMonitor"] canvas').waitFor({timeout: 10000});
    const noSignal = await page.locator('[data-testid="bw-ctl-simplevga-vgaMonitor"]').getByText('NO SIGNAL').count();
    check('Controller mirrors both physical displays', noSignal === 0);

    const writesBefore = await page.evaluate(() =>
        window.__activeBoard.getDeviceState('vga').videoFrame().writes ??
        window.__activeBoard.getDeviceState('vga')._video?.writes ?? 0);
    const aKey = page.locator('[data-ps2-key="a"]');
    await aKey.dispatchEvent('pointerdown', {pointerId: 1});
    await aKey.dispatchEvent('pointerup', {pointerId: 1});
    await page.waitForFunction(before => {
        const state = window.__activeBoard && window.__activeBoard.getDeviceState('vga');
        const frame = state && state.videoFrame && state.videoFrame();
        const writes = (frame && frame.writes) ?? (state && state._video && state._video.writes) ?? 0;
        return writes > before;
    }, writesBefore, {timeout: 10000});
    check('clicking circuit key A crosses PS/2 → VIA → 6502 → VGA', true);
} catch (error) {
    const diagnostic = await page.evaluate(() => {
        const tab = window.__bwAuroraCircuitTab;
        const board = window.__activeBoard;
        let debugPanel = null;
        const host = document.querySelector('[data-bw-debug-host]');
        const debugElement = host && host.querySelector('button');
        const key = debugElement && Object.keys(debugElement).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        const queue = key ? [debugElement[key]] : [];
        for (let i = 0; i < 2000 && queue.length; i++) {
            const fiber = queue.shift();
            const node = fiber && fiber.stateNode;
            if (node && node.state && node.state.ui &&
                typeof node.runner === 'function' && typeof node.onStart === 'function') {
                debugPanel = node;
                break;
            }
            if (fiber && fiber.child) queue.push(fiber.child);
            if (fiber && fiber.sibling) queue.push(fiber.sibling);
            if (fiber && fiber.return) queue.push(fiber.return);
        }
        const runner = debugPanel && debugPanel.state && debugPanel.state.runner;
        const runnerBoard = runner && typeof runner.board === 'function' ? runner.board() : null;
        return {
            tab: tab && {
                runToken: tab.state.runToken,
                machineBooted: tab.state.machineBooted,
                board: !!tab.state.board,
                debugState: !!tab.state.debugState,
            },
            extracted: !!window.__bwMachineExtracted,
            media: window.__bwPendingMedia && window.__bwPendingMedia.type,
            activeBoard: !!board,
            debugHost: !!host,
            debugPanel: debugPanel && {
                kind: debugPanel.state.kind,
                phase: debugPanel.state.ui && debugPanel.state.ui.phase,
                message: debugPanel.state.ui && debugPanel.state.ui.message,
                machineConfig: !!debugPanel.state.machineConfig,
                bootMedia: !!debugPanel._bootMedia,
                runner: !!runner,
                runnerBoard: !!runnerBoard,
                runnerState: runner && typeof runner.state === 'function' ? runner.state() : null,
            },
            runtime: tab && tab.props.vm && {
                circuitBoard: !!tab.props.vm.runtime.circuitBoard,
                runBoard: !!tab.props.vm.runtime.bwRunBoard,
            },
        };
    }).catch(() => null);
    check('Aurora-65 browser journey completes', false,
        `${String(error).slice(0, 300)}${diagnostic ? ` state=${JSON.stringify(diagnostic)}` : ''}`);
} finally {
    await browser.close();
}

console.log(failures.length ? `\n${failures.length} Aurora-65 check(s) failed.` :
    '\nAll Aurora-65 workstation checks passed.');
process.exit(failures.length ? 1 : 0);

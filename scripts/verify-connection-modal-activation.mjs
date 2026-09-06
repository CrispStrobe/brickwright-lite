#!/usr/bin/env node
/** Measure first usable Connection-modal UI against P18's accepted eager baseline. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const baselineRun = 34056846253;
const baselineMs = 92.1;
const relativeLimitMs = 105.92;
const absoluteLimitMs = 1000;
const maxLongTaskMs = 100;
const minimumEncodedBytes = 20480;
const output = path.resolve('artifacts/connection-modal-activation');
await mkdir(output, {recursive: true});
const {chromium} = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('crash', () => errors.push('renderer crashed'));

const prepareFaultPage = async faultPage => {
    await faultPage.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
        } catch { /* private mode */ }
    });
    await faultPage.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await faultPage.waitForFunction(() => Boolean(
        window.__brickwrightStore?.getState?.()?.scratchGui?.targets?.editingTarget
    ), null, {timeout: 60000});
    await faultPage.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        window.__BW_CONNECTION_FAULT_CALLS__ = [];
        vm.getPeripheralIsConnected = () => false;
        vm.scanForPeripheral = extensionId => window.__BW_CONNECTION_FAULT_CALLS__.push(['scan', extensionId]);
        vm.disconnectPeripheral = extensionId =>
            window.__BW_CONNECTION_FAULT_CALLS__.push(['disconnect', extensionId]);
    });
};

const openMicroBitModal = faultPage => faultPage.evaluate(() => {
    const store = window.__brickwrightStore;
    store.dispatch({type: 'scratch-gui/connection-modal/setId', extensionId: 'microbit'});
    store.dispatch({type: 'scratch-gui/modals/OPEN_MODAL', modal: 'connectionModal'});
});

const waitForPromise = async (promise, label) => {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 10000);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
};

try {
    await page.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
        } catch { /* private mode */ }
        const probe = window.__BW_CONNECTION_MODAL_PERF__ = {
            longTasks: [],
            calls: [],
            usbCalls: [],
            usbOutcomes: ['failure', 'success']
        };
        Object.defineProperty(navigator, 'usb', {
            configurable: true,
            value: {
                requestDevice: () => {
                    const outcome = probe.usbOutcomes.shift() || 'success';
                    probe.usbCalls.push({active: navigator.userActivation?.isActive === true, outcome});
                    if (outcome === 'failure') return Promise.reject(new Error('CI update failure'));
                    return Promise.resolve(undefined);
                }
            }
        });
        try {
            probe.observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    probe.longTasks.push({at: entry.startTime, ms: entry.duration});
                }
            });
            probe.observer.observe({entryTypes: ['longtask']});
        } catch { /* retain an empty receipt when unsupported */ }
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => Boolean(
        window.__brickwrightStore?.getState?.()?.scratchGui?.targets?.editingTarget
    ), null, {timeout: 60000});
    const beforeRequests = await page.evaluate(() => performance.getEntriesByType('resource')
        .filter(entry => /connection-modal/i.test(entry.name)).length);
    const startedAt = await page.evaluate(() => {
        const store = window.__brickwrightStore;
        const vm = store.getState().scratchGui.vm;
        const probe = window.__BW_CONNECTION_MODAL_PERF__;
        vm.getPeripheralIsConnected = extensionId => {
            probe.calls.push(['is-connected', extensionId]);
            return false;
        };
        vm.scanForPeripheral = extensionId => probe.calls.push(['scan', extensionId]);
        vm.connectPeripheral = (extensionId, peripheralId) =>
            probe.calls.push(['connect', extensionId, peripheralId]);
        vm.disconnectPeripheral = extensionId => probe.calls.push(['disconnect', extensionId]);
        const start = performance.now();
        store.dispatch({type: 'scratch-gui/connection-modal/setId', extensionId: 'microbit'});
        store.dispatch({type: 'scratch-gui/modals/OPEN_MODAL', modal: 'connectionModal'});
        return start;
    });
    await page.getByText('Looking for devices', {exact: true}).waitFor({timeout: 30000});
    await page.getByRole('button', {name: 'Refresh'}).waitFor({timeout: 30000});
    const receipt = await page.evaluate(start => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const readyAt = performance.now();
            const probe = window.__BW_CONNECTION_MODAL_PERF__;
            for (const entry of probe?.observer?.takeRecords?.() || []) {
                probe.longTasks.push({at: entry.startTime, ms: entry.duration});
            }
            const scripts = performance.getEntriesByType('resource')
                .filter(entry => entry.initiatorType === 'script' && entry.startTime >= start)
                .map(entry => ({name: entry.name, startTime: entry.startTime,
                    responseEnd: entry.responseEnd, encodedBodySize: entry.encodedBodySize || 0}));
            const state = window.__brickwrightStore.getState().scratchGui;
            resolve({
                startedAt: start,
                readyAt,
                durationMs: readyAt - start,
                longTasks: (probe?.longTasks || []).filter(task => task.at >= start && task.at <= readyAt),
                scripts,
                calls: probe.calls.slice(),
                extensionId: state.connectionModal.extensionId,
                modalVisible: state.modals.connectionModal,
                dialogs: document.querySelectorAll('[role="dialog"]').length,
                looking: document.body.textContent.includes('Looking for devices'),
                refresh: [...document.querySelectorAll('button')]
                    .some(button => button.textContent.trim() === 'Refresh')
            });
        }));
    }), startedAt);
    receipt.schema = 'brickwright/connection-modal-activation/v1';
    receipt.url = url;
    receipt.errors = errors;
    receipt.beforeRequests = beforeRequests;
    receipt.connectionModalScripts = receipt.scripts.filter(resource => /connection-modal/i.test(resource.name));
    await page.screenshot({path: path.join(output, 'connection-modal.png'), fullPage: true});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.emit('PERIPHERAL_LIST_UPDATE', {
        ci: {peripheralId: 'ci-device', name: 'CI micro:bit', rssi: -42}
    }));
    await page.getByText('CI micro:bit', {exact: true}).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'Connect'}).click();
    await page.getByRole('button', {name: 'Connecting...'}).waitFor({timeout: 10000});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.emit('PERIPHERAL_CONNECTED'));
    await page.getByText('Connected', {exact: true}).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'Disconnect'}).click();
    await page.getByText('Connected', {exact: true}).waitFor({state: 'hidden', timeout: 10000});
    await page.evaluate(() => window.__brickwrightStore.dispatch({
        type: 'scratch-gui/modals/OPEN_MODAL',
        modal: 'connectionModal'
    }));
    await page.getByText('Looking for devices', {exact: true}).waitFor({timeout: 10000});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.emit('PERIPHERAL_REQUEST_ERROR'));
    await page.getByRole('button', {name: 'Try again'}).click();
    await page.getByText('Looking for devices', {exact: true}).waitFor({timeout: 10000});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.emit('PERIPHERAL_SCAN_TIMEOUT'));
    await page.getByRole('button', {name: 'Update my Device'}).click();
    await page.getByRole('button', {name: 'Do Update'}).click();
    await page.getByText('Update failed.', {exact: true}).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'Try Again'}).click();
    await page.getByText('Update successful!', {exact: true}).waitFor({timeout: 10000});
    receipt.updateFlow = await page.evaluate(() => ({
        usbCalls: window.__BW_CONNECTION_MODAL_PERF__.usbCalls.slice(),
        calls: window.__BW_CONNECTION_MODAL_PERF__.calls.slice()
    }));
    await page.getByRole('button', {name: 'Go Back'}).click();
    await page.getByText('Looking for devices', {exact: true}).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'Close'}).click();
    await page.getByText('Looking for devices', {exact: true}).waitFor({state: 'hidden', timeout: 10000});
    receipt.afterClose = await page.evaluate(() => ({
        modalVisible: window.__brickwrightStore.getState().scratchGui.modals.connectionModal,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        calls: window.__BW_CONNECTION_MODAL_PERF__.calls.slice()
    }));
    await page.evaluate(() => window.__brickwrightStore.dispatch({
        type: 'scratch-gui/modals/OPEN_MODAL',
        modal: 'connectionModal'
    }));
    await page.getByText('Looking for devices', {exact: true}).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'Refresh'}).waitFor({timeout: 10000});
    receipt.afterReopen = await page.evaluate(() => ({
        connectionModalScripts: performance.getEntriesByType('resource')
            .filter(entry => entry.initiatorType === 'script' && /connection-modal/i.test(entry.name))
            .map(entry => ({name: entry.name, encodedBodySize: entry.encodedBodySize || 0})),
        calls: window.__BW_CONNECTION_MODAL_PERF__.calls.slice()
    }));
    await page.getByRole('button', {name: 'Close'}).click();
    receipt.baseline = {run: baselineRun, durationMs: baselineMs};
    receipt.limits = {relativeMs: relativeLimitMs, absoluteMs: absoluteLimitMs,
        maxLongTaskMs, minimumEncodedBytes};

    const retryContext = await browser.newContext({
        viewport: {width: 1200, height: 800},
        serviceWorkers: 'block'
    });
    const retryPage = await retryContext.newPage();
    let retryRequests = 0;
    await retryPage.route(/connection-modal.*\.js(?:\?|$)/, route => {
        retryRequests += 1;
        if (retryRequests === 1) return route.abort('failed');
        return route.continue();
    });
    await prepareFaultPage(retryPage);
    await openMicroBitModal(retryPage);
    await retryPage.locator('[data-connection-modal-load-error]').waitFor({timeout: 10000});
    const retryErrorWasClosable = await retryPage.getByRole('button', {name: 'Close'}).isVisible();
    await retryPage.getByRole('button', {name: 'Retry connection tools'}).click();
    await retryPage.getByText('Looking for devices', {exact: true}).waitFor({timeout: 10000});
    receipt.importRetry = await retryPage.evaluate(requests => ({
        requests,
        scans: window.__BW_CONNECTION_FAULT_CALLS__.filter(call => call[0] === 'scan').length
    }), retryRequests);
    receipt.importRetry.errorWasClosable = retryErrorWasClosable;
    await retryContext.close();

    const delayContext = await browser.newContext({
        viewport: {width: 1200, height: 800},
        serviceWorkers: 'block'
    });
    const delayPage = await delayContext.newPage();
    let releaseChunk;
    const chunkReleased = new Promise(resolve => { releaseChunk = resolve; });
    let announceChunk;
    const chunkRequested = new Promise(resolve => { announceChunk = resolve; });
    let delayedRequests = 0;
    await delayPage.route(/connection-modal.*\.js(?:\?|$)/, async route => {
        delayedRequests += 1;
        announceChunk();
        await chunkReleased;
        await route.continue();
    });
    await prepareFaultPage(delayPage);
    await openMicroBitModal(delayPage);
    await waitForPromise(chunkRequested, 'the held Connection-modal request');
    await delayPage.evaluate(() => window.__brickwrightStore.dispatch({
        type: 'scratch-gui/modals/CLOSE_MODAL',
        modal: 'connectionModal'
    }));
    const closedWhilePending = await delayPage.evaluate(() => ({
        visible: window.__brickwrightStore.getState().scratchGui.modals.connectionModal,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        calls: window.__BW_CONNECTION_FAULT_CALLS__.slice()
    }));
    releaseChunk();
    await openMicroBitModal(delayPage);
    await delayPage.getByText('Looking for devices', {exact: true}).waitFor({timeout: 10000});
    receipt.closeBeforeResolution = await delayPage.evaluate(({closed, requests}) => ({
        closed,
        requests,
        calls: window.__BW_CONNECTION_FAULT_CALLS__.slice()
    }), {closed: closedWhilePending, requests: delayedRequests});
    await delayContext.close();

    await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    if (errors.length) throw new Error(errors.join(' | '));
    if (beforeRequests !== 0 || receipt.connectionModalScripts.length !== 1) {
        throw new Error('the lazy modal must be absent at startup and fetch exactly one named chunk on first open');
    }
    if (receipt.connectionModalScripts[0].encodedBodySize < minimumEncodedBytes) {
        throw new Error(`Connection-modal chunk was only ${receipt.connectionModalScripts[0].encodedBodySize} encoded bytes`);
    }
    if (receipt.durationMs > relativeLimitMs || receipt.durationMs > absoluteLimitMs) {
        throw new Error(`Connection modal took ${receipt.durationMs.toFixed(2)} ms; limits are ` +
            `${relativeLimitMs} ms relative and ${absoluteLimitMs} ms absolute`);
    }
    const slowTasks = receipt.longTasks.filter(task => task.ms > maxLongTaskMs);
    if (slowTasks.length) throw new Error(`Connection-modal activation had ${slowTasks.length} long task(s)`);
    if (receipt.extensionId !== 'microbit' || !receipt.modalVisible || receipt.dialogs !== 1 ||
        !receipt.looking || !receipt.refresh) {
        throw new Error('Connection modal did not reach usable scanning UI');
    }
    if (receipt.updateFlow.usbCalls.length !== 2 ||
        receipt.updateFlow.usbCalls.some(call => !call.active) ||
        receipt.updateFlow.usbCalls.map(call => call.outcome).join(',') !== 'failure,success') {
        throw new Error('firmware failure/retry did not retain transient WebUSB activation');
    }
    const connects = receipt.updateFlow.calls.filter(call =>
        call[0] === 'connect' && call[1] === 'microbit' && call[2] === 'ci-device').length;
    if (connects !== 1) throw new Error(`expected one deterministic micro:bit connection, got ${connects}`);
    const scans = receipt.calls.filter(call => call[0] === 'scan' && call[1] === 'microbit').length;
    if (scans !== 1) throw new Error(`expected one micro:bit scan, got ${scans}`);
    const disconnects = receipt.afterClose.calls
        .filter(call => call[0] === 'disconnect' && call[1] === 'microbit').length;
    if (receipt.afterClose.modalVisible || receipt.afterClose.dialogs || disconnects !== 2) {
        throw new Error('closing the Connection modal did not disconnect and unmount it');
    }
    if (receipt.afterReopen.connectionModalScripts.length !== 1) {
        throw new Error('reopening the Connection modal downloaded its module again');
    }
    const reopenedScans = receipt.afterReopen.calls
        .filter(call => call[0] === 'scan' && call[1] === 'microbit').length;
    if (reopenedScans !== 5) {
        throw new Error(`the complete connection journey and reopening should total five scans, got ${reopenedScans}`);
    }
    if (!receipt.importRetry.errorWasClosable || receipt.importRetry.requests !== 2 ||
        receipt.importRetry.scans !== 1) {
        throw new Error('aborted Connection-modal import did not expose a closable, retryable recovery');
    }
    const pendingScans = receipt.closeBeforeResolution.closed.calls.filter(call => call[0] === 'scan').length;
    const resumedScans = receipt.closeBeforeResolution.calls.filter(call => call[0] === 'scan').length;
    if (receipt.closeBeforeResolution.closed.visible || receipt.closeBeforeResolution.closed.dialogs ||
        pendingScans || receipt.closeBeforeResolution.closed.calls.length ||
        receipt.closeBeforeResolution.requests !== 1 || resumedScans !== 1) {
        throw new Error('closing before Connection-modal resolution left stale UI, work, or another download');
    }
} catch (error) {
    await writeFile(path.join(output, 'failure.json'), `${JSON.stringify({
        schema: 'brickwright/connection-modal-activation-failure/v1',
        message: error.message,
        stack: error.stack,
        errors
    }, null, 2)}\n`);
    await page.screenshot({path: path.join(output, 'failure.png'), fullPage: true}).catch(() => {});
    throw error;
} finally {
    await browser.close();
}

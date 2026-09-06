#!/usr/bin/env node
/** Measure first usable Connection-modal UI; the eager run establishes P18's baseline. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const output = path.resolve('artifacts/connection-modal-activation');
await mkdir(output, {recursive: true});
const {chromium} = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('crash', () => errors.push('renderer crashed'));

try {
    await page.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
        } catch { /* private mode */ }
        const probe = window.__BW_CONNECTION_MODAL_PERF__ = {longTasks: [], calls: []};
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
    await page.getByRole('button', {name: 'Close'}).click();
    await page.getByText('Looking for devices', {exact: true}).waitFor({state: 'hidden', timeout: 10000});
    receipt.afterClose = await page.evaluate(() => ({
        modalVisible: window.__brickwrightStore.getState().scratchGui.modals.connectionModal,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        calls: window.__BW_CONNECTION_MODAL_PERF__.calls.slice()
    }));
    await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    if (errors.length) throw new Error(errors.join(' | '));
    if (beforeRequests !== 0 || receipt.connectionModalScripts.length !== 0) {
        throw new Error('the eager baseline unexpectedly fetched a Connection-modal chunk');
    }
    if (receipt.extensionId !== 'microbit' || !receipt.modalVisible || receipt.dialogs !== 1 ||
        !receipt.looking || !receipt.refresh) {
        throw new Error('Connection modal did not reach usable scanning UI');
    }
    const scans = receipt.calls.filter(call => call[0] === 'scan' && call[1] === 'microbit').length;
    if (scans !== 1) throw new Error(`expected one micro:bit scan, got ${scans}`);
    const disconnects = receipt.afterClose.calls
        .filter(call => call[0] === 'disconnect' && call[1] === 'microbit').length;
    if (receipt.afterClose.modalVisible || receipt.afterClose.dialogs || disconnects !== 1) {
        throw new Error('closing the Connection modal did not disconnect and unmount it');
    }
} finally {
    await browser.close();
}

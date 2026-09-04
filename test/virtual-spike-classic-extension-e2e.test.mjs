// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');
globalThis.window = globalThis;
globalThis.navigator = {language: 'en', languages: ['en']};
globalThis.document = {documentElement: {lang: 'en'}};
globalThis.localStorage = {getItem: () => null};
globalThis.addEventListener = () => {};
const realInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;

const here = dirname(fileURLToPath(import.meta.url));
const root = '../overlay/scratch-gui/src/lib/virtual-hub/';
const {default: HubState} = await import(resolve(here, `${root}spike-hub-state.js`));
const {VirtualSpikeClassicSocket} = await import(resolve(here, `${root}spike-classic-scratch-link.js`));
const tick = () => new Promise(resolvePromise => setTimeout(resolvePromise, 0));

class ScratchLinkSocketAdapter {
    constructor (hubState) { this.hubState = hubState; this.opened = false; }
    setOnOpen (value) { this.onOpen = value; }
    setOnClose (value) { this.onClose = value; }
    setOnError (value) { this.onError = value; }
    setHandleMessage (value) { this.handleMessage = value; }
    open () {
        this.socket = new VirtualSpikeClassicSocket('ws://127.0.0.1:20111/scratch/bt', {hubState: this.hubState});
        this.socket.onopen = () => { this.opened = true; this.onOpen(); };
        this.socket.onmessage = event => this.handleMessage(JSON.parse(event.data));
        this.socket.onclose = event => { this.opened = false; if (this.onClose) this.onClose(event); };
    }
    sendMessage (value) { this.socket.send(JSON.stringify(value)); }
    isOpen () { return this.opened; }
    close () { this.socket.close(); }
}

test('bundled Classic extension uses corrected base64 RFCOMM end to end', async t => {
    t.after(() => { globalThis.setInterval = realInterval; });
    const hubState = new HubState();
    let adapter;
    const runtime = {
        constructor: {PERIPHERAL_CONNECTED: 'connected', PERIPHERAL_DISCONNECTED: 'disconnected',
            PERIPHERAL_LIST_UPDATE: 'list', USER_PICKED_PERIPHERAL: 'picked', PERIPHERAL_SCAN_TIMEOUT: 'timeout'},
        getLocale: () => 'en', emit: () => {}, on: () => {}, registerPeripheralExtension: () => {},
        getScratchLinkSocket: kind => {
            assert.equal(kind, 'BT');
            adapter = new ScratchLinkSocketAdapter(hubState);
            return adapter;
        }
    };
    const wrapper = await readFile(resolve(here,
        '../overlay/scratch-vm/src/extensions/crispstrobe/spikeprimeBTC/index.js'), 'utf8');
    const source = JSON.parse(wrapper.slice(wrapper.indexOf('makeExt(') + 8, -3));
    let extension;
    const Scratch = {extensions: {unsandboxed: true, register: value => { extension = value; }},
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
        ArgumentType: {STRING: 'string', NUMBER: 'number', BOOLEAN: 'Boolean'},
        Cast: {toString: String, toNumber: Number}, vm: {runtime}};
    Function('Scratch', source)(Scratch); // eslint-disable-line no-new-func
    extension._peripheral.scan();
    await tick();
    extension._peripheral.connect('brickwright-virtual-spike-classic');
    await tick();
    assert.equal(extension._peripheral.isConnected(), true);
    extension.motorSetSpeed({PORT: 'C', SPEED: 55});
    await extension.motorStart({PORT: 'C', DIRECTION: 1});
    assert.equal(hubState.data.motors[2].speed, 55);
    await extension.setPixel({X: 2, Y: 3, BRIGHTNESS: 100});
    assert.equal(hubState.data.display[11], 9);
    hubState.setPort('B', 'distance', {distance: 222});
    adapter.socket.emitCurrentState();
    assert.equal(extension.getDistance({PORT: 'B'}), 222);
    extension._peripheral.disconnect();
    assert.equal(hubState.data.motors[2].speed, 0);
});

// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const bundle = await readFile(resolve(import.meta.dirname,
    '../overlay/scratch-vm/src/extensions/crispstrobe/spikeprime/index.js'), 'utf8');
const source = JSON.parse(bundle.slice(bundle.indexOf('makeExt(') + 8, -3));

const loadInfo = locale => {
    let extension = null;
    globalThis.window = globalThis;
    globalThis.ReduxStore = {getState: () => ({locales: {locale}})};
    globalThis.localStorage = {getItem: () => null};
    Object.defineProperty(globalThis, 'navigator', {
        value: {language: locale}, configurable: true, writable: true
    });
    globalThis.document = {documentElement: {lang: locale}};
    globalThis.addEventListener = () => {};
    globalThis.setInterval = () => 0;
    const runtime = {
        getLocale: () => locale, on: () => {}, emit: () => {}, registerPeripheralExtension: () => {},
        constructor: {
            PERIPHERAL_CONNECTED: 'connected', PERIPHERAL_DISCONNECTED: 'disconnected',
            PERIPHERAL_LIST_UPDATE: 'list', USER_PICKED_PERIPHERAL: 'picked',
            PERIPHERAL_SCAN_TIMEOUT: 'timeout', PERIPHERAL_REQUEST_ERROR: 'error'
        }
    };
    const Scratch = {
        extensions: {unsandboxed: true, register: value => { extension = value; }},
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
        ArgumentType: {STRING: 'string', NUMBER: 'number', BOOLEAN: 'Boolean'},
        Cast: {toString: String, toNumber: Number}, vm: {runtime}
    };
    const oldLog = console.log;
    console.log = () => {};
    try {
        Function('Scratch', source)(Scratch); // eslint-disable-line no-new-func
        return extension.getInfo();
    } finally {
        console.log = oldLog;
    }
};

test('localized SPIKE labels cannot merge with the prepended icon placeholder', () => {
    for (const locale of ['en', 'de', 'fr']) {
        const info = loadInfo(locale);
        const block = info.blocks.find(candidate => candidate && candidate.opcode === 'setLightMatrixPixel');
        assert.ok(block, `${locale}: missing setLightMatrixPixel`);
        const names = [];
        const converted = block.text.replace(/\[(.+?)]/g, (_match, name) => {
            if (!names.includes(name)) names.push(name);
            return `%${names.indexOf(name) + 3}`; // %1 and %2 are the icon and separator.
        });
        const message = `%1 %2${converted}`; // Matches Runtime._convertBlockForScratchBlocks.
        const indexes = [...message.matchAll(/%(\d+)/g)].map(match => Number(match[1]));
        const argCount = names.length + 2;
        assert.ok(indexes.every(index => index <= argCount),
            `${locale}: ${JSON.stringify(message)} contains an out-of-range Blockly message index`);
    }
});

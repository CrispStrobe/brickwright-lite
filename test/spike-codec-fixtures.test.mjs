// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(await readFile(resolve(here, 'fixtures/spike-cobs-v1.json'), 'utf8'));
const modulePath = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub/spike-prime-peripheral.js');
const {packSpikeFrame, unpackSpikeFrame} = await import(modulePath);
const bytes = hex => Uint8Array.from(hex.match(/../g)?.map(value => Number.parseInt(value, 16)) || []);
const hex = value => Buffer.from(value).toString('hex');

for (const vector of fixture.vectors) {
    test(`SPIKE codec fixture: ${vector.name}`, () => {
        assert.equal(hex(packSpikeFrame(bytes(vector.payload_hex))), vector.frame_hex);
        assert.equal(hex(unpackSpikeFrame(bytes(vector.frame_hex))), vector.payload_hex);
    });
}

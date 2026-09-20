// SPDX-License-Identifier: Apache-2.0
//
// The spikeprime bundle is generated from its readable source. If the two can
// drift, the readable file is decoration and the string is the real program —
// which is the situation this arrangement exists to prevent.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILT_FROM_SOURCE, bundlePath, readSource, renderBundle} from '../scripts/spike/build-bundle.mjs';

for (const id of BUILT_FROM_SOURCE) {
    test(`${id}/index.js is exactly what ${id}/source.js renders to`, () => {
        assert.equal(
            readFileSync(bundlePath(id), 'utf8'),
            renderBundle(readSource(id)),
            `run: node scripts/spike/build-bundle.mjs`);
    });
}

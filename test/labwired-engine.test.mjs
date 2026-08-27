/**
 * The heavy tier's availability probe.
 *
 * The engine is a 20 MB artifact fetched by `npm run sync:labwiredwasm`, so
 * whether it exists is a BUILD-time choice and whether it can be offered is
 * therefore a RUNTIME question. Two properties matter, and both are about not
 * lying:
 *
 *   1. Absence is an ANSWER, not an exception. A checkout that never fetched
 *      the artifact must get `null` and a reason — not a thrown error that a
 *      caller has to wrap, and not a picker entry that fails when clicked.
 *   2. The build must not depend on it. That one is enforced by the
 *      `webpackIgnore` comment on the import, asserted here because deleting it
 *      is a one-character edit that turns a 20 MB optional download into a hard
 *      build dependency of the whole app — and nothing else would notice.
 */
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../overlay/scratch-gui/src/lib/labwired-engine.js');

describe('labwired engine loader', () => {
    test('outside a browser it answers "not available", and says why', async () => {
        const {loadLabwired, isLabwiredAvailable, _resetLabwiredCache} = await import(SRC);
        _resetLabwiredCache();
        assert.equal(await loadLabwired(), null, 'absence must not throw');
        assert.match(loadLabwired.lastError, /browser-only/,
            'the reason must name the actual cause, not a URL parse failure');
        assert.equal(await isLabwiredAvailable(), false);
    });

    test('a failed load is remembered, not retried on every call', async () => {
        const {loadLabwired, _resetLabwiredCache} = await import(SRC);
        _resetLabwiredCache();
        await loadLabwired();
        const first = loadLabwired.lastError;
        delete loadLabwired.lastError;
        await loadLabwired();
        assert.equal(loadLabwired.lastError, undefined,
            'the second call re-ran the load; a 20 MB fetch must not repeat per keystroke');
        assert.ok(first, 'the first call should have recorded a reason');
    });

    test('the import is webpackIgnore\'d, so a build without the artifact still compiles', () => {
        const src = readFileSync(SRC, 'utf8');
        assert.match(src, /import\(\s*\/\* webpackIgnore: true \*\/\s*glue\s*\)/,
            'the dynamic import lost its webpackIgnore. Webpack would then resolve the path at '
            + 'BUILD time, so every build would need the 20 MB artifact present or fail to '
            + 'compile — the opposite of an on-demand engine.');
    });

    test('it loads from static/, which webpack copies wholesale', () => {
        const src = readFileSync(SRC, 'utf8');
        assert.match(src, /static\/labwired\/labwired_wasm\.js/);
        assert.match(src, /static\/labwired\/labwired_wasm_bg\.wasm/);
        assert.doesNotMatch(src, /generated\/labwired/,
            'src/generated is bundled by webpack; the point of static/ is that it is not');
    });
});

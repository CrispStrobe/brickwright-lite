import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('boot payload accepts shared lazy engine bytes but rejects eager, absent and map-only markers', () => {
    const build = mkdtempSync(join(tmpdir(), 'boot-payload-'));
    const marker = 'no RAM, ROM, VIA or ACIA on the board';
    const put = (name, text) => writeFileSync(join(build, name), text);
    const run = () => spawnSync(process.execPath, [resolve('scripts/verify-boot-payload.mjs')], {
        env: {...process.env, BW_BUILD: build}, encoding: 'utf8'
    });
    try {
        mkdirSync(join(build, 'chunks'));
        put('index.html', '<script src="gui.js"></script>');
        put('gui.js', '_bwFontWait');
        for (const [name, bytes] of Object.entries({
            'ext-music': "'drums/1-snare.mp3'", 'render-fonts': 'x-font-ttf',
            'ext-legonxt': 'ID: legonxt', 'ext-spikeprime': 'ID: spikeprime\n',
            'asset-library-index': '"name":"Abby"',
            'bw-circuit-ui': 'Check the address decode wiring on the breadboard. Could not recognise this file',
            'bw-board': 'entry', 'guided-lessons': 'optional', '8933.hash': marker
        })) put(`chunks/${name}.js`, bytes);
        let result = run();
        assert.equal(result.status, 0, result.stdout + result.stderr);
        put('gui.js', `_bwFontWait ${marker}`);
        result = run();
        assert.equal(result.status, 1);
        assert.match(result.stdout, /FAIL 6502 bus extractor .*not in the first load/);
        put('gui.js', '_bwFontWait');
        put('chunks/8933.hash.js', 'absent');
        assert.equal(run().status, 1);
        put('chunks/8933.hash.js.map', marker);
        assert.equal(run().status, 1, 'source maps must not provide the positive control');
        put('chunks/8933.hash.js', marker);
        put('index.html', '<script src="gui.js"></script><script src="chunks/8933.hash.js"></script>');
        assert.equal(run().status, 1, 'HTML-loaded shared chunks are eager');
        put('index.html', '<script src="gui.js"></script><link rel="preload" as="script" href="chunks/8933.hash.js">');
        assert.equal(run().status, 1, 'shared payload preload links also refuse');
        put('index.html', '<script src="gui.js"></script>');
        rmSync(join(build, 'chunks/bw-board.js'));
        assert.equal(run().status, 1, 'the named entry chunk is still required');
    } finally {rmSync(build, {recursive: true, force: true});}
});

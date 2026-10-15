/**
 * scripts/gen-hosted-targets.mjs reads stc-compiler's optional ESP8266_TARGETS
 * dict (plan N13). The committed snapshot is NOT asserted to list esp8266:
 * production does not serve that target yet, and the conformance gate keeps
 * the ESP8266 C cell open until a refresh against the deployed source adds it.
 * These cases run the generator on authored app.py fixtures in a throwaway
 * git repository (the generator records the checkout's HEAD sha).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

import {build, OPTIONAL_COMPILE_DICTS} from '../scripts/gen-hosted-targets.mjs';

const BASE = 'TARGETS = {"stc12c5a60s2": {}}\nAVR_TARGETS = {"atmega328p": {}}\n'
    + 'ARM_TARGETS = {"rp2040": {}, "stm32f030": {}}\nEATER_TARGETS = {"eater6502": {}}\n'
    + 'Z80_TARGETS = {"z80": {}}\nASSEMBLE_TARGETS = {"z80": "z80"}\n';

function fixture (appPy) {
    const dir = mkdtempSync(join(tmpdir(), 'stc-esp-'));
    writeFileSync(join(dir, 'app.py'), appPy);
    const git = args => execFileSync('git', ['-C', dir, ...args], {stdio: 'pipe'});  // gate-shapes-allow: the repository is the one this test just created
    git(['init', '-q']);
    git(['add', 'app.py']);
    git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
    return dir;
}

test('the generator names ESP8266_TARGETS as the esp8266 compile family', () => {
    assert.equal(OPTIONAL_COMPILE_DICTS.esp8266, 'ESP8266_TARGETS');
});

test('a checkout that lists ESP8266_TARGETS yields compile.esp8266 = its keys', () => {
    const dir = fixture(BASE + 'ESP8266_TARGETS = {\n    "esp8266": {"description": "ESP8266 (LX106)"},\n}\n');
    try {
        const doc = build(dir, '2026-10-15');
        assert.deepEqual(doc.compile.esp8266, ['esp8266']);
        assert.deepEqual(doc.compile.arm, ['rp2040', 'stm32f030'], 'the required families are unchanged');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('a checkout without ESP8266_TARGETS (the snapshot\'s source) adds no esp8266 family and is not refused', () => {
    const dir = fixture(BASE);
    try {
        const doc = build(dir, '2026-10-15');
        assert.equal(Object.hasOwn(doc.compile, 'esp8266'), false);
        assert.deepEqual(Object.keys(doc.compile).sort(), ['6502', '8051', 'arm', 'avr', 'z80']);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

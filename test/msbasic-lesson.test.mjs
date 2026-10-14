// The Microsoft BASIC (6502) lesson: Microsoft's MIT-released 1978 6502 BASIC
// offered as a one-click machine in the Machine Manager. Its media is
// self-contained — the 32 KB ROM ships in this app (static/roms), nothing is
// fetched from media-lab — but like every lesson it is still gated by the
// machine-image policy axis. Checks the config (incl. the inline eater6502 ACIA
// machineConfig), its activation, and bilingual strings. The live boot is
// proven by the media-lab project's own proof.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    lessonMachines, lessonT, LESSON_STRINGS
} from '../overlay/scratch-gui/src/lib/bw-machines/lessons.js';
import {validateMachineConfig, MACHINE_KINDS} from '../overlay/scratch-gui/src/lib/bw-machines/machine-config.js';
import {activateConfig} from '../overlay/scratch-gui/src/lib/bw-machines/activate.js';

const msRow = (loc = 'en') => lessonMachines(loc).find(r => r.config.id === 'lesson-msbasic-6502');

test('MS BASIC lesson: a valid, self-contained eater6502 ROM config', () => {
    const row = msRow();
    assert.ok(row, 'the MS BASIC lesson is offered');
    const {config} = row;
    assert.ok(MACHINE_KINDS.includes('eater6502'));
    assert.deepEqual(validateMachineConfig(config), {ok: true, errors: []});
    assert.equal(config.machine, 'eater6502');
    assert.equal(config.bootOrder[0], 'rom');
    assert.deepEqual(Object.keys(config.slots), ['rom']);
    assert.ok(!row.coldConfig);
    // The ACIA the BASIC console talks to must be in the inline machineConfig.
    const chips = (config.machineConfig && config.machineConfig.chips) || [];
    assert.ok(chips.some(c => c.kind === 'acia'), 'the inline machineConfig supplies the ACIA console');
});

test('MS BASIC lesson: SELF-CONTAINED — the ROM is a same-origin static asset', () => {
    const ref = msRow().config.slots.rom;
    assert.ok(/^static\/roms\/msbasic-6502\.rom$/.test(ref.url), `ROM is a same-origin static asset (${ref.url})`);
    assert.ok(!/^https?:/.test(ref.url), 'not fetched over the network');
    assert.match(ref.sha256, /^[0-9a-f]{64}$/, 'the ROM carries a SHA-256 pin');
});

test('MS BASIC lesson: activates into the eater6502 boot', async () => {
    const {config} = msRow();
    const asked = [];
    const fetcher = async ref => { asked.push(ref.url); return {bytes: new Uint8Array(32768), sha256: ref.sha256}; };
    const activated = await activateConfig(config, {fetcher});
    assert.equal(activated.targetKind, 'eater6502', 'folds onto the eater6502 debug target');
    assert.equal(activated.bootMedia.slot, 'rom');
    assert.ok(asked.some(u => /static\/roms\/msbasic-6502\.rom$/.test(u)), 'the ROM is fetched by url');
});

test('MS BASIC lesson: strings resolve in EN and DE with matching keys', () => {
    for (const loc of ['en', 'de']) {
        const row = msRow(loc);
        assert.ok(row.summary && row.summary !== 'msbasic.summary', `${loc} summary resolves`);
        assert.match(row.licence, /MIT/);
        assert.ok(row.source && /ms-basic-6502/.test(row.source), 'source links the media-lab project');
    }
    const en = Object.keys(LESSON_STRINGS.en).filter(k => k.startsWith('msbasic.')).sort();
    const de = Object.keys(LESSON_STRINGS.de).filter(k => k.startsWith('msbasic.')).sort();
    assert.deepEqual(en, de, 'msbasic.* keys match across locales');
    assert.ok(en.length >= 3);
    for (const k of en) {
        assert.notEqual(lessonT('en', k), k, `${k} resolves in EN`);
        assert.notEqual(lessonT('de', k), k, `${k} resolves in DE`);
    }
});

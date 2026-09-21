// SPDX-License-Identifier: Apache-2.0
//
// The Code tab must still round-trip every SPIKE block after the merge.
//
// SB3Creator.runtimeOp() looks an opcode up in RUNTIME_EXTENSIONS and returns
// null when there is no entry — at which point the block is simply not emitted.
// UNTIL 2026-09-21 the vendored registry still described the five pre-merge
// extensions, so a unified entry was derived from the shipping extension and
// MERGED over it at sb3-creator-register-art.js. sb3-creator has since
// regenerated its registry against the unified extension, the merge became a
// no-op and was removed — but the derivation was KEPT, and this file is why.
//
// It is now a drift gate rather than the check on an arrangement. Two
// independent derivations of the same surface have to agree:
//
//   A. the VENDORED entry, produced by sb3-creator executing the upstream
//      extension's getInfo() at its pin, and
//   B. the DERIVED table, produced here by executing the bundle Lite actually
//      ships.
//
// Nothing makes them agree; they agree because they describe the same
// extension, and a divergence means Lite's bundle and sb3-creator's pin have
// drifted apart. Deleting B along with the merge would have removed the only
// thing that could notice.
//
//   1. the derived entry matches the extension that actually ships; and
//   2. every opcode the migration can produce has an entry, so no project
//      loses blocks in the Code tab by being migrated.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {quietConsole} from './helpers/quiet-console.mjs';
import {buildEntry, render} from '../scripts/spike/gen-runtime-ops.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);

quietConsole();

const opsPath = resolve(root, 'overlay/scratch-gui/src/lib/spike-runtime-ops.js');
const checkedIn = (await import(opsPath)).default;
const ledger = require('./fixtures/spike-legacy-ledger.json');
const migration = await import('../overlay/scratch-gui/src/lib/spike-legacy-migration.js');

test('the checked-in ops match the extension that ships', () => {
    assert.deepEqual(checkedIn, buildEntry(),
        'run: node scripts/spike/gen-runtime-ops.mjs');
    // Rendered exactly as the generator renders it, so "regenerate" is always
    // a no-op diff when nothing changed.
    assert.equal(readFileSync(opsPath, 'utf8'), render(buildEntry()));
});

test('every opcode the migration can produce has a registry entry', () => {
    // The regression this exists to prevent: a legacy block migrates onto a
    // unified opcode, and the Code tab silently drops it because the pinned
    // registry never heard of it.
    const missing = [];
    for (const [legacyId, ext] of Object.entries(ledger.extensions)) {
        for (const block of ext.blocks) {
            const resolved = migration.resolveOpcode(`${legacyId}_${block.opcode}`);
            const opcode = resolved.opcode.slice('spikeprime_'.length);
            if (!checkedIn.ops[opcode]) missing.push(`${legacyId}_${block.opcode} -> ${opcode}`);
        }
    }
    assert.deepEqual(missing, [], 'these would stop round-tripping through the Code tab');
});

test('argument order is preserved, because the emitter reads them positionally', () => {
    assert.deepEqual(checkedIn.ops.motorRunFor.args, ['PORT', 'DIRECTION', 'VALUE', 'UNIT']);
    assert.deepEqual(checkedIn.ops.setLightMatrixPixel.args, ['PORT', 'X', 'Y', 'BRIGHTNESS']);
    assert.deepEqual(checkedIn.ops.getDistanceIn.args, ['PORT', 'UNIT']);
});

test('block kinds map to the three sb3-creator knows', () => {
    const kinds = new Set(Object.values(checkedIn.ops).map(op => op.kind));
    for (const kind of kinds) {
        assert.ok(['command', 'reporter', 'boolean', 'hat'].includes(kind), `unknown kind ${kind}`);
    }
    assert.equal(checkedIn.ops.isConnected.kind, 'boolean');
    assert.equal(checkedIn.ops.whenGesture.kind, 'hat');
    assert.equal(checkedIn.ops.getBatteryLevel.kind, 'reporter');
    assert.equal(checkedIn.ops.displayClear.kind, 'command');
});

test('the four dead ids are dropped rather than left resolvable', () => {
    // Read as text: importing the module would pull in the 886 kB compiler.
    // What matters is that the deletion is written and reaches every call
    // site, which is what putting it in this module buys.
    const door = readFileSync(
        resolve(root, 'overlay/scratch-gui/src/lib/sb3-creator-register-art.js'), 'utf8');
    assert.match(door, /delete SB3Creator\.RUNTIME_EXTENSIONS\[legacyId\];/,
        'the legacy entries must be removed');
    // And the merge that used to sit beside it must NOT come back. It is a
    // no-op now, so re-adding it would be invisible in behaviour and would
    // quietly re-establish "the two agree because one was overwritten by the
    // other" in place of the drift gate below.
    assert.doesNotMatch(door, /RUNTIME_EXTENSIONS\.spikeprime\s*=/,
        'the unified entry is vendored now; overwriting it at runtime would hide drift ' +
        'between Lite\'s bundle and the sb3-creator pin instead of failing on it');
    for (const legacyId of migration.LEGACY_IDS) {
        assert.ok(!Object.prototype.hasOwnProperty.call(checkedIn.ops, legacyId));
    }
});

test('DRIFT GATE: the vendored registry and the shipping bundle describe the same extension', async () => {
    // The property the removed merge used to ARRANGE, now CHECKED. If
    // sb3-creator's pin moves to a commit whose extension differs from the
    // bundle Lite vendors, these two stop matching and this fails by name —
    // where before, the merge would have silently papered over it.
    const vendored = (await import(
        resolve(root, 'overlay/scratch-gui/src/lib/sb3-creator-runtime.js'))).RUNTIME_EXTENSIONS;
    const entry = vendored.spikeprime;
    assert.ok(entry, 'the vendored registry no longer carries a spikeprime entry at all — ' +
        'the sb3-creator pin has gone back to a commit that predates the consolidation');

    assert.deepEqual(Object.keys(entry.ops).sort(), Object.keys(checkedIn.ops).sort(),
        'the vendored opcode set and the shipping bundle\'s disagree');
    const differing = Object.keys(checkedIn.ops)
        .filter(op => JSON.stringify(entry.ops[op]) !== JSON.stringify(checkedIn.ops[op]));
    assert.deepEqual(differing, [],
        'same opcodes, different signatures — argument order or block kind has drifted');

    // sb3-creator KEEPS the four legacy ids (projects in the wild carry them),
    // which is exactly why the deletion above is not symmetric with the merge
    // that was removed. Asserted so that a future sb3-creator dropping them
    // shows up here as information rather than as a silent change of meaning.
    const stillThere = migration.LEGACY_IDS.filter(id => vendored[id]);
    assert.deepEqual(stillThere, [...migration.LEGACY_IDS],
        'sb3-creator no longer registers the legacy SPIKE ids; the deletion in the door ' +
        'is now redundant and should be re-examined rather than left running on nothing');
});

test('the vendored registry is not edited', () => {
    // It is judged byte-for-byte against the sb3-creator pin. If this merge is
    // ever "simplified" into editing it, that gate fails somewhere far from
    // here; saying so at the scene is cheaper.
    const vendored = readFileSync(
        resolve(root, 'overlay/scratch-gui/src/lib/sb3-creator-runtime.js'), 'utf8');
    // The first line, not a character window: a window silently stops
    // checking anything once the file's preamble grows past it.
    assert.match(vendored.split('\n', 1)[0], /GENERATED by scripts\/gen-runtime-registry\.mjs/);
    assert.ok(vendored.includes('"spikeprimeble"'),
        'the vendored file still describes the pre-merge world, and that is correct: ' +
        'it is pinned, and the unified entry is merged over it at runtime');
});

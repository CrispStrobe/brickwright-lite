import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {patchArcadeExceptions} from '../scripts/lib/arcade-exception-hooks.mjs';
const engine=()=>readFileSync(path.join(INTEGRATED,'node_modules/scratch-vm/src/engine/execute.js'),'utf8');

test('exception installer validates executable settlement hooks and is idempotent',()=>{
    const source=engine(),patched=patchArcadeExceptions(source);
    assert.equal(patchArcadeExceptions(patched),patched);
    for(const original of [
        'if (!bwArcadeExceptions.consume(sequencer.runtime, thread, error)) throw error;',
        'if (bwArcadeExceptions.stale(sequencer.runtime, thread, bwExceptionLease)) return;',
        'if (bwArcadeExceptions.consume(sequencer.runtime, thread, rejectionReason) || bwArcadeExceptions.stale(sequencer.runtime, thread, bwExceptionLease)) return;'
    ]) {
        assert.ok(patched.includes(original));
        assert.throws(()=>patchArcadeExceptions(patched.replace(original,'/* '+original+' */')),/hooks incomplete/);
    }
    const declaration="const bwArcadeExceptions = require('../util/bw-arcade-exceptions');";
    assert.throws(()=>patchArcadeExceptions(patched.replace(declaration,'function decoy(){'+declaration+'}')),/hooks incomplete/);
    assert.throws(()=>patchArcadeExceptions(patched.replace(declaration,declaration.replace('const ','let '))),/hooks incomplete/);
    assert.throws(()=>patchArcadeExceptions(patched.replace('consume(sequencer.runtime, thread, error)','consume(sequencer.runtime, other, error)')),/hooks incomplete/);
    assert.throws(()=>patchArcadeExceptions(patched.replace('module.exports = function executeWithContext','const decoy = function executeWithContext')),/actual context wrapper/);
    assert.throws(()=>patchArcadeExceptions('/* '+declaration+' */'),/missing or ambiguous/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {patchProcedureConstraints} from '../scripts/lib/procedure-constraint-hooks.mjs';

test('stock procedure installer binds checked entry before body execution and rejects partial executable hooks',()=>{
    const source=readFileSync(path.join(INTEGRATED,'node_modules/scratch-vm/src/blocks/scratch3_procedures.js'),'utf8');
    const patched=patchProcedureConstraints(source);
    assert.equal(patchProcedureConstraints(patched),patched);
    const declaration='const bwConstraintEntry = bwProcedureEntry.entry(this.runtime, procedureCode, args, util);';
    const binding='if (bwConstraintEntry) bwProcedureEntry.bind(this.runtime, util.thread, util.thread.target, procedureCode, util.stackFrame.params, bwConstraintEntry.values, args, util);';
    assert.ok(patched.indexOf(declaration)<patched.indexOf('util.initParams();'));
    assert.ok(patched.indexOf(binding)>patched.indexOf('util.pushParam(paramNames[i], bwConstraintEntry.values[i]);'));
    assert.ok(patched.indexOf(binding)<patched.indexOf('util.startProcedure(procedureCode);'));
    for(const executable of [declaration,binding]) {
        assert.throws(()=>patchProcedureConstraints(patched.replace(executable,'/* '+executable+' */')),/hooks incomplete/);
    }
    assert.throws(()=>patchProcedureConstraints(patched.replace('bwConstraintEntry.values[i]','args[paramIds[i]]')),/hooks incomplete/);
    const imported="const bwProcedureEntry = require('../util/bw-procedure-entry');";
    assert.throws(()=>patchProcedureConstraints(patched.replace(imported,'function decoy(){'+imported+'}')),/differs|incomplete/);
    assert.throws(()=>patchProcedureConstraints(source.replace('util.initParams();','util.initParams();util.initParams();')),/installation shape differs/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram,clearStrayTimers,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runPxtCore} from './helpers/pxt-core-runtime.mjs';

// Native authored value addition is intentionally distinct from PXT source
// RefCollection addition. Execute the actual emitted typed-join bridge in the
// original compiler/shims; BW reimport alone cannot establish that boundary.
const code=`DEVICE ARCADE
GLOBAL alias
GLOBAL aliasCopy
GLOBAL emptyLeft
GLOBAL emptyRight
GLOBAL fiveLeft
GLOBAL fiveRight
GLOBAL pairLeft
GLOBAL pairRight
GLOBAL item
SPRITE Game:
WHEN flag clicked:
  set alias to (convert value (0) op "+")
  new array "named"
  set alias to (reference to named array ("named"))
  set aliasCopy to alias
  set emptyLeft to (calculate value (alias) op "+" with ("!"))
  set emptyRight to (calculate value ("!") op "+" with (aliasCopy))
  push 5 to array "named"
  set item to item 0 of array "named"
  set fiveLeft to (calculate value (alias) op "+" with ("!"))
  set fiveRight to (calculate value ("!") op "+" with (aliasCopy))
  push 2 to array "named"
  set pairLeft to (calculate value (aliasCopy) op "+" with ("!"))
  set pairRight to (calculate value ("!") op "+" with (alias))`;
const expected={emptyLeft:'!',emptyRight:'!',fiveLeft:'5!',fiveRight:'!5',pairLeft:'5,2!',pairRight:'!5,2',item:5};
const normalized=name=>name.replace(/^Game_/,'');

test('native named Array text and primitive alias writers execute identically in actual exported PXT',async t=>{
    let run;
    t.after(()=>{
        try{run?.vm.stopAll();}finally{
            try{run?.vm.quit();}finally{try{quitStrandedVMs();}finally{clearStrayTimers();}}
        }
    });
    run=await runProgram(code,{frames:60,storage:true});
    const rows=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables||{}));
    const native=name=>{const found=rows.filter(variable=>normalized(variable.name)===name);assert.equal(found.length,1,name);return found[0].value;};
    const nativeResults=Object.fromEntries(Object.keys(expected).map(name=>[name,native(name)]));
    t.diagnostic(JSON.stringify({stage:'native',values:nativeResults,errors:run.errors,creatorErrors:run.creator.errors,warnings:run.creator.warnings}));
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    assert.deepEqual(nativeResults,expected);assert.equal(native('alias'),native('aliasCopy'),'actual native aliases share one canonical reference');
    const blocks=run.creator.project.targets.flatMap(target=>Object.values(target.blocks||{}));
    assert.equal(blocks.filter(block=>block.opcode==='arrays_valueBinary').length,6);
    assert.equal(blocks.some(block=>block.opcode==='arcade_sourceValueBinary'),false,'the authored program uses native value operations');
    const before=structuredClone(run.creator.project);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(_target,costume)=>run.creator.assets.get(costume.assetId)?.data});
    t.diagnostic(JSON.stringify({stage:'export',unsupported:exported.unsupported,files:Object.keys(exported.files||{})}));
    assert.deepEqual(run.creator.project,before);assert.deepEqual(exported.unsupported,[]);
    assert.equal(exported.files['main.ts'],exported.ts);
    const built=await compile('arcade',exported.files);
    t.diagnostic(JSON.stringify({stage:'compile-full-files',success:built.success,diagnostics:built.diagnostics}));
    assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    // One finite authored startup stack is emitted synchronously. The existing
    // core oracle rejects asynchronous shims rather than replacing a scheduler.
    const original=await runPxtCore(exported.ts);
    const originalRows=Object.entries(original);
    const pxt=name=>{const found=originalRows.filter(([key])=>normalized(key)===name);assert.equal(found.length,1,'PXT '+name);return found[0][1];};
    const pxtResults=Object.fromEntries(Object.keys(expected).map(name=>[name,pxt(name)]));
    t.diagnostic(JSON.stringify({stage:'original-PXT',values:pxtResults}));
    assert.deepEqual(pxtResults,expected);assert.deepEqual(pxtResults,nativeResults);
    assert.equal(pxt('alias'),pxt('aliasCopy'),'actual original RefCollection aliases share one object');
});

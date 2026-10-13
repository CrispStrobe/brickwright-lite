import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {admitArcadeNativeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.js';
import {SPRITE_DATA_SOURCE_TEXT} from '../overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.generated.js';
const source=fs.readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-data-source/main.ts',import.meta.url),'utf8');
const candidate={packageId:'arcade-sprite-data',filename:'main.ts',source};

test('exact original Sprite Data source alone receives a frozen nine-function replacement receipt',()=>{
    execFileSync(process.execPath,['scripts/generate-arcade-native-source-admission.mjs','--check'],{stdio:'pipe'});
    assert.equal(SPRITE_DATA_SOURCE_TEXT,source);
    const receipt=admitArcadeNativeSource(candidate);assert.ok(receipt);
    assert.equal(receipt.source.sourceSha256,createHash('sha256').update(source).digest('hex'));
    assert.equal(receipt.source.revision,'332026d12c46286c7afe59bc4829ccf08471d5b1');
    assert.equal(receipt.apis.length,9);assert.ok(receipt.apis.includes('changeDataNumberBy'));assert.ok(!receipt.apis.some(api=>api.includes('Image')));
    for(const value of [receipt,receipt.source,receipt.apis,receipt.nativeOpcodes])assert.ok(Object.isFrozen(value));
    assert.throws(()=>{receipt.apis.push('madeUp');},TypeError);assert.throws(()=>{receipt.source.sourceSha256='wrong';},TypeError);
    assert.equal(admitArcadeNativeSource(candidate),receipt,'failed mutation cannot change admission');
});

test('changed code, comments, line endings, extra functions and metadata assertions never replace source checks',()=>{
    for(const replacement of [source.replace('!!value','value'),source+'\n// extra comment\n',source.replace(/\n/g,'\r\n'),source+'\nnamespace sprites { export function extra(){ return 1 } }']) {
        assert.equal(admitArcadeNativeSource({...candidate,source:replacement}),null);
        assert.equal(admitArcadeNativeSource({...candidate,source:replacement,repository:'microsoft/arcade-sprite-data',version:'v0.0.5',revision:'332026d12c46286c7afe59bc4829ccf08471d5b1'}),null,'official-looking metadata cannot override changed bytes');
        assert.equal(admitArcadeNativeSource({...candidate,source:replacement,repository:'different/repo',version:'v9'}),null,'changed repository/version cannot admit different bytes');
    }
});

test('fake names and additional executable files stay outside file-scoped admission',()=>{
    for(const filename of ['helpers.ts','extra.ts','nested/main.ts','main.js','main.ts '])assert.equal(admitArcadeNativeSource({...candidate,filename}),null,filename);
    assert.equal(admitArcadeNativeSource({...candidate,packageId:'sprite-data'}),null);
    assert.equal(admitArcadeNativeSource(),null);
    const files={'main.ts':source,'extra.ts':'let sideEffect=1;sideEffect+=1'};
    const decisions=Object.entries(files).map(([filename,source])=>({filename,receipt:admitArcadeNativeSource({...candidate,filename,source})}));
    assert.ok(decisions[0].receipt);assert.equal(decisions[1].receipt,null);
    assert.equal(files['extra.ts'],'let sideEffect=1;sideEffect+=1','the hook does not mutate or discard additional source');
});

// Preparation preserves additional executable initialization while replacing
// only the complete byte-identical helper with its qualified native adapter.
test('prepared SpriteData inputs keep additional executable sources and diagnose altered helpers',async()=>{
    const {prepareArcadeDependencyInputs}=await import('../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js');
    const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const {runProgram,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const {SPRITE_DATA_SOURCE_TEXT}=await import('../overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.generated.js');
    const original={'main.ts':'let hero=sprites.create(img`1`,SpriteKind.Player)\nsprites.setDataNumber(hero,"score",7)\nlet observed=sprites.readDataNumber(hero,"score")',
        'pxt.json':JSON.stringify({dependencies:{device:'*','arcade-sprite-data':'github:microsoft/arcade-sprite-data#v0.0.5'},files:['main.ts']})};
    const before=JSON.stringify(original);
    const resolved={packages:{'arcade-sprite-data':{files:{'main.ts':SPRITE_DATA_SOURCE_TEXT,'extra.ts':'let packageInitialized=3'}}},
        sourceOrder:[{id:'arcade-sprite-data',file:'main.ts'},{id:'arcade-sprite-data',file:'extra.ts'}],jres:{}};
    const prepared=prepareArcadeDependencyInputs(original,resolved);
    assert.equal(JSON.stringify(original),before);
    assert.ok(prepared.provenance.some(entry=>entry.nativeAdapter?.adapter==='arcade-sprite-data-v0.0.5'));
    assert.ok(Object.values(prepared.files).includes('let packageInitialized=3'));
    const imported=arcadeToPseudocode(prepared.files);assert.deepEqual(imported.unsupported,[]);
    try {
        const run=await runProgram(imported.code,{frames:15,uploads:imported.costumes});
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
        for(const [name,value] of [['observed',7],['packageInitialized',3]])
            assert.equal(variables.find(variable=>variable.name===name||variable.name==='Game_'+name)?.value,value);
    }finally{clearStrayTimers();}
    resolved.packages['arcade-sprite-data'].files['main.ts']+='\n// altered source';
    const changed=prepareArcadeDependencyInputs(original,resolved);
    assert.equal(changed.provenance.some(entry=>entry.nativeAdapter),false);
    assert.ok(Object.values(changed.files).includes(resolved.packages['arcade-sprite-data'].files['main.ts']));
});

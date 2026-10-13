import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {admitArcadeNativeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.js';
import {TEXT_SPRITE_SOURCE_TEXT,TEXT_SPRITE_INITIALIZER} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
const source=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/text-sprite-source/text.ts',import.meta.url),'utf8');
const candidate={packageId:'arcade-text',filename:'text.ts',source};

test('exact TextSprite admission retains the genuine kind initializer and immutable source identity',()=>{
    execFileSync(process.execPath,['scripts/generate-arcade-text-source-admission.mjs','--check'],{stdio:'pipe'});
    assert.equal(TEXT_SPRITE_SOURCE_TEXT,source);
    const receipt=admitArcadeNativeSource(candidate);assert.ok(receipt);
    assert.equal(receipt.replacementSource,TEXT_SPRITE_INITIALIZER);
    assert.equal(receipt.replacementSource,source.slice(0,source.indexOf('\n\n//% blockNamespace')));
    assert.match(receipt.replacementSource,/export const Text = SpriteKind\.create\(\)/);
    assert.ok(!receipt.replacementSource.includes('class TextSprite'));
    assert.match(receipt.boundary,/numeric kind allocation is not qualified/);
    assert.equal(receipt.nativeOpcodes.length,9);
    for(const value of [receipt,receipt.apis,receipt.nativeOpcodes,receipt.source,receipt.source.sha256])assert.ok(Object.isFrozen(value));
    assert.throws(()=>{receipt.source.sha256['text.ts']='wrong';},TypeError);
    assert.throws(()=>{receipt.replacementSource='namespace SpriteKind {export const Text=0}';},TypeError);
    assert.equal(admitArcadeNativeSource(candidate),receipt);
});

test('changed initializer, helper code, comments, line endings and fake names are never admitted',()=>{
    for(const altered of [source.replace('SpriteKind.create()','0'),source.replace('this.update()','this.text=""'),source+'\n// new comment',source.replace(/\n/g,'\r\n'),source+'\ntextsprite.create("unexpected initializer")'])
        assert.equal(admitArcadeNativeSource({...candidate,source:altered,repository:'microsoft/arcade-text',version:'v1.3.0'}),null);
    for(const filename of ['main.ts','extra.ts','nested/text.ts'])assert.equal(admitArcadeNativeSource({...candidate,filename}),null);
    assert.equal(admitArcadeNativeSource({...candidate,packageId:'invented-text'}),null);
    const files={'text.ts':source,'extra.ts':'let additionalInit=9'};
    assert.ok(admitArcadeNativeSource({...candidate,source:files['text.ts']}));
    assert.equal(admitArcadeNativeSource({...candidate,filename:'extra.ts',source:files['extra.ts']}),null);
    assert.equal(files['extra.ts'],'let additionalInit=9');
});

test('prepared TextSprite admission keeps the kind initializer and every additional executable file',async()=>{
    const {prepareArcadeDependencyInputs}=await import('../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js');
    const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const {runProgram,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
    const main='let label=textsprite.create("Main");let membership=sprites.allOfKind(SpriteKind.Text).length;let observed=packageLabel.text;let done=1;done+=0';
    const extra='let packageLabel=textsprite.create("Package")';
    const input={'main.ts':main,'pxt.json':JSON.stringify({dependencies:{device:'*','arcade-text':'github:microsoft/arcade-text#v1.3.0'},files:['main.ts']})};
    const resolved={packages:{'arcade-text':{files:{'text.ts':source,'extra.ts':extra}}},sourceOrder:[{id:'arcade-text',file:'text.ts'},{id:'arcade-text',file:'extra.ts'}],jres:{}};
    const before=JSON.stringify(input),prepared=prepareArcadeDependencyInputs(input,resolved);
    assert.equal(JSON.stringify(input),before);
    const receipt=prepared.provenance.find(entry=>entry.nativeAdapter?.adapter==='arcade-text-v1.3.0');assert.ok(receipt);
    assert.equal(prepared.files[receipt.path],TEXT_SPRITE_INITIALIZER);
    assert.ok(Object.values(prepared.files).includes(extra));
    const manifest=JSON.parse(prepared.files['pxt.json']);assert.ok(manifest.files.indexOf(receipt.path)<manifest.files.indexOf('main.ts'));
    const expected=await runPxtArcade({'text.ts':source,'extra.ts':extra,'main.ts':main,'pxt.json':JSON.stringify({dependencies:{device:'*'},files:['text.ts','extra.ts','main.ts']})});
    assert.equal(expected.membership,2);assert.equal(expected.observed,'Package');
    const imported=arcadeToPseudocode(prepared.files);assert.deepEqual(imported.unsupported,[]);
    try{
        const run=await runProgram(imported.code,{frames:30,storage:true});assert.deepEqual(run.errors,[]);
        const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        assert.equal(values.membership,expected.membership);assert.equal(values.observed,expected.observed);assert.equal(values.done,1);
    }finally{clearStrayTimers();}
    resolved.packages['arcade-text'].files['text.ts']+='\n// changed source';
    const altered=prepareArcadeDependencyInputs(input,resolved);assert.equal(altered.provenance.some(entry=>entry.nativeAdapter),false);assert.ok(Object.values(altered.files).includes(resolved.packages['arcade-text'].files['text.ts']));
});

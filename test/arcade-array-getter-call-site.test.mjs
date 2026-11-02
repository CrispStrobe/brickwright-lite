import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// A closed parameterless getter that only returns a global yields that global
// at its call. The receiver is an initialized Array only when the global's
// writer definitely precedes THAT call; original PXT faults otherwise.
const exported = source => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, [], source);
    const creator = new Creator(); creator.parse(imported.code);
    for (const costume of imported.costumes || []) costume.mode === 'add' ? creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name) : creator.applyCustomSVG(costume.sprite, costume.svg);
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data}).unsupported;
};

test('a getter call after the global Array writer is an initialized receiver', () => {
    assert.deepEqual(exported('function read(){return numbers}let early=read()===undefined;let numbers=[1,2];let alias=read();alias[0]=7;let value=numbers[0];early=!!early;'), []);
});

test('a getter call before the writer, a writing getter or a later reset keeps the refusal', () => {
    for (const source of [
        'function read(){return numbers}let alias=read();let numbers=[1,2];alias[0]=7;let value=numbers[0];',
        'function read(){numbers=null;return numbers}let numbers=[1,2];let alias=read();alias[0]=7;let value=numbers[0];',
        'function read(){return numbers}let numbers=[1,2];numbers=null;let alias=read();alias[0]=7;',
        'function read(n:number){return numbers}let numbers=[1,2];numbers=null;let alias=read(1);alias[0]=7;']) {
        assert.ok(exported(source).some(row => /Array reference/.test(row)), source);
    }
});

// `cond ? a : b` lowers to an if/else on a literal comparison; with a constant
// condition only the taken branch runs, in PXT and in Lite.
test('a constant conditional selects only its taken Array branch', () => {
    assert.deepEqual(exported('let pictures=[img`3`];let selected=true?pictures:null;let picture=selected[0];picture.fill(6);'), []);
    for (const source of [
        'let pictures=[img`3`];let selected=false?pictures:null;let picture=selected[0];picture.fill(6);',
        'let pictures=[img`3`];let flag=true;let selected=flag?pictures:null;let picture=selected[0];picture.fill(6);'])
        assert.ok(exported(source).some(row => /Array reference/.test(row)), source);
});

// A procedure no block can enter never runs; reads inside it are not
// receivers in PXT or in Lite. Calls, escapes or names in literals keep them.
test('reads inside an unenterable procedure need no Array proof', () => {
    assert.deepEqual(exported('function unused(pictures:Image[]){let p=pictures[0];p.fill(2)}\nlet ready=1\n'), []);
    for (const source of [
        'function first(pictures:Image[]){let p=pictures[0];p.fill(2)}\nlet none:Image[]=null\nfirst(none)\n',
        'function first(pictures:Image[]){let p=pictures[0];p.fill(2)}\nlet held:any=first\n']) {
        const imported = arcadeToPseudocode(source);
        assert.ok(imported.unsupported.length > 0 || exported(source).some(row => /Array reference/.test(row)), source);
    }
});

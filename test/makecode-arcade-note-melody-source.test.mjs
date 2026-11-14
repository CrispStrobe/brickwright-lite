import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {legacyNoteMelodySourceSafe,literalLegacyNoteMelody,markLegacyNoteMelodies} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-note-melody-source.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';

test('direct literal melody-editor notes preserve their tempo and remain independent of global volume',()=>{
    for(const tempo of ['120','+240','0','-120']) {
        const source=`music.setVolume(12);music.playMelody("C5 - D E F G A B ",${tempo})`;
        const imported=arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported,[]);
        assert.match(imported.code,/arcade set music volume to \(12\)/);
        assert.match(imported.code,/arcade play note melody \("C5 - D E F G A B "\) at/);
        assert.doesNotMatch(imported.code,/arcade string playable/);
    }
});

test('nonliteral, faulting, overlong or unsupported call shapes retain a named refusal',()=>{
    for(const source of [
        'music.playMelody("C",120,1)',
        'music.playMelody("C")',
        'music.playMelody(null,120)',
        'music.playMelody("Q",120)',
        'music.playMelody("C D E F G A B C5 D",120)',
        'music.playMelody("C",Infinity)',
        'let tempo=120;music.playMelody("C",tempo)',
        'let notes="C";music.playMelody(notes,120)',
        'function tempo(){return 120}music.playMelody("C",tempo())'
    ]) {
        const imported=arcadeToPseudocode(source);
        assert.ok(imported.unsupported.some(reason=>reason.includes('music.playMelody')),source);
        assert.doesNotMatch(imported.code,/arcade play note melody/);
    }
});

test('SDK and intrinsic aliases or mutations cannot obtain the literal-note command',()=>{
    const call='music.playMelody("C5 - D C",120)';
    for(const before of [
        'let music=1;',
        'let alias=music;',
        'let alias=music.playMelody;',
        'music.playMelody=function(){};',
        'music["playMelody"]=function(){};',
        'Math.max=function(){return 1};',
        'String.prototype.split=function(){return []};',
        'Array.prototype.filter=function(){return []};',
        'let acquire=(function(){})["con"+"structor"];',
        'class Opaque{callback:any;constructor(){this.callback=function(){music.playMelody=function(){}}}}let opaque=new Opaque();'
    ]) {
        const imported=arcadeToPseudocode(before+call);
        assert.ok(imported.unsupported.length,before);
        assert.doesNotMatch(imported.code,/arcade play note melody/);
    }
});

test('original configured generated code and unresolved languages retain the source veto',()=>{
    const call='music.playMelody("C",120)';
    for(const [name,text] of [['generated.g.ts','music.playMelody=function(){};'],['native.asm','nop'],['main.py',''],['ambient.d.ts','declare const hidden:number;']]) {
        const files={'main.ts':call,[name]:text,'pxt.json':JSON.stringify({files:['main.ts',name]})};
        assert.equal(legacyNoteMelodySourceSafe(files),false,name);
        assert.doesNotMatch(arcadeToPseudocode(files).code,/arcade play note melody/);
    }
    for(const editor of ['tsprj','blocksprj']) {
        const files={'main.ts':call,'main.py':'','pxt.json':JSON.stringify({files:['main.ts','main.py'],preferredEditor:editor})};
        assert.equal(legacyNoteMelodySourceSafe(files),true);
        assert.deepEqual(arcadeToPseudocode(files).unsupported,[]);
    }
    for(const prefix of ['mu\\u0073ic.playMelody=function(){};','let invalid="broken\n";'])
        assert.equal(legacyNoteMelodySourceSafe({'main.ts':prefix+call}),false);
});

test('only original unbound literal calls are marked, without changing source argument evaluation',()=>{
    const source='music.playMelody("C5 - D C",-120)',ast=parseMakeCodeTs(source),call=ast.body[0].expr;
    const args=call.args,callee=call.callee;
    assert.equal(literalLegacyNoteMelody(call),true);markLegacyNoteMelodies(ast,true);
    assert.equal(call.bwPxtLegacyNoteMelody,true);assert.strictEqual(call.args,args);assert.strictEqual(call.callee,callee);
    const rejected=parseMakeCodeTs('let music=1;music.playMelody("C",120)');markLegacyNoteMelodies(rejected,true);
    assert.equal(rejected.body[1].expr.bwPxtLegacyNoteMelody,undefined);
});

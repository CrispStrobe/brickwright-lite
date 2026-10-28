import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const clean=out=>{for(const key of ['unsupported','errors','warnings','unparsed'])if(Object.hasOwn(out,key))assert.deepEqual(out[key],[],key);};
const create=text=>{const out=arcadeToPseudocode(text);clean(out);const c=new Creator();c.parse(out.code);clean(c);return c;};
const refused=text=>{const imported=arcadeToPseudocode(text);if(imported.unsupported?.length)return true;
    const c=new Creator();c.parse(imported.code);if(c.errors?.length||c.unsupported?.length)return true;
    return projectJsonToArcade(JSON.stringify(c.project)).unsupported.some(reason=>/native addition/.test(reason));};

// Representative calculator programs: PXT game.askForNumber returns a Number
// (possibly NaN) on normal return, so both text and numeric joins are native.
const programs=['let n=game.askForNumber("Enter a number.");game.splash(""+n+" entered");',
    'let a=game.askForNumber("First?");let b=game.askForNumber("Second?");game.splash(""+a+" + "+b+" = "+(a+b));',
    // PXT game.runtime() is the elapsed milliseconds: accumulators and string joins.
    'let n=0;let trace="";game.onUpdate(function(){n=n+game.runtime();trace+=game.runtime()+",";});'];

test('askForNumber results join natively through both export routes and reimport',()=>{
    for(const text of programs){
        const c=create(text),json=projectJsonToArcade(JSON.stringify(c.project)),direct=projectToArcade(c.project);
        clean(json);clean(direct);assert.deepEqual(direct.files,json.files);assert.match(json.ts,/game\.(askForNumber|runtime)\(/);
        const again=create(json.files),code=new Creator();code.parse(again.decompile());clean(code);
        clean(projectJsonToArcade(JSON.stringify(again.project)));
    }
});

test('a rebound or written game namespace supplies no askForNumber Number',()=>{
    for(const text of ['let game:any={askForNumber(){return {};}};let n=game.askForNumber("x");game.splash(""+n);',
        'let n=game.askForNumber("x");(game as any).askForNumber=function(){return {};};game.splash(""+n);',
        'let n=0;(game as any).runtime=function(){return {};};game.onUpdate(function(){n=n+game.runtime();});'])assert.ok(refused(text),text);
});

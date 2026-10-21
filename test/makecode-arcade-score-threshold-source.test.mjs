import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const convert = source => {
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported, [], source);
    const creator = new Creator(); creator.parse(imported.code); assert.deepEqual(creator.warnings, []);
    return {imported, creator, project: creator.project};
};

test('public score registrations retain fixed players, fractional threshold, captures and matching callback through Code and export', () => {
    for (const [api, player] of [['info', 1], ['info.player1', 1], ['info.player2', 2], ['info.player3', 3], ['info.player4', 4], ['info.player1.impl',1]]) {
        const source = `let hits=0; ${api}.onScore(3.5,function(){hits+=1}); ${api.replace('.impl','')}.setScore(4);`;
        const {imported, creator, project} = convert(source);
        assert.match(imported.code, new RegExp(`arcade register score player \\(${player}\\) threshold`));
        assert.match(imported.code, /WHEN arcade score handler /);
        const decompiled = creator.decompile(); assert.match(decompiled, /arcade register score player/);
        const again = new Creator(); again.parse(decompiled); assert.deepEqual(again.warnings, []);
        const out = projectToArcade(project); assert.deepEqual(out.unsupported, []);
        assert.match(out.ts, new RegExp(`${player === 1 ? 'info' : `info.player${player}`}\\.onScore\\(`));
        assert.match(out.ts, /3\.5/); assert.match(out.ts, /function \(/);
        const reimported = convert(out.files); assert.match(reimported.imported.code, /WHEN arcade score handler /);
    }
    for(const threshold of ['(2+1.5)','threshold']){
        const numeric=convert(`let threshold=3.5;let hits=0;info.onScore(${threshold},function(){hits+=1});`);
        assert.deepEqual(projectToArcade(numeric.project).unsupported,[],'actual literal/arithmetic/all-writer Number producers');
    }
    const forwarded=convert('let hits=0;function register(limit:number, callback:()=>void){info.player1.impl.onScore(limit,callback)} register(-5,function(){hits+=1});');
    assert.match(forwarded.imported.code,/arcade register score player/);
    const current=projectToArcade(forwarded.project);assert.deepEqual(current.unsupported,[]);assert.match(current.ts,/info\.onScore/);
});

test('score source ownership rejects root/member writes, aliases, shadows and opaque thresholds and unproved internal impl owners', () => {
    const valid = 'let hits=0;info.onScore(2,function(){hits+=1});';
    for (const source of [
        'let info:any={};' + valid,
        'function f(info:any){info.onScore(2,function(){})} f({});',
        valid + ' function unused(){info.onScore=function(n:any,f:any){}}',
        valid + ' let alias=info;',
        valid + ' let playerAlias=info.player1;',
        valid + ' info.player1={};',
        'info.onScore({valueOf:function(){return 2}},function(){});',
        'function install(value:any){info.onScore(value,function(){})} install("2");',
        'info.player1.impl={onScore:function(n:any,f:any){}};info.player1.impl.onScore(2,function(){});',
        'let old=info.player1.impl;old.onScore(2,function(){});',
        'function threshold(){return 2}info.player1.impl.onScore(threshold(),function(){});'
    ]) {
        assert.ok(arcadeToPseudocode(source).unsupported.length > 0, source);
    }
});

test('current threshold and callback edits govern export; invalid player and missing handler never borrow a registration', () => {
    const {creator, project} = convert('let hits=0;info.player3.onScore(3.5,function(){hits+=1});info.player3.setScore(4);');
    const target = project.targets.find(t => Object.values(t.blocks).some(b => b.opcode === 'arcade_registerScoreHandler'));
    const registration = Object.values(target.blocks).find(b => b.opcode === 'arcade_registerScoreHandler');
    let edits = 0;
    const edit = raw => {
        if (Array.isArray(raw) && [4,5,6,7,8].includes(raw[0]) && Number(raw[1]) === 3.5) {raw[1] = '7.5'; edits++; return;}
        if (typeof raw === 'string' && target.blocks[raw]) for (const slot of Object.values(target.blocks[raw].inputs || {})) edit(slot[1]);
    };
    edit(registration.inputs.SCORE[1]); assert.equal(edits, 1);
    const out = projectToArcade(project); assert.deepEqual(out.unsupported, []); assert.match(out.ts, /7\.5/);
    assert.match(convert(out.files).imported.code, /7\.5/);
    const savedScore=structuredClone(registration.inputs.SCORE);
    for(const [label,operand]of [['text',[10,'2']],['object',{opcode:'arcade_createObject',inputs:{},fields:{}}],
        ['Sprite',{opcode:'arcade_createSprite',inputs:{},fields:{}}],['unknown',{opcode:'unrecognised_threshold_reporter',inputs:{},fields:{}}]]){
        if(Array.isArray(operand))registration.inputs.SCORE=[1,operand];
        else {target.blocks.__editedScoreOperand={...operand,parent:Object.keys(target.blocks).find(id=>target.blocks[id]===registration),next:null,shadow:false,topLevel:false};registration.inputs.SCORE=[2,'__editedScoreOperand'];}
        assert.ok(projectToArcade(project).unsupported.some(message=>/actual Number threshold producer/.test(message)),label);
        delete target.blocks.__editedScoreOperand;registration.inputs.SCORE=structuredClone(savedScore);
    }
    const mixed=convert('let threshold=3.5;let hits=0;info.onScore(threshold,function(){hits+=1});threshold=4;').project;
    const writer=mixed.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='data_setvariableto'&&/threshold/.test(b.fields?.VARIABLE?.[0]||''));
    assert.ok(writer,'actual threshold writer');writer.inputs.VALUE=[1,[10,'2']];
    assert.ok(projectToArcade(mixed).unsupported.some(message=>/actual Number threshold producer/.test(message)),'all actual writers must remain Number');
    const saved = structuredClone(registration.inputs.PLAYER);
    registration.inputs.PLAYER = [1,[4,'0']];
    assert.ok(projectToArcade(project).unsupported.some(message => /fixed player/.test(message)));
    registration.inputs.PLAYER = saved;
    registration.inputs.TOKEN = [1,[10,'unregistered-score-handler']];
    assert.ok(projectToArcade(project).unsupported.some(message => /matching callback/.test(message)));
    assert.match(creator.decompile(), /arcade register score player/);
});

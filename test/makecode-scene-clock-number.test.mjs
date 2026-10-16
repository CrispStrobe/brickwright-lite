import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {ordinarySceneClockNumberCalls} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-scene-clock-number-source.js';
import {ordinaryPrimitiveSdkNumberCalls} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-primitive-sdk-number-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {importSource} from './helpers/bw-integrated.mjs';
const Creator=(await importSource('src/lib/sb3-creator.js')).default;
const ast=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true});
const walk=(node,predicate,out=[])=>{if(!node||typeof node!=='object')return out;if(Array.isArray(node)){node.forEach(value=>walk(value,predicate,out));return out;}if(predicate(node))out.push(node);Object.values(node).forEach(value=>{if(value&&typeof value==='object')walk(value,predicate,out);});return out;};
const runtimeCalls=program=>walk(program,node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.object?.name==='game'&&node.callee.name==='runtime');

test('scene clock is an explicit source producer option, not a broad SDK Number table',()=>{
    const program=ast('let a=game.runtime();let b=game.currentScene();let c=game.eventContext();let d=control.millis();let e=game.ScoringType.LowScore;');
    const facts=analyseSourceValueProducers(program,{sceneClockNumbers:true}),ordinary=analyseSourceValueProducers(program),calls=walk(program,node=>node.type==='Call');
    assert.deepEqual([...facts.typesAt(calls[0])],['Number']);assert.equal(ordinary.typesAt(calls[0]).has('Number'),false);
    for(const node of calls.slice(1))assert.equal(facts.typesAt(node).has('Number'),false);
    const leaf=walk(program,node=>node.type==='Member'&&node.name==='LowScore')[0];assert.equal(facts.typesAt(leaf).has('Number'),false);
});

test('closed supported game calls and exact readonly LowScore keep independent clock eligibility',()=>{
    const program=ast('let n=game.runtime();let s=game.currentScene();let dt=game.eventContext().deltaTime;game.gameOver(false);game.setGameOverPlayable(false,music.melodyPlayable(music.baDing,120),false);game.setGameOverEffect(false,effects.confetti);game.setGameOverScoringType(game.ScoringType.LowScore);');
    const calls=ordinarySceneClockNumberCalls(program);assert.equal(calls.has(runtimeCalls(program)[0]),true);
});
for(const neighbor of ['game.runtime(1)','new game.runtime()','game.runtime<number>()','let f=game.runtime','let g=game','game.runtime=()=>1','game=other','game["runtime"]()','game.onUpdate(function(){})','game.ScoringType.LowScore=1','let values=game.ScoringType','game.ScoringType.LowScore.extra=1','function unused(){game.runtime=()=>1}','globalThis.game.runtime=()=>1','let root=this;root.game.runtime=()=>1','let key="con"+"structor";let f=(()=>1)[key]("return game")'])test('clock candidate refuses unsafe configured neighbor: '+neighbor,()=>{
    const program=ast('let n=game.runtime();'+neighbor+';'),proof=ordinarySceneClockNumberCalls(program);assert.equal(proof.has(runtimeCalls(program)[0]),false);
});
for(const call of ['game.currentScene(1)','game.eventContext(1)','game.gameOver()','game.setGameOverPlayable(false,1)','game.setGameOverEffect(false)','game.setGameOverScoringType(1,2)'])test('closed game census refuses unsupported arity: '+call,()=>{
    const program=ast('let n=game.runtime();'+call+';');assert.equal(ordinarySceneClockNumberCalls(program).has(runtimeCalls(program)[0]),false);
});

test('lexical shadowing supplies no clock fact and does not poison an independent SDK use',()=>{
    const program=ast('function local(game:any){return game.runtime()}let n=game.runtime();'),calls=runtimeCalls(program),proof=ordinarySceneClockNumberCalls(program);
    assert.equal(proof.has(calls[0]),false);assert.equal(proof.has(calls[1]),true);
});

test('info7 source census stays independently bounded',()=>{
    const program=ast('let a=info.score();let b=game.runtime();'),score=walk(program,node=>node.type==='Call'&&node.callee?.object?.name==='info')[0];
    assert.equal(ordinaryPrimitiveSdkNumberCalls(program).has(score),true);
    const unsafe=ast('let a=info.score();let b=game.runtime();info.player1.score();'),call=walk(unsafe,node=>node.type==='Call'&&node.callee?.object?.name==='info')[0];
    assert.equal(ordinaryPrimitiveSdkNumberCalls(unsafe).has(call),false,'clock does not widen deep info use');
});

test('two ordinary Number call sites and Number text keep existing editable scene reporter',t=>{
    const result=arcadeToPseudocode('let seen=0;function receive(value:number){seen=value}receive(game.runtime());receive(game.runtime());let text=game.runtime().toString();');
    assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);assert.match(result.code,/arcade scene runtime milliseconds/);
    const creator=new Creator();creator.parse(result.code);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.unparsed,[]);
    const out=projectToArcade(creator.project);t.diagnostic(JSON.stringify({stage:'actual source and current formal/caller export',result,creator:{warnings:creator.warnings,errors:creator.errors,unparsed:creator.unparsed},current:creator.project,out}));assert.deepEqual(out.unsupported,[]);assert.deepEqual(out.warnings,[]);assert.match(out.ts,/game\.runtime\(\)/);
});

test('current export refuses a malformed scene reporter and a borrowed parent edge',()=>{
    const imported=arcadeToPseudocode('let seen=game.runtime();'),creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.errors,[]);
    for(const mode of ['extra input','field','shared edge']){
        const project=JSON.parse(JSON.stringify(creator.project)),target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sceneMillis')),[id,node]=Object.entries(target.blocks).find(([,block])=>block.opcode==='arcade_sceneMillis');
        if(mode==='extra input')node.inputs.EXTRA=[1,[4,'1']];if(mode==='field')node.fields.EXTRA=['bad',null];
        if(mode==='shared edge'){const parent=target.blocks[node.parent];parent.inputs.EXTRA=[2,id];}
        const out=projectToArcade(project);assert.ok(out.unsupported.some(message=>message.includes('Scene clock Number:')),mode);assert.deepEqual(out.warnings,[]);
    }
});


test('class instance this is bounded separately from ambient or nested-function this',()=>{
    const safe=ast('class Timer {start:number;constructor(){this.start=game.runtime()}millis(){return game.runtime()-this.start}}');
    const proof=ordinarySceneClockNumberCalls(safe);for(const call of runtimeCalls(safe))assert.equal(proof.has(call),true);
    const unsafe=ast('class Timer {start:number;constructor(){this.start=game.runtime();function unused(){let root=this;root.game.runtime=()=>1}}}');
    assert.equal(ordinarySceneClockNumberCalls(unsafe).has(runtimeCalls(unsafe)[0]),false);
});


test('current typed caller clock facts require the same exact connected reporter as emission',t=>{
    const result=arcadeToPseudocode('let seen=0;function receive(value:number){seen=value}receive(game.runtime());receive(game.runtime());');
    const creator=new Creator();creator.parse(result.code);assert.deepEqual(result.unsupported,[]);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.unparsed,[]);
    for(const mode of ['extra input','extra field','shadow','top level','next','mutation','wrong parent','duplicate dictionary identity','shared block edge','shared shadow edge','other clock opcode']){
        const project=JSON.parse(JSON.stringify(creator.project)),target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sceneMillis'));
        const [id,node]=Object.entries(target.blocks).find(([,block])=>block.opcode==='arcade_sceneMillis'),parent=target.blocks[node.parent];
        if(mode==='extra input')node.inputs.EXTRA=[1,[4,'1']];
        if(mode==='extra field')node.fields.EXTRA=['bad',null];
        if(mode==='shadow')node.shadow=true;
        if(mode==='top level')node.topLevel=true;
        if(mode==='next')node.next=Object.keys(target.blocks).find(other=>other!==id);
        if(mode==='mutation')node.mutation={tagName:'mutation',children:[]};
        if(mode==='wrong parent')node.parent=Object.keys(target.blocks).find(other=>other!==id&&target.blocks[other]!==parent);
        if(mode==='duplicate dictionary identity')target.blocks.authoredDuplicateClock=node;
        if(mode==='shared block edge')parent.inputs.EXTRA=[2,id];
        if(mode==='shared shadow edge')parent.inputs.EXTRA=[3,[4,'0'],id];
        if(mode==='other clock opcode')node.opcode='arcade_programMillis';
        const out=projectToArcade(project);t.diagnostic(JSON.stringify({stage:'malformed current typed clock caller',mode,current:project,out}));
        assert.ok(out.unsupported.some(message=>message.includes('Procedure parameter constraint: actual current caller or writer requires Number')),mode+' cannot seed the formal Number graph');
        if(mode!=='other clock opcode')assert.ok(out.unsupported.some(message=>message.includes('Scene clock Number:')),mode+' has the same emission refusal');
        assert.deepEqual(out.warnings,[]);
    }
});

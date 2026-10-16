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
    for(const mode of ['extra input','extra field','shadow','top level','next','mutation','wrong parent','duplicate dictionary identity','shared edge with valid caller','shared block edge','shared shadow edge','socket unknown tag','socket same-shadow role','socket missing tag','socket no-shadow extra tail','socket shadow missing fallback','socket extra fallback tail','socket malformed inline fallback','socket missing fallback block','socket foreign fallback owner','socket shared fallback','other clock opcode']){
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
        if(mode==='shared edge with valid caller'){const prior=target.blocks[parent.parent];assert.equal(prior?.opcode,'data_setvariableto','actual main writer preceding the first current caller');assert.equal(prior.next,node.parent);prior.inputs.VALUE=[2,id];}
        if(mode==='shared block edge')parent.inputs.EXTRA=[2,id];
        if(mode==='shared shadow edge')parent.inputs.EXTRA=[3,[4,'0'],id];
        const socket=Object.entries(parent.inputs).find(([,slot])=>slot[1]===id)?.[0];assert.ok(socket);
        if(mode==='socket unknown tag')parent.inputs[socket]=[99,id];
        if(mode==='socket same-shadow role')parent.inputs[socket]=[1,id];
        if(mode==='socket missing tag')parent.inputs[socket]=[id];
        if(mode==='socket no-shadow extra tail')parent.inputs[socket]=[2,id,'extra'];
        if(mode==='socket shadow missing fallback')parent.inputs[socket]=[3,id];
        if(mode==='socket extra fallback tail')parent.inputs[socket]=[3,id,[4,'0'],'extra'];
        if(mode==='socket malformed inline fallback')parent.inputs[socket]=[3,id,[4,'0','extra']];
        if(mode==='socket missing fallback block')parent.inputs[socket]=[3,id,'missing-shadow'];
        if(mode==='socket foreign fallback owner'||mode==='socket shared fallback'){
            const fallback='authored-clock-fallback';assert.equal(Object.hasOwn(target.blocks,fallback),false);
            target.blocks[fallback]={opcode:'math_number',next:null,parent:mode==='socket foreign fallback owner'?id:node.parent,inputs:{},fields:{NUM:['0',null]},shadow:true,topLevel:false};parent.inputs[socket]=[3,id,fallback];
            if(mode==='socket shared fallback')parent.inputs.EXTRA=[1,fallback];
        }
        if(mode==='other clock opcode')node.opcode='arcade_programMillis';
        // Extra/missing call sockets invalidate the structural owner before any
        // typed obligations exist. Require that exact earlier refusal, rather
        // than inventing a Number obligation for a rejected call declaration.
        const structural=['shared block edge','shared shadow edge','socket missing tag','socket shared fallback'].includes(mode);
        const expectedDiagnostic=structural?'Procedure parameter constraint: stock call requires exactly its actual input sockets':'Procedure parameter constraint: actual current caller or writer requires Number';
        const out=projectToArcade(project);t.diagnostic(JSON.stringify({stage:'malformed current typed clock caller',mode,expectedDiagnostic,current:project,out}));
        assert.ok(out.unsupported.includes(expectedDiagnostic),mode+' cannot seed the formal Number graph or bypass its earlier exact owner refusal');
        if(!['other clock opcode','socket missing tag'].includes(mode))assert.ok(out.unsupported.some(message=>message.includes('Scene clock Number:')),mode+' has the same emission refusal');
        assert.deepEqual(out.warnings,[]);
    }
});


test('current typed clock accepts canonical nonshadow sockets and uniquely owned primitive fallback',t=>{
    const result=arcadeToPseudocode('let seen=0;function receive(value:number){seen=value}receive(game.runtime());');
    const creator=new Creator();creator.parse(result.code);assert.deepEqual(result.unsupported,[]);assert.deepEqual(creator.errors,[]);
    for(const mode of ['no shadow','inline numeric shadow','inline text shadow','owned numeric shadow']){
        const project=JSON.parse(JSON.stringify(creator.project)),target=project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sceneMillis')),[id,node]=Object.entries(target.blocks).find(([,block])=>block.opcode==='arcade_sceneMillis'),parent=target.blocks[node.parent],socket=Object.entries(parent.inputs).find(([,slot])=>slot[1]===id)[0];
        if(mode==='no shadow')parent.inputs[socket]=[2,id];
        if(mode==='inline numeric shadow')parent.inputs[socket]=[3,id,[4,'0']];
        if(mode==='inline text shadow')parent.inputs[socket]=[3,id,[10,'']];
        if(mode==='owned numeric shadow'){target.blocks.authoredClockShadow={opcode:'math_number',next:null,parent:node.parent,inputs:{},fields:{NUM:['0',null]},shadow:true,topLevel:false};parent.inputs[socket]=[3,id,'authoredClockShadow'];}
        const out=projectToArcade(project);t.diagnostic(JSON.stringify({stage:'canonical current typed clock socket',mode,current:project,out}));assert.deepEqual(out.unsupported,[],mode);assert.deepEqual(out.warnings,[]);
    }
});

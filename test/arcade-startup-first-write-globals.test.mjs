// Row 2e (exporter): a start-script global whose saved default can never be
// read exports without that default, and a String receiver calls `.concat`
// directly instead of hiding behind `__bwSdkConcat(<any>...)`. Near misses keep
// the old export. Positive original-PXT comparison:
// test/makecode-string-conversion-roundtrip.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {startupFirstWriteVariables} from '../overlay/scratch-gui/src/lib/bw-makecode/startup-first-write-globals.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';

const exportOf=async source=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:5,storage:true});
    try{return {project:run.creator.project,exported:projectToArcade(run.creator.project)};}finally{run.vm.quit();clearStrayTimers();}
};
const declaration=(ts,name)=>ts.split('\n').find(line=>line.startsWith(`let ${name}`));
const letter='function letter(code:number):string{return String.fromCharCode(code)}';

test('a start-script global first written before any read drops its dead default and concatenates directly',async()=>{
    const source=`${letter}\nlet f=letter(72)\nlet g=letter(105)\nlet h=f.concat(g)\nlet k="a".concat(<any>(0/0))`;
    const expected=await runPxtArcade(source);
    const {exported}=await exportOf(source);
    assert.deepEqual(exported.unsupported,[]);
    assert.equal(declaration(exported.ts,'f'),'let f = ""');
    assert.match(exported.ts,/\bh = f\.concat\(<any>g\)/);
    assert.match(exported.ts,/\bk = "a"\.concat\(<any>/);
    assert.doesNotMatch(exported.ts,/__bwSdkConcat/,'no unused concat helper');
    const original=await runPxtArcade(exported.ts);
    for(const name of ['h','k'])assert.equal(original[name]??original['Game_'+name],expected[name],name);
    assert.deepEqual(arcadeToPseudocode(exported.ts).unsupported,[]);
});

test('a global also read by a procedure keeps its saved default and the cast helper',async()=>{
    const source=`${letter}\nlet f=letter(72)\nfunction peek(){return f.concat("!")}\nlet p=peek()\nlet h=f.concat("x")`;
    const expected=await runPxtArcade(source);
    const {project,exported}=await exportOf(source);
    const variables=Object.assign({},...project.targets.map(t=>t.variables||{}));
    const id=Object.entries(variables).find(([,v])=>v[0]==='f')?.[0];
    assert.ok(id,'actual f variable');
    assert.equal(startupFirstWriteVariables(project,()=>true).has(id),false,'f is referenced outside the start script');
    assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/__bwSdkConcat\(<any>Game_f, "x"\)|__bwSdkConcat\(<any>f, "x"\)/,'live default keeps the cast helper');
    const original=await runPxtArcade(exported.ts);
    for(const name of ['p','h'])assert.equal(original[name]??original['Game_'+name],expected[name],name);
});

const project=(scripts,variables={v1:['f',0]})=>({targets:[{isStage:true,name:'Stage',variables,blocks:{}},{isStage:false,name:'Game',variables:{},blocks:scripts}]});
const set=(id,next,value,variable=['f','v1'])=>({[id]:{opcode:'data_setvariableto',next,parent:null,topLevel:false,fields:{VARIABLE:variable},inputs:{VALUE:value[0]===3?value:[1,value]}}});
const read=(id,next)=>({[id]:{opcode:'looks_say',next,topLevel:false,fields:{},inputs:{MESSAGE:[3,[12,'f','v1'],[10,'']]}}});
const hat=next=>({hat:{opcode:'arcade_whenSourceStarts',next,topLevel:true,fields:{},inputs:{}}});
const all=()=>true;

test('first-write analysis admits only a top-level plain set that precedes every reference',()=>{
    assert.deepEqual([...startupFirstWriteVariables(project({...hat('s'),...set('s','r',[10,'x']),...read('r',null)}),all)],['v1']);
    // read first
    assert.equal(startupFirstWriteVariables(project({...hat('r'),...read('r','s'),...set('s',null,[10,'x'])}),all).size,0);
    // the set reads its own variable
    assert.equal(startupFirstWriteVariables(project({...hat('s'),...set('s',null,[3,[12,'f','v1'],[10,'']])}),all).size,0);
    // first reference nested inside a control block
    assert.equal(startupFirstWriteVariables(project({...hat('c'),c:{opcode:'control_if',next:null,topLevel:false,fields:{},inputs:{SUBSTACK:[2,'s']}},...set('s',null,[10,'x'])}),all).size,0);
    // a reference in another script (procedure, handler)
    assert.equal(startupFirstWriteVariables(project({...hat('s'),...set('s',null,[10,'x']),other:{opcode:'looks_say',next:null,topLevel:true,fields:{},inputs:{MESSAGE:[3,[12,'f','v1'],[10,'']]}}}),all).size,0);
    // two start scripts
    assert.equal(startupFirstWriteVariables(project({...hat('s'),...set('s',null,[10,'x']),hat2:{opcode:'event_whenflagclicked',next:'t',topLevel:true,fields:{},inputs:{}},...set('t',null,[10,'y'])}),all).size,0);
    // the name used as text elsewhere (menus, declarations) counts as a reference
    assert.equal(startupFirstWriteVariables(project({...hat('s'),...set('s',null,[10,'x']),menu:{opcode:'sensing_of',next:null,topLevel:true,fields:{PROPERTY:['f',null]},inputs:{}}}),all).size,0);
    // ineligible (clone-local) variables are never admitted
    assert.equal(startupFirstWriteVariables(project({...hat('s'),...set('s',null,[10,'x'])}),()=>false).size,0);
});

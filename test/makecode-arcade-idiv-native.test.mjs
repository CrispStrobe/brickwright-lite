import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {MATH_IDIV_SOURCE,MATH_IDIV_EXPECTED} from './fixtures/arcade/math-idiv.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
let recordCounter=0;
const emit=row=>console.error(JSON.stringify({kind:'idiv-native-observation',counter:++recordCounter,...row}));
const errorRecord=(error,seen=new Set())=>{
    if(error===null)return null;
    if(error===undefined)return {provided:false,valueKind:'undefined'};
    if(typeof error!=='object')return {valueKind:typeof error,value:String(error)};
    if(seen.has(error))return {valueKind:'cyclic-error-cause'};
    seen.add(error);return {name:error.name,message:error.message,stack:error.stack,cause:Object.hasOwn(error,'cause')?errorRecord(error.cause,seen):{provided:false}};
};
function diagnostics(route,stage,value,required,parseError=null){
    const channels={},keys=Object.keys(value);
    for(const key of new Set([...keys.filter(key=>/unsupported|warning|error|unparsed|diagnostic|refusal/i.test(key)),...required])){
        const provided=Object.hasOwn(value,key),actual=value[key];
        channels[key]={provided,valueKind:!provided?'notprovided':actual===undefined?'undefined':Array.isArray(actual)?'array':actual===null?'null':typeof actual,value:!provided||actual===undefined?null:structuredClone(actual)};
    }
    const result={route,stage,returnedKeys:keys,channels,parseError:errorRecord(parseError)};emit(result);return result;
}
const hasIssue=value=>Array.isArray(value)?value.length>0:value&&typeof value==='object'?Object.keys(value).length>0:typeof value==='number'?value!==0:Boolean(value);
function clean(record,required){
    for(const key of required)assert.ok(record.channels[key]?.provided&&record.channels[key].valueKind==='array'&&record.channels[key].value.length===0,record.route+' '+record.stage+' required '+key);
    for(const [key,row]of Object.entries(record.channels))if(row.provided)assert.ok(row.valueKind!=='undefined'&&!hasIssue(row.value),record.route+' '+record.stage+' '+key);
}
const scalar=value=>typeof value==='number'?{valueKind:'number',value:Number.isNaN(value)?'NaN':!Number.isFinite(value)?String(value):value,negativeZero:Object.is(value,-0)}:
    value===undefined?{valueKind:'undefined',value:null}:value===null?{valueKind:'null',value:null}:['string','boolean'].includes(typeof value)?{valueKind:typeof value,value}:{valueKind:typeof value,value:null};
function check(run,edited=false,route='native'){
    const actual=vars(run);emit({route,stage:'runtime-scalars',errors:run.errors.map(error=>errorRecord(error)),variables:Object.fromEntries(Object.keys(MATH_IDIV_EXPECTED).map(name=>[name,{provided:Object.hasOwn(actual,name),...scalar(actual[name])}]))});
    assert.deepEqual(run.errors,[]);for(const[name,value]of Object.entries(MATH_IDIV_EXPECTED))assert.deepEqual(actual[name],edited&&name==='idivEditable'?0:value,name);
}
const creatorRequired=['errors','warnings','unparsed'];
const creatorObserver=route=>(creator,parseError)=>{
    const observed=diagnostics(route,'Creator-parse',creator,creatorRequired,parseError);
    if(!parseError)clean(observed,creatorRequired);
};
async function execute(source,route){
    const codeOnly=typeof source==='object'&&typeof source.code==='string'&&!Object.hasOwn(source,'main.ts');
    const imported=codeOnly?source:arcadeToPseudocode(source);
    if(codeOnly)emit({route,stage:'source-import',provided:false,reason:'Actual Code-only route has no source importer invocation or diagnostic object'});
    else clean(diagnostics(route,'source-import',imported,['unsupported','warnings']),['unsupported','warnings']);
    const run=await runProgram(imported.code,{frames:150,storage:true,observeCreator:creatorObserver(route)});
    try{clean(diagnostics(route,'Creator-after-run',run.creator,creatorRequired),creatorRequired);return run;}catch(error){clearStrayTimers(run.vm);throw error;}
}
function currentExport(run,route){
    const exported=projectToArcade(JSON.parse(run.vm.toJSON()));clean(diagnostics(route,'current-export',exported,['unsupported','warnings']),['unsupported','warnings']);return exported;
}
async function savedRoutes(run,edited){
    const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
    emit({route:'same-SB3',stage:'saved-project-load',sourceImport:{provided:false},CreatorParse:{provided:false},reason:'Actual saved VM load; no source import or Creator parse'});
    await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,150);check(run,edited,'same-SB3');
    const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0,storage:true,observeCreator:creatorObserver('fresh-VM-bootstrap')});
    try{clean(diagnostics('fresh-VM-bootstrap','Creator-after-run',fresh.creator,creatorRequired),creatorRequired);emit({route:'fresh-SB3',stage:'saved-project-load',sourceImport:{provided:false},CreatorParse:{provided:false},reason:'Actual saved VM load; bootstrap Creator is recorded separately'});await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,150);check(fresh,edited,'fresh-SB3');}finally{clearStrayTimers(fresh.vm);}
}

test('native Math.idiv signed conversion once order lazy loop and reentrant locals survive portable routes',async()=>{
    const run=await execute(MATH_IDIV_SOURCE,'source');try{
        check(run);const code=await execute({code:run.creator.decompile()},'Code');try{check(code);}finally{clearStrayTimers(code.vm);}
        await savedRoutes(run,false);
        const exported=currentExport(run,'export');
        const imported=await execute(exported.files,'reimport');try{check(imported);}finally{clearStrayTimers(imported.vm);}
    }finally{clearStrayTimers(run.vm);}
});

test('native Math.idiv current converted quotient OP edit exports the actual changed expression',async()=>{
    const run=await execute(MATH_IDIV_SOURCE,'source');try{
        check(run);let edited=false;
        for(const target of run.vm.runtime.targets)for(const setter of Object.values(target.blocks._blocks||{}))if(setter.opcode==='data_setvariableto'&&setter.fields.VARIABLE?.value?.endsWith('idivEditable')){
            const expression=target.blocks.getBlock(setter.inputs.VALUE.block);assert.equal(expression.opcode,'arrays_valueBinary');assert.equal(expression.fields.OP.value,'|');
            target.blocks.changeBlock({id:expression.id,element:'field',name:'OP',value:'&'});edited=true;
        }
        assert.equal(edited,true);run.vm.greenFlag();await stepFrames(run.vm,150);check(run,true);await savedRoutes(run,true);
        const exported=currentExport(run,'export');
        const imported=await execute(exported.files,'reimport');try{check(imported,true);}finally{clearStrayTimers(imported.vm);}
    }finally{clearStrayTimers(run.vm);}
});

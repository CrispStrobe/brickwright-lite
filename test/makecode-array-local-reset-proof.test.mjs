import test from 'node:test';
import assert from 'node:assert/strict';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

// Independently authored physical graphs: no retained generated names or source
// hashes are admission criteria. Seven different cells share a real frame but
// their fresh Array bodies and overwrite points remain separate.
function fixture(count=1) {
    const blocks={},target={isStage:true,name:'Stage',variables:{published:['published',0],out:['out',0]},blocks};
    const project={targets:[target],extensions:['arcade','arrays'],extensionURLs:{arrays:'https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js'}};
    let serial=0;
    const text=value=>[10,String(value)],number=value=>[4,String(value)];
    function node(opcode,inputs={},fields={}) {
        const id=`b${++serial}`,n={opcode,next:null,parent:null,shadow:false,topLevel:false,inputs:{},fields};blocks[id]=n;
        for(const [key,value] of Object.entries(inputs)) {
            if(typeof value==='string'){n.inputs[key]=[2,value];blocks[value].parent=id;}
            else n.inputs[key]=[1,value];
        }
        return id;
    }
    const local=name=>node('arcade_getLocal',{NAME:text(name)});
    const special=kind=>node('arrays_specialValue',{}, {KIND:[kind,null]});
    const set=(name,value)=>node('arcade_setLocal',{NAME:text(name),VALUE:value});
    const create=()=>node('arrays_createReference',{VALUES:text('[]')});
    const palette=()=>node('arcade_setPalette',{DATA:text('012345'.repeat(16))});
    const global=value=>node('data_setvariableto',{VALUE:value},{VARIABLE:['published','published']});
    const push=(name,value=number(1))=>node('arrays_mutateReference',{ARRAY:local(name),OP:text('push'),INDEX:number(0),VALUE:value});
    const proto=node('procedures_prototype');blocks[proto].shadow=true;
    blocks[proto].mutation={proccode:'build',argumentids:'[]',argumentnames:'[]',argumentdefaults:'[]',warp:'false'};
    const definition=node('procedures_definition',{custom_block:proto});blocks[definition].inputs.custom_block[0]=1;blocks[definition].topLevel=true;
    const hat=node('arcade_whenSourceStarts');blocks[hat].topLevel=true;
    const call=node('procedures_call');blocks[call].mutation={proccode:'build',argumentids:'[]',warp:'false'};
    blocks[hat].next=call;blocks[call].parent=hat;
    const resets=[],overwrites=[],reads=[],sequence=[];
    for(let i=0;i<count;i++){const id=set(`cell${i}`,special(i%2?'undefined':'null'));resets.push(id);sequence.push(id);}
    const effect=palette();sequence.push(effect);
    for(let i=0;i<count;i++){
        sequence.push(set(`fresh${i}`,create()));const write=set(`cell${i}`,local(`fresh${i}`));overwrites.push(write);sequence.push(write);
        sequence.push(push(`cell${i}`),global(local(`cell${i}`)));
    }
    for(let i=0;i<count;i++){const read=node('arrays_referenceLength',{ARRAY:local(`cell${i}`)});reads.push(read);sequence.push(node('data_setvariableto',{VALUE:read},{VARIABLE:['out','out']}));}
    function chain(ids,start=definition){let prior=start;for(const id of ids){blocks[prior].next=id;blocks[id].parent=prior;prior=id;}blocks[prior].next=null;}
    chain(sequence);
    const insert=(before,id)=>{const prior=blocks[before].parent;blocks[prior].next=id;blocks[id].parent=prior;blocks[id].next=before;blocks[before].parent=id;};
    return {project,target,blocks,node,text,number,local,set,special,create,palette,global,push,proto,definition,hat,call,resets,overwrites,reads,effect,sequence,insert,chain};
}
const results=f=>{const proof=createArrayReferenceExportAuthority(f.project);return f.reads.map(id=>proof.validateInput(f.target,f.blocks[id]).ok);};
const refuses=f=>assert.deepEqual(results(f),f.reads.map(()=>false));

test('seven separate local resets cross palette, independent construction, push and publication',()=>{
    const f=fixture(7),before=JSON.stringify(f.project);assert.deepEqual(results(f),Array(7).fill(true));assert.equal(JSON.stringify(f.project),before);
    assert.deepEqual(results({...f,project:structuredClone(f.project),target:null}),Array(7).fill(false));
    const saved=structuredClone(f.project),proof=createArrayReferenceExportAuthority(saved);
    for(const id of f.reads)assert.equal(proof.validateInput(saved.targets[0],saved.targets[0].blocks[id]).ok,true);
});
test('a noncloud unrelated global assignment preserves effects without exposing the local',()=>{const f=fixture();f.insert(f.overwrites[0],f.global(f.number(8)));assert.deepEqual(results(f),[true]);});
test('a local read hidden in an otherwise unrelated assignment refuses',()=>{const f=fixture();f.insert(f.overwrites[0],f.global(f.local('cell0')));refuses(f);});
test('an alias of the reset value before overwrite refuses',()=>{const f=fixture();f.insert(f.overwrites[0],f.set('alias',f.local('cell0')));refuses(f);});
test('managed call, yield and lifecycle commands retain the reset',()=>{for(const opcode of ['arcade_callFunction','control_wait','arcade_gameOver','arcade_pushScene']){const f=fixture();f.insert(f.overwrites[0],f.node(opcode));refuses(f);}});
test('a callback capturing any current local can retain the entire frame',()=>{const f=fixture();f.insert(f.overwrites[0],f.node('arcade_registerCountdownHandler',{TOKEN:f.text('later'),CAPTURES:f.text('fresh0')}));refuses(f);});
test('a later callback capture after overwrite does not retroactively expose the old value',()=>{
    const f=fixture(),registration=f.node('arcade_registerCountdownHandler',{TOKEN:f.text('later'),CAPTURES:f.text('cell0')});
    f.insert(f.sequence.at(-1),registration);const hat=f.node('arcade_whenRegisteredCountdown',{TOKEN:f.text('later')});f.blocks[hat].topLevel=true;
    assert.deepEqual(results(f),[true]);
});
test('foreign local identity and an actual formal cannot borrow the local reset proof',()=>{
    const f=fixture();f.blocks[f.overwrites[0]].inputs.NAME=[1,f.text('foreign')];refuses(f);
    const formal=fixture(),reporter=formal.node('argument_reporter_string_number',{}, {VALUE:['cell0',null]});formal.blocks[reporter].shadow=true;
    const proto=formal.blocks[formal.proto];proto.inputs={arg:[1,reporter]};formal.blocks[reporter].parent=formal.proto;
    proto.mutation.argumentnames='["cell0"]';proto.mutation.argumentids='["arg"]';proto.mutation.argumentdefaults='[""]';
    formal.blocks[formal.call].inputs={arg:[1,formal.number(0)]};formal.blocks[formal.call].mutation.argumentids='["arg"]';refuses(formal);
});
test('a non-source caller and a nested conditional invocation refuse',()=>{
    for(const nested of [false,true]){const f=fixture();if(!nested)f.blocks[f.hat].opcode='arcade_whenRegisteredButton';else{
        const branch=f.node('control_if',{CONDITION:f.number(1),SUBSTACK:f.call});f.blocks[f.hat].next=branch;f.blocks[branch].parent=f.hat;
    }refuses(f);}
});
test('conditional and loop overwrites cannot masquerade as a linear overwrite',()=>{for(const opcode of ['control_if','control_repeat']){const f=fixture();f.insert(f.overwrites[0],f.node(opcode));refuses(f);}});
test('a cyclic next edge cannot prove the overwrite',()=>{const f=fixture();f.blocks[f.effect].next=f.effect;refuses(f);});
test('an orphan overwrite cannot supply a connected proof',()=>{const f=fixture();const n=f.blocks[f.overwrites[0]],prior=f.blocks[n.parent];prior.next=n.next;f.blocks[n.next].parent=n.parent;n.parent=null;n.next=null;refuses(f);});
test('a malformed operand parent or physical input tag refuses',()=>{for(const tag of [false,true]){const f=fixture();const get=f.blocks[f.overwrites[0]].inputs.VALUE;if(tag)get[0]=99;else f.blocks[get[1]].parent=f.definition;refuses(f);}});
test('a mutation may not read or alias the still-null candidate',()=>{const f=fixture();f.insert(f.overwrites[0],f.push('cell0'));refuses(f);});
test('a published fresh Array cannot borrow independent mutation credit',()=>{const f=fixture();const name='fresh0';f.insert(f.overwrites[0],f.global(f.local(name)));f.insert(f.overwrites[0],f.push(name));refuses(f);});
test('cloud or malformed variable declarations keep the incompatible initializer',()=>{for(const row of [['published',0,true],['other',0]]){const f=fixture();f.target.variables.published=row;f.insert(f.overwrites[0],f.global(f.number(8)));refuses(f);}});
test('unknown extension routes and dynamic owner declarations refuse',()=>{
    for(const edit of [f=>f.project.extensions.push('custom'),f=>{f.project.extensionURLs.arrays='https://example.invalid/arrays.js';},f=>{f.project.extensionURLs.arcade='https://example.invalid/arcade.js';},f=>f.insert(f.overwrites[0],f.node('arcade_createCallable'))]){const f=fixture();edit(f);refuses(f);}
});
test('a later incompatible writer remains in all-writer obligations',()=>{const f=fixture();f.insert(f.sequence.at(-1),f.set('cell0',f.number(3)));refuses(f);});
test('metadata mutation invalidates an already-issued extended graph proof',()=>{const f=fixture(),proof=createArrayReferenceExportAuthority(f.project);assert.equal(proof.validateInput(f.target,f.blocks[f.reads[0]]).ok,true);f.project.extensions.push('custom');assert.equal(proof.validateInput(f.target,f.blocks[f.reads[0]]).ok,false);});

test('native plain-object prototype setters are not actual own local cells',()=>{
    const renamed=name=>{const f=fixture();for(const n of Object.values(f.blocks))if(n.inputs?.NAME?.[1]?.[0]===10&&n.inputs.NAME[1][1]==='cell0')n.inputs.NAME[1][1]=name;return f;};
    const unsafe=renamed('__proto__');unsafe.blocks[unsafe.blocks[unsafe.resets[0]].inputs.VALUE[1]].fields.KIND[0]='undefined';refuses(unsafe);
    const adjacent=renamed('__proto__');adjacent.chain(adjacent.sequence.filter(id=>id!==adjacent.effect));delete adjacent.blocks[adjacent.effect];refuses(adjacent);
    for(const name of ['constructor','toString']){
        const poisoned=renamed(name);poisoned.insert(poisoned.resets[0],poisoned.set('__proto__',poisoned.special('undefined')));refuses(poisoned);
        // The original adjacent-reset path must not cross the same storage
        // hazard merely because there is no palette command in this version.
        const legacy=renamed(name);legacy.chain(legacy.sequence.filter(id=>id!==legacy.effect));delete legacy.blocks[legacy.effect];
        legacy.insert(legacy.resets[0],legacy.set('__proto__',legacy.special('undefined')));refuses(legacy);
    }
    // These inherited writable data properties become ordinary own cells on
    // assignment; they are not the inherited __proto__ setter.
    for(const name of ['constructor','toString','hasOwnProperty'])assert.deepEqual(results(renamed(name)),[true],name);
});

test('inherited native procedure-cache entries cannot establish a fresh invocation frame',()=>{
    for(const name of Object.getOwnPropertyNames(Object.prototype)){
        const f=fixture();f.blocks[f.proto].mutation.proccode=name;f.blocks[f.call].mutation.proccode=name;refuses(f);
    }
    const f=fixture();f.blocks[f.proto].mutation.proccode='constructor ordinary';f.blocks[f.call].mutation.proccode='constructor ordinary';assert.deepEqual(results(f),[true]);
});

test('declared extensions cannot hide owners inferred from physical blocks or monitors',()=>{
    for(const edit of [
        f=>{f.node('custom_payload');},
        f=>{f.insert(f.overwrites[0],f.node('custom_payload'));},
        f=>{f.project.monitors=[{opcode:'custom_payload'}];},
        f=>{f.project.extensions=['arcade'];},
        f=>{f.project.monitors=null;}
    ]){const f=fixture();edit(f);refuses(f);}
    const f=fixture();f.project.monitors=[{opcode:'data_variable'}];assert.deepEqual(results(f),[true]);
});

test('physical native entry, storage and unavailable metadata cannot bypass the closed proof',()=>{
    for(const value of [[],{},null,17]){
        const f=fixture(),call=f.node('procedures_call');f.blocks[call].mutation={proccode:value,argumentids:'[]',warp:'false'};refuses(f);
    }
    for(const value of ['{}','[1]','["a","a"]']){
        const f=fixture(),call=f.node('procedures_call');f.blocks[call].mutation={proccode:'build',argumentids:value,warp:'false'};refuses(f);
    }
    const duplicateProto=fixture(),proto=duplicateProto.node('procedures_prototype');duplicateProto.blocks[proto].mutation=structuredClone(duplicateProto.blocks[duplicateProto.proto].mutation);refuses(duplicateProto);
    const duplicateDef=fixture(),p=duplicateDef.node('procedures_prototype');duplicateDef.blocks[p].mutation=structuredClone(duplicateDef.blocks[duplicateDef.proto].mutation);duplicateDef.node('procedures_definition',{custom_block:p});refuses(duplicateDef);
    const unsafeVariable=fixture();Object.defineProperty(unsafeVariable.target.variables,'__proto__',{value:['other',0],enumerable:true,writable:true,configurable:true});refuses(unsafeVariable);
    for(const id of Object.getOwnPropertyNames(Object.prototype)){
        const f=fixture();Object.defineProperty(f.blocks,id,{value:{opcode:'text',inputs:{},fields:{TEXT:['unused',null]},shadow:true,topLevel:false,parent:null,next:null},enumerable:true});refuses(f);
    }
    const unknown=fixture();unknown.project.monitors=undefined;refuses(unknown);
    for(const value of [undefined,null]){
        const f=fixture(),proof=createArrayReferenceExportAuthority(f.project);assert.equal(proof.validateInput(f.target,f.blocks[f.reads[0]]).ok,true);
        f.project.monitors=value;assert.equal(proof.validateInput(f.target,f.blocks[f.reads[0]]).ok,false);
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

const original=`let absent:any[]
let text=absent+""
let numeric=+absent
let before=absent===undefined
let truth=!!absent
absent=[5]
let after=absent+""
let item=absent[0]`;
const channels=(value,required)=>{
    const ds=Object.getOwnPropertyDescriptors(value),names=new Set([...required,'unsupported','warnings','errors','unparsed','diagnostics','fetchRefusals','refused','netAttempts',...Reflect.ownKeys(ds).filter(k=>typeof k==='string'&&/unsupported|warn|error|unparsed|diagnostic|refus|netAttempts/i.test(k))]);
    for(const name of names){const d=ds[name];if(!d){assert.equal(required.includes(name),false,'required channel '+name);continue;}assert.ok(Object.hasOwn(d,'value'),'provided accessor '+name);assert.ok(Array.isArray(d.value),'provided channel '+name);assert.deepEqual(d.value,[],name);}
};
const current=source=>{const imported=arcadeToPseudocode(source);channels(imported,['unsupported','warnings']);const creator=new Creator();creator.parse(imported.code);channels(creator,['errors','warnings','unparsed']);return {creator,imported};};
const item=creator=>{for(const target of creator.project.targets)for(const [id,node]of Object.entries(target.blocks))if(node.opcode==='arrays_referenceItem')return {target,id,node};throw Error('missing actual item');};
const accepted=creator=>{const before=structuredClone(creator.project),result=projectToArcade(creator.project);channels(result,['unsupported','warnings']);assert.deepEqual(creator.project,before,'export does not replace writers or effects');return result;};
const refused=creator=>assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));

test('observed undefined followed by an actual mandatory Array retains all original public operations',()=>{
    const {creator,imported}=current(original),{target,node}=item(creator),id=node.inputs.ARRAY[1][2];
    const writers=Object.values(target.blocks).filter(n=>n.opcode==='data_setvariableto'&&n.fields.VARIABLE?.[1]===id);
    assert.equal(writers.length,2);assert.equal(target.blocks[writers[0].inputs.VALUE[1]].opcode,'arrays_specialValue');
    assert.deepEqual(target.blocks[writers[0].inputs.VALUE[1]].fields.KIND,['undefined',null]);
    const raw=Object.values(target.blocks).flatMap(n=>Object.values(n.inputs)).filter(slot=>Array.isArray(slot[1])&&slot[1][0]===12&&slot[1][2]===id);assert.equal(raw.length,6,'four undefined reads and two post-assignment reads remain');
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,true);accepted(creator);
    assert.match(imported.code,/set absent to \(undefined value\)/);
    const code=creator.decompile(structuredClone(creator.project)),second=new Creator();second.parse(code);channels(second,['errors','warnings','unparsed']);accepted(second);
});

test('actual assigned aliases transfer the current allocation without reading a future writer',()=>{
    for(const source of ['let absent:any[];let before=absent===undefined;absent=[5];let alias=absent;let item=alias[0]',
        'let absent:any[];absent=[5];let alias=absent;absent=alias;let item=absent[0]'])accepted(current(source).creator);
    for(const source of ['let absent:any[];let item=absent[0];absent=[5]',
        'let absent:any[];let alias=absent;absent=[5];let item=alias[0]',
        'let absent:any[];absent=[5];let item=absent[0];absent=0 as any',
        'let absent:any[];absent=[5];let item=absent[0];absent=0 as any;absent=[6]',
        'let absent:any[];absent=[5];let alias=absent;let item=alias[0];alias=0 as any;alias=[6]'])refused(current(source).creator);
});

test('conditional loop call and registered entries cannot acquire straight-line occurrence credit',()=>{
    for(const source of ['let absent:any[];let flag=true;if(flag){absent=[5]};let item=absent[0]',
        'let absent:any[];for(let i=0;i<2;i++){absent=[5]};let item=absent[0]',
        'let absent:any[];function put(){absent=[5]};put();let item=absent[0]',
        'let absent:any[];absent=[5];game.onUpdate(function(){absent=[6]});let item=absent[0]',
        'let absent:any[];absent=[5];pause(1);let item=absent[0]'])refused(current(source).creator);
});

test('the complete current writer ID owner and physical edge inventory remains mandatory',()=>{
    const baseline=current(original).creator,stage=baseline.project.targets.find(t=>t.isStage),monitors=structuredClone(baseline.project.monitors);
    assert.equal(monitors.length,Object.keys(stage.variables).length,'the actual Creator keeps all canonical hidden variable monitors');
    assert.ok(monitors.length>0);accepted(baseline);assert.deepEqual(baseline.project.monitors,monitors,'accepted monitors are preserved');
    for(const edit of [
        m=>{m.mode='slider';},m=>{m.visible=true;},m=>{m.opcode='data_listcontents';},
        m=>{m.id='foreign-monitor-id';},m=>{m.params.VARIABLE='foreign-name';},
        m=>{m.params.EXTRA='unknown';},m=>{m.unknown=true;},m=>{m.spriteName='Game';},
        m=>{m.value=[];},m=>{m.sliderMin=-1;},m=>{m.x=Infinity;}
    ]){const {creator}=current(original),{target,node}=item(creator);edit(creator.project.monitors[0]);assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,false);refused(creator);}
    for(const edit of [
        creator=>{creator.project.monitors.push(structuredClone(creator.project.monitors[0]));},
        creator=>{const stage=creator.project.targets.find(t=>t.isStage),game=creator.project.targets.find(t=>!t.isStage),id=creator.project.monitors[0].id;game.variables[id]=stage.variables[id];delete stage.variables[id];}
    ]){const {creator}=current(original),{target,node}=item(creator);edit(creator);assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,false);refused(creator);}
    for(const edit of [
        (creator,target,node)=>{node.inputs.ARRAY[1][2]='foreign-id';},
        (creator,target,node)=>{const stage=creator.project.targets.find(t=>t.isStage);stage.variables[node.inputs.ARRAY[1][2]][0]='other';},
        (creator,target,node)=>{const variable=node.inputs.ARRAY[1];target.blocks.orphan={opcode:'data_setvariableto',parent:null,next:null,inputs:{VALUE:[1,[4,'0']]},fields:{VARIABLE:[variable[1],variable[2]]},shadow:false,topLevel:false};},
        (creator,target,node)=>{node.parent=Object.keys(target.blocks).find(id=>target.blocks[id].opcode==='looks_hide');},
        (creator,target,node)=>{const value=Object.values(target.blocks).find(n=>n.opcode==='arrays_createReference');value.inputs.VALUES=[1,[10,'[{}]']];},
        (creator,target,node)=>{const value=Object.values(target.blocks).find(n=>n.opcode==='arrays_createReference');value.inputs.EXTRA=[1,[10,'[]']];}
    ]){const {creator}=current(original),{target,node}=item(creator);edit(creator,target,node);refused(creator);}
    for(const edit of [
        creator=>{creator.project.targets.find(t=>t.isStage).isStage='true';},
        creator=>{const stage=creator.project.targets.find(t=>t.isStage);creator.project.targets.push({...structuredClone(stage),name:'OtherStage',variables:{},blocks:{}});},
        (creator,target)=>{Object.values(target.blocks).find(n=>n.opcode==='arrays_specialValue').fields.KIND[1]='foreign-metadata';}
    ]){const {creator}=current(original),{target,node}=item(creator);edit(creator,target);assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,false);}
});

test('issued occurrence credit expires on physical or metadata ABA and fresh policies reprove restoration',()=>{
    for(const edit of [
        (creator,node)=>{const old=node.inputs.ARRAY;node.inputs.ARRAY=[...old];return()=>{node.inputs.ARRAY=old;};},
        creator=>{const old=creator.project.extensions;creator.project.extensions=[...old,'unknown'];return()=>{creator.project.extensions=old;};},
        creator=>{const monitor=creator.project.monitors[0];monitor.visible=true;return()=>{monitor.visible=false;};}
    ]){const {creator}=current(original),{target,node}=item(creator),proof=createArrayReferenceExportAuthority(creator.project);assert.equal(proof.validateInput(target,node).ok,true);const restore=edit(creator,node);assert.equal(proof.validateInput(target,node).ok,false);restore();assert.equal(proof.validateInput(target,node).ok,false);assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,true);}
});

test('descriptor false and actual reflection throw observations expire before consumer early exits',()=>{
    const {creator}=current(original),{target,node}=item(creator),proof=createArrayReferenceExportAuthority(creator.project);assert.equal(proof.validateInput(target,node).ok,true);
    const old=Object.getOwnPropertyDescriptor(creator.project,'extensions'),calls=[];
    Object.defineProperty(creator.project,'extensions',{configurable:true,get(){calls.push('must not run');throw Error('getter');}});
    assert.equal(proof.validateInput(target,node).ok,false);assert.deepEqual(calls,[],'descriptor observation never invokes the source getter');
    Object.defineProperty(creator.project,'extensions',old);assert.equal(proof.validateInput(target,node).ok,false);assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,true);
    const throwing=createArrayReferenceExportAuthority(creator.project),targets=creator.project.targets,sentinel=Error('actual reflection trap');assert.equal(throwing.validateInput(target,node).ok,true);
    creator.project.targets=new Proxy(targets,{getOwnPropertyDescriptor(){throw sentinel;}});
    assert.throws(()=>throwing.validateInput(target,node),error=>error===sentinel);
    creator.project.targets=targets;assert.equal(throwing.validateInput(target,node).ok,false);assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,true);
});

test('intrinsic and prototype mutation cannot disguise an observed physical change or revive a fact',()=>{
    const arrayIterator=Object.getPrototypeOf([][Symbol.iterator]()),cases=[
        [arrayIterator,'next'],[Object.getPrototypeOf(new Map().entries()),'next'],
        [Object.getPrototypeOf(new Set().values()),'next'],[Object.getPrototypeOf(arrayIterator),Symbol.iterator]
    ];
    for(const [prototype,key]of cases){
        const {creator}=current(original),{target,node}=item(creator),proof=createArrayReferenceExportAuthority(creator.project);assert.equal(proof.validateInput(target,node).ok,true);
        const old=Object.getOwnPropertyDescriptor(prototype,key);assert.ok(old&&typeof old.value==='function');let calls=0,result;
        try{Object.defineProperty(prototype,key,{...old,value:function(){calls++;throw Error('foreign iterator must not run');}});result=proof.validateInput(target,node).ok;}
        finally{Object.defineProperty(prototype,key,old);}
        assert.equal(result,false);assert.equal(calls,0,'refuse before invoking a modified iterator');assert.equal(proof.validateInput(target,node).ok,false);assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,true);
    }

    for(const name of ['includes','map','indexOf']){
        const {creator}=current(original),{target,node}=item(creator),proof=createArrayReferenceExportAuthority(creator.project);assert.equal(proof.validateInput(target,node).ok,true);
        const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,name),parent=Object.getPrototypeOf(node.inputs.ARRAY);
        let result;
        try{Object.defineProperty(Array.prototype,name,{...descriptor,value:function(){return name==='includes'?true:[];}});Object.setPrototypeOf(node.inputs.ARRAY,{});result=proof.validateInput(target,node).ok;}
        finally{Object.defineProperty(Array.prototype,name,descriptor);Object.setPrototypeOf(node.inputs.ARRAY,parent);}
        assert.equal(result,false,name);assert.equal(proof.validateInput(target,node).ok,false,name+' restoration');assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,true);
    }
});

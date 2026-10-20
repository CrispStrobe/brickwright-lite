import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {createArrayOccurrenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-occurrence-export-authority.js';

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

test('closed occurrence refusal remains separate from independent primary Array proofs',()=>{
    const sources=['let absent:any[];let flag=true;if(flag){absent=[5]};let item=absent[0]',
        'let absent:any[];for(let i=0;i<2;i++){absent=[5]};let item=absent[0]',
        'let absent:any[];function put(){absent=[5]};put();let item=absent[0]',
        'let absent:any[];absent=[5];game.onUpdate(function(){absent=[6]});let item=absent[0]',
        'let absent:any[];absent=[5];pause(1);let item=absent[0]'];
    for(let i=0;i<sources.length;i++){
        const {creator}=current(sources[i]),profile=createArrayOccurrenceExportAuthority(creator.project),receiver=item(creator);
        for(const target of creator.project.targets)for(const node of Object.values(target.blocks))
            if(node.opcode.startsWith('arrays_')&&Object.hasOwn(node.inputs,'ARRAY'))
                assert.equal(profile.validateInput(target,node,'ARRAY'),false,'closed profile source '+i+' '+node.opcode);
        // Actual independent primary dominance retains the Array across an
        // Array-only handler and a pause; neither acquires closed-profile facts.
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(receiver.target,receiver.node).ok,i>=3,'primary source '+i);
        if(i<3)refused(creator);else accepted(creator);
    }
});

test('closed profile metadata rules remain separate from actual primary writer and binding obligations',()=>{
    const baseline=current(original).creator,stage=baseline.project.targets.find(t=>t.isStage),monitors=structuredClone(baseline.project.monitors);
    assert.equal(monitors.length,Object.keys(stage.variables).length,'the actual Creator keeps all canonical hidden variable monitors');
    assert.ok(monitors.length>0);accepted(baseline);assert.deepEqual(baseline.project.monitors,monitors,'accepted monitors are preserved');
    const baselineReceiver=item(baseline);
    assert.equal(createArrayOccurrenceExportAuthority(baseline.project).validateInput(baselineReceiver.target,baselineReceiver.node,'ARRAY'),true,'closed profile metadata negatives start from actual accepted facts');
    for(const edit of [
        m=>{m.mode='slider';},m=>{m.visible=true;},m=>{m.opcode='data_listcontents';},
        m=>{m.id='foreign-monitor-id';},m=>{m.params.VARIABLE='foreign-name';},
        m=>{m.params.EXTRA='unknown';},m=>{m.unknown=true;},m=>{m.spriteName='Game';},
        m=>{m.value=[];},m=>{m.sliderMin=-1;},m=>{m.x=Infinity;}
    ]){const {creator}=current(original),{target,node}=item(creator);edit(creator.project.monitors[0]);assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false,'exact closed-profile monitor schema remains mandatory');}
    for(const edit of [
        creator=>{creator.project.monitors.push(structuredClone(creator.project.monitors[0]));},
        creator=>{const stage=creator.project.targets.find(t=>t.isStage),game=creator.project.targets.find(t=>!t.isStage),id=creator.project.monitors[0].id;game.variables[id]=stage.variables[id];delete stage.variables[id];}
    ]){const {creator}=current(original),{target,node}=item(creator);edit(creator);assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false,'closed-profile monitor identity and Stage owner remain mandatory');}
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
        creator=>{const stage=creator.project.targets.find(t=>t.isStage);creator.project.targets.push({...structuredClone(stage),name:'OtherStage',variables:{},blocks:{}});}
    ]){const {creator}=current(original),{target,node}=item(creator);edit(creator,target);assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false,'closed profile requires one actual boolean Stage');}
    {const {creator}=current(original),{target,node}=item(creator);Object.values(target.blocks).find(n=>n.opcode==='arrays_specialValue').fields.KIND[1]='foreign-metadata';assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,false);refused(creator);}
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


test('a real local alias of a mixed global retains primary proof and sticky source currentness',()=>{
    const {creator}=current('let absent:any[];absent=[5];pause(1);let item=absent[0]');
    const {target,node}=item(creator),blocks=target.blocks,statement=blocks[node.parent],statementId=node.parent,priorId=statement.parent;
    assert.equal(statement.opcode,'data_setvariableto');assert.equal(blocks[priorId].next,statementId);
    const globalInput=structuredClone(node.inputs.ARRAY),name='actualLocalAlias';let serial=0;
    const add=(opcode,inputs={},fields={})=>{
        let id;do{id='occurrence-local-'+(++serial);}while(Object.hasOwn(blocks,id));
        blocks[id]={opcode,inputs,fields,parent:null,next:null,shadow:false,topLevel:false};return id;
    };
    const text=[1,[10,name]],resetValue=add('arrays_specialValue',{}, {KIND:['undefined',null]});
    const reset=add('arcade_setLocal',{NAME:structuredClone(text),VALUE:[2,resetValue]});blocks[resetValue].parent=reset;
    const left=add('arcade_setLocal',{NAME:structuredClone(text),VALUE:structuredClone(globalInput)});
    const right=add('arcade_setLocal',{NAME:structuredClone(text),VALUE:structuredClone(globalInput)});
    const branch=add('control_if_else',{CONDITION:[1,[4,'1']],SUBSTACK:[2,left],SUBSTACK2:[2,right]});
    blocks[left].parent=branch;blocks[right].parent=branch;
    blocks[priorId].next=reset;blocks[reset].parent=priorId;blocks[reset].next=branch;blocks[branch].parent=reset;
    blocks[branch].next=statementId;statement.parent=branch;
    const read=add('arcade_getLocal',{NAME:structuredClone(text)});blocks[read].parent=statement.inputs.VALUE[1];node.inputs.ARRAY=[2,read];
    // Both real local branch writers read the mixed global. The preceding
    // local undefined writer cannot be removed by a straight-line reset scan.
    assert.equal(blocks[reset].next,branch);assert.equal(blocks[branch].opcode,'control_if_else');
    assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false);
    const before=structuredClone(creator.project),proof=createArrayReferenceExportAuthority(creator.project);
    assert.equal(proof.validateInput(target,node).ok,true);accepted(creator);assert.deepEqual(creator.project,before);
    const original=creator.project.extensions;creator.project.extensions=[...original,'unknown'];
    assert.equal(proof.validateInput(target,node).ok,false);
    creator.project.extensions=original;
    assert.equal(proof.validateInput(target,node).ok,false,'observed source expiry is sticky through restoration');
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node).ok,true,'fresh primary proof independently rechecks the restored source');
});


test('nonprotected legacy queries revoke observed source failures before protected primary proof can revive',()=>{
    for(const source of [
        'let absent:any[];absent=[5];pause(1);let item=absent[0]',
        'let absent:any[];absent=[5];game.onUpdate(function(){absent=[6]});let item=absent[0]'
    ]){
        const {creator}=current(source),{target,node}=item(creator),proof=createArrayReferenceExportAuthority(creator.project);
        assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false);
        assert.equal(proof.validateInput(target,node,'ARRAY').ok,true,'independent primary proof is initially valid');
        assert.equal(proof.validateInput(target,node,'INDEX').ok,false,'a current wrong-input query does not revoke valid source');
        assert.equal(proof.validateInput(target,node,'ARRAY').ok,true);
        const original=node.inputs.ARRAY;node.inputs.ARRAY=structuredClone(original);
        assert.equal(proof.validateInput(target,node,'INDEX').ok,false,'legacy currentness actually observes replaced input identity');
        node.inputs.ARRAY=original;
        assert.equal(proof.validateInput(target,node,'ARRAY').ok,false,'wrong-input observation cannot revive after physical restoration');
        const restored=createArrayReferenceExportAuthority(creator.project);
        assert.equal(restored.validateInput(target,node,'ARRAY').ok,true);
        const blocks=target.blocks,sentinel=Error('actual legacy block reflection failure');let calls=0;
        target.blocks=new Proxy(blocks,{getOwnPropertyDescriptor(){calls++;throw sentinel;}});
        try{assert.throws(()=>restored.validateInput(target,node,'INDEX'),error=>error===sentinel);}
        finally{target.blocks=blocks;}
        assert.ok(calls>0,'the legacy JSON graph observation reached the genuine reflection trap');
        assert.equal(restored.validateInput(target,node,'ARRAY').ok,false,'actual legacy reflection throw revokes retained source authority');
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node,'ARRAY').ok,true,'fresh source proof independently rechecks restoration');
        accepted(creator);
    }
});


test('already-observed unrelated summary metadata mismatch revokes a retained independent primary proof',()=>{
    const {creator}=current('let absent:any[];absent=[5];pause(1);let item=absent[0]'),{target,node}=item(creator),blocks=target.blocks;
    const stage=creator.project.targets.find(t=>t.isStage);let serial=0;
    const add=(opcode,inputs={},fields={})=>{let id;do{id='occurrence-summary-'+(++serial);}while(Object.hasOwn(blocks,id));blocks[id]={opcode,inputs,fields,parent:null,next:null,shadow:false,topLevel:false};return id;};
    let variable='occurrence-summary-variable';while(Object.hasOwn(stage.variables,variable))variable+='-';
    stage.variables[variable]=['occurrenceSummaryValue',0];
    const create=add('arrays_createReference',{VALUES:[1,[10,'[]']]});
    const write=add('data_setvariableto',{VALUE:[2,create]},{VARIABLE:['occurrenceSummaryValue',variable]});blocks[create].parent=write;
    const prototype=add('procedures_prototype');blocks[prototype].shadow=true;
    blocks[prototype].mutation={proccode:'__occurrenceSummary',argumentids:'[]',argumentnames:'[]',argumentdefaults:'[]',warp:'false'};
    const definition=add('procedures_definition',{custom_block:[1,prototype]});blocks[definition].topLevel=true;blocks[prototype].parent=definition;blocks[definition].next=write;blocks[write].parent=definition;
    const call=add('procedures_call');blocks[call].mutation={proccode:'__occurrenceSummary',argumentids:'[]',warp:'false'};
    const hat=Object.keys(blocks).find(id=>blocks[id].opcode==='arcade_whenSourceStarts'),next=blocks[hat].next;
    blocks[hat].next=call;blocks[call].parent=hat;blocks[call].next=next;blocks[next].parent=call;
    const proof=createArrayReferenceExportAuthority(creator.project);
    assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false);
    assert.equal(proof.validateInput(target,node,'ARRAY').ok,true);
    assert.equal(proof.validateInput(target,node,'INDEX').ok,false);
    assert.equal(proof.validateInput(target,node,'ARRAY').ok,true,'unmodified unrelated summary does not revoke independent primary authority');
    const original=Object.getOwnPropertyDescriptor(creator.project,'extensions');let calls=0,observed;
    Object.defineProperty(creator.project,'extensions',{configurable:true,enumerable:original.enumerable,get(){calls++;return [...original.value,'unknown'];}});
    try{observed=proof.validateInput(target,node,'INDEX');}
    finally{Object.defineProperty(creator.project,'extensions',original);}
    assert.ok(calls>0,'the existing summary effectMetadata observation actually read the changed metadata');
    assert.deepEqual(observed,{ok:false,reason:'requires an actual initialized Array producer and compatible all writers'},'legacy live stayed true; only the already-issued summary metadata check observed the mismatch');
    assert.equal(proof.validateInput(target,node,'ARRAY').ok,false,'observed metadata mismatch is sticky after restoration');
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node,'ARRAY').ok,true);
    accepted(creator);
});

test('read-only monitor UI metadata preserves primary Array proof while actual addressed UI writers refuse',()=>{
    const source='let absent:any[];absent=[5];pause(1);let item=absent[0]';
    const {creator}=current(source),{target,node}=item(creator),id=node.inputs.ARRAY[1][2];
    const monitor=creator.project.monitors.find(m=>m.id===id);assert.ok(monitor);
    Object.assign(monitor,{visible:true,mode:'default',value:'shown value',x:31,y:47,width:200,height:80,sliderMin:-100,sliderMax:200});
    const proof=createArrayReferenceExportAuthority(creator.project);
    assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false);
    assert.equal(proof.validateInput(target,node,'ARRAY').ok,true);accepted(creator);
    monitor.x++;
    assert.equal(proof.validateInput(target,node,'ARRAY').ok,false,'actual read-only metadata is frozen, not exempted');
    monitor.x--;
    assert.equal(proof.validateInput(target,node,'ARRAY').ok,false);
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node,'ARRAY').ok,true);
    for(const mode of ['slider','list']){
        const fixture=current(source).creator,receiver=item(fixture),variableId=receiver.node.inputs.ARRAY[1][2];
        const active=fixture.project.monitors.find(m=>m.id===variableId);assert.ok(active);active.visible=true;active.mode=mode;
        assert.equal(createArrayReferenceExportAuthority(fixture.project).validateInput(receiver.target,receiver.node).ok,false,'actual '+mode+' controls can write the addressed Array variable');refused(fixture);
    }
    const hidden=current(source).creator,hiddenReceiver=item(hidden),hiddenId=hiddenReceiver.node.inputs.ARRAY[1][2];
    hidden.project.monitors.find(m=>m.id===hiddenId).mode='slider';
    assert.equal(createArrayReferenceExportAuthority(hidden.project).validateInput(hiddenReceiver.target,hiddenReceiver.node).ok,true,'hidden slider is not an active UI writer');accepted(hidden);
    const unrelated=current(source).creator,unrelatedReceiver=item(unrelated),unrelatedId=unrelatedReceiver.node.inputs.ARRAY[1][2];
    const other=unrelated.project.monitors.find(m=>m.id!==unrelatedId);assert.ok(other);other.mode='slider';other.visible=true;
    assert.equal(createArrayReferenceExportAuthority(unrelated.project).validateInput(unrelatedReceiver.target,unrelatedReceiver.node).ok,true,'an unrelated scalar slider cannot write this Array binding');accepted(unrelated);
});


test('actual monitor observation throws and source edits expire retained primary authority',()=>{
    for(const fault of ['throw','edit']){
        const {creator}=current('let absent:any[];absent=[5];pause(1);let item=absent[0]'),{target,node}=item(creator),id=node.inputs.ARRAY[1][2];
        const index=creator.project.monitors.findIndex(m=>m.id===id);assert.ok(index>=0);
        const monitor=creator.project.monitors[index],originalExtensions=creator.project.extensions,sentinel=Error('actual monitor property observation failed');
        let armed=false,calls=0;
        creator.project.monitors[index]=new Proxy(monitor,{get(object,key,receiver){
            if(armed&&key==='visible'){
                calls++;armed=false;
                if(fault==='throw')throw sentinel;
                creator.project.extensions=[...originalExtensions,'unknown'];
            }
            return Reflect.get(object,key,receiver);
        }});
        const proof=createArrayReferenceExportAuthority(creator.project);
        assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false);
        assert.equal(proof.validateInput(target,node,'ARRAY').ok,true,'unarmed actual monitor remains a valid primary context');
        armed=true;
        try{
            if(fault==='throw')assert.throws(()=>proof.validateInput(target,node,'ARRAY'),error=>error===sentinel);
            else assert.equal(proof.validateInput(target,node,'ARRAY').ok,false,'a normal monitor read return cannot conceal its actual source edit');
        }finally{armed=false;creator.project.extensions=originalExtensions;}
        assert.equal(calls,1,'the actual new monitor observation reached its armed property trap');
        // Keep the exact Proxy/monitor identity. Only the external trap state
        // and edited metadata are restored, so a fresh identity mismatch cannot
        // make this retained-policy refusal pass accidentally.
        assert.equal(proof.validateInput(target,node,'ARRAY').ok,false,'observed failure remains expired after restoration');
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,node,'ARRAY').ok,true,'fresh independent primary proof rechecks restored source');
        creator.project.monitors[index]=monitor;
        accepted(creator);
    }
});

test('closed occurrence source arithmetic contributes scalar results without changing Array writers',()=>{
    for(const op of ['+','-','*','/','%','**','&','|','^','<<','>>','>>>']){
        const {creator}=current(original),{target,node}=item(creator);
        const source=Object.values(target.blocks).filter(block=>block.opcode==='arcade_sourceValueBinary');
        assert.equal(source.length,2,'actual original undefined and initialized Array arithmetic');
        for(const block of source)block.fields.OP[0]=op;
        assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),true,op);
    }
    const {creator}=current('let absent:any[];let before=~absent;absent=[5];let after=~absent;let item=absent[0]'),{target,node}=item(creator);
    assert.equal(Object.values(target.blocks).filter(block=>block.opcode==='arcade_sourceValueUnary').length,2);
    assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),true);
});

test('closed occurrence source arithmetic keeps exact selector schema and actual initialized writer obligations',()=>{
    for(const edit of [
        block=>{block.fields.OP[0]='unknown';},
        block=>{block.fields.OP[1]='foreign-selector-id';},
        block=>{block.inputs.OP=[1,[10,'+']];},
        block=>{block.inputs.EXTRA=[1,[10,'0']];},
        block=>{delete block.inputs.RIGHT;},
        block=>{block.opcode='foreign_sourceValueBinary';}
    ]){
        const {creator}=current(original),{target,node}=item(creator),source=Object.values(target.blocks).find(block=>block.opcode==='arcade_sourceValueBinary');
        assert.ok(source);edit(source);
        assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false);
    }
    for(const source of ['let absent:any[];let value=absent+"";let item=absent[0];absent=[5]',
        'let absent:any[];absent=[5];let value=absent+"";absent=0 as any;let item=absent[0]']){
        const {creator}=current(source),{target,node}=item(creator);
        assert.equal(createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY'),false,source);
    }
});


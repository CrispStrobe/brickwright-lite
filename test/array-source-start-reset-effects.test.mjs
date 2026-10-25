import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

// Owned source controls. No SDK/VM execution or captured private input fixture.
const source='let samples=[Math.min(1,1),Math.min(-1,-1)];let sampled=samples[1];let finished=1;finished+=0';
const called='function value(){return 1}let before=value();'+source;
const ordered='let order=0;function first(){order=order*10+1;return 1}function second(){order=order*10+2;return -1}let samples=[Math.min(first(),second())];let sampled=samples[0];let finished=1;finished+=0';
const clean=result=>{assert.deepEqual(result.unsupported||[],[]);assert.deepEqual(result.warnings||[],[]);assert.deepEqual(result.errors||[],[]);};
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const literal=(target,node,name)=>{const raw=node.inputs?.[name]?.[1];return Array.isArray(raw)&&raw[0]===10?raw[1]:node.fields?.[name]?.[0];};
const creator=text=>{const result=arcadeToPseudocode(text);clean(result);const c=new Creator();c.parse(result.code);clean(c);return c;};
const exported=c=>{const out=projectJsonToArcade(JSON.stringify(c.project));clean(out);return out;};
const fixtures=new Map();
function fixture(text=source){
    if(!fixtures.has(text)){const first=creator(text),out=exported(first),second=creator(out.files);fixtures.set(text,JSON.stringify(second.project));}
    return JSON.parse(fixtures.get(text));
}
function query(draft){const project=createProjectJsonSnapshot(JSON.stringify(draft)),proof=createArrayReferenceExportAuthority(project),
    consumers=rows(project).filter(r=>['arrays_mutateReference','arrays_referenceItem'].includes(r.node.opcode));
    assert.ok(consumers.length>=2);return {project,proof,consumers,decisions:consumers.map(r=>proof.validateInput(r.target,r.node))};}
const accepted=draft=>{const result=query(draft);assert.ok(result.decisions.every(d=>d.ok),JSON.stringify(result.decisions));return result;};
const globals=p=>rows(p).filter(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[0]==='samples');
const reset=p=>globals(p).find(r=>r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arrays_specialValue');
function insertBefore(row,id,node){const previous=Object.entries(row.target.blocks).find(([,n])=>n.next===row.id);assert.ok(previous);previous[1].next=id;row.node.parent=id;row.target.blocks[id]={...node,parent:previous[0],next:row.id,shadow:false,topLevel:false};}
function refused(edit,text=called){const draft=fixture(text);accepted(draft);const before=rows(draft).filter(r=>['arrays_mutateReference','arrays_referenceItem'].includes(r.node.opcode)).map(r=>r.id);edit(draft);const result=query(draft);assert.deepEqual(result.consumers.map(r=>r.id),before);assert.ok(result.decisions.some(d=>!d.ok),JSON.stringify(result.decisions));}

test('closed source-start global and local resets retain full current emitted-file journeys',()=>{
    for(const text of [source,called,ordered,called.replace('return 1','return \"ok\"'),called.replace('function value(){return 1}', 'function leaf(){return 1}function value(){return leaf()}'),source.replaceAll('samples','values').replaceAll('sampled','observed')]){
        const draft=fixture(text),before=JSON.stringify(draft);accepted(draft);
        const out=projectJsonToArcade(before);clean(out);assert.equal(JSON.stringify(draft),before);
        const again=creator(out.files);clean(again);
    }
});

test('observing or copying the reset global before publication retains the original writer',()=>{
    for(const opcode of ['data_setvariableto','arrays_valueTruthy'])refused(p=>{
        const r=reset(p),call=rows(p).find(r=>r.node.opcode==='procedures_call'),id='early-reset-read';
        if(opcode==='data_setvariableto')insertBefore(call,id,{opcode,fields:{VARIABLE:['sampled',Object.keys(r.target.variables).find(k=>r.target.variables[k][0]==='sampled')]},inputs:{VALUE:[3,[12,...r.node.fields.VARIABLE],[10,'']]}});
        else {insertBefore(call,id,{opcode:'data_setvariableto',fields:{VARIABLE:['sampled',Object.keys(r.target.variables).find(k=>r.target.variables[k][0]==='sampled')]},inputs:{VALUE:[2,'early-truthy']}});r.target.blocks['early-truthy']={opcode,inputs:{VALUE:[3,[12,...r.node.fields.VARIABLE],[10,'']]},fields:{},parent:id,next:null,shadow:false,topLevel:false};}
    });
});

test('late reset, cloud binding, competing entry and monitored state cannot borrow the source-start theorem',()=>{
    refused(p=>{const r=reset(p),publish=globals(p).find(r=>r!==reset(p)&&r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arcade_getLocal');assert.ok(publish);const parent=r.target.blocks[r.node.parent];parent.next=r.node.next;r.target.blocks[r.node.next].parent=r.node.parent;const next=publish.node.next;publish.node.next=r.id;r.node.parent=publish.id;r.node.next=next;if(next)r.target.blocks[next].parent=r.id;});
    refused(p=>{const r=reset(p);p.targets.find(t=>Object.hasOwn(t.variables,r.node.fields.VARIABLE[1])).variables[r.node.fields.VARIABLE[1]].push(true);});
    refused(p=>{(p.monitors||(p.monitors=[])).push({visible:true,mode:'default'});});
    refused(p=>{const t=reset(p).target;t.blocks.other={opcode:'event_whenflagclicked',inputs:{},fields:{},next:null,parent:null,topLevel:true,shadow:false};});
});

test('value summaries require the actual canonical callee, zero arguments and closed body',()=>{
    for(const change of ['duplicate','name','args','effect','fallthrough','recursion','reference','candidate-read'])refused(p=>{
        const call=rows(p).find(r=>r.node.opcode==='arcade_callFunction'),definition=rows(p).find(r=>r.node.opcode==='procedures_definition'&&literal(r.target,call.node,'NAME')===r.target.blocks[r.node.inputs.custom_block[1]]?.mutation?.proccode);
        assert.ok(definition);
        if(change==='name')call.node.inputs.NAME=[1,[10,'unknown']];
        if(change==='args')call.node.inputs.ARGS=[1,[10,'[1]']];
        if(change==='duplicate'){const prototype=definition.target.blocks[definition.node.inputs.custom_block[1]];definition.target.blocks.copy={...structuredClone(definition.node),next:null,inputs:{custom_block:[1,'copy-prototype']}};definition.target.blocks['copy-prototype']={...structuredClone(prototype),parent:'copy'};}
        if(change==='effect')insertBefore({target:definition.target,id:definition.node.next,node:definition.target.blocks[definition.node.next]},'opaque-effect',{opcode:'arcade_setBackgroundColor',inputs:{COLOR:[1,[4,'1']]},fields:{}});
        if(change==='reference'){const returned=definition.target.blocks[definition.node.next];returned.inputs.VALUE=[2,'reference-return'];definition.target.blocks['reference-return']={opcode:'arrays_createReference',inputs:{VALUES:[1,[10,'[]']]},fields:{},parent:definition.node.next,next:null,shadow:false,topLevel:false};}
        if(change==='candidate-read'){const returned=definition.target.blocks[definition.node.next];returned.inputs.VALUE=[3,[12,...reset(p).node.fields.VARIABLE],[10,'']];}
        if(change==='fallthrough'){const returned=definition.target.blocks[definition.node.next];returned.opcode='looks_hide';returned.inputs={};}
        if(change==='recursion'){const returned=definition.target.blocks[definition.node.next],old=returned.inputs.VALUE[1];returned.inputs.VALUE=[2,'recursive-call'];definition.target.blocks['recursive-call']={...structuredClone(call.node),parent:definition.node.next};delete definition.target.blocks[old];}
    });
});

test('scalar call effects transfer current values rather than borrowing Number from the first writer',()=>{
    refused(p=>{const setter=rows(p).find(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[0]==='order'&&r.target.blocks[r.node.parent]?.opcode==='procedures_definition');assert.ok(setter);setter.node.inputs.VALUE=[1,[10,'wrong']];},ordered);
    refused(p=>{const returned=rows(p).find(r=>r.node.opcode==='arcade_returnValue');returned.node.inputs.VALUE=[1,[10,'wrong']];},ordered);
});

test('opaque effects, local reads before construction and extra startup calls retain resets',()=>{
    refused(p=>{const call=rows(p).find(r=>r.node.opcode==='procedures_call');insertBefore(call,'opaque',{opcode:'control_wait',inputs:{DURATION:[1,[4,'0']]},fields:{}});});
    refused(p=>{const local=rows(p).find(r=>r.node.opcode==='arcade_setLocal'&&r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arrays_createReference');assert.ok(local);const name=literal(local.target,local.node,'NAME');insertBefore(local,'early-local',{opcode:'data_setvariableto',fields:{VARIABLE:[...reset(p).node.fields.VARIABLE]},inputs:{VALUE:[2,'early-local-read']}});local.target.blocks['early-local-read']={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,name]]},fields:{},parent:'early-local',next:null,shadow:false,topLevel:false};});
    refused(p=>{const call=rows(p).find(r=>r.node.opcode==='procedures_call');insertBefore(call,'second-call',{...structuredClone(call.node)});});
});

test('used source-start dependencies expire after observed ambient changes and never revive on restoration',()=>{
    const {project,proof,consumers}=accepted(fixture(called)),selected=consumers.find(r=>r.node.opcode==='arrays_referenceItem');
    assert.ok(Object.isFrozen(project));
    const original=Object.getOwnPropertyDescriptor(Array.prototype,'sourceStartTest');
    try{Object.defineProperty(Array.prototype,'sourceStartTest',{value:1,configurable:true});assert.equal(proof.validateInput(selected.target,selected.node).ok,false);}
    finally{if(original)Object.defineProperty(Array.prototype,'sourceStartTest',original);else delete Array.prototype.sourceStartTest;}
    assert.equal(proof.validateInput(selected.target,selected.node).ok,false);
});

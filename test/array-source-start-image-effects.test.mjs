import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

// Source-only consumer of the unchanged hosted Image/identity/Array fixture.
// Importing its SDK/VM harness would cross this test's source boundary.
const fixtureText=readFileSync(new URL('./makecode-arcade-image-values.test.mjs',import.meta.url),'utf8');
const source=fixtureText.match(/const source=`([\s\S]*?)`;/)?.[1];
assert.ok(source&&!source.includes('${')&&!source.includes('\\'));
const clean=result=>{assert.deepEqual(result.unsupported||[],[]);assert.deepEqual(result.warnings||[],[]);assert.deepEqual(result.errors||[],[]);};
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const literal=(row,name)=>row.node.fields?.[name]?.[0]??(Array.isArray(row.node.inputs?.[name]?.[1])?row.node.inputs[name][1][1]:row.target.blocks[row.node.inputs?.[name]?.[1]]?.fields?.TEXT?.[0]);
const creator=text=>{const imported=arcadeToPseudocode(text);clean(imported);const c=new Creator();c.parse(imported.code);clean(c);for(const art of imported.costumes)c.applyCustomSVG(art.sprite,art.svg);return c;};
const exported=(c,project=c.project)=>{const out=projectToArcade(project,{costumeSvg:(target,costume)=>c.assets.get(costume.assetId)?.data});clean(out);return out;};
let cached;
const fixture=()=>{
    if(!cached){const first=creator(source),out=exported(first),second=creator(out.ts);cached=JSON.stringify(second.project);}
    return JSON.parse(cached);
};
const query=draft=>{
    const project=createProjectJsonSnapshot(JSON.stringify(draft)),proof=createArrayReferenceExportAuthority(project);
    const consumers=rows(project).filter(r=>['arrays_mutateReference','arrays_referenceIndexOf'].includes(r.node.opcode));
    assert.ok(consumers.length>=4);return {project,proof,consumers,decisions:consumers.map(r=>proof.validateInput(r.target,r.node))};
};
const accepted=draft=>{const result=query(draft);assert.ok(result.decisions.every(d=>d.ok),JSON.stringify(result.decisions));return result;};
const removeTree=(target,id)=>{if(typeof id!=='string')return;const n=target.blocks[id];if(!n)return;for(const slot of Object.values(n.inputs||{}))for(let i=1;i<slot.length;i++)removeTree(target,slot[i]);delete target.blocks[id];};
const replaceInput=(row,name,input)=>{for(const edge of row.node.inputs[name].slice(1))removeTree(row.target,edge);row.node.inputs[name]=input;};
const refsWriters=p=>rows(p).filter(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[0]==='refs');
const reset=p=>refsWriters(p).find(r=>r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arrays_specialValue');
const publication=p=>refsWriters(p).find(r=>r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arcade_getLocal');
const insertBefore=(row,id,node)=>{
    const previous=Object.entries(row.target.blocks).find(([,n])=>n.next===row.id);assert.ok(previous);
    previous[1].next=id;row.node.parent=id;row.target.blocks[id]={...node,parent:previous[0],next:row.id,shadow:false,topLevel:false};
};
const refused=edit=>{
    const draft=fixture();accepted(draft);const ids=query(draft).consumers.map(r=>r.id);edit(draft);const result=query(draft);
    assert.deepEqual(result.consumers.map(r=>r.id),ids);assert.ok(result.decisions.some(d=>!d.ok),JSON.stringify(result.decisions));
};
const identity=p=>{
    const calls=rows(p).filter(r=>r.node.opcode==='arcade_callFunction');
    assert.equal(calls.length,1,'the fixture has one actual identity call after canonical operator lowering');
    const call=calls[0],definition=rows(p).find(r=>r.node.opcode==='procedures_definition'&&r.target.blocks[r.node.inputs.custom_block[1]]?.mutation?.proccode===literal(call,'NAME'));
    assert.ok(definition);const prototype=definition.target.blocks[definition.node.inputs.custom_block[1]];
    return {call,definition,prototype};
};

test('actual Image fixture retains global/local Array authority through second source export and JSON',()=>{
    const first=creator(source);
    for(const project of [first.project,JSON.parse(JSON.stringify(first.project))]){
        const out=exported(first,project),second=creator(out.ts);
        for(const reopened of [second.project,JSON.parse(JSON.stringify(second.project))]){
            const before=JSON.stringify(reopened);accepted(reopened);const again=exported(second,reopened);
            assert.equal(JSON.stringify(reopened),before);assert.match(again.ts,/\.clone\(/);assert.match(again.ts,/\.setPixel\(/);
            assert.match(again.ts,/\.indexOf\(/);assert.doesNotMatch(again.ts,/\.join\(/);
        }
    }
});

test('Image prefix cannot hide a read, missing overwrite, or later incompatible writer of the reset global',()=>{
    refused(p=>{const r=reset(p),call=rows(p).find(r=>r.node.opcode==='procedures_call'),observed=rows(p).find(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[0]==='index');assert.ok(r&&call&&observed);insertBefore(call,'image-early-global-copy',{opcode:'data_setvariableto',fields:{VARIABLE:[...observed.node.fields.VARIABLE]},inputs:{VALUE:[3,[12,...r.node.fields.VARIABLE],[10,'']]}});});
    refused(p=>{const r=publication(p);assert.ok(r);replaceInput(r,'VALUE',[3,[12,...r.node.fields.VARIABLE],[10,'']]);});
    refused(p=>{const r=publication(p);assert.ok(r);replaceInput(r,'VALUE',[1,[10,'missing Array allocation']]);});
    refused(p=>{const r=publication(p),previous=r.target.blocks[r.node.parent],next=r.node.next;assert.ok(previous);
        const oldParent=r.node.parent;previous.next='image-conditional-overwrite';
        r.target.blocks['image-conditional-overwrite']={opcode:'control_if',inputs:{CONDITION:[1,[10,'true']],SUBSTACK:[2,r.id]},fields:{},parent:oldParent,next,shadow:false,topLevel:false};
        r.node.parent='image-conditional-overwrite';r.node.next=null;if(next)r.target.blocks[next].parent='image-conditional-overwrite';
    });
    refused(p=>{const r=publication(p);assert.ok(r);const next=r.node.next;assert.ok(next);insertBefore({target:r.target,id:next,node:r.target.blocks[next]},'image-later-scalar-writer',{opcode:'data_setvariableto',fields:{VARIABLE:[...r.node.fields.VARIABLE]},inputs:{VALUE:[1,[4,'1']]}});});
});

test('identity effect requires its actual formal, exact optional Any prefix and unique declaration',()=>{
    refused(p=>{const {definition}=identity(p),returned=rows(p).find(r=>r.node.opcode==='arcade_returnValue'&&r.target===definition.target&&r.node.parent===definition.id)||rows(p).find(r=>r.node.opcode==='arcade_returnValue'&&r.target===definition.target&&r.target.blocks[r.node.parent]?.opcode==='arcade_declareParameterConstraint');assert.ok(returned);const read=returned.target.blocks[returned.node.inputs.VALUE[1]];assert.equal(read.opcode,'arcade_getLocal');read.inputs.NAME=[1,[10,'otherFormal']];});
    for(const field of ['PROCEDURE','PARAMETER','TYPE'])refused(p=>{
        const {definition,prototype}=identity(p),first=definition.target.blocks[definition.node.next];
        if(first.opcode==='arcade_declareParameterConstraint')first.fields[field][0]='wrong';
        else {const formal=JSON.parse(prototype.mutation.argumentnames)[0];insertBefore({target:definition.target,id:definition.node.next,node:first},'image-wrong-constraint',{opcode:'arcade_declareParameterConstraint',inputs:{},fields:{PROCEDURE:[prototype.mutation.proccode,null],PARAMETER:[formal,null],TYPE:['Any',null]}});definition.target.blocks['image-wrong-constraint'].fields[field][0]='wrong';}
    });
    refused(p=>{const {definition,prototype}=identity(p);definition.target.blocks['image-duplicate-prototype']={...structuredClone(prototype),parent:null,topLevel:true};});
    refused(p=>{const {definition,prototype}=identity(p),id=JSON.parse(prototype.mutation.argumentids)[0];definition.target.blocks[prototype.inputs[id][1]].fields.VALUE[0]='otherFormal';});
    refused(p=>{const {definition,prototype}=identity(p),firstId=definition.node.next,first=definition.target.blocks[firstId],formal=JSON.parse(prototype.mutation.argumentnames)[0];
        const fields={PROCEDURE:[prototype.mutation.proccode,null],PARAMETER:[formal,null],TYPE:['Any',null]};
        insertBefore({target:definition.target,id:firstId,node:first},'image-constraint-one',{opcode:'arcade_declareParameterConstraint',inputs:{},fields:structuredClone(fields)});
        insertBefore({target:definition.target,id:firstId,node:first},'image-constraint-two',{opcode:'arcade_declareParameterConstraint',inputs:{},fields:structuredClone(fields)});
    });
    refused(p=>{const {definition}=identity(p);insertBefore({target:definition.target,id:definition.node.next,node:definition.target.blocks[definition.node.next]},'image-extra-effect',{opcode:'control_wait',inputs:{DURATION:[1,[4,'0']]},fields:{}});});
});

test('Image effects refuse unknown entry, malformed image schema and Array coercion',()=>{
    refused(p=>{const {call}=identity(p);replaceInput(call,'NAME',[1,[10,'unknownIdentity']]);});
    refused(p=>{const {call}=identity(p),r=reset(p),argument={target:call.target,node:call.target.blocks[call.node.inputs.ARGS[1]]};assert.ok(argument.node);replaceInput(argument,'VALUE',[3,[12,...r.node.fields.VARIABLE],[10,'']]);});
    refused(p=>{const create=rows(p).find(r=>r.node.opcode==='arcade_createImage');assert.ok(create);create.node.inputs.EXTRA=[1,[4,'1']];});
    refused(p=>{const fill=rows(p).find(r=>r.node.opcode==='arcade_mutateImage');assert.ok(fill);fill.node.fields.OP[0]='replace';});
    refused(p=>{const binary=rows(p).find(r=>['arrays_valueBinary','arcade_sourceValueBinary'].includes(r.node.opcode));assert.ok(binary);const r=reset(p);replaceInput(binary,'LEFT',[3,[12,...r.node.fields.VARIABLE],[10,'']]);});
    refused(p=>{const call=rows(p).find(r=>r.node.opcode==='procedures_call');insertBefore(call,'image-extra-startup-call',structuredClone(call.node));});
    refused(p=>{const call=rows(p).find(r=>r.node.opcode==='procedures_call');insertBefore(call,'image-registration',{opcode:'arcade_registerButtonHandler',inputs:{BUTTON:[1,[10,'A']],EVENT:[1,[10,'pressed']],TOKEN:[1,[10,'image-handler']],CAPTURES:[1,[10,'{}']]},fields:{}});});
});

test('used Image startup proof expires on observed ambient mutation and remains expired after restoration',()=>{
    const {proof,consumers}=accepted(fixture()),selected=consumers.find(r=>r.node.opcode==='arrays_referenceIndexOf');assert.ok(selected);
    const original=Object.getOwnPropertyDescriptor(Array.prototype,'sourceStartImageTest');
    try{Object.defineProperty(Array.prototype,'sourceStartImageTest',{value:1,configurable:true});assert.equal(proof.validateInput(selected.target,selected.node).ok,false);}
    finally{if(original)Object.defineProperty(Array.prototype,'sourceStartImageTest',original);else delete Array.prototype.sourceStartImageTest;}
    assert.equal(proof.validateInput(selected.target,selected.node).ok,false);
});

test('the builtin costume-frame effect uses exact literal sockets and grants no input readiness',()=>{
    const c=creator('let refs:Image[]=null;function start(){let picture=img`5 5`;refs=[];refs.push(picture);let index=refs.indexOf(picture);}start();');
    const decide=draft=>{
        const project=createProjectJsonSnapshot(JSON.stringify(draft)),proof=createArrayReferenceExportAuthority(project);
        const consumers=rows(project).filter(row=>['arrays_mutateReference','arrays_referenceIndexOf'].includes(row.node.opcode));
        assert.equal(consumers.length,2);return consumers.map(row=>proof.validateInput(row.target,row.node));
    };
    assert.ok(decide(c.project).every(row=>row.ok));
    const draft=JSON.parse(JSON.stringify(c.project)),frame=rows(draft).find(row=>row.node.opcode==='arcade_frameImage');
    assert.ok(frame);replaceInput(frame,'KEY',[1,[4,'1']]);
    assert.ok(decide(draft).some(row=>!row.ok),'a coerced key cannot borrow the literal frame-effect rule');
});

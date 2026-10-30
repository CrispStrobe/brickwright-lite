import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

// Derive the real source-entry/unique-startup protocol from one genuine export,
// rather than inventing a hand-authored function that the importer wraps again.
// No SDK/VM harness is imported; the fixture source and emitted assets are real.
const text=readFileSync(new URL('./makecode-arcade-image-values.test.mjs',import.meta.url),'utf8');
const original=text.match(/const source=`([\s\S]*?)`;/)?.[1];
assert.ok(original&&!original.includes('${')&&!original.includes('\\'));
const source=original.replace('image.create(2,1)','img`5 5`');
const rows=p=>p.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const clean=out=>{assert.deepEqual(out.unsupported||[],[]);assert.deepEqual(out.warnings||[],[]);assert.deepEqual(out.errors||[],[]);};
const creator=source=>{const imported=arcadeToPseudocode(source);clean(imported);const c=new Creator();c.parse(imported.code);clean(c);for(const art of imported.costumes)c.applyCustomSVG(art.sprite,art.svg);return c;};
let cached;
const fixture=()=>{
    if(!cached){const first=creator(source),out=projectToArcade(first.project,{costumeSvg:(target,costume)=>first.assets.get(costume.assetId)?.data});clean(out);cached=JSON.stringify(creator(out.ts).project);}
    return JSON.parse(cached);
};
const query=draft=>{
    const project=createProjectJsonSnapshot(JSON.stringify(draft)),proof=createArrayReferenceExportAuthority(project);
    const consumers=rows(project).filter(r=>r.node.opcode==='arrays_referenceIndexOf');
    assert.equal(consumers.length,2);return {project,proof,consumer:consumers[0],decisions:consumers.map(row=>proof.validateInput(row.target,row.node))};
};
const accepted=draft=>{const result=query(draft);assert.ok(result.decisions.every(decision=>decision.ok),JSON.stringify(result.decisions));return result;};
const refused=edit=>{const draft=fixture();accepted(draft);edit(draft);const result=query(draft);assert.ok(result.decisions.some(decision=>!decision.ok),JSON.stringify(result.decisions));};
const removeTree=(target,id)=>{if(typeof id!=='string')return;const n=target.blocks[id];if(!n)return;for(const slot of Object.values(n.inputs||{}))for(const edge of slot.slice(1))removeTree(target,edge);delete target.blocks[id];};
const replace=(row,name,input)=>{for(const edge of row.node.inputs[name].slice(1))removeTree(row.target,edge);row.node.inputs[name]=input;};
const literal=(target,node,name)=>node.fields?.[name]?.[0]??(Array.isArray(node.inputs?.[name]?.[1])?node.inputs[name][1][1]:target.blocks[node.inputs?.[name]?.[1]]?.fields?.TEXT?.[0]);
const item=p=>{const result=rows(p).find(r=>r.node.opcode==='arrays_referenceItem');assert.ok(result);return result;};
const bank=p=>{
    const selection=item(p),raw=selection.node.inputs.ARRAY[1],reporter=selection.target.blocks[raw];
    const id=Array.isArray(raw)?raw[2]:reporter?.fields?.VARIABLE?.[1];assert.ok(id);
    const result=rows(p).find(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[1]===id&&['arrays_createReference','arcade_getLocal'].includes(r.target.blocks[r.node.inputs.VALUE[1]]?.opcode));assert.ok(result);return result;
};
const builder=p=>{
    const b=bank(p),read=b.target.blocks[b.node.inputs.VALUE[1]];assert.equal(read.opcode,'arcade_getLocal');const name=literal(b.target,read,'NAME');
    const result=rows(p).find(r=>r.node.opcode==='arcade_setLocal'&&literal(r.target,r.node,'NAME')===name&&r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arrays_createReference');assert.ok(result);return result;
};
const population=p=>{
    const local=builder(p),name=literal(local.target,local.node,'NAME');
    const result=rows(p).find(r=>r.node.opcode==='arrays_mutateReference'&&r.target.blocks[r.node.inputs.ARRAY[1]]?.opcode==='arcade_getLocal'&&literal(r.target,r.target.blocks[r.node.inputs.ARRAY[1]],'NAME')===name);assert.ok(result);return result;
};
const variableOwner=(p,id)=>{const owners=p.targets.filter(target=>Object.hasOwn(target.variables||{},id));assert.equal(owners.length,1);return owners[0];};
const numericCell=p=>{
    const matches=p.targets.flatMap(target=>Object.entries(target.variables||{}).filter(([,row])=>Array.isArray(row)&&row[0]==='index').map(([id,row])=>[row[0],id]));
    assert.equal(matches.length,1);return matches[0];
};
const command=p=>{const result=rows(p).find(r=>r.node.opcode==='procedures_call');assert.ok(result);return result;};
const insertBefore=(row,id,node)=>{
    const previous=Object.entries(row.target.blocks).find(([,n])=>n.next===row.id);assert.ok(previous);
    previous[1].next=id;row.node.parent=id;row.target.blocks[id]={...node,parent:previous[0],next:row.id,shadow:false,topLevel:false};
};
const removeStatement=row=>{const previous=row.target.blocks[row.node.parent],next=row.node.next;assert.ok(previous);previous.next=next;if(next)row.target.blocks[next].parent=row.node.parent;removeTree(row.target,row.id);};
const appendElement=(p,scalar=false)=>{
    const b=bank(p),first=population(p),copy=structuredClone(first.node),id='entry-bank-second-element';
    const cloneTree=(id,parent)=>{const node=b.target.blocks[id];assert.ok(node);const copy=structuredClone(node),newId='bank-copy-'+id;copy.parent=parent;b.target.blocks[newId]=copy;
        for(const slot of Object.values(copy.inputs))for(let i=1;i<slot.length;i++)if(typeof slot[i]==='string')slot[i]=cloneTree(slot[i],newId);
        assert.equal(copy.next,null);return newId;
    };
    for(const slot of Object.values(copy.inputs))for(let i=1;i<slot.length;i++)if(typeof slot[i]==='string')slot[i]=cloneTree(slot[i],id);
    if(scalar){for(const edge of copy.inputs.VALUE.slice(1))removeTree(b.target,edge);copy.inputs.VALUE=[1,[4,'0']];}
    insertBefore(b,id,copy);
};

test('a real source-entry Image list reaches its exact indexed clone through the unique startup',()=>{
    const draft=fixture(),before=JSON.stringify(draft);accepted(draft);accepted(JSON.parse(before));assert.equal(JSON.stringify(draft),before);
    // Selection follows the actual ordered elements and exact literal result;
    // no frame-bank spelling, declared Image[] type or expected index is used.
    const two=fixture();appendElement(two);replace(item(two),'INDEX',[1,[4,'1']]);accepted(two);
    const inline=fixture(),local=builder(inline),push=population(inline),factory=local.target.blocks[local.node.inputs.VALUE[1]],element=push.node.inputs.VALUE;
    factory.inputs.VALUES=[2,'entry-bank-direct-values'];
    local.target.blocks['entry-bank-direct-values']={opcode:'arrays_referenceValues',inputs:{VALUE:structuredClone(element),REST:[1,[10,'[]']]},fields:{},parent:local.node.inputs.VALUE[1],next:null,shadow:false,topLevel:false};
    if(typeof element[1]==='string')local.target.blocks[element[1]].parent='entry-bank-direct-values';
    push.node.inputs.VALUE=[1,[4,'0']];removeStatement(push);accepted(inline);
    const renamed=fixture(),b=bank(renamed),id=b.node.fields.VARIABLE[1];variableOwner(renamed,id).variables[id][0]='artwork';
    for(const row of rows(renamed)){
        const field=row.node.fields?.VARIABLE;
        if(Array.isArray(field)&&field.length===2&&field[1]===id)field[0]='artwork';
        for(const slot of Object.values(row.node.inputs||{}))for(const raw of slot.slice(1))if(Array.isArray(raw)&&raw.length===3&&raw[0]===12&&raw[2]===id)raw[1]='artwork';
    }
    accepted(renamed);
});

const physicalScope=(target,id)=>{
    const seen=new Set();let node=target.blocks[id];
    while(node&&!node.topLevel){assert.equal(seen.has(node),false);seen.add(node);node=target.blocks[node.parent];}
    assert.ok(node);return node;
};
const receiverAlias=p=>{
    const consumer=rows(p).find(row=>row.node.opcode==='arrays_referenceIndexOf');assert.ok(consumer);
    const read=consumer.target.blocks[consumer.node.inputs.ARRAY[1]];assert.equal(read.opcode,'arcade_getLocal');
    const scope=physicalScope(consumer.target,consumer.id),order=new Map(),statements=new Set();let id=scope.next;
    while(id){assert.equal(statements.has(id),false,'the actual startup chain is acyclic');statements.add(id);order.set(id,order.size);id=consumer.target.blocks[id].next;}
    let name=literal(consumer.target,read,'NAME'),use=containingStatement(consumer);const seen=new Set();
    while(true){
        assert.equal(typeof name,'string');assert.equal(seen.has(name),false,'receiver alias bindings cannot cycle');seen.add(name);
        const writers=rows(p).filter(row=>row.target===consumer.target&&row.node.opcode==='arcade_setLocal'&&
            literal(row.target,row.node,'NAME')===name&&physicalScope(row.target,row.id)===scope);
        const resets=writers.filter(row=>row.target.blocks[row.node.inputs.VALUE[1]]?.opcode==='arrays_specialValue');
        const overwrites=writers.filter(row=>!resets.includes(row));
        assert.equal(overwrites.length,1,'the actual receiver alias has one unambiguous overwrite');const overwrite=overwrites[0];
        assert.ok(order.has(overwrite.id)&&order.has(use.id)&&order.get(overwrite.id)<order.get(use.id),'each actual alias writer precedes its read');
        if(resets.length){
            assert.equal(resets.length,1);const reset=resets[0],special=reset.target.blocks[reset.node.inputs.VALUE[1]];
            assert.ok(['null','undefined'].includes(literal(reset.target,special,'KIND')));
            assert.ok(order.has(reset.id)&&order.get(reset.id)<order.get(overwrite.id),'the real reset precedes the actual overwrite');
            return {consumer,name,reset,overwrite,use};
        }
        const rhs=overwrite.target.blocks[overwrite.node.inputs.VALUE[1]];
        assert.equal(rhs?.opcode,'arcade_getLocal','a reset-free link must be the actual local alias read');
        assert.equal(physicalScope(overwrite.target,overwrite.node.inputs.VALUE[1]),scope);
        name=literal(overwrite.target,rhs,'NAME');use=overwrite;
    }
};
const containingStatement=row=>{
    let current=row;
    while(true){const parent=current.target.blocks[current.node.parent];
        if(!parent||!Object.values(parent.inputs||{}).some(slot=>slot[1]===current.id))return current;
        current={target:current.target,id:current.node.parent,node:parent};
    }
};

test('local receiver alias resets require the actual allocated token and every read/writer obligation',()=>{
    refused(p=>{const {name,overwrite}=receiverAlias(p);insertBefore(overwrite,'entry-alias-early-copy',{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'earlyAliasCopy']],VALUE:[2,'entry-alias-early-read']},fields:{}});
        overwrite.target.blocks['entry-alias-early-read']={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,name]]},fields:{},parent:'entry-alias-early-copy',next:null,shadow:false,topLevel:false};
    });
    refused(p=>{const {name,overwrite}=receiverAlias(p);replace(overwrite,'VALUE',[2,'entry-alias-self-read']);
        overwrite.target.blocks['entry-alias-self-read']={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,name]]},fields:{},parent:overwrite.id,next:null,shadow:false,topLevel:false};
    });
    refused(p=>{const {overwrite}=receiverAlias(p);assert.ok(bank(p),'another valid bank remains present');replace(overwrite,'VALUE',[1,[4,'0']]);});
    refused(p=>{const {name,use}=receiverAlias(p);insertBefore(use,'entry-alias-later-scalar',{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,name]],VALUE:[1,[4,'1']]},fields:{}});});
});

test('entry allocation must precede the real startup and every receiver writer remains relevant',()=>{
    refused(p=>{const b=bank(p),c=command(p),previous=b.target.blocks[b.node.parent],next=b.node.next;
        previous.next=next;if(next)b.target.blocks[next].parent=b.node.parent;
        const after=c.node.next;c.node.next=b.id;b.node.parent=c.id;b.node.next=after;if(after)b.target.blocks[after].parent=b.id;
    });
    refused(p=>{const b=bank(p),c=command(p);insertBefore(c,'entry-bank-scalar-writer',{opcode:'data_setvariableto',fields:{VARIABLE:[...b.node.fields.VARIABLE]},inputs:{VALUE:[1,[4,'0']]}});});
    refused(p=>{const c=command(p),b=bank(p),field=numericCell(p);
        insertBefore(b,'entry-bank-early-copy',{opcode:'data_setvariableto',fields:{VARIABLE:[...field]},inputs:{VALUE:[3,[12,...b.node.fields.VARIABLE],[10,'']]}});
        replace(item(p),'ARRAY',[3,[12,...field],[10,'']]);
        assert.ok(c);
    });
    refused(p=>{const c=command(p);insertBefore(c,'entry-bank-extra-call',structuredClone(c.node));});
});

test('bank selection requires a finite integral in-bounds literal computation, never a Number-domain read',()=>{
    for(const value of ['-1','1','0.5','Infinity','NaN'])refused(p=>replace(item(p),'INDEX',[1,[4,value]]));
    refused(p=>{const r=item(p),field=numericCell(p);replace(r,'INDEX',[3,[12,...field],[10,'']]);});
    refused(p=>{const r=item(p);replace(r,'INDEX',[2,'entry-bank-nonfinite-index']);r.target.blocks['entry-bank-nonfinite-index']={opcode:'operator_divide',inputs:{NUM1:[1,[4,'1']],NUM2:[1,[4,'0']]},fields:{},parent:r.id,next:null,shadow:false,topLevel:false};});
    refused(p=>{const round=rows(p).find(r=>r.node.opcode==='operator_round');assert.ok(round);round.node.inputs.EXTRA=[1,[4,'0']];});
});

test('empty or mixed banks and malformed actual Image elements cannot supply a clone receiver',()=>{
    refused(p=>removeStatement(population(p)));
    refused(p=>appendElement(p,true));
    refused(p=>{const frame=rows(p).find(r=>r.node.opcode==='arcade_frameImage');assert.ok(frame);replace(frame,'KEY',[1,[4,'1']]);});
    refused(p=>{const b=builder(p),allocation=b.target.blocks[b.node.inputs.VALUE[1]],r={target:b.target,node:allocation};replace(r,'VALUES',[1,[10,'[0]']]);});
});

test('source-entry mutation and startup mutation through a bank alias retain reset refusals',()=>{
    refused(p=>{const b=bank(p),c=command(p);appendElement(p);const pushed=b.target.blocks['entry-bank-second-element'],previous=b.target.blocks[pushed.parent];previous.next=pushed.next;b.node.parent=pushed.parent;
        insertBefore(c,'entry-bank-mutation',structuredClone(pushed));
        for(const slot of Object.values(pushed.inputs))for(const edge of slot.slice(1))if(typeof edge==='string')b.target.blocks[edge].parent='entry-bank-mutation';
        delete b.target.blocks['entry-bank-second-element'];
    });
    refused(p=>{const push=population(p),local=builder(p);insertBefore(push,'entry-bank-competing-holder',{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'otherBankHolder']],VALUE:[2,'entry-bank-holder-read']},fields:{}});
        push.target.blocks['entry-bank-holder-read']={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,literal(local.target,local.node,'NAME')]]},fields:{},parent:'entry-bank-competing-holder',next:null,shadow:false,topLevel:false};
    });
    refused(p=>{const push=population(p);replace(push,'INDEX',[1,[4,'1']]);});
    refused(p=>{const b=bank(p),selection=item(p),clone=selection.target.blocks[selection.node.parent];assert.equal(clone.opcode,'arcade_cloneImage');
        const statement={target:selection.target,id:clone.parent,node:selection.target.blocks[clone.parent]};assert.ok(statement.node);
        insertBefore(statement,'startup-bank-alias',{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'bankAlias']],VALUE:[3,[12,...b.node.fields.VARIABLE],[10,'']]},fields:{}});
        insertBefore(statement,'startup-bank-mutation',{opcode:'arrays_mutateReference',inputs:{ARRAY:[2,'startup-bank-alias-read'],OP:[1,[10,'push']],INDEX:[1,[4,'0']],VALUE:[1,[4,'1']]},fields:{}});
        statement.target.blocks['startup-bank-alias-read']={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'bankAlias']]},fields:{},parent:'startup-bank-mutation',next:null,shadow:false,topLevel:false};
    });
});

test('entry Image-bank proof observes ambient changes and cannot revive after restoration',()=>{
    const {project,proof,consumer}=accepted(fixture());assert.ok(Object.isFrozen(project));
    const property='__bwEntryImageBankControl';assert.equal(Object.hasOwn(Array.prototype,property),false);
    try{Object.defineProperty(Array.prototype,property,{value:1,configurable:true});assert.equal(proof.validateInput(consumer.target,consumer.node).ok,false);}
    finally{delete Array.prototype[property];}
    assert.equal(proof.validateInput(consumer.target,consumer.node).ok,false);
});

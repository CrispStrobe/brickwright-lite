import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

const base='let ordinary:number[];function initialize(){let temporary:number[]=[];temporary.push(1);ordinary=temporary;}function use(){let count=ordinary.length;}initialize();use();game.onUpdate(function(){use();});';
const channels=value=>Object.fromEntries(Object.keys(value).filter(key=>/unsupported|warn|error|unparsed|diagnostic|refusal/i.test(key)).map(key=>[key,value[key]]));
const record=row=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(row)+'\n');};
const current=source=>{const imported=arcadeToPseudocode(source);record({stage:'callee-initialization-source-import',source,result:imported,channels:channels(imported)});assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);record({stage:'callee-initialization-Creator',project:creator.project,channels:channels(creator)});assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);for(const value of Object.values(channels(creator)))assert.deepEqual(value,[]);return creator.project;};
const find=(project,opcode)=>{for(const target of project.targets)for(const [id,block]of Object.entries(target.blocks))if(block.opcode===opcode)return {target,id,block};throw Error('missing '+opcode);};
const receiver=project=>find(project,'arrays_referenceLength');
const check=(project,expected)=>{const {target,block}=receiver(project),authority=createArrayReferenceExportAuthority(project);assert.equal(authority.validateInput(target,block).ok,expected);return {target,block,authority};};
const refused=source=>check(current(source),false);
const procedure=(project,name)=>{for(const target of project.targets)for(const [id,block]of Object.entries(target.blocks))if(block.opcode==='procedures_prototype'&&block.mutation.proccode===name)return {target,prototype:block,root:target.blocks[block.parent],id};throw Error('missing procedure '+name);};
const calls=(project,name)=>project.targets.flatMap(target=>Object.values(target.blocks).filter(b=>b.opcode==='procedures_call'&&b.mutation.proccode===name).map(block=>({target,block})));
const globalId=(project,name)=>project.targets.flatMap(t=>Object.entries(t.variables)).find(([,v])=>v[0]===name)?.[0];
const writer=(project,name)=>{const id=globalId(project,name);for(const target of project.targets)for(const block of Object.values(target.blocks))if(block.opcode==='data_setvariableto'&&block.fields.VARIABLE[1]===id)return {target,block};throw Error('missing writer '+name);};

test('callee initialization credits actual later startup and registered entries',()=>{const project=current(base);check(project,true);assert.deepEqual(projectToArcade(project).unsupported,[]);});
test('callee aliases keep actual local allocation and push before the global writer',()=>{const project=current(base.replace('ordinary=temporary;','let alias=temporary;ordinary=alias;'));check(project,true);const {target,block}=writer(project,'ordinary');assert.equal(target.blocks[block.inputs.VALUE[1]].opcode,'arcade_getLocal');assert.equal(Object.values(target.blocks).filter(b=>b.opcode==='arrays_createReference').length,1);});
test('a call after a read supplies no earlier occurrence fact',()=>{refused(base.replace('initialize();use();game.','use();initialize();game.'));});
test('a missing initializer call cannot borrow its eventual writer type',()=>{refused(base.replace('initialize();use();game.','use();game.'));});
test('registration before initialization supplies no callback initialization',()=>{refused(base.replace('initialize();use();game.onUpdate(function(){use();});','game.onUpdate(function(){use();});initialize();use();'));});
test('one early caller invalidates complete later caller obligations',()=>{refused(base.replace('initialize();use();game.','use();initialize();use();game.'));});
test('a conditional initializer write is not a mandatory linear write',()=>{refused(base.replace('ordinary=temporary;','if(controller.A.isPressed()){ordinary=temporary;}'));});
test('a later null writer remains in the independent all-writer obligation',()=>{refused(base+'ordinary=null;');});
test('local Array escape is not a closed initializer operand effect',()=>{
    const source='let escaped:number[];function expose(value:number[]){escaped=value;}'+
        base.replace('ordinary=temporary;','expose(temporary);ordinary=temporary;');
    const project=current(source),escaped=writer(project,'escaped'),ordinary=writer(project,'ordinary');
    assert.equal(escaped.target,ordinary.target);const target=escaped.target,blocks=target.blocks;
    const owner=node=>{const seen=new Set();while(node.opcode!=='procedures_definition'){
        assert.ok(node.parent&&!seen.has(node));seen.add(node);node=blocks[node.parent];assert.ok(node);
    }return node;};
    const escapeRoot=owner(escaped.block),prototype=blocks[escapeRoot.inputs.custom_block[1]];
    assert.equal(prototype.opcode,'procedures_prototype');
    const names=JSON.parse(prototype.mutation.argumentnames),ids=JSON.parse(prototype.mutation.argumentids);
    assert.equal(names.length,1);assert.equal(ids.length,1);assert.equal(prototype.mutation.proccode,'expose %s');
    const actualCalls=calls(project,prototype.mutation.proccode);assert.equal(actualCalls.length,1);
    const actual=actualCalls[0];assert.equal(actual.target,target);assert.deepEqual(Object.keys(actual.block.inputs),ids);
    const argument=blocks[actual.block.inputs[ids[0]][1]],value=blocks[escaped.block.inputs.VALUE[1]];
    assert.equal(argument.opcode,'arcade_getLocal');assert.equal(value.opcode,'arcade_getLocal');
    assert.equal(value.inputs.NAME[1][1],names[0],'global escape stores the actual parameter cell');
    const localName=argument.inputs.NAME[1][1],initRoot=owner(ordinary.block);assert.equal(owner(actual.block),initRoot);
    const chain=[];let id=initRoot.next,previous=initRoot;
    while(id){assert.ok(!chain.includes(id));const node=blocks[id];assert.ok(node);assert.equal(blocks[node.parent],previous);chain.push(id);previous=node;id=node.next;}
    const actualId=Object.keys(blocks).find(id=>blocks[id]===actual.block),ordinaryId=Object.keys(blocks).find(id=>blocks[id]===ordinary.block);
    assert.ok(chain.indexOf(actualId)>=0&&chain.indexOf(actualId)<chain.indexOf(ordinaryId),'escape call precedes the global ordinary assignment');
    const allocations=chain.slice(0,chain.indexOf(actualId)).map(id=>blocks[id]).filter(node=>node.opcode==='arcade_setLocal'&&node.inputs.NAME[1][1]===localName&&blocks[node.inputs.VALUE[1]]?.opcode==='arrays_createReference');
    assert.equal(allocations.length,1,'actual argument refers to the initialized local Array allocation');
    const ordinaryValue=blocks[ordinary.block.inputs.VALUE[1]];assert.equal(ordinaryValue.opcode,'arcade_getLocal');assert.equal(ordinaryValue.inputs.NAME[1][1],localName,'escaped and ordinary references share the actual local cell');
    record({stage:'callee-escape-current-bindings',source,project,escapedVariableId:globalId(project,'escaped'),ordinaryVariableId:globalId(project,'ordinary'),procedure:prototype.mutation.proccode,formalName:names[0],argumentId:ids[0],localName,callId:actualId,ordinaryWriterId:ordinaryId,initializerChain:chain});
    // The first summary slice admits zero-argument closed calls. This genuine
    // parameterized escape must remain outside it; no dialog coercion is waived.
    check(project,false);
});
test('recursive initializer cannot acquire a provisional summary',()=>{refused(base.replace('ordinary=temporary;','initialize();ordinary=temporary;'));});
test('yielding initialization cannot lend a closed completion summary',()=>{refused(base.replace('ordinary=temporary;','ordinary=temporary;pause(1);'));});
test('callback incompatible rebinding remains a real writer',()=>{refused(base.replace('function(){use();}','function(){ordinary=null;use();}'));});
test('repeated initializer calls preserve fresh allocation sites and actual calls',()=>{const project=current(base.replace('initialize();use();game.','initialize();use();initialize();use();game.'));check(project,true);assert.equal(calls(project,'initialize').length,2);assert.equal(project.targets.flatMap(t=>Object.values(t.blocks)).filter(b=>b.opcode==='arrays_createReference').length,1);});
test('wrong variable ID cannot borrow a similarly spelled cell',()=>{const project=current(base),stage=project.targets.find(t=>t.isStage);stage.variables.otherCell=['other',0];const {block}=receiver(project);const id='otherCell';block.inputs.ARRAY[1]=[12,'ordinary',id];check(project,false);});
test('a same-name target-local cell cannot borrow the Stage writer',()=>{const project=current(base);const {target,block}=receiver(project),stage=project.targets.find(t=>t.isStage),id=globalId(project,'ordinary');assert.ok(stage.variables[id]);target.variables.foreign=['ordinary',0];block.inputs.ARRAY[1]=[12,'ordinary','foreign'];check(project,false);});
test('a changed actual call target cannot retain initializer authority',()=>{const project=current(base+'function innocent(){}innocent();');for(const {block}of calls(project,'initialize'))block.mutation.proccode='innocent';check(project,false);});
test('a changed physical registration token refuses the callback entry',()=>{const project=current(base),{block}=find(project,'arcade_registerUpdateHandler');block.inputs.TOKEN=[1,[10,'different-current-token']];check(project,false);});
test('duplicate physical ordinary declarations refuse summaries',()=>{const project=current(base),{target,root,prototype}=procedure(project,'initialize');const rootId='duplicateRoot',prototypeId='duplicatePrototype';target.blocks[rootId]={...structuredClone(root),next:null,inputs:{custom_block:[1,prototypeId]}};target.blocks[prototypeId]={...structuredClone(prototype),parent:rootId};check(project,false);});
test('orphan global writes cannot disappear from all-writer checking',()=>{const project=current(base),{target,block}=writer(project,'ordinary');target.blocks.orphan={...structuredClone(block),parent:null,next:null,inputs:{VALUE:[1,[4,'0']]}};check(project,false);});
test('summary expiry survives early returns exceptions restoration and copied occurrences',()=>{
    for(const mode of ['normal','schema','binding','cycle']){
        const project=current(base),{target,block,authority}=check(project,true),{block:write}=writer(project,'ordinary'),old=write.inputs.VALUE;
        write.inputs.VALUE=[1,[4,'0']];
        if(mode==='schema'){const previous=block.opcode;block.opcode='text';assert.equal(authority.validateInput(target,block).ok,false);block.opcode=previous;}
        else if(mode==='binding'){const previous=write.fields.VARIABLE;write.fields.VARIABLE=['wrong',previous[1]];assert.equal(authority.validateInput(target,block).ok,false);write.fields.VARIABLE=previous;}
        else if(mode==='cycle'){write.extra=write;assert.throws(()=>authority.validateInput(target,block));delete write.extra;}
        else assert.equal(authority.validateInput(target,block).ok,false);
        write.inputs.VALUE=old;assert.equal(authority.validateInput(target,block).ok,false,mode);
    }
    const project=current(base),{target,block,authority}=check(project,true);assert.equal(authority.validateInput({...target},block).ok,false);assert.equal(authority.validateInput(target,{...block}).ok,false);
    const direct=current('let values=[1];let count=values.length;'),d=check(direct,true),old=d.block.inputs.ARRAY;d.block.inputs.ARRAY=[1,[4,'0']];assert.equal(d.authority.validateInput(d.target,d.block).ok,false);d.block.inputs.ARRAY=old;assert.equal(d.authority.validateInput(d.target,d.block).ok,true,'existing unrelated direct-fact policy is unchanged');
});
test('managed metadata entries remain outside the closed summary effect domain',()=>{const project=current(base),{target}=procedure(project,'initialize');target.blocks.managed={opcode:'arcade_declareClass',parent:null,next:null,topLevel:true,shadow:false,fields:{},inputs:{NAME:[1,[10,'Owner']],FIELDS:[1,[10,'[]']],INITIALIZER:[1,[10,'initialize']],CONSTRUCTOR:[1,[10,'']],PARAMETERS:[1,[10,'[]']],METHODS:[1,[10,'[]']]}};check(project,false);});
test('callable extraction and hat-local initializer calls cannot gain summary credit',()=>{const project=current(base),{target}=procedure(project,'initialize');target.blocks.extracted={opcode:'arcade_createCallable',parent:null,next:null,topLevel:true,shadow:false,fields:{},inputs:{NAME:[1,[10,'initialize']]}};check(project,false);refused('let ordinary:number[];function initialize(){ordinary=[];}function use(){let count=ordinary.length;}game.onUpdate(function(){initialize();use();});');});
test('nested reporter calls receive no command-chain summary credit',()=>{refused('let ordinary:number[];function initialize(){ordinary=[];return 1;}function use(){let count=ordinary.length;}let ignored=initialize();use();');});
test('a self-dependent RHS cannot initialize itself through the recursion guard',()=>{refused('let ordinary:number[];function initialize(){ordinary=ordinary;}function use(){let count=ordinary.length;}initialize();use();');refused('let ordinary:number[];let other:number[];function initialize(){ordinary=other;other=ordinary;}function use(){let count=ordinary.length;}initialize();use();other=[];');});
test('transitive initialization binds actual RHS call order',()=>{
    const source='let ordinary:number[];let other:number[];function first(){other=[];}function second(){ordinary=other;}function use(){let count=ordinary.length;}first();second();use();';check(current(source),true);refused(source.replace('first();second();use();','second();first();use();'));
});
test('same-type eventual writers and cloud cells cannot borrow closed summary effects',()=>{refused('let ordinary:number[];let other:number[];function initialize(){ordinary=[];}function later(){ordinary=other;}function use(){let count=ordinary.length;}initialize();later();use();other=[];');refused('let ordinary:number[];let other:number[];function initialize(){ordinary=other;}function use(){let count=ordinary.length;}initialize();use();');
    const cloud=current(base),id=globalId(cloud,'ordinary');cloud.targets.find(t=>Object.hasOwn(t.variables,id)).variables[id].push(true);check(cloud,false);
    const source='let ordinary:number[];let other:number[]=[];function initialize(){ordinary=other;}function use(){let count=ordinary.length;}initialize();use();';
    const dependency=current(source);check(dependency,true);const other=globalId(dependency,'other');dependency.targets.find(t=>Object.hasOwn(t.variables,other)).variables[other].push(true);check(dependency,false);
});

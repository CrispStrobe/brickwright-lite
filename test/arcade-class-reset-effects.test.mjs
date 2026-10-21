import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {prepareObjectClassExport} from '../overlay/scratch-gui/src/lib/bw-makecode/object-class-export.js';
import {scalarExportFlow} from '../overlay/scratch-gui/src/lib/bw-makecode/scalar-export-flow.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';

const clean=value=>{for(const name of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(value,name))assert.deepEqual(value[name],[],name);};
const parse=code=>{const c=new Creator();c.parse(code);clean(c);return c;};
const source=text=>{const out=arcadeToPseudocode(text);clean(out);return parse(out.code);};
const base='class Box{constructor(public n:number){}read():number{return this.n}}let boxes:Box[]=null;let alias:Box[]=null;let result=0;function build(){boxes=[new Box(1)];alias=boxes;alias.push(new Box(2));result=alias.length;}build();';
const rows=(c,opcode)=>c.project.targets.flatMap(target=>Object.entries(target.blocks).filter(([,node])=>node.opcode===opcode).map(([id,node])=>({target,id,node})));
const literal=(target,node,name)=>{const value=node.inputs?.[name]?.[1];return Array.isArray(value)?value[1]:target.blocks[value]?.fields.TEXT?.[0];};
const ctorWrite=c=>{const matches=rows(c,'arcade_setObjectField');assert.equal(matches.length,1,'actual sole constructor own-field write');return matches[0];};
const checked=(project,expected)=>{const proof=createArrayReferenceExportAuthority(project),inputs=project.targets.flatMap(target=>Object.values(target.blocks).filter(node=>node.opcode==='arrays_referenceLength').map(node=>({target,node})));
    assert.equal(inputs.length,1,'actual bound Array consumer');for(const {target,node}of inputs)assert.equal(proof.validateInput(target,node).ok,expected);return proof;};
const owned=(c,expected)=>checked(createProjectJsonSnapshot(JSON.stringify(c.project)),expected);
const replaceWrite=(c,opcode,inputs,fields={})=>{const row=ctorWrite(c);row.node.opcode=opcode;row.node.inputs=inputs(row);row.node.fields=fields;return row;};

let captureSerial=0;
const roundtrip=(text,mixed=false)=>{
    const c=source(text),d={stage:'initial-validation',sourceInput:text,feedbackCode:null,reimportCode:null,
        initial:null,imported:null,current:null,currentCreator:c,projects:{original:c.project,feedback:null,second:null}};
    const exportCurrent=(creator,owned)=>{d.currentCreator=creator;const before=JSON.stringify(creator.project);
        d.current=owned?projectJsonToArcade(before):projectToArcade(creator.project);
        if(d.stage==='initial-export')d.initial=d.current;
        clean(d.current);assert.equal(JSON.stringify(creator.project),before);return d.current;};
    try{
        if(!mixed){checked(c.project,false);owned(c,true);}
        d.stage='initial-export';const first=exportCurrent(c,!mixed);
        if(mixed){assert.match(first.ts,/let boxes: any\[\] = null/);assert.ok(first.ts.includes('alias.push((0 + 0))'));assert.ok(first.ts.includes('boxes[0].read()'));}
        else assert.ok(first.ts.includes('new Box'));
        d.stage='Code-feedback';d.feedbackCode=c.decompile();const feedback=parse(d.feedbackCode);d.projects.feedback=feedback.project;exportCurrent(feedback,true);
        d.stage='exact-files-import';d.imported=arcadeToPseudocode(first.files);clean(d.imported);d.reimportCode=d.imported.code;
        const second=parse(d.imported.code);d.projects.second=second.project;d.currentCreator=second;
        if(mixed)assert.ok(projectToArcade(second.project).unsupported.length,'the global null/callee path still requires owned ingress');
        d.stage='exact-files-second-export';exportCurrent(second,true);return first;
    }catch(error){
        const root=process.env.BW_ARRAY_MENU_FAILURE_ROOT;
        if(root){const prefix='effect-failure-'+(++captureSerial);try{
            const creator=d.currentCreator,notes=[],model=prepareObjectClassExport({project:creator.project,opts:{},managedValueProcedures:new Set(),
                varName:(_target,name)=>name,note:message=>notes.push(message)}),scalar=scalarExportFlow(creator.project,()=>false);
            const facts={classNotes:notes,classVariableTypes:[...model.variableTypes],classDeclarationTypes:[...model.variableDeclarationTypes],nodes:[],variables:[],privateLiteralCells:'UNOBSERVED'};
            for(const target of creator.project.targets){
                for(const [id,value]of Object.entries(target.variables||{}))facts.variables.push({targetName:target.name,id,name:value[0],types:[...(scalar.types.get('variable:'+id)||[])]});
                for(const [id,node]of Object.entries(target.blocks||{}))facts.nodes.push({targetName:target.name,id,opcode:node.opcode,classTypes:[...model.valueTypes(target,node)],scalarTypes:[...(scalar.types.get(node)||[])]});
            }
            for(const [name,value]of Object.entries({state:{stage:d.stage,sourceInput:text,feedbackCode:d.feedbackCode,reimportCode:d.reimportCode,facts},
                'initial-export':d.initial,'importer-result':d.imported,projects:d.projects,'current-export':d.current}))
                writeFileSync(join(root,prefix+'-'+name+'.json'),JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
        }catch{try{writeFileSync(join(root,'effect-capture-failed-'+captureSerial+'.json'),JSON.stringify({captureFailed:true,originalFailureRetained:true})+'\n',{flag:'wx',mode:0o600});}catch{}}}
        throw error;
    }
};

test('a genuine local constructor and own primitive method permit only the owned JSON global overwrite path',()=>{
    roundtrip(base);
});

test('the unchanged mixed append source retains numeric writers and honest declarations through exact-file reimport',()=>{
    roundtrip('class Box{constructor(public n:number){}read():number{return this.n}}let boxes=[new Box(1)];let alias=boxes;alias.push(0 as any);let observed=boxes[0].read();',true);
});

test('constructor global publication and a real callback registration opcode refuse the new effect proof',()=>{
    const c=source(base),stage=c.project.targets.find(t=>t.isStage),entry=Object.entries(stage.variables).find(([,v])=>v[0]==='result');assert.ok(entry);
    replaceWrite(c,'data_setvariableto',row=>({VALUE:row.node.inputs.VALUE}),{VARIABLE:['result',entry[0]]});owned(c,false);
    const callback=source(base);replaceWrite(callback,'arcade_registerUpdateHandler',()=>({TOKEN:[1,[10,'handler']],CAPTURES:[1,[10,'']]}));owned(callback,false);
});

test('returning or storing the receiver and writing a foreign receiver cannot borrow own-field effects',()=>{
    const returned=source(base);replaceWrite(returned,'arcade_returnValue',row=>({VALUE:row.node.inputs.OBJECT}));owned(returned,false);
    const escaped=source(base.replace('constructor(public n:number){}','n:any;constructor(n:number){this.n=this}'));owned(escaped,false);
    const foreign=source(base),other=ctorWrite(foreign);other.node.inputs.OBJECT=[1,[10,'not the constructor receiver']];owned(foreign,false);
    const foreignMethod=source(base.replace('result=alias.length','let observed=alias[0].read();result=alias.length'));
    const method=rows(foreignMethod,'arcade_callObjectMethod');assert.equal(method.length,1);method[0].node.inputs.OBJECT=[1,[10,'foreign method receiver']];owned(foreignMethod,false);
    const expression=source(base.replace('let boxes:','function obtain(){result=7;return new Box(1);}let boxes:').replace('result=alias.length','let observed=obtain().read();result=alias.length'));owned(expression,false);
    const unusedEffect=source(base.replace('let boxes:','function keep(value:Box,unused:number):Box{return value;}function effect(){result=7;return 0;}let boxes:').replace('result=alias.length','let observed=keep(new Box(1),effect()).read();result=alias.length'));owned(unusedEffect,false);
});

test('inherited and accessor classes remain outside this initial effect-only contract',()=>{
    const inherited=source(base.replace('class Box{constructor(public n:number){}read():number{return this.n}}','class Parent{constructor(public n:number){}}class Box extends Parent{read():number{return this.n}}'));owned(inherited,false);
    const accessor=source(base.replace('read():number{return this.n}','get value():number{return this.n}read():number{return this.value}'));owned(accessor,false);
});

test('unknown bodies dynamic own-field selectors and a missing constructor definition remain refused',()=>{
    const unknown=source(base);ctorWrite(unknown).node.opcode='arcade_futureClassBody';owned(unknown,false);
    const dynamic=source(base),writer=ctorWrite(dynamic);writer.node.inputs.FIELD=writer.node.inputs.VALUE;writer.node.inputs.VALUE=[1,[4,'1']];owned(dynamic,false);
    const missing=source(base),decl=rows(missing,'arcade_declareClass')[0];assert.ok(decl);decl.node.inputs.CONSTRUCTOR=[1,[10,'missing actual constructor']];owned(missing,false);
});

test('actual constructor arguments are inspected without trusting Number annotations or a function result',()=>{
    const effectful=source(base.replace('class Box','function computeValue(){result=7;return 1;}class Box').replace('new Box(1)','new Box(computeValue())'));owned(effectful,false);
    const primitive=source(base.replace('new Box(1)','new Box(1+2)'));owned(primitive,true);
    const neutral=source(base.replace('let result=0','let result:any=0'));owned(neutral,true);
    const declarations=rows(neutral,'arcade_declareSourceScalar');assert.ok(declarations.some(({node})=>node.fields.TYPE?.[0]==='Any'));
    const nested=base.replace('}build();','}function entry(){boxes=null;build();}entry();'),ancestor=source(nested);
    const procedure=({target,node})=>{let at=node;const seen=new Set();while(!at.topLevel){assert.ok(at.parent&&!seen.has(at));seen.add(at);at=target.blocks[at.parent];assert.ok(at);}
        const proto=at.opcode==='procedures_definition'&&target.blocks[at.inputs.custom_block[1]];return proto?.mutation?.proccode||null;};
    const ancestorResets=rows(ancestor,'data_setvariableto').filter(row=>row.node.fields.VARIABLE[0]==='boxes'&&procedure(row)?.includes('entry')&&
        row.target.blocks[row.node.inputs.VALUE[1]]?.opcode==='arrays_specialValue');
    assert.equal(ancestorResets.length,1,'an actual ordinary ancestor owns the null writer');
    assert.deepEqual(ancestorResets[0].target.blocks[ancestorResets[0].node.inputs.VALUE[1]].fields.KIND,['null',null]);
    const descendant=rows(ancestor,'arrays_referenceLength');assert.equal(descendant.length,1);assert.ok(procedure(descendant[0])?.includes('build'));
    assert.notEqual(procedure(ancestorResets[0]),procedure(descendant[0]));owned(ancestor,true);
    owned(source(nested.replace('entry();','entry();entry();')),false);
    owned(source(nested.replace('boxes=null;build();','boxes=null;build();entry();')),false);
    owned(source(nested.replace('function entry(){','function entry(unused:number){').replace('}entry();','}entry(0);')),false);
    const forwarded=source(base.replace('let boxes:','function keep(value:Box,unused:number):Box{return value;}let boxes:').replace('result=alias.length','let observed=keep(new Box(1),0).read();result=alias.length'));owned(forwarded,true);
    const bad=source(base),allocation=rows(bad,'arcade_createObject')[0];assert.ok(allocation);
    const arg=allocation.target.blocks[allocation.node.inputs.ARGS[1]];assert.equal(arg.opcode,'arcade_functionArgument');const producer=allocation.target.blocks[arg.inputs.VALUE[1]];assert.equal(producer.opcode,'operator_add');producer.opcode='arcade_futureArgument';owned(bad,false);
});

test('immutable ownership is not caller freezing and changed definitions never refresh an earlier proof',()=>{
    const c=source(base),json=JSON.stringify(c.project),snapshot=createProjectJsonSnapshot(json),proof=checked(snapshot,true);
    const frozenWrite=ctorWrite({project:snapshot});assert.throws(()=>{frozenWrite.node.opcode='data_setvariableto';},TypeError);
    ctorWrite(c).node.opcode='arcade_futureClassBody';owned(c,false);
    const target=snapshot.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arrays_referenceLength')),consumer=Object.values(target.blocks).find(n=>n.opcode==='arrays_referenceLength');
    assert.equal(proof.validateInput(target,consumer).ok,true,'the admitted immutable tree is distinct from later edits to the original source object');
    const forged=JSON.parse(json);Object.freeze(forged);checked(forged,false);
    assert.equal(JSON.stringify(snapshot),json,'all original physical source bytes remain represented');
});

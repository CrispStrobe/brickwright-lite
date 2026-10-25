import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {prepareObjectClassExport} from '../overlay/scratch-gui/src/lib/bw-makecode/object-class-export.js';
import {createImageConsumerAbiExport} from '../overlay/scratch-gui/src/lib/bw-makecode/image-consumer-abi-export.js';
import {SDK_DIALOG_CLASS_NODES} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-class-descriptors.js';
import {dialogOriginalSource} from './fixtures/arcade-sdk-dialog-game.mjs';
const clean=result=>{assert.deepEqual(result.unsupported||[],[]);assert.deepEqual(result.warnings||[],[]);assert.deepEqual(result.errors||[],[]);};
const build=source=>{const imported=arcadeToPseudocode(source);clean(imported);const c=new Creator();c.parse(imported.code);clean(c);return c;};
const rows=p=>p.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const out=p=>{const result=projectToArcade(p);clean(result);return result;};
const casts=text=>(text.match(/<Image>/g)||[]).length;
const fixture=()=>build(dialogOriginalSource);

test('actual SplashDialog socket proof retains old/new image aliases and emits Image context only at six consumers',()=>{
    const c=fixture(),before=JSON.stringify(c.project),exported=out(c.project);
    assert.equal(rows(c.project).length,55);assert.equal(casts(exported.ts),6);
    assert.match(exported.ts,/initial = dialog.image/);assert.match(exported.ts,/resized = dialog.image/);
    assert.match(exported.ts,/let initial: any = 0/);assert.match(exported.ts,/let resized: any = 0/);
    assert.equal(JSON.stringify(c.project),before);clean(build(exported.files));
    const json=projectJsonToArcade(before);clean(json);assert.equal(casts(json.ts),6);
});

test('Code and owned saved project preserve the current physical Image consumers',async()=>{
    const c=fixture(),feedback=new Creator();feedback.parse(c.decompile());clean(feedback);assert.equal(casts(out(feedback.project).ts),6);
    const saved=await JSZip.loadAsync(await(await c.generateSB3()).arrayBuffer()),project=JSON.parse(await saved.file('project.json').async('string'));
    assert.equal(casts(out(project).ts),6);const again=new Creator();again.parse(c.decompile(project));clean(again);assert.equal(casts(out(again.project).ts),6);
});

test('pixel type context is receiver-local and retains independently numeric coordinate arguments',()=>{
    const source=dialogOriginalSource+'\nlet pixel=initial.getPixel(0,0)';const c=build(source),exported=out(c.project);
    assert.equal(casts(exported.ts),7);assert.match(exported.ts,/\(<Image>\(initial\)\)\.getPixel/);
    for(const edit of ['coordinate','extra','property']){
        const p=structuredClone(c.project),pixel=rows(p).find(r=>r.node.opcode==='arcade_imagePixel');assert.ok(pixel);
        if(edit==='coordinate')pixel.node.inputs.X=[1,[10,'wrong']];
        if(edit==='extra')pixel.node.inputs.EXTRA=[1,[4,'0']];
        if(edit==='property'){const property=rows(p).find(r=>r.node.opcode==='arcade_imageProperty');property.node.fields.PROPERTY[0]='unknown';}
        assert.equal(casts(projectToArcade(p).ts),0,edit);
    }
});

test('default-frame zero and negative matrix keeps reachable Images distinct from guarded absent branches',()=>{
    for(const [w,h]of [[0,0],[0,3],[3,0],[-1,2],[2,-1]]){
        const source=`let dialog=new game.BaseDialog(${w},${h});let probeImage=dialog.image;let missing=probeImage==undefined;let width=missing?-1:probeImage.width;let height=missing?-1:probeImage.height`;
        const c=build(source),exported=out(c.project);assert.equal(casts(exported.ts),w<0||h<0?0:2);
        assert.match(exported.ts,/if \(!!\(missing\)\)/);clean(build(exported.files));
    }
});

test('all actual alias and writable field writers, unknown calls and entry order remain obligations',()=>{
    for(const edit of ['late-alias','field','method','entry','early']){
        const c=fixture(),p=c.project,list=rows(p),first=list.find(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[0]==='initial');assert.ok(first);
        if(edit==='late-alias'){
            const tail=list.find(r=>r.node.next===null&&r.node.opcode==='data_setvariableto');
            tail.node.next='late-alias';tail.target.blocks['late-alias']={opcode:'data_setvariableto',inputs:{VALUE:[1,[10,'bad']]},fields:{VARIABLE:structuredClone(first.node.fields.VARIABLE)},parent:tail.id,next:null,shadow:false,topLevel:false};
        }
        if(edit==='field'){
            const field=list.find(r=>r.node.opcode==='arcade_objectField');field.node.inputs.FIELD=[1,[10,'frame']];
        }
        if(edit==='method')list.find(r=>r.node.opcode==='arcade_callObjectMethod').node.inputs.METHOD=[1,[10,'foreign']];
        if(edit==='entry')first.target.blocks.extra={opcode:'event_whenflagclicked',inputs:{},fields:{},parent:null,next:null,topLevel:true,shadow:false};
        if(edit==='early'){
            const variable=list.find(r=>r.node.opcode==='arcade_imageProperty'&&Array.isArray(r.node.inputs.IMAGE[1])&&r.node.inputs.IMAGE[1][1]==='resized');
            first.node.inputs.VALUE=structuredClone(variable.node.inputs.IMAGE);
        }
        assert.equal(casts(projectToArcade(p).ts),0,edit);
    }
});

// Use the real current object-class model/query. These source-only emitter
// callbacks name variables and collect diagnostics; they issue no SDK facts.
const currentProof=project=>{
    const notes=[],model=prepareObjectClassExport({project,opts:{},managedValueProcedures:new Set(),varName:(_target,name)=>name,note:m=>notes.push(m)});
    assert.deepEqual(notes,[]);
    return {model,proof:createImageConsumerAbiExport({project,provider:model})};
};

test('actual canonical SDK identity rejects a foreign constructor spelling and caller class replacement',()=>{
    const p=fixture().project,{model}=currentProof(p),construct=rows(p).find(r=>r.node.opcode==='arcade_createObject');assert.ok(construct);
    assert.equal(model.sdkDialogConstructor(construct.target,construct.node),'SplashDialog');
    assert.equal(model.sdkDialogConstructor(construct.target,{...construct.node}),null);
    model.classes.set('__bwSDK_SplashDialog',{...model.classes.get('__bwSDK_SplashDialog')});
    assert.equal(model.sdkDialogConstructor(construct.target,construct.node),null);
    const proof=createImageConsumerAbiExport({project:p,provider:model});
    for(const row of rows(p).filter(r=>r.node.opcode==='arcade_imageProperty'))assert.equal(proof.accepts(row.target,row.node),false);
});

test('actual provider cache expires on source edits and does not revive after physical restoration',()=>{
    const p=fixture().project,{proof}=currentProof(p),consumer=rows(p).find(r=>r.node.opcode==='arcade_imageProperty'),writer=rows(p).find(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[0]==='initial');
    assert.equal(proof.accepts(consumer.target,consumer.node),true);
    const original=writer.node.inputs.VALUE;writer.node.inputs.VALUE=[1,[10,'bad']];
    assert.equal(proof.accepts(consumer.target,consumer.node),false);writer.node.inputs.VALUE=original;
    assert.equal(proof.accepts(consumer.target,consumer.node),false);
    assert.equal(currentProof(p).proof.accepts(consumer.target,consumer.node),true);
});

test('actual descriptor changes expire used proof while a fresh restored model can qualify',()=>{
    const p=fixture().project,{proof}=currentProof(p),consumer=rows(p).find(r=>r.node.opcode==='arcade_imageProperty');
    assert.equal(proof.accepts(consumer.target,consumer.node),true);
    const node=SDK_DIALOG_CLASS_NODES[0],name=node.fields[0].typeName;
    try{node.fields[0].typeName='number';assert.equal(proof.accepts(consumer.target,consumer.node),false);}
    finally{node.fields[0].typeName=name;}
    assert.equal(proof.accepts(consumer.target,consumer.node),false);
    assert.equal(currentProof(p).proof.accepts(consumer.target,consumer.node),true);
});

test('caller callbacks and cloned provider objects cannot issue consumer ABI authority',()=>{
    const p=fixture().project,{model}=currentProof(p),consumer=rows(p).find(r=>r.node.opcode==='arcade_imageProperty');
    for(const options of [
        {sdkDialogConstructor:()=> 'SplashDialog',qualifiedImageInput:()=>({kind:'sdk',name:'Image'})},
        {provider:{...model}},
        {provider:{sdkDialogConstructor:()=> 'SplashDialog',classCallableProvider:()=>({currentInputType:()=>({kind:'sdk',name:'Image'})})}}
    ])assert.equal(createImageConsumerAbiExport({project:p,...options}).accepts(consumer.target,consumer.node),false);
    const {model:actual,proof}=currentProof(p);assert.equal(proof.accepts(consumer.target,consumer.node),true);
    const current=actual.classes.get('__bwSDK_SplashDialog'),name=current.fields[0].type;
    try{current.fields[0].type='Image';current.methods.push({...current.methods[0]});assert.equal(proof.accepts(consumer.target,consumer.node),false);}
    finally{current.fields[0].type=name;current.methods.pop();}
    assert.equal(proof.accepts(consumer.target,consumer.node),false);
});

test('constructor sockets and changed model records cannot acquire canonical SDK provenance',()=>{
    const p=fixture().project,{model}=currentProof(p),construct=rows(p).find(r=>r.node.opcode==='arcade_createObject');
    const original=construct.node.inputs.CLASS;construct.node.inputs.CLASS=[1,[4,'__bwSDK_SplashDialog']];
    assert.equal(model.sdkDialogConstructor(construct.target,construct.node),null);construct.node.inputs.CLASS=original;
    const fresh=currentProof(p),consumer=rows(p).find(r=>r.node.opcode==='arcade_imageProperty');assert.equal(fresh.proof.accepts(consumer.target,consumer.node),true);
    const cls=fresh.model.classes.get('__bwSDK_SplashDialog'),parent=Object.getPrototypeOf(cls);
    try{Object.setPrototypeOf(cls,{foreign:true});assert.equal(fresh.proof.accepts(consumer.target,consumer.node),false);}
    finally{Object.setPrototypeOf(cls,parent);}
    assert.equal(fresh.proof.accepts(consumer.target,consumer.node),false);
});

test('reserved globals stay distinct while emitted local namespaces and nominal Image classes receive no new context',()=>{
    const c=fixture(),stage=c.project.targets.find(t=>t.isStage);stage.variables.gameScalar=['game',0];
    const first=rows(c.project).find(r=>r.node.opcode==='arcade_setLocal'),previous=first.node.parent;
    first.target.blocks[previous].next='global-game-write';first.node.parent='global-game-write';
    first.target.blocks['global-game-write']={opcode:'data_setvariableto',inputs:{VALUE:[1,[4,'1']]},fields:{VARIABLE:['game','gameScalar']},parent:previous,next:first.id,shadow:false,topLevel:false};
    const normal=out(c.project);assert.equal(casts(normal.ts),6);assert.match(normal.ts,/let game_/);assert.match(normal.ts,/new game\.SplashDialog/);
    const p=fixture().project,local=rows(p).find(r=>r.node.opcode==='arcade_setLocal'),parent=local.node.parent;
    local.target.blocks[parent].next='namespace-shadow';local.node.parent='namespace-shadow';local.target.blocks['namespace-shadow']={opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'game']],VALUE:[1,[4,'0']]},fields:{},parent,next:local.id,shadow:false,topLevel:false};
    const shadow=projectToArcade(p);assert.equal(casts(shadow.ts),0);assert.match(shadow.ts,/let game:/);
    const nominal=build('class Image{value:number;constructor(value:number){this.value=value}}let ordinary=new Image(1);'),combined=fixture().project;
    Object.assign(combined.targets.find(t=>t.isStage).variables,nominal.project.targets.find(t=>t.isStage).variables);
    for(const target of nominal.project.targets.filter(t=>!t.isStage)){target.name='Nominal';combined.targets.push(target);}
    assert.equal(casts(projectToArcade(combined).ts),0);
});

test('an initial caller class collision cannot supply the canonical SDK parent',()=>{
    const c=build('class Parent{value:number;constructor(value:number){this.value=value}}let ordinary=new Parent(1);'+dialogOriginalSource),p=c.project;
    const declaration=rows(p).find(r=>r.node.opcode==='arcade_declareClass'&&r.node.inputs.NAME[1][1]==='Parent');assert.ok(declaration);
    declaration.node.inputs.NAME=[1,[10,'__bwSDK_BaseDialog']];
    const model=prepareObjectClassExport({project:p,opts:{},managedValueProcedures:new Set(),varName:(_t,name)=>name,note:()=>{}}),construct=rows(p).find(r=>r.node.opcode==='arcade_createObject'&&r.node.inputs.CLASS[1][1]==='__bwSDK_SplashDialog');assert.ok(construct);
    assert.equal(model.sdkDialogConstructor(construct.target,construct.node),null);
    const proof=createImageConsumerAbiExport({project:p,provider:model});
    for(const row of rows(p).filter(r=>r.node.opcode==='arcade_imageProperty'))assert.equal(proof.accepts(row.target,row.node),false);
});

test('resize generations retain old Images and keep absent new accesses unreachable',()=>{
    const old=build('let dialog=new game.BaseDialog(2,3);let initial=dialog.image;dialog.resize(-1,2);let missing=dialog.image==undefined;let oldWidth=initial.width;let newWidth=missing?-1:dialog.image.width');
    const first=out(old.project);assert.equal(casts(first.ts),1);assert.match(first.ts,/\(<Image>\(initial\)\)\.width/);
    const absent=build('let dialog=new game.BaseDialog(-1,2);let initial=dialog.image;let missing=initial==undefined;dialog.resize(2,3);let current=dialog.image;let newWidth=current.width;let oldWidth=missing?-1:initial.width');
    const second=out(absent.project);assert.equal(casts(second.ts),1);assert.match(second.ts,/\(<Image>\(current\)\)\.width/);
});

test('actual writable image assignments retain old aliases and reject foreign values',()=>{
    const cleared=build('let dialog=new game.BaseDialog(2,3);let initial=dialog.image;dialog.image=undefined;let missing=dialog.image==undefined;let oldWidth=initial.width;let newWidth=missing?-1:dialog.image.width');
    assert.ok(rows(cleared.project).some(r=>r.node.opcode==='arcade_setObjectField'));
    assert.equal(casts(out(cleared.project).ts),1);
    const restored=build('let dialog=new game.BaseDialog(2,3);let initial=dialog.image;dialog.resize(-1,2);dialog.image=initial;let width=dialog.image.width');
    assert.equal(casts(out(restored.project).ts),1);
    const foreign=build('let dialog=new game.BaseDialog(2,3);let initial=dialog.image;let width=initial.width;dialog.image="foreign"');
    assert.equal(casts(projectToArcade(foreign.project).ts),0);
});

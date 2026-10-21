import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {normalizeProjectMenuArgs,readableView} from '../overlay/scratch-gui/src/lib/extension-menu-args.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arrayMenuLiteral,isArrayMenuSelector} from '../overlay/scratch-gui/src/lib/bw-makecode/array-menu-literal.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {namedArrayItemExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/named-array-item-export-authority.js';
import {scalarExportFlow} from '../overlay/scratch-gui/src/lib/bw-makecode/scalar-export-flow.js';
import {prepareObjectClassExport} from '../overlay/scratch-gui/src/lib/bw-makecode/object-class-export.js';

const clean = value => {
    for (const name of ['unsupported','warnings','errors','unparsed']) {
        if (Object.hasOwn(value,name)) assert.deepEqual(value[name],[],name);
    }
};
const parse = code => {const creator=new Creator();creator.parse(code);clean(creator);return creator;};
const source = text => {const imported=arcadeToPseudocode(text);clean(imported);return parse(imported.code);};
const selectors = project => project.targets.flatMap(target => Object.values(target.blocks)
    .filter(node=>isArrayMenuSelector(node,'OP')).map(node=>({target,node})));
const canonical = creator => {
    const rows=selectors(creator.project);assert.ok(rows.length,'actual imported Array selectors');
    for (const {target,node} of rows) {
        const op=arrayMenuLiteral(target,node,'OP');assert.equal(typeof op,'string');
        // Exercise the real load migration for the older stored field form.
        delete node.inputs.OP;node.fields.OP=[op,null];
    }
    assert.deepEqual(normalizeProjectMenuArgs(creator.project),[]);
    for (const {target,node} of rows) {
        assert.equal(Object.hasOwn(node.fields,'OP'),false);
        const slot=node.inputs.OP;assert.equal(slot[0],1);assert.equal(typeof slot[1],'string');
        const menu=node.opcode==='arrays_mutateReference'?'referenceMutations':'referenceTakeOperations';
        assert.equal(target.blocks[slot[1]].opcode,'arrays_menu_'+menu);
        assert.equal(arrayMenuLiteral(target,node,'OP'),target.blocks[slot[1]].fields[menu][0]);
    }
    return rows;
};
const exported = (creator,options={},diagnostic=null) => {
    const before=structuredClone(creator.project),out=projectToArcade(creator.project,options);
    if(diagnostic){
        diagnostic.exportOutput=out;
        if(['unsupported','warnings','errors','unparsed'].some(name=>Object.hasOwn(out,name)&&Array.isArray(out[name])&&out[name].length))retainFailure(diagnostic);
    }
    clean(out);assert.deepEqual(creator.project,before,'export retains original physical graph');return out;
};
const exportedOwned = (creator,diagnostic,rawResetMode) => {
    const json=JSON.stringify(creator.project),raw=projectToArcade(creator.project);
    if(rawResetMode==='legacy-local-class'){
        const all=creator.project.targets.flatMap(target=>Object.values(target.blocks).map(node=>({target,node})));
        const nullWrite=({target,node})=>target.blocks[node.inputs?.VALUE?.[1]]?.opcode==='arrays_specialValue'&&target.blocks[node.inputs.VALUE[1]].fields.KIND[0]==='null';
        assert.ok(all.some(row=>row.node.opcode==='arcade_setLocal'&&nullWrite(row)),'actual class local null reset remains');
        assert.ok(!all.some(row=>row.node.opcode==='data_setvariableto'&&nullWrite(row)),'uninitialized source-reference globals add no global null writer');
        clean(raw); // The unchanged legacy deadReset proves this pure local prefix.
    }else assert.ok(raw.unsupported.length,'direct mutable reimport graph retains its reset refusal');
    diagnostic.ownedJsonInput=json;diagnostic.directAstExport=raw;
    const out=projectJsonToArcade(json);diagnostic.exportOutput=out;
    if(['unsupported','warnings','errors','unparsed'].some(name=>Object.hasOwn(out,name)&&Array.isArray(out[name])&&out[name].length))retainFailure(diagnostic);
    clean(out);assert.equal(JSON.stringify(creator.project),json,'owned JSON export retains original physical graph');return out;
};
let failureSerial=0;
const captureFailure = diagnostic => {
    const root=process.env.BW_ARRAY_MENU_FAILURE_ROOT;if(!root)return;
    const prefix='menu-failure-'+(++failureSerial);
    // Actual JSON project/conversion outputs only; no guest calls or error coercion.
    // Each complete graph is a separate bounded leaf; root enforces aggregate caps.
    for(const [name,value] of Object.entries({
        state:{stage:diagnostic.stage,feedbackCode:diagnostic.feedbackCode,reimportCode:diagnostic.reimportCode,ownedJsonInput:diagnostic.ownedJsonInput,directAstExport:diagnostic.directAstExport,sourceInput:diagnostic.sourceInput,facts:diagnostic.facts},
        'initial-export':diagnostic.initial,
        'importer-result':diagnostic.imported,
        projects:diagnostic.projects,
        'current-export':diagnostic.exportOutput
    }))writeFileSync(join(root,prefix+'-'+name+'.json'),JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
};
const retainFailure = diagnostic => {
    if(diagnostic.captureAttempted)return;diagnostic.captureAttempted=true;
    // Capture failure must never replace the original feature/assertion error.
    try{captureFailure(diagnostic);}catch(captureError){
        if(process.env.BW_ARRAY_MENU_FAILURE_ROOT){
            try{writeFileSync(join(process.env.BW_ARRAY_MENU_FAILURE_ROOT,'menu-capture-failed-'+failureSerial+'.json'),
                JSON.stringify({captureFailed:true,originalFailureRetained:true})+'\n',{flag:'wx',mode:0o600});}catch{}
        }
    }
};
const repeat = (creator,{rawResetMode}={}) => {
    const diagnostic={stage:'initial-export',initial:null,imported:null,feedbackCode:null,reimportCode:null,exportOutput:null,
        projects:{original:creator.project,feedback:null,second:null,again:null}};
    try{
        const initial=exported(creator,{},diagnostic);diagnostic.initial=initial;
        diagnostic.stage='Code-feedback';
        const before=structuredClone(creator.project),code=creator.decompile();diagnostic.feedbackCode=code;
        assert.deepEqual(creator.project,before,'Code reader retains original physical graph');
        const feedback=parse(code);diagnostic.projects.feedback=feedback.project;exported(feedback,{},diagnostic);
        diagnostic.stage='exact-files-import';
        const imported=arcadeToPseudocode(initial.files);diagnostic.imported=imported;clean(imported);
        diagnostic.reimportCode=imported.code;diagnostic.stage='exact-files-second-export';
        const second=parse(imported.code);diagnostic.projects.second=second.project;exportedOwned(second,diagnostic,rawResetMode);
        diagnostic.stage='second-Code-feedback';
        const again=parse(second.decompile());diagnostic.projects.again=again.project;exportedOwned(again,diagnostic,rawResetMode);
        return initial;
    }catch(error){
        retainFailure(diagnostic);
        throw error;
    }
};
const base='let items=[1,2,3];let alias=items;alias.push(4);let count=items.length;';

test('outer registered Creator migration Code feedback and exact-file reimport retain all exported Array selectors',()=>{
    const c=source('let items=[1,2,3,4,5,6];let alias=items;alias.push(7);alias.unshift(0);alias.insertAt(1,8);alias[0]=9;alias.reverse();alias.removeElement(8);alias.removeAt(0);alias.pop();alias.shift();alias.length=3;let tail=alias.pop();let head=alias.shift();let removed=alias.removeAt(0);let count=items.length;');
    const rows=canonical(c),operations=new Set(rows.filter(r=>r.node.opcode==='arrays_mutateReference').map(r=>arrayMenuLiteral(r.target,r.node,'OP')));
    for(const op of ['push','unshift','insertAt','set','reverse','removeElement','removeAt','pop','shift','length'])assert.ok(operations.has(op),op);
    const takes=new Set(rows.filter(r=>r.node.opcode==='arrays_referenceTake').map(r=>arrayMenuLiteral(r.target,r.node,'OP')));
    assert.deepEqual([...takes].sort(),['pop','removeAt','shift']);
    const out=repeat(c);assert.match(out.ts,/\.insertAt\(/);assert.match(out.ts,/\.removeAt\(/);assert.match(out.ts,/\.reverse\(/);
});

test('canonical selectors retain nested receiver aliases and ordinary caller-chain producer evidence',()=>{
    const c=source('function identity(values:number[][]):number[][]{return values};let first:number[][]=[];let alias=identity(first);alias.push([1]);let row=first[0];let count=row.length');
    canonical(c);repeat(c);
    const bad=source('let rows=[[1]];let alias=rows;alias.push(0 as any);let row=rows[0];let count=row.length');
    canonical(bad);assert.ok(projectToArcade(bad.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('only explicit legacy fields inline text and genuine uniquely-owned text shadows decode',()=>{
    for(const form of ['field','inline','text']){
        const c=source(base),[{target,node}]=canonical(c),old=node.inputs.OP[1];delete target.blocks[old];
        if(form==='field'){delete node.inputs.OP;node.fields.OP=['push',null];}
        if(form==='inline')node.inputs.OP=[1,[10,'push']];
        if(form==='text')target.blocks[old]={opcode:'text',parent:Object.keys(target.blocks).find(id=>target.blocks[id]===node),next:null,inputs:{},fields:{TEXT:['push',null]},shadow:true,topLevel:false};
        assert.equal(arrayMenuLiteral(target,node,'OP'),'push',form);exported(c);
    }
});

test('canonical menu rejection covers computed fallback conflicting detached shared and malformed physical selectors',()=>{
    const edits=[
        ({node})=>{node.inputs.OP[0]=2;},
        ({node})=>{node.inputs.OP=[3,node.inputs.OP[1],[10,'push']];},
        ({node})=>{node.fields.OP=['push',null];},
        ({menu})=>{menu.opcode='foreign_menu_referenceMutations';},
        ({menu})=>{menu.opcode='arrays_menu_referenceTakeOperations';},
        ({menu})=>{menu.fields.referenceMutations=[4,null];},
        ({menu})=>{menu.fields.referenceMutations=['push','not-null'];},
        ({menu})=>{menu.fields={wrong:['push',null]};},
        ({menu})=>{menu.fields.extra=['push',null];},
        ({menu})=>{menu.parent='detached';},
        ({menu})=>{menu.shadow=false;},
        ({menu})=>{menu.topLevel=true;},
        ({menu})=>{menu.mutation={};},
        ({menu})=>{menu.inputs.EXTRA=[1,[10,'push']];},
        ({menu})=>{menu.next='foreign';},
        ({target,node})=>{target.blocks.other={opcode:'text',inputs:{VALUE:[1,node.inputs.OP[1]]},fields:{},next:null,parent:null,shadow:false,topLevel:true};},
        ({target,node,menu})=>{target.blocks.duplicate=menu;}
    ];
    for(const edit of edits){const c=source(base),[{target,node}]=canonical(c),menu=target.blocks[node.inputs.OP[1]];edit({target,node,menu});
        assert.equal(arrayMenuLiteral(target,node,'OP'),null);
        const owner=Object.keys(target.blocks).find(id=>target.blocks[id]===node);assert.ok(owner);
        assert.equal(readableView(c.project).targets[c.project.targets.indexOf(target)].blocks[owner],node,'invalid Array selector receives no reader projection');
        assert.ok(projectToArcade(c.project).unsupported.length,'physical invalid selector must not export');}
    const take=source('let items=[1,2];let tail=items.pop();');
    const takeRow=canonical(take).find(row=>row.node.opcode==='arrays_referenceTake');assert.ok(takeRow,'actual take reporter');
    const {target:takeTarget,node:takeNode}=takeRow;
    assert.equal(takeNode.opcode,'arrays_referenceTake');
    assert.equal(takeTarget.blocks[takeNode.inputs.OP[1]].opcode,'arrays_menu_referenceTakeOperations');
    takeTarget.blocks[takeNode.inputs.OP[1]].opcode='arrays_menu_referenceMutations';
    assert.equal(arrayMenuLiteral(takeTarget,takeNode,'OP'),null);assert.ok(projectToArcade(take.project).unsupported.length);
    const c=source(base),[{target,node}]=canonical(c),menu=target.blocks[node.inputs.OP[1]];let coerced=0;
    menu.fields.referenceMutations[0]={toString(){coerced++;throw Error('selector coercion');}};
    assert.equal(arrayMenuLiteral(target,node,'OP'),null);assert.equal(coerced,0);
    node.opcode={toString(){coerced++;return 'arrays_mutateReference';},[Symbol.toPrimitive](){coerced++;return 'arrays_mutateReference';}};
    assert.equal(isArrayMenuSelector(node,'OP'),false);assert.equal(arrayMenuLiteral(target,node,'OP'),null);assert.equal(coerced,0,'opcode classification never coerces');
    for(const change of ['computed','malformed','unknown']){
        const scalar=source('let values=[1];let alias=values;alias.push(2);let observed=values[0]');
        const [{target:scalarTarget,node:writer}]=canonical(scalar);
        const initialStage=scalar.project.targets.find(t=>t.isStage),initialObserved=Object.entries(initialStage.variables).find(([,v])=>v[0]==='observed');assert.ok(initialObserved);
        assert.equal(scalarExportFlow(scalar.project,()=>false).primitive('variable:'+initialObserved[0]),true,'actual scalar element baseline');
        if(change==='computed')writer.inputs.OP[0]=2;
        if(change==='malformed')scalarTarget.blocks[writer.inputs.OP[1]].fields.extra=['push',null];
        if(change==='unknown')scalarTarget.blocks[writer.inputs.OP[1]].fields.referenceMutations[0]='future-operation';
        const flow=scalarExportFlow(scalar.project,()=>false),stage=scalar.project.targets.find(t=>t.isStage);
        const observed=Object.entries(stage.variables).find(([,v])=>v[0]==='observed');assert.ok(observed);
        assert.equal(flow.primitive('variable:'+observed[0]),false,change+' scalar proof');
        assert.equal(flow.type('variable:'+observed[0]),'any');

        const objects=source('class Box{constructor(public n:number){}}let values=[new Box(1)];let alias=values;alias.push(new Box(2));let observed=values[0]');
        const [{target:objectTarget,node:objectWriter}]=canonical(objects);
        const classNotes=[],classFacts=()=>prepareObjectClassExport({project:objects.project,opts:{},managedValueProcedures:new Set(),varName:(_target,name)=>name,note:message=>classNotes.push(message)});
        assert.equal(classFacts().variableTypes.get('observed'),'Box','actual class element baseline');assert.deepEqual(classNotes,[]);
        if(change==='computed')objectWriter.inputs.OP[0]=2;
        if(change==='malformed')objectTarget.blocks[objectWriter.inputs.OP[1]].fields.extra=['push',null];
        if(change==='unknown')objectTarget.blocks[objectWriter.inputs.OP[1]].fields.referenceMutations[0]='future-operation';
        const objectFacts=classFacts();assert.deepEqual(classNotes,[]);
        assert.equal(objectFacts.variableTypes.get('observed'),'any',change+' class element proof');

        const nested=source('let values=[[1]];let alias=values;alias.push([2]);let row=values[0];let count=row.length');
        const nestedRows=canonical(nested),aliasPush=nestedRows.filter(({target,node})=>{
            const raw=node.inputs.ARRAY?.[1];
            return node.opcode==='arrays_mutateReference'&&arrayMenuLiteral(target,node,'OP')==='push'&&
                Array.isArray(raw)&&raw[0]===12&&raw[1]==='alias'&&
                nested.project.targets.some(t=>t.variables?.[raw[2]]?.[0]==='alias');
        });
        assert.equal(aliasPush.length,1,'unique actual alias push writer, not literal construction');
        const {target:nestedTarget,node:nestedWriter}=aliasPush[0];
        assert.equal(nestedWriter.inputs.ARRAY[1][1],'alias');
        if(change==='computed')nestedWriter.inputs.OP[0]=2;
        if(change==='malformed')nestedTarget.blocks[nestedWriter.inputs.OP[1]].fields.extra=['push',null];
        if(change==='unknown')nestedTarget.blocks[nestedWriter.inputs.OP[1]].fields.referenceMutations[0]='future-operation';
        const length=Object.values(nestedTarget.blocks).find(b=>b.opcode==='arrays_referenceLength');assert.ok(length);
        const nestedFacts=createArrayReferenceExportAuthority(nested.project);
        assert.equal(nestedFacts.validateInput(nestedTarget,length).ok,false,change+' nested Array proof');
        assert.equal(nestedFacts.validateInput(nestedTarget,nestedWriter).ok,false,change+' current operation syntax');
    }
    const inspected=parse('DEVICE ARCADE\nGLOBAL values\nGLOBAL observed\nGLOBAL result\nWHEN arcade source starts:\n  set values to (new array reference from (array value 1 rest "[]"))\n  mutate array reference (values) op "push" index 0 value 2\n  set observed to (item 0 of array reference (values))\n  set result to (arcade inspect value (observed) limit 20)');
    const [{target:inspectTarget,node:inspectWriter}]=canonical(inspected);exported(inspected);
    inspectTarget.blocks[inspectWriter.inputs.OP[1]].fields.referenceMutations[0]='future-operation';
    assert.ok(projectToArcade(inspected.project).unsupported.includes('Arcade inspection export requires actual primitive VALUE and Number or Undefined LIMIT producers'),'private element proof must refuse independently of selector diagnostic');

});

test('a current producer proof cannot survive selector edits followed by restoration',()=>{
    const c=source('let items:any[];let observed=items+"";items=[1];items.push(2);let count=items.length'),[{target,node}]=canonical(c),length=Object.values(target.blocks).find(b=>b.opcode==='arrays_referenceLength');
    assert.ok(length);const proof=createArrayReferenceExportAuthority(c.project);
    assert.equal(proof.validateInput(target,length).ok,true);
    const menu=target.blocks[node.inputs.OP[1]],before=menu.fields.referenceMutations[0];menu.fields.referenceMutations[0]='pop';
    assert.equal(proof.validateInput(target,length).ok,false);menu.fields.referenceMutations[0]=before;
    assert.equal(proof.validateInput(target,length).ok,false,'restoration cannot revive observed source');
});

test('named alias writer census sees canonical insertAt as well as push and preserves opaque-reference refusal',()=>{
    for(const operation of ['push','insertAt']){
        const c=parse('DEVICE ARCADE\nGLOBAL alias\nWHEN arcade source starts:\n  new array "items" = [1]\n  set alias to (reference to named array ("items"))\n  mutate array reference (alias) op "'+operation+'" index 0 value (arcade new image width 1 height 1)');
        canonical(c);
        assert.equal(namedArrayItemExportAuthority(c.project,'items',()=>false).ok,false,operation);
        const row=selectors(c.project)[0],value=row.node.inputs.VALUE;row.node.inputs.VALUE=[1,[10,'safe']];
        assert.equal(namedArrayItemExportAuthority(c.project,'items',()=>false).ok,true,operation);
        const selector=row.target.blocks[row.node.inputs.OP[1]],field=Object.keys(selector.fields)[0];selector.fields[field][0]='future-operation';
        assert.equal(namedArrayItemExportAuthority(c.project,'items',()=>false).ok,false,'unknown selector keeps potential alias writer');
        row.node.inputs.VALUE=value;
    }
});

test('object class and primitive-field readers census canonical Array element writers',()=>{
    const text='class Box{constructor(public n:number){}read():number{return this.n}}let boxes=[new Box(1)];let alias=boxes;alias.push(new Box(2));let observed=boxes[0].read();';
    const c=source(text);canonical(c);repeat(c,{rawResetMode:'legacy-local-class'});
    const requiresOwned=source('let ordinary:number[]=null;let alias:number[]=null;let result=0;function build(){ordinary=[];alias=ordinary;alias.push(1);result=alias.length;}build();');
    assert.ok(projectToArcade(requiresOwned.project).unsupported.length,'actual global reset across an ordinary callee still refuses raw mutable input');
    clean(projectJsonToArcade(JSON.stringify(requiresOwned.project)));
    const mixedSource=text.replace('alias.push(new Box(2))','alias.push(0 as any)');
    const mixedImport=arcadeToPseudocode(mixedSource);clean(mixedImport);
    const mixed=parse(mixedImport.code),importedProject=structuredClone(mixed.project);canonical(mixed);
    const mixedBefore=structuredClone(mixed.project),mixedOut=projectToArcade(mixed.project);
    assert.deepEqual(mixed.project,mixedBefore,'mixed export retains the actual physical graph');
    const classNotes=[],classFacts=prepareObjectClassExport({project:mixed.project,opts:{},managedValueProcedures:new Set(),
        varName:(_target,name)=>name,note:message=>classNotes.push(message)});
    const scalarFacts=scalarExportFlow(mixed.project,()=>false);
    const strings=values=>{const result=[...values];assert.ok(result.every(value=>typeof value==='string'),'facts contain actual string type tags');return result;};
    const facts={classNotes,classVariableTypes:[...classFacts.variableTypes],scalarVariables:[],receiverInputs:[]};
    for(const target of mixed.project.targets){
        for(const [id,value]of Object.entries(target.variables||{}))facts.scalarVariables.push({id,name:value[0],
            primitive:scalarFacts.primitive('variable:'+id),type:scalarFacts.type('variable:'+id),types:strings(scalarFacts.types.get('variable:'+id)||[])});
        for(const [id,node]of Object.entries(target.blocks||{}))if(node.opcode==='arcade_callObjectMethod')facts.receiverInputs.push({
            targetName:target.name,id,opcode:node.opcode,inputTypes:strings(classFacts.inputTypes(target,node,'OBJECT')),
            valueTypes:strings(classFacts.valueTypes(target,node))});
    }
    if(mixedOut.unsupported.length||classFacts.variableTypes.get('boxes')!=='any[]'||!mixedOut.ts.includes('let boxes: any[] = null'))retainFailure({
        stage:'mixed-class-writer-type-repair-positive',sourceInput:mixedSource,facts,initial:mixedOut,imported:mixedImport,
        feedbackCode:null,reimportCode:mixedImport.code,exportOutput:mixedOut,
        projects:{imported:importedProject,original:mixed.project,feedback:null,second:null,again:null}});
    clean(mixedOut);
    assert.equal(classFacts.variableTypes.get('boxes'),'any[]','actual numeric writer prevents Box-only element facts');
    assert.match(mixedOut.ts,/let boxes: any\[\] = null/);
    assert.ok(mixedOut.ts.includes('alias.push((0 + 0))'),'original appended primitive remains');
    assert.ok(mixedOut.ts.includes('boxes[0]'),'original unaffected consumed slot remains');
    repeat(mixed);
    const scalar=source('class Box{constructor(public n:number){}}let values=[1];let alias=values;alias.unshift(2);let box=new Box(values[0]);');
    const scalarRows=canonical(scalar),aliasWrites=scalarRows.filter(({target,node})=>{
        const raw=node.inputs.ARRAY?.[1];return node.opcode==='arrays_mutateReference'&&arrayMenuLiteral(target,node,'OP')==='unshift'&&
            Array.isArray(raw)&&raw[0]===12&&raw[1]==='alias';
    });
    assert.equal(aliasWrites.length,1,'actual alias writer at the consumed index');
    const [{target,node}]=aliasWrites;exported(scalar);
    node.inputs.VALUE=[1,[10,'not Number']];
    assert.ok(projectToArcade(scalar.project).unsupported.some(message=>message.startsWith('Class primitive export:')),'actual String inserted at the consumed slot must reach the Number constructor check');
});

const animationID='12345678-1234-4234-8234-123456789abc';
const animationDocument=()=>{
    const frames=[2,8].map((colour,index)=>({id:'f'+index,durationMs:100,activeLayerId:'pixels',layers:[{id:'pixels',name:'Pixels',locked:false,type:'pixel',visible:true,opacity:1,content:{kind:'pixels',value:{width:2,height:1,pixels:[colour,colour]}}}]}));
    return {version:4,layers:frames[0].layers,activeLayerId:'pixels',animation:{resource:{id:animationID,name:'Walk'},activeFrameId:'f0',frames}};
};
test('actual outer animation resource menus remain supported and malformed or dynamic resources remain refused',()=>{
    for(const operation of ['frames','fresh frames']){
        const c=parse('DEVICE ARCADE\nGLOBAL frames\nGLOBAL count\nWHEN arcade source starts:\n  set frames to (arcade animation '+operation+' resource "'+animationID+'")\n  set count to (length of array reference (frames))');
        const options={animationDocuments:[animationDocument()]},target=c.project.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_animationAsset'+(operation==='frames'?'Frames':'FreshFrames')));
        const node=Object.values(target.blocks).find(n=>n.opcode==='arcade_animationAsset'+(operation==='frames'?'Frames':'FreshFrames'));
        delete node.inputs.RESOURCE;node.fields.RESOURCE=[animationID,null];assert.deepEqual(normalizeProjectMenuArgs(c.project),[]);
        const menu=target.blocks[node.inputs.RESOURCE[1]];assert.equal(menu.opcode,'arcade_menu_animationAssets');exported(c,options);
        const feedback=parse(c.decompile());exported(feedback,options);
        menu.fields.animationAssets[0]='missing';assert.ok(projectToArcade(c.project,options).unsupported.length);
        menu.fields.animationAssets[0]=animationID;node.inputs.RESOURCE=[2,node.inputs.RESOURCE[1]];assert.ok(projectToArcade(c.project,options).unsupported.length);
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {prepareObjectClassExport} from '../overlay/scratch-gui/src/lib/bw-makecode/object-class-export.js';
import {scalarExportFlow} from '../overlay/scratch-gui/src/lib/bw-makecode/scalar-export-flow.js';
import {arrayMenuLiteral,isArrayMenuSelector} from '../overlay/scratch-gui/src/lib/bw-makecode/array-menu-literal.js';
import {normalizeProjectMenuArgs} from '../overlay/scratch-gui/src/lib/extension-menu-args.js';

const original='class Box{constructor(public n:number){}read():number{return this.n}}let boxes=[new Box(1)];let alias=boxes;alias.push(0 as any);let observed=boxes[0].read();';
const clean=value=>{for(const key of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(value,key))assert.deepEqual(value[key],[],key);};
const parse=code=>{const c=new Creator();c.parse(code);clean(c);return c;};
const source=text=>{const value=arcadeToPseudocode(text);clean(value);return parse(value.code);};
const rows=(c,opcode)=>c.project.targets.flatMap(target=>Object.entries(target.blocks).filter(([,node])=>node.opcode===opcode).map(([id,node])=>({target,id,node})));
const literal=(target,node,name)=>{const value=node.inputs?.[name]?.[1];return Array.isArray(value)?value[1]:target.blocks[value]?.fields?.TEXT?.[0];};
const canonical=c=>{
    for(const target of c.project.targets)for(const node of Object.values(target.blocks))if(isArrayMenuSelector(node,'OP')){
        const op=arrayMenuLiteral(target,node,'OP');assert.equal(typeof op,'string');delete node.inputs.OP;node.fields.OP=[op,null];
    }
    assert.deepEqual(normalizeProjectMenuArgs(c.project),[]);return c;
};
const facts=c=>{const notes=[],model=prepareObjectClassExport({project:c.project,opts:{},managedValueProcedures:new Set(),varName:(_target,name)=>name,note:value=>notes.push(value)});assert.deepEqual(notes,[]);return model;};
const owner=({target,node})=>{let top=node;const seen=new Set();while(!top.topLevel){assert.ok(top.parent&&!seen.has(top));seen.add(top);top=target.blocks[top.parent];assert.ok(top);}
    const id=Object.keys(target.blocks).find(id=>target.blocks[id]===top),proto=top.opcode==='procedures_definition'?target.blocks[top.inputs.custom_block[1]]:null;
    return proto?`${target.isStage?'':target.name}:${proto.mutation.proccode}`:`${target.name}:script:${id}`;};
const emit=c=>{const before=JSON.stringify(c.project),out=projectToArcade(c.project);clean(out);assert.equal(JSON.stringify(c.project),before);return out;};
let captureSerial=0;
const roundtrip=(c,sourceInput)=>{
    const diagnostic={stage:'initial-export',sourceInput,initial:null,imported:null,current:null,feedbackCode:null,reimportCode:null,
        projects:{original:c.project,feedback:null,second:null},currentCreator:c};
    const observedExport=(creator,owned=false)=>{diagnostic.currentCreator=creator;const before=JSON.stringify(creator.project);
        const out=owned?projectJsonToArcade(before):projectToArcade(creator.project);diagnostic.current=out;
        if(diagnostic.stage==='initial-export')diagnostic.initial=out;
        clean(out);assert.equal(JSON.stringify(creator.project),before);return out;};
    try{
        const out=observedExport(c);diagnostic.stage='Code-feedback';diagnostic.feedbackCode=c.decompile();
        const feedback=parse(diagnostic.feedbackCode);diagnostic.projects.feedback=feedback.project;observedExport(feedback);
        diagnostic.stage='exact-files-import';const imported=arcadeToPseudocode(out.files);diagnostic.imported=imported;clean(imported);
        diagnostic.reimportCode=imported.code;diagnostic.stage='exact-files-second-export';
        const next=parse(imported.code);diagnostic.projects.second=next.project;observedExport(next,true);return out;
    }catch(error){
        const root=process.env.BW_ARRAY_MENU_FAILURE_ROOT;
        if(root){const prefix='typing-failure-'+(++captureSerial);try{
            const creator=diagnostic.currentCreator,notes=[],model=prepareObjectClassExport({project:creator.project,opts:{},managedValueProcedures:new Set(),
                varName:(_target,name)=>name,note:message=>notes.push(message)}),scalar=scalarExportFlow(creator.project,()=>false);
            const facts={classNotes:notes,classVariableTypes:[...model.variableTypes],classDeclarationTypes:[...model.variableDeclarationTypes],variables:[],nodes:[],privateLiteralCells:'UNOBSERVED'};
            for(const target of creator.project.targets){
                for(const [id,value]of Object.entries(target.variables||{}))facts.variables.push({targetName:target.name,id,name:value[0],type:scalar.type('variable:'+id),types:[...(scalar.types.get('variable:'+id)||[])]});
                for(const [id,node]of Object.entries(target.blocks||{}))facts.nodes.push({targetName:target.name,id,opcode:node.opcode,classTypes:[...model.valueTypes(target,node)],scalarTypes:[...(scalar.types.get(node)||[])]});
            }
            for(const [name,value]of Object.entries({state:{stage:diagnostic.stage,sourceInput:diagnostic.sourceInput,feedbackCode:diagnostic.feedbackCode,reimportCode:diagnostic.reimportCode,facts},
                'initial-export':diagnostic.initial,'importer-result':diagnostic.imported,projects:diagnostic.projects,'current-export':diagnostic.current}))
                writeFileSync(join(root,prefix+'-'+name+'.json'),JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
        }catch{try{writeFileSync(join(root,'typing-capture-failed-'+captureSerial+'.json'),JSON.stringify({captureFailed:true,originalFailureRetained:true})+'\n',{flag:'wx',mode:0o600});}catch{}}}
        throw error;
    }
};
const aliasWriter=(c,operation)=>{const found=rows(c,'arrays_mutateReference').filter(({target,node})=>{const input=node.inputs.ARRAY[1];return Array.isArray(input)&&input[0]===12&&input[1]==='alias'&&arrayMenuLiteral(target,node,'OP')===operation;});assert.equal(found.length,1);return found[0];};

test('the retained mixed append and fixed index source exports with every actual writer and honest mixed declaration types',()=>{
    const c=canonical(source(original)),before=JSON.stringify(c.project),model=facts(c),writer=aliasWriter(c,'push');
    const numeric=writer.target.blocks[writer.node.inputs.VALUE[1]];assert.equal(numeric.opcode,'operator_add');
    assert.equal(model.variableTypes.get('boxes'),'any[]');assert.equal(model.variableDeclarationTypes.get('alias'),'any[]');
    const call=rows(c,'arcade_callObjectMethod')[0];assert.ok(call);
    const input=model.inputTypes(call.target,call.node,'OBJECT');assert.ok(input.has('Box')&&input.has('number'),'both genuine producers remain');
    const out=roundtrip(c,original);assert.match(out.ts,/let boxes: any\[\] = null/);assert.match(out.ts,/alias\.push\(\(0 \+ 0\)\)/);assert.match(out.ts,/boxes\[0\]/);
    assert.equal(JSON.stringify(c.project),before,'no writer or source expression is erased');
});

test('genuine class-only temporary values and Arrays use reference declarations rather than Number defaults',()=>{
    const c=canonical(source(original.replace('alias.push(0 as any);',''))),model=facts(c),out=emit(c);
    const assignments=rows(c,'arcade_setLocal').filter(({target,node})=>target.blocks[node.inputs.VALUE?.[1]]?.opcode==='arcade_createObject');assert.ok(assignments.length);
    for(const row of assignments){const name=literal(row.target,row.node,'NAME');assert.equal(model.localDeclarationType(owner(row),name),'Box');assert.ok(out.ts.includes(`let ${name}: Box = null`));assert.ok(!out.ts.includes(`let ${name}: number = 0`));}
    assert.match(out.ts,/let __bwPxtValue\d+: Box\[\] = null/);assert.match(out.ts,/^let boxes: Box\[\]$/m);
    assert.ok(rows(c,'arcade_declareSourceReference').some(({node})=>Array.isArray(node.inputs.VARIABLE[1])&&node.inputs.VARIABLE[1][1]==='boxes'),'existing source-reference declaration retains its genuine uninitialized global contract');
    const absence=source('class Box{constructor(public n:number){}}let box:Box=null;let missing:any=undefined;box=new Box(1);');
    const specials=rows(absence,'arrays_specialValue');assert.ok(specials.length>=2);
    for(const row of specials){assert.equal(Object.hasOwn(row.node.inputs,'KIND'),false);
        const kind=row.node.fields.KIND;assert.ok(['null','undefined'].includes(kind[0]));assert.deepEqual(kind,[kind[0],null]);
        assert.ok(facts(absence).valueTypes(row.target,row.node).has(kind[0]),'actual absence is retained, not an opaque or allocation fact');}
    const changed=specials[0];changed.node.inputs.KIND=[1,[10,changed.node.fields.KIND[0]]];
    assert.ok(facts(absence).valueTypes(changed.target,changed.node).has('any'),'conflicting field/input cannot be a fixed native absence');
    const kind=changed.node.fields.KIND[0];delete changed.node.fields.KIND;
    assert.ok(facts(absence).valueTypes(changed.target,changed.node).has('any'),'missing canonical field cannot borrow an inline KIND input');
    const shadowId=changed.id+'-invalid-kind-shadow';assert.equal(Object.hasOwn(changed.target.blocks,shadowId),false);
    changed.target.blocks[shadowId]={opcode:'text',next:null,parent:changed.id,inputs:{},fields:{TEXT:[kind,null]},shadow:true,topLevel:false};
    changed.node.inputs.KIND=[1,shadowId];
    assert.ok(facts(absence).valueTypes(changed.target,changed.node).has('any'),'a connected text shadow cannot replace the native fixed field');
    delete changed.node.inputs.KIND;delete changed.target.blocks[shadowId];changed.node.fields.KIND=['foreign-kind',null];
    assert.ok(facts(absence).valueTypes(changed.target,changed.node).has('any'),'unsupported fixed kinds remain opaque');
    delete changed.node.fields;assert.ok(facts(absence).valueTypes(changed.target,changed.node).has('any'),'missing fields refuse without throwing');
    changed.node.fields=null;assert.ok(facts(absence).valueTypes(changed.target,changed.node).has('any'),'null fields refuse without throwing');
});

test('class and primitive local writes remain mixed and retain their actual order and initializers',()=>{
    const c=source('class Box{constructor(public n:number){}}function build(){let saved:any=new Box(1);saved=0;let copy=saved;}build();'),before=JSON.stringify(c.project),out=emit(c);
    assert.match(out.ts,/let saved: any = 0/);assert.ok(out.ts.indexOf('saved = new Box')<out.ts.lastIndexOf('saved = (0 + 0)'));
    assert.equal(JSON.stringify(c.project),before);
    const capture=source('class Box{constructor(public n:number){}}function build(){let saved:any=new Box(1);game.onUpdate(function(){saved=0;});let observed=saved;}build();');
    assert.ok(rows(capture,'arcade_setCaptured').length,'actual source closure retains its captured writer');
    const row=rows(capture,'arcade_setLocal').find(({target,node})=>literal(target,node,'NAME')==='saved');assert.ok(row);
    assert.equal(facts(capture).localDeclarationType(owner(row),'saved'),'any','captured writes cannot leave an earlier class-only declaration');
});

test('an unsupported late value producer cannot vanish into an earlier class Array element',()=>{
    const c=canonical(source(original)),writer=aliasWriter(c,'push'),value=writer.target.blocks[writer.node.inputs.VALUE[1]];
    value.opcode='future_numeric_value';const before=JSON.stringify(c.project),model=facts(c);
    assert.equal(model.variableTypes.get('boxes'),'any[]');assert.equal(model.variableDeclarationTypes.get('alias'),'any[]');
    assert.ok(projectToArcade(c.project).unsupported.length);assert.equal(JSON.stringify(c.project),before);
});

test('actual aliases and ordinary helper returns retain mixed Array writers across forwarding',()=>{
    const helperSource='class Box{constructor(public n:number){}}function same(value:Box[]):Box[]{return value;}let boxes=[new Box(1)];let alias=same(boxes);alias.push(0 as any);let item=boxes[0];';
    const c=canonical(source(helperSource));
    const model=facts(c);assert.equal(model.variableDeclarationTypes.get('boxes'),'any[]');assert.equal(model.variableDeclarationTypes.get('alias'),'any[]');
    const call=rows(c,'arcade_callFunction').find(({target,node})=>literal(target,node,'NAME').includes('same'));assert.ok(call);
    const code=literal(call.target,call.node,'NAME'),key=`${call.target.isStage?'':call.target.name}:${code}`;
    assert.equal(model.procedureParameterType(key,'value'),'any');assert.equal(model.procedureResultType(key),'any',
        'a genuine allocation caller cannot narrow unknown callable ingress to a class or Array syntax type');
    const annotationOnly=source('class Box{constructor(public n:number){}}function same(value:Box[]):Box[]{return value;}let values:number[]=[];let alias=same(values as any);');
    const ordinary=rows(annotationOnly,'arcade_callFunction').find(({target,node})=>literal(target,node,'NAME').includes('same'));assert.ok(ordinary);
    const ordinaryKey=`${ordinary.target.isStage?'':ordinary.target.name}:${literal(ordinary.target,ordinary.node,'NAME')}`;
    assert.equal(facts(annotationOnly).procedureParameterType(ordinaryKey,'value'),null,'annotation alone cannot create a class-origin syntax hint');
    const out=roundtrip(c,helperSource);assert.ok(out.ts.includes('same('));assert.match(out.ts,/function Game_same\s*\(value: any\): any/);assert.match(out.ts,/let alias: any\[\]/);assert.match(out.ts,/alias\.push\(\(0 \+ 0\)\)/);
    const copied=canonical(source('class Box{constructor(public n:number){}}let boxes=[new Box(1)];let copy=boxes.slice(0,1);let joined=copy.concat(boxes);boxes.push(0 as any);'));
    const copiedFacts=facts(copied);assert.equal(copiedFacts.variableDeclarationTypes.get('copy'),'any[]');
    assert.equal(copiedFacts.variableDeclarationTypes.get('joined'),'any[]','element alternatives propagate without alias-identity or body authority');
    const partial=source('class Box{constructor(public n:number){}}function maybe(){if(controller.A.isPressed()){return new Box(1);}}let selected=maybe();');
    const calls=rows(partial,'arcade_callFunction').filter(({target,node})=>literal(target,node,'NAME').includes('maybe'));assert.equal(calls.length,1);
    assert.ok(facts(partial).valueTypes(calls[0].target,calls[0].node).has('undefined'),'actual fallthrough remains in result facts, independently of class annotation');
});

test('source plus retains String while fixed numeric operations do not grant class or Array input authority',()=>{
    const c=source('class Box{constructor(public n:number){}}let boxes=[new Box(1)];let alias=boxes;alias.push(2 as any);');
    const writer=rows(c,'arrays_mutateReference').find(({node})=>Array.isArray(node.inputs.ARRAY[1])&&node.inputs.ARRAY[1][1]==='alias');assert.ok(writer);
    const value=writer.target.blocks[writer.node.inputs.VALUE[1]];value.opcode='arcade_sourceValueBinary';value.inputs={LEFT:[1,[10,'text']],RIGHT:[1,[4,'1']]};value.fields={OP:['+',null]};
    const model=facts(c);assert.equal(model.variableDeclarationTypes.get('boxes'),'any[]');
    const scalar=scalarExportFlow(c.project,()=>false);assert.ok(scalar.types.get(value)?.has('string'));assert.ok(!scalar.types.get(value)?.has('number'));
    const union=source('let choice:any=1;choice="text";let result=choice+1;');
    const plus=rows(union,'arrays_valueBinary').find(({node})=>node.fields?.OP?.[0]==='+');assert.ok(plus,'actual primitive-only importer uses native plus');
    assert.deepEqual(plus.node.fields,{OP:['+',null]});assert.equal(Object.hasOwn(plus.node.inputs,'OP'),false);
    const alternatives=scalarExportFlow(union.project,()=>false).types.get(plus.node);
    assert.ok(alternatives?.has('string')&&alternatives.has('number'),'each actual String|Number alternative survives native plus');
    const left=plus.node.inputs.LEFT,right=plus.node.inputs.RIGHT;
    plus.node.opcode='arcade_sourceValueBinary';plus.node.fields={OP:['+',null]};plus.node.inputs={LEFT:left,RIGHT:right};
    const sourceAlternatives=scalarExportFlow(union.project,()=>false).types.get(plus.node);
    assert.ok(sourceAlternatives?.has('string')&&sourceAlternatives.has('number'),'the fixed source selector retains both alternatives from the same actual operands');
    assert.equal(plus.node.inputs.LEFT,left);assert.equal(plus.node.inputs.RIGHT,right);
    value.fields.OP=['future-operation',null];assert.equal(facts(c).variableDeclarationTypes.get('boxes'),'any[]');assert.ok(projectToArcade(c.project).unsupported.length);
});

test('a real alias write to the consumed slot remains unsafe for an actual Number constructor contract',()=>{
    const c=canonical(source('class Box{constructor(public n:number){}}let values=[1];let alias=values;alias.unshift(2);let box=new Box(values[0]);'));
    const {node}=aliasWriter(c,'unshift');emit(c);node.inputs.VALUE=[1,[10,'not Number']];
    const before=JSON.stringify(c.project),out=projectToArcade(c.project);
    assert.ok(out.unsupported.some(message=>message.startsWith('Class primitive export:')));assert.equal(JSON.stringify(c.project),before);
});

test('the genuine original MakeCode SDK compiles both the unchanged captured source and emitted files',async t=>{
    const {compile,hasRuntime}=await import('../scripts/lib/pxt-node.mjs');
    if(!hasRuntime('arcade')){t.skip('SDK_ABSENT: no genuine retained Arcade runtime; actual original and emitted-file compilation remains mandatory');return;}
    const files={'main.ts':original,'pxt.json':JSON.stringify({name:'class-array-original',dependencies:{core:'*'},files:['main.ts']})};
    const first=await compile('arcade',files);assert.equal(first.success,true,JSON.stringify(first.diagnostics));
    const out=emit(canonical(source(original))),second=await compile('arcade',out.files);assert.equal(second.success,true,JSON.stringify({diagnostics:second.diagnostics,files:out.files}));
});

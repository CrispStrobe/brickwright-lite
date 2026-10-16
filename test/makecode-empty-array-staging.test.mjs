import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {prepareProcedureConstraintSource,procedureConstraintAstMetadata} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const directory=process.env.BW_EMPTY_ARRAY_OBSERVATIONS;let serial=0;
const retain=(kind,value)=>{if(directory)fs.writeFileSync(path.join(directory,String(serial++).padStart(4,'0')+'-'+kind+'.json'),JSON.stringify(value,(_key,v)=>v===undefined?{$undefined:true}:v,2)+'\n',{flag:'wx'});};
const channels=value=>Object.fromEntries([...new Set(['warnings','errors','unparsed','unsupported','diagnostics',...Object.keys(value||{}).filter(k=>/warn|error|unparsed|unsupported|diagnostic|refus/i.test(k))])].map(k=>[k,{provided:Object.hasOwn(value||{},k),kind:!Object.hasOwn(value||{},k)?'absent':value[k]===undefined?'undefined':value[k]===null?'null':Array.isArray(value[k])?'array':typeof value[k],...(Object.hasOwn(value||{},k)?{value:value[k]}:{})}]));
const walk=(node,fn)=>{if(!node||typeof node!=='object')return;fn(node);for(const value of Object.values(node))if(typeof value==='object')Array.isArray(value)?value.forEach(n=>walk(n,fn)):walk(value,fn);};
const temporaryCount=tree=>{let n=0;walk(tree,node=>{if(node.type==='Declaration')n+=node.decls.filter(d=>d.temporary===true).length;});return n;};
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true});
const lower=(input,opts)=>{retain('lower-input',{input});try{const result=lowerPxtStagedValues(input,opts);retain('lower-return',{result,inputAfter:input});return result;}catch(error){retain('lower-exception',{name:error.name,message:error.message,stack:error.stack,channels:channels(error),inputAfter:input});throw error;}};

// A deliberately tiny authored-fixture observer, not a product/guest interpreter.
// It checks allocation identity and effect order in this suite's straight-line IR.
const executeFixture=body=>{const values=new Map(),effects=[];let allocations=0;
 const value=node=>{if(node.type==='Number')return Number(node.value);if(node.type==='String')return node.value;if(node.type==='Identifier'){assert.ok(values.has(node.name));return values.get(node.name);}if(node.type==='Array'){allocations++;return node.items.map(value);}if(node.type==='Call'&&node.callee.type==='Member'&&node.callee.name==='push')return value(node.callee.object).push(...node.args.map(value));if(node.type==='Call'&&node.callee.type==='Identifier'&&node.callee.name==='effect'){const v=value(node.args[0]);effects.push(v);return v;}throw Error('unsupported authored fixture expression '+node.type);};
 for(const st of body){if(st.type==='Declaration')for(const d of st.decls)values.set(d.name,value(d.init));else if(st.type==='ExpressionStatement'&&st.expr.type==='Assignment'){assert.equal(st.expr.op,'=');assert.equal(st.expr.left.type,'Identifier');values.set(st.expr.left.name,value(st.expr.right));}else if(st.type==='ExpressionStatement')value(st.expr);else throw Error('unsupported authored fixture statement '+st.type);}
 return{values,effects,allocations};};

test('single actual let and const initializers remain direct fresh empty allocations',()=>{
 for(const kind of ['let','const']){const input=parse(`${kind} values:number[]=[];`),before=structuredClone(input),result=lower(input);assert.deepEqual(input,before);assert.equal(temporaryCount(result),0);assert.equal(result.body.length,1);assert.equal(result.body[0].kind,kind);assert.equal(result.body[0].decls[0].init.type,'Array');assert.deepEqual(result.body[0].decls[0].init.items,[]);}
});

test('complete existing-let assignment remains at its actual statement position',()=>{
 const input=parse('let values:number[]=[];values=[];'),result=lower(input);assert.equal(temporaryCount(result),0);assert.equal(result.body.length,2);assert.equal(result.body[1].expr.type,'Assignment');assert.equal(result.body[1].expr.right.type,'Array');
});

test('fresh identity, aliases and mutations retain one allocation per source position',()=>{
 const input=parse('let values:number[]=[];let alias=values;values.push(4);values=[];values.push(9);'),result=lower(input);
 for(const tree of [input,result]){const actual=executeFixture(tree.body);assert.equal(actual.allocations,2);assert.notEqual(actual.values.get('alias'),actual.values.get('values'));assert.deepEqual(actual.values.get('alias'),[4]);assert.deepEqual(actual.values.get('values'),[9]);}
 const first=executeFixture(result.body),second=executeFixture(result.body);assert.notEqual(first.values.get('alias'),second.values.get('alias'));assert.notEqual(first.values.get('values'),second.values.get('values'));
});

test('surrounding actual effect order remains before allocation then after assignment',()=>{
 const input=parse('effect("before");let values:number[]=[];effect("middle");values=[];effect("after");'),result=lower(input);for(const tree of[input,result]){const actual=executeFixture(tree.body);assert.equal(actual.allocations,2);assert.deepEqual(actual.effects,['before','middle','after']);}
});

test('actual shadowed lexical declaration and parameter assignment bind their own cells',()=>{
 const input=parse('let values:number[]=[];function f(values:number[]){values=[];let other:number[]=[];return other;}'),result=lower(input);assert.equal(temporaryCount(result),0);assert.equal(result.body[1].body[0].expr.right.type,'Array');assert.equal(result.body[1].body[1].decls[0].init.type,'Array');
});

test('unbound, duplicate, const-assignment and var contexts retain existing staging',()=>{
 for(const source of ['values=[];','let values:number[]=[];let values:number[]=[];','const values:number[]=[];values=[];','var values:number[]=[];values=[];'])assert.ok(temporaryCount(lower(parse(source)))>0,source);
});

test('multiple declarators retain staging and complete evaluation order',()=>{
 const input=parse('let a:number[]=[],b=effect("second");'),result=lower(input);assert.ok(temporaryCount(result)>0);for(const tree of[input,result]){const actual=executeFixture(tree.body);assert.equal(actual.allocations,1);assert.deepEqual(actual.effects,['second']);assert.deepEqual(actual.values.get('a'),[]);assert.equal(actual.values.get('b'),'second');}
});

test('member, index, consumed assignments and compound assignments remain staged',()=>{
 for(const source of ['let obj:any={};obj.value=[];','let values:any[]=[];values[0]=[];','let values:any[]=[];let other=(values=[]);','let values:any[]=[];values+=[];'])assert.ok(temporaryCount(lower(parse(source)))>0,source);
});

test('return, call, conditional and short-circuit empty arrays remain staged',()=>{
 for(const source of ['function f(){return [];}','consume([]);','let values=flag?[]:[];','let values=flag&&[];'])assert.ok(temporaryCount(lower(parse(source)))>0,source);
});

test('nonempty arrays and resource/staging metadata keep existing protocols',()=>{
 assert.ok(temporaryCount(lower(parse('let values=[1,2];')))>0);
 for(const flag of ['bwAnimationResourceId','bwImageArrayGroup','temporary','valuePreserving']){const input=parse('let values=[];');input.body[0].decls[0].init[flag]=flag.startsWith('bw')?'actual-resource':true;assert.ok(temporaryCount(lower(input))>0,flag);}
 const whenUsed=parse('let values=[];');whenUsed.body[0].decls[0].whenUsed=true;assert.ok(temporaryCount(lower(whenUsed))>0);
});

test('shared actual literals and unknown array shape cannot authorize direct allocation',()=>{
 const input=parse('let a=[];let b=[];');input.body[1].decls[0].init=input.body[0].decls[0].init;assert.ok(temporaryCount(lower(input))>0);
 const extra=parse('let a=[];');extra.body[0].decls[0].init.unknownProtocol=true;assert.ok(temporaryCount(lower(extra))>0);
});

test('unsupported scopes and for-init positions preserve their prior staging',()=>{
 for(const source of ['namespace N{export let values=[];}','class Box{values:number[]=[];constructor(){}}','for(let values=[];false;){values=[];}'])assert.ok(temporaryCount(lower(parse(source)))>0,source);
});

test('onlySelected does not authorize an empty statement outside selected syntax',()=>{
 const input=parse('let values=[];'),result=lower(input,{onlySelected:()=>false});assert.equal(result,input);assert.deepEqual(result,input);
});

const build=source=>{const imported=arcadeToPseudocode(source);retain('public-import',{source,imported,channels:channels(imported)});assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const creator=new Creator();let error;try{creator.parse(imported.code);for(const c of imported.costumes||[])creator.applyCustomSVG(c.sprite,c.svg);}catch(e){error=e;}finally{retain('Creator',{channels:channels(creator),project:creator.project,...(error?{exception:{name:error.name,message:error.message,stack:error.stack,channels:channels(error)}}:{})});}if(error)throw error;for(const k of['warnings','errors','unparsed'])assert.deepEqual(creator[k],[]);return{imported,creator};};
const reparse=code=>{const creator=new Creator();let error;try{creator.parse(code);}catch(e){error=e;}finally{retain('Code-Creator',{code,channels:channels(creator),project:creator.project,...(error?{exception:{name:error.name,message:error.message,stack:error.stack,channels:channels(error)}}:{})});}if(error)throw error;for(const k of['warnings','errors','unparsed'])assert.deepEqual(creator[k],[]);return creator;};
const exported=creator=>{let result,error;try{result=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume?.assetId)?.data});}catch(e){error=e;}finally{retain('current-export',{project:creator.project,...(result?{result,channels:channels(result)}:{}),...(error?{exception:{name:error.name,message:error.message,stack:error.stack,channels:channels(error)}}:{})});}if(error)throw error;assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);return result;};

test('real source to editable Code and blocks preserves direct allocations, aliases and current export',()=>{
 const{creator,imported}=build('let values:number[]=[];let alias=values;values.push(4);values=[];values.push(9);let answer=alias[0]+values[0];');assert.doesNotMatch(imported.code,/arcade set local __bwPxtValue/);const code=creator.decompile();retain('current-Code',{code});const next=reparse(code),reopened=next.decompile();retain('reopened-Code',{code:reopened});assert.equal((reopened.match(/new array reference from/g)||[]).length,2);const blocks=next.project.targets.flatMap(t=>Object.values(t.blocks||{}));assert.equal(blocks.filter(b=>b.opcode==='arrays_createReference').length,2);assert.ok(blocks.some(b=>b.opcode==='arrays_mutateReference'));assert.ok(blocks.some(b=>b.opcode==='arrays_referenceItem'));const result=exported(next);assert.match(result.files['main.ts'],/\[\]/);assert.match(result.files['main.ts'],/push\(/);
});

test('an actual Code edit changes the allocation graph and current export without source restoration',()=>{
 const{creator}=build('let values:number[]=[];values.push(4);let answer=values[0];');const code=creator.decompile(),edited=code.replace(/new array reference from (?:\(\s*"\[\]"\s*\)|"\[\]")/,'new array reference from "[5]"');retain('edited-Code',{code,edited});assert.notEqual(edited,code,'actual editable empty-array reporter occurrence');const next=reparse(edited);assert.ok(next.project.targets.flatMap(t=>Object.values(t.blocks||{})).some(b=>b.opcode==='arrays_createReference'&&b.inputs?.VALUES?.[1]?.[1]==='[5]'));const result=exported(next);assert.match(result.files['main.ts'],/\[\s*5\s*\]/);assert.equal(Object.hasOwn(next.project,'bwMakeCode'),false);
});


test('an earlier real lowering callback cannot reuse a stale empty-shape or binding census',()=>{
 for(const kind of ['items','binding']){const input=parse('probe();let values:number[]=[];values=[];');let edited=false;const result=lower(input,{lowerArrayMap:node=>{if(!edited&&node.type==='Call'&&node.callee?.name==='probe'){edited=true;if(kind==='items')input.body[1].decls[0].init.items.push({type:'Number',value:'5'});else input.body[1].kind='const';}return null;}});assert.equal(edited,true);assert.ok(temporaryCount(result)>0,'changed current AST must retain ordinary staging');}
});


test('an empty declaration at an actual loop body site remains a fresh per-entry allocation',()=>{
 const result=lower(parse('let iteration=0;while(iteration<2){let values:number[]=[];iteration++;}'));assert.equal(temporaryCount(result),0);const site=result.body[1].body[0];assert.equal(site.decls[0].init.type,'Array');const first=executeFixture([site]),second=executeFixture([site]);assert.equal(first.allocations,1);assert.equal(second.allocations,1);assert.notEqual(first.values.get('values'),second.values.get('values'));
});


test('an unknown neighboring syntax domain cannot lend a lexical statement proof',()=>{
 const input=parse('let values=[];');input.body.push({type:'UnexpectedScope',body:[]});assert.ok(temporaryCount(lower(input))>0);
});


test('empty direct statements still invoke their existing value-lowering hooks once in order',()=>{
 const input=parse('let values=[];'),calls=[];const result=lower(input,{lowerIntegerDivision:node=>{if(node.type==='Array')calls.push('division');return null;},lowerArrayMap:node=>{if(node.type==='Array')calls.push('map');return null;}});assert.deepEqual(calls,['division','map']);assert.equal(temporaryCount(result),0);assert.equal(result.body[0].decls[0].init.type,'Array');
});

test('another actual value-lowering protocol wins before empty-array transport omission',()=>{
 for(const owner of['lowerIntegerDivision','lowerArrayMap']){const input=parse('let values=[];');let calls=0;const result=lower(input,{[owner]:node=>{if(node.type!=='Array')return null;calls++;return{prefix:[],value:{type:'Number',value:'7'}};}});assert.equal(calls,1);assert.equal(result.body[0].decls[0].init.type,'Number');assert.equal(Number(result.body[0].decls[0].init.value),7);}
});


test('the real root constraint protocol is retained separately from executable binding facts',()=>{
 const prepared=prepareProcedureConstraintSource(parse('let values:number[]=[];'));assert.deepEqual(prepared.diagnostics,[]);const metadata=procedureConstraintAstMetadata(prepared),input={...prepared.program,bwProcedureConstraintSource:metadata};const result=lower(input);assert.equal(temporaryCount(result),0);assert.equal(result.bwProcedureConstraintSource,metadata);assert.equal(result.bwProcedureConstraintSource.prefix,prepared.prefix);assert.equal(result.body[0].decls[0].init.type,'Array');
 const changed=parse('probe();let values:number[]=[];');changed.bwProcedureConstraintSource=metadata;const after=lower(changed,{lowerArrayMap:node=>{if(node.type==='Call'&&node.callee?.name==='probe')changed.bwProcedureConstraintSource=Object.freeze({prefix:prepared.prefix});return null;}});assert.ok(temporaryCount(after)>0,'replaced protocol envelope expires currentness');
});


test('a lowering hook cannot borrow a known statement for a foreign empty literal',()=>{
 const input=parse('probe();let values=[];'),statement=input.body[1],foreign={type:'Array',items:[]};let observed;
 const result=lower(input,{lowerArrayMap:(node,{expression})=>{if(node.type==='Call'&&node.callee?.name==='probe')observed=expression(foreign,statement);return null;}});
 assert.ok(observed);assert.equal(observed.prefix.length,1);assert.equal(observed.prefix[0].decls[0].init.items.length,0);assert.equal(observed.value.type,'Identifier');assert.equal(result.body[1].decls[0].init,statement.decls[0].init);assert.equal(temporaryCount(result),0);
});

test('the genuine literal stays bound to its own actual statement through the hook helper',()=>{
 const input=parse('probe();let values=[];'),statement=input.body[1],literal=statement.decls[0].init;let observed;
 const result=lower(input,{lowerArrayMap:(node,{expression})=>{if(node.type==='Call'&&node.callee?.name==='probe')observed=expression(literal,statement);return null;}});
 assert.ok(observed);assert.deepEqual(observed.prefix,[]);assert.equal(observed.value,literal);assert.equal(result.body[1].decls[0].init,literal);assert.equal(temporaryCount(result),0);
});

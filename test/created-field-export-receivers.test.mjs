import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreatedFieldExportReceivers} from '../overlay/scratch-gui/src/lib/bw-makecode/created-field-export-receivers.js';
import {checkClassPrimitiveExport} from '../overlay/scratch-gui/src/lib/bw-makecode/class-primitive-export-proof.js';

const statement=';(sprite as Easy).value=9';
const source=`sprites.onCreated(SpriteKind.Player,function(sprite){${statement}});class Easy extends sprites.ExtendableSprite {constructor(art:Image,public value:any){super(art,SpriteKind.Player)}setKind(kind:number){super.setKind(kind);this.value="after"}}let easy=new Easy(img\`1\`,3);`;
const target={blocks:{}},block={opcode:'arcade_setObjectField'};
const site={target,block,statement};
const inspect=(sources=[source],sites=[site],current=()=>true)=>createCreatedFieldExportReceivers({sources,sites,current});

test('field emission joins the actual assignment in every complete output program',()=>{
 const query=inspect([source,source+'let harmless=3;']);
 assert.deepEqual(query(target,block),['Easy']);
 assert.equal(query(target,{...block}),null);
 assert.equal(query({...target},block),null);
 const returned=query(target,block);returned[0]='Forged';assert.deepEqual(query(target,block),['Easy']);
 assert.equal(inspect([source,source.replace('new Easy(img`1`,3)','null')])(target,block),null);
 assert.equal(inspect([])(target,block),null);
});

test('duplicate source occurrences and duplicate physical emissions cannot borrow a receipt',()=>{
 assert.equal(inspect([source+'function uncalled(sprite:any){'+statement+'}'])(target,block),null);
 assert.equal(inspect([source],[site,{...site,block:{...block}}])(target,block),null);
 assert.equal(inspect([source],[site,site])(target,block),null);
 assert.equal(inspect([source],[{...site,statement:';(other as Easy).value=9'}])(target,block),null);
 assert.equal(inspect([source],[{...site,statement:';(sprite as Easy).value=10'}])(target,block),null);
});

test('declarations casts unknown effects and changed companion source cannot replace real receivers',()=>{
 for(const changed of [source.replace('new Easy(img`1`,3)','JSON.parse("{}")'),source+'foreign(easy);',source+'sprites.onCreated=foreign;',source.replace('public value:any','unused:any')]){
  assert.equal(inspect([source,changed])(target,block),null,changed);
 }
 let live=true;const query=inspect([source],[site],()=>live);
 assert.deepEqual(query(target,block),['Easy']);live=false;assert.equal(query(target,block),null);
 live=true;assert.equal(query(target,block),null,'observed expiry is permanent');
});

const diagnostics=({field={},names=['Easy'],rhs=[4,'9']}={})=>{
 const literal=text=>[1,[10,text]];
 const writer={opcode:'arcade_setObjectField',parent:'root',next:null,inputs:{OBJECT:[1,'object'],FIELD:literal('value'),VALUE:[1,rhs]},fields:{}};
 const object={opcode:'arcade_local',parent:'write',next:null,inputs:{NAME:literal('sprite')},fields:{}};
 const actual={blocks:{root:{opcode:'event_whenflagclicked',topLevel:true,parent:null,next:'write',inputs:{},fields:{}},write:writer,object},variables:{}};
 const cls={name:'Easy',target:actual,fields:[{name:'value',type:'number',...field}],methods:[],parameters:[],initializer:'init',constructor:'ctor'};
 const messages=[];
 checkClassPrimitiveExport({project:{targets:[actual]},classes:new Map([['Easy',cls]]),procedures:new Map(),note:message=>messages.push(message),qualifiedFieldReceivers:(t,b)=>t===actual&&b===writer?names:null});
 return messages.filter(message=>message.includes('field '));
};
test('receiver obligation never bypasses RHS declared types missing readonly private or accessor fields',()=>{
 assert.deepEqual(diagnostics(),[]);
 assert.ok(diagnostics({rhs:[10,'wrong']}).some(message=>message.includes('conflicts with declared number')));
 for(const field of [{readonly:true},{visibility:'private'},{visibility:'protected'},{getter:'read'},{setter:{procedure:'write'}},{name:'other'}])
  assert.ok(diagnostics({field}).some(message=>message.includes('requires an actual declared receiver')),JSON.stringify(field));
 assert.ok(diagnostics({names:['Easy','Missing']}).some(message=>message.includes('requires an actual declared receiver')));
 assert.ok(diagnostics({names:['Easy','Easy']}).some(message=>message.includes('requires an actual declared receiver')),'a cast cannot select one of several observed receiver layouts');
});

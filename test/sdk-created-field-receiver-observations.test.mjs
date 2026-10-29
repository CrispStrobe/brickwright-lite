import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {sdkSpriteConstructorScalarEffects} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-constructor-scalar-effects.js';

const source='sprites.onCreated(SpriteKind.Player,function(sprite){(sprite as Easy).value=9});class Easy extends sprites.ExtendableSprite {constructor(art:Image,public value:any){super(art,SpriteKind.Player)}setKind(kind:number){super.setKind(kind);this.value="after"}read(){return this.value}}let easy=new Easy(img`1`,3);let result=easy.read();';
const walk=(node,out=[])=>{
 if(!node||typeof node!=='object')return out;
 if(Array.isArray(node)){for(const child of node)walk(child,out);return out;}
 out.push(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','assertedType'].includes(key))walk(value,out);return out;
};
const inspect=text=>{
 const program=parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
 const nodes=walk(program),write=nodes.find(node=>node.type==='Assignment'&&node.left?.type==='Member'&&node.left.name==='value'&&node.right?.type==='Number'&&String(node.right.value)==='9');
 assert.ok(write);return {program,nodes,write,proof:sdkSpriteConstructorScalarEffects(program)};
};

test('actual creation dispatch observes the exact declared receiver after the virtual override suffix',()=>{
 const q=inspect(source),receivers=q.proof.fieldReceiverClassesAt(q.write);
 assert.equal(q.proof.current(),true);assert.equal(receivers.length,1);
 assert.equal(receivers[0],q.program.body.find(node=>node.type==='Class'));
 const read=q.nodes.find(node=>node.type==='Call'&&node.callee?.name==='read');
 assert.deepEqual(q.proof.typesAt(read),['Number']);
 assert.equal(q.proof.typesAt(q.write.left.object),null,'receiver obligation is not a primitive result');
 assert.equal(q.proof.initialized(q.write.left.object),false,'no receiver initialization authority');
 assert.equal(q.proof.fieldReceiverClassesAt(structuredClone(q.write)),null,'a lookalike occurrence receives no receipt');
 receivers.length=0;assert.equal(q.proof.fieldReceiverClassesAt(q.write).length,1,'returned collections cannot alter observations');
});

test('every observed class at one handler occurrence is retained universally',()=>{
 const other='class Other extends sprites.ExtendableSprite {constructor(art:Image,public value:any){super(art,SpriteKind.Player)}}let other=new Other(img`2`,4);';
 const q=inspect(source+other);assert.deepEqual(q.proof.fieldReceiverClassesAt(q.write).map(node=>node.name).sort(),['Easy','Other']);
 const missing=inspect(source+other.replace(',public value:any','').replace(',4)',')'));
 assert.equal(missing.proof.fieldReceiverClassesAt(missing.write),null,'one invocation without the declared field revokes all observations');
});

test('casts escaped partial values unknown effects and namespace changes cannot establish a receiver',()=>{
 for(const changed of [
  source.replace('(sprite as Easy).value=9','(sprite as Easy).value=9;foreign(sprite)'),
  'let escaped:any=null;'+source.replace('(sprite as Easy).value=9','escaped=sprite;(sprite as Easy).value=9'),
  source+'sprites.onCreated=foreign;',
  source+'function alter(value:any){(value as Easy).value=9}alter(7);'
 ]){
  const q=inspect(changed);assert.equal(q.proof.fieldReceiverClassesAt(q.write),null,changed);
 }
});

test('observed source changes permanently expire receiver observations',()=>{
 const q=inspect(source);assert.equal(q.proof.fieldReceiverClassesAt(q.write).length,1);
 const old=q.write.left.name;q.write.left.name='unproved';assert.equal(q.proof.current(),false);
 q.write.left.name=old;assert.equal(q.proof.fieldReceiverClassesAt(q.write),null);
});

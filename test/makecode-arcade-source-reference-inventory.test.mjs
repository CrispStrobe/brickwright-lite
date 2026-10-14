import test from 'node:test';import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {sourceReferenceDeclarations} from '../overlay/scratch-gui/src/lib/bw-makecode/source-reference-declarations.js';
const inventory=source=>sourceReferenceDeclarations(lowerNamespaceBindings(parseMakeCodeTs(source)).program);
test('known reference declarations and forward aliases preserve actual types without scalar contamination',()=>{
 const found=new Map(inventory('class Box {constructor(){}} let s:Sprite;let im:Image;let ns:number[];let bs:Box[];let box:Box;let alias=im;function read():Image{return im};let ret=read();let bool=im===undefined;let unknown;let func=()=>im;').map(decl=>[decl.name,decl.type]));
 assert.deepEqual([...found], [['s','Sprite'],['im','Image'],['ns','number[]'],['bs','Box[]'],['box','Box'],['alias','Image'],['ret','Image']]);
});
test('namespace type resolution and never instantiated classes are actual declaration authority',()=>{
 const parsed=lowerNamespaceBindings(parseMakeCodeTs('namespace N{export class Box{constructor(){}}}let before:N.Box;let arr:N.Box[];function read(value:N.Box):N.Box{return value};let alias=read(before);'));
 const cls=parsed.program.body.find(node=>node.type==='Class');
 assert.deepEqual(sourceReferenceDeclarations(parsed.program),[{name:'before',type:cls.name},{name:'arr',type:cls.name+'[]'},{name:'alias',type:cls.name}]);
});
test('incompatible domains and unowned type spellings do not become Any or guessed objects',()=>{
 assert.deepEqual(inventory('let x:Missing;let y:Callable;let z:any;let ns:Missing[];let sprite:Sprite;let image:Image;let mixed; mixed=sprite;mixed=image;let scalarMixed;scalarMixed=sprite;scalarMixed=5;'),[{name:'sprite',type:'Sprite'},{name:'image',type:'Image'}]);
});

test('SDK factory identity requires a genuine unshadowed namespace receiver',()=>{
 assert.deepEqual(inventory('let pending=sprites.create(img`1`,SpriteKind.Player);let im=image.create(1,1);function spoof(sprites:any){let local=sprites.create();return local}let unknown=spoof(null);'),[{name:'pending',type:'Sprite'},{name:'im',type:'Image'}]);
});

test('explicit Any, generic shadows and constructor scalar writes cannot confer inferred reference types',()=>{
 const found=inventory('class Box{constructor(value:number){mixed=value}}let mixed; mixed=new Box(1);let explicit:any=new Box(2);let alias=explicit;class T{constructor(){}}function identity<T>(value:T):T{return value}let generic=identity(1);');
 assert.deepEqual(found,[]);
});

test('literal image aliases and function results remain references, mixed logical domains stay excluded',()=>{
 assert.deepEqual(inventory('let a=img`3`;let b=img`5`;let alias=a;function choose(flag:boolean){return flag?a:b};let result=choose(false);let mixed=(false&&a)||b;let unknown=assets.image`missing`;'),[{name:'a',type:'Image'},{name:'b',type:'Image'},{name:'alias',type:'Image'},{name:'result',type:'Image'}]);
});

test('array arguments, results and elements retain supported domains without guessing empty or mixed arrays',()=>{
 const found=new Map(inventory('class Box{constructor(){}}let images=[img`3`];let spritesList=[sprites.create(img`2`,SpriteKind.Player)];let boxes=[new Box()];function first(values:Image[]){return values[0]}function pass(values:Sprite[]){return values}let picked=first(images);let alias=pass(spritesList);let box=boxes[0];let nums=[1,2];let flags=[true,false];let texts=["a","b"];let empty=[];let mixed=[img`3`,1];').map(decl=>[decl.name,decl.type]));
 assert.deepEqual([...found],[['images','Image[]'],['spritesList','Sprite[]'],['boxes','Box[]'],['picked','Image'],['alias','Sprite[]'],['box','Box'],['nums','number[]'],['flags','boolean[]'],['texts','string[]']]);
});
test('array writes and removals propagate element domains while Any and generic receivers remain opaque',()=>{
 const found=inventory('let images=[];images.push(img`3`);let first=images[0];let last=images.pop();let alias=images;let copy=images.slice();let joined=copy.concat(images);let unowned:any=images;let unsafe=unowned[0];let unsafeResult=unowned.pop();function fake(receiver:any, values:Image[]){return receiver.concat(values)}let unknown=fake(null,images);class T{constructor(){}}function identity<T>(values:T[]){return values[0]}let generic=identity([1]);');
 assert.deepEqual(found,[{name:'images',type:'Image[]'},{name:'first',type:'Image'},{name:'last',type:'Image'},{name:'alias',type:'Image[]'},{name:'copy',type:'Image[]'},{name:'joined',type:'Image[]'}]);
});

test('callable, unresolved and nested array elements cannot masquerade as Image arrays',()=>{
 const found=inventory('let picture=img`3`;let callback=()=>picture;let bad=[picture,callback];function action(){return picture}let labels=[action,picture];let unknown;let unresolved=[picture,unknown];let nested=[[picture]];let pending:Image;let known=[pending,picture];');
 assert.deepEqual(found,[{name:'picture',type:'Image'},{name:'pending',type:'Image'},{name:'known',type:'Image[]'}]);
});

test('local callee shadows cannot acquire global array factory or class authority',()=>{
 assert.deepEqual(inventory('function make(values:Image[]){return values};function fake(make:any){return make()};let result=fake(null);class Box{constructor(){}}function construct(Box:any){return new Box()};let instance=construct(null);'),[]);
});

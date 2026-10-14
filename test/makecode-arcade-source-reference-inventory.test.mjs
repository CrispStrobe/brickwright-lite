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

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';
const profile=profiles.ordinary,header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const child='class Position extends sprites.ExtendableSprite {constructor(picture:Image){super(picture,SpriteKind.Player)}get horizontal(){return this.x}set horizontal(value:any){this.x=value}}';
const source=child+'let first=new Position(img`2`);first.horizontal=17;let observed=first.horizontal;let total=__bwBinaryAdd(observed,1);';
const inspect=text=>{const program=parseMakeCodeTs(header+';'+text,profile);return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};};
const good=text=>{const result=inspect(text);assert.equal(result.proof.reason,null,text);assert.equal(result.proof.helpers.size,1,text);assert.equal(result.proof.arrayHelpers.size,0);assert.equal(result.proof.current(),true);return result;};
const bad=text=>{const {proof}=inspect(text);assert.equal(proof.helpers.size,0,text);assert.ok(!proof.current()||typeof proof.reason==='string',text);};

test('genuine selected SDK x slots compose with local inherited getters setters and actual constructor inputs',()=>{
 good(source);
 good('class Position extends Sprite {get horizontal(){return this.x}}let first=new Position(img`3`);let total=__bwBinaryAdd(first.horizontal,1);');
 good(source.replace('let observed=first.horizontal','let alias=first;let observed=alias.horizontal'));
 good(source.replace('let first=new Position(img`2`);','function make(picture:Image){return new Position(picture)}let first=make(img`2`);'));
});

test('actual literal frame indexing and clone receiver identity support the exported construction shape',()=>{
 const frames='let frames:Image[]=[img`2`];';
 good(frames+source.replace('new Position(img`2`)','new Position(frames[(((Math.round(0)%1)+1)%1)].clone())'));
 good(frames+source.replace('new Position(img`2`)','new Position(frames[0].clone())'));
});

test('registry indexing carries all compatible concrete receivers and a possible missing receiver',()=>{
 const text=child+'class Other extends sprites.ExtendableSprite {constructor(picture:Image){super(picture,SpriteKind.Player)}}let first=new Position(img`2`);let second=new Other(img`3`);let alias=sprites.allOfKind(SpriteKind.Player)[0];let total=__bwBinaryAdd(alias.x,1);';
 good(text);
 bad(text.replace('class Other extends sprites.ExtendableSprite {constructor(picture:Image){super(picture,SpriteKind.Player)}}','class Other extends sprites.ExtendableSprite {constructor(picture:Image){super(picture,SpriteKind.Player)}get x(){return {}}}'));
});

test('SDK spellings annotations and namespace replacements cannot mint selected slot or Image authority',()=>{
 for(const prefix of ['let sprites:any={};','let SpriteKind:any={Player:0};','let img:any=foreign;'])bad(prefix+source);
 for(const effect of ['sprites.allOfKind=foreign','SpriteKind.Player=4','Math.round=foreign','Image.prototype.clone=foreign'])bad(source+effect+';');
 bad(source.replace('new Position(img`2`)','new Position(foreign())'));
 // Pending inputs must not publish an instance's x slot. These exercise both
 // implicit forwarding and actual constructor parameters without changing the
 // original B1 foreignImage negative.
 for(const argument of ['foreignImage','undefined','null','{}','foreign()']){
  bad('class Child extends sprites.ExtendableSprite {get value(){return this.x}}let child=new Child('+argument+');let total=__bwBinaryAdd(child.value,1);');
  bad(source.replace('new Position(img`2`)','new Position('+argument+')'));
 }
 bad(source.replace('new Position(img`2`)','new Position()'));
 bad('class Child extends sprites.ExtendableSprite {get value(){return this.x}}let child=new Child();let total=__bwBinaryAdd(child.value,1);');
 bad('class Child extends sprites.ExtendableSprite {get value(){return this.x}}let child=new Child(img`2`,foreignKind);let total=__bwBinaryAdd(child.value,1);');
 // A valid site's shared formal cannot mask another site's unresolved input.
 bad(source+'function dormant(unproved:Image){return new Position(unproved)}');
 bad(source+'let other=new Position(undefined);');
 bad(source+'let other=new Position(null);');
 bad(source+'let other=new Position();');
 bad(source+'function make(picture:Image){return new Position(picture)}function dormant(unproved:Image){return make(unproved)}');
 bad(source+'class Holder {constructor(public picture:Image){}make(){return new Position(this.picture)}}let holder=new Holder(img`2`);function dormant(unproved:Image){return new Holder(unproved)}let made=holder.make();');
});

test('opaque coercion and complete Image frame writers escapes and out-of-bounds clones remain refused',()=>{
 for(const value of ['{}','[]','foreign()'])bad(source.replace('first.horizontal=17','first.horizontal='+value));
 const frames='let frames:any=[img`2`];';
 for(const index of ['2','-1','foreign()'])bad(frames+source.replace('new Position(img`2`)','new Position(frames['+index+'].clone())'));
 for(const effect of ['frames.push({});','foreign(frames);','frames[0]={};'])bad(frames+effect+source.replace('new Position(img`2`)','new Position(frames[0].clone())'));
 bad(source.replace('img`2`','foreignTag`2`'));
});

test('virtual SDK constructor overrides unknown effects and every later writer preserve refusals',()=>{
 for(const method of ['setKind(value:number){foreign()}','setImage(value:Image){foreign()}','update(dt:number){foreign()}'])bad(source.replace('get horizontal()',method+'get horizontal()'));
 for(const effect of ['first.x={};','let alias=first;alias.horizontal={};','foreign(first);'])bad(source+effect);
});

test('callback scene and arbitrary registry effects cannot borrow a closed receiver-set proof',()=>{
 const text=source.replace('let observed=first.horizontal','let alias=sprites.allOfKind(SpriteKind.Player)[0];let observed=alias.x');
 for(const effect of ['sprites.onCreated(SpriteKind.Player,function(value){value.x={}});','game.pushScene();','first.setKind(SpriteKind.Food);','first.destroy();','sprites.create(img`3`,SpriteKind.Player);'])bad(text+effect);
});

test('private SDK normal-result projection preserves the original actual getter and revokes on source edits',()=>{
 const text=child+'let first=new Position(img`2`);first.horizontal=17;let observed=first.horizontal;';
 const program=parseMakeCodeTs(text,profile),before=structuredClone(program),view=nativeClassScalarView(program,profile);
 assert.deepEqual(program,before);assert.equal(view.current(),true);
 const declaration=view.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed');
 assert.equal(declaration.decls[0].init.type,'Conditional');assert.equal(declaration.decls[0].init.test.type,'Member');
 assert.deepEqual(declaration.decls[0].init.test,before.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init);
 program.body.find(node=>node.type==='Class').methods.find(method=>method.kind==='get').body[0].value={type:'Object',props:[]};
 assert.equal(view.current(),false);
});

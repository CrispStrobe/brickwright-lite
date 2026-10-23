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

const ordinaryFactory='function make(color:number):Sprite{let art:Image=null;let created:Sprite=null;'+
 'art=image.create(4,3);art.fill(color);created=sprites.create(art,SpriteKind.Player);created.x=30;return created}';
const ordinary=ordinaryFactory+
 'function forward(color:number):Sprite{return make(color)}'+
 'function identity(sprite:Sprite):Sprite{return sprite}'+
 'function move(sprite:Sprite):Sprite{sprite.x=__bwBinaryAdd(sprite.x,5);return sprite}'+
 'let hero=forward(7);let alias=identity(hero);let moved=move(alias);let friend=make(2);'+
 'hero.y=40;friend.y=70;alias.setImage(hero.image.clone());identity(friend).y=75;'+
 'let total=__bwBinaryAdd(identity(moved).x,friend.y);';

test('ordinary factory selection leaves unrelated classless producer routes unchanged',()=>{
 const program=parseMakeCodeTs('let observed=unresolved.field;',profile),view=nativeClassScalarView(program,profile);
 assert.equal(view.program,program);assert.equal(view.current(),true);
 program.body[0].decls[0].init={type:'Object',props:[]};
 assert.equal(view.current(),true,'the untouched legacy route issues no additional class or Sprite facts');
});

test('ordinary real SDK factories retain function forwarding and selected Image effects without classes',()=>{
 good(ordinary);
 for(const kind of ['Player','Projectile','Food','Enemy'])good(ordinary.replace('SpriteKind.Player','SpriteKind.'+kind));
 good(ordinary.replace('image.create(4,3)','img`2`'));
 good(ordinary.replace('alias.setImage(hero.image.clone());','alias.setImage(null);alias.setImage(hero.image);alias.setImage(hero.image.clone());'));
});

test('ordinary factories require actual namespaces Images and every allocation input',()=>{
 for(const prefix of ['let image:any={};','let sprites:any={};','let SpriteKind:any={Player:0};'])bad(prefix+ordinary);
 for(const effect of ['image.create=foreign;','sprites.create=foreign;','SpriteKind.Player=4;',
  'Image.prototype.clone=foreign;','let extracted=image.create;','let extracted=sprites.create;'])bad(effect+ordinary);
 for(const image of ['null','undefined','foreignImage','{}','foreign()'])bad(ordinary.replace('image.create(4,3)',image));
 for(const args of ['art','art,foreignKind','art,SpriteKind.Player,0'])bad(ordinary.replace('sprites.create(art,SpriteKind.Player)','sprites.create('+args+')'));
 bad(ordinary.replace('image.create(4,3)','image.create(foreignWidth,3)'));
 bad(ordinary.replace('image.create(4,3)','image.create(4)'));
 bad(ordinary+'let bad=sprites.create(null,SpriteKind.Player);');
 bad(ordinary+'let bad=sprites.create(foreignImage,SpriteKind.Player);');
});

test('ordinary call entries cannot borrow another caller and unsupported defaults remain refused',()=>{
 for(const effect of ['make();','make({});','make(1,2);',
  'function dormant(unproved:any){return make(unproved)}',
  'function dormant(unproved:any){return identity(unproved)}'])bad(ordinary+effect);
 bad(ordinary.replace('function make(color:number)','function make(color:number=7)'));
 assert.throws(()=>parseMakeCodeTs('function rest(...values:any[]){return values}',profile),
  /expected ident but found "\.\.\."/,'rest syntax has a distinct parser frontier');
 const program=parseMakeCodeTs(ordinaryFactory+'let hero=make(7);let observed=hero.x;',profile);
 program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='make').restParam='color';
 assert.equal(nativeClassScalarView(program,profile).program,program,'actual unsupported parameter metadata grants no getter projection');
});

test('ordinary rows retain earlier callbacks late writers coercion and method ownership refusals',()=>{
 for(const effect of ['foreign();','sprites.onCreated(SpriteKind.Player,function(value){value.x={}});',
  'game.onUpdate(function(){foreign()});']){bad(effect+ordinary);bad(ordinary+effect);}
 for(const effect of ['hero.x={};','alias.y={};','alias.setImage(foreignImage);','alias.setImage();',
  'alias.setImage=foreign;','hero.image=foreignImage;','hero.destroy();','foreign(hero);',
  'let method=hero.setImage;','let method=hero.image.clone;'])bad(ordinary+effect);
 bad(ordinary.replace('art.fill(color)','art.fill({})'));
 bad(ordinary.replace('art.fill(color)','art.fill()'));
 // Keep the old subclass/registry profile separate from ordinary factories.
 bad(child+ordinary);
});

test('ordinary normal-result getters preserve original source and revoke permanently after observed edits',()=>{
 const text=ordinaryFactory+'let hero=make(7);let observed=hero.x;let vertical=hero.y;';
 const program=parseMakeCodeTs(text,profile),before=structuredClone(program),view=nativeClassScalarView(program,profile);
 assert.deepEqual(program,before);assert.equal(view.current(),true);
 for(const name of ['observed','vertical']){
  const find=p=>p.body.find(node=>node.type==='Declaration'&&node.decls[0].name===name).decls[0].init;
  const rewritten=find(view.program);assert.equal(rewritten.type,'Conditional');assert.deepEqual(rewritten.test,find(before));
 }
 const made=program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='make');
 const write=made.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Assignment'&&node.expr.left?.name==='art');
 assert.ok(write);const previous=write.expr.right.args[0];write.expr.right.args[0]={type:'Number',value:'5'};
 assert.equal(view.current(),false);
 const fresh=nativeClassScalarView(program,profile);assert.equal(fresh.current(),true,'a new valid width is independently proved');
 assert.notEqual(fresh.program,program,'fresh currentness accompanies actual issued getter facts');
 assert.equal(fresh.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init.type,'Conditional');
 write.expr.right.args[0]=previous;assert.equal(view.current(),false);assert.equal(fresh.current(),false);
 const literalView=nativeClassScalarView(program,profile);assert.equal(literalView.current(),true);
 assert.notEqual(literalView.program,program,'the restored source independently reissues actual getter facts');
 assert.equal(literalView.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init.type,'Conditional');
 const oldValue=previous.value;previous.value='5';
 assert.equal(literalView.current(),false,'changing a literal in place also revokes the issued Image dependency');
 previous.value=oldValue;assert.equal(literalView.current(),false);
 // Preserve an actual reflection error while revoking the ordinary facts.
 // A subsequent successful reflection must not revive the observed failure.
 let failReflection=false,reflectionReads=0;const reflectionFailure=new Error('source reflection failed');
 write.expr.right.args[0]=new Proxy(previous,{getPrototypeOf(target){
  reflectionReads++;if(failReflection)throw reflectionFailure;return Reflect.getPrototypeOf(target);
 }});
 try{
  const throwingView=nativeClassScalarView(program,profile);assert.equal(throwingView.current(),true);
  assert.equal(throwingView.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='observed').decls[0].init.type,'Conditional');
  failReflection=true;assert.throws(()=>throwingView.current(),error=>error===reflectionFailure);
  const readsAfterFailure=reflectionReads;failReflection=false;assert.equal(throwingView.current(),false);
  assert.equal(reflectionReads,readsAfterFailure,'a revoked view performs no later source reflection');
 }finally{failReflection=false;write.expr.right.args[0]=previous;}

});

import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {BUTTON_EVENTS} from '../overlay/scratch-gui/src/lib/bw-makecode/controller-button-event-number-source.js';
import {ownedGameFiles} from './fixtures/arcade-owned-text-game.mjs';

// Pure source and real Creator/asset controls. No PXT, VM, browser or guest.
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainCallableMetadata:true,retainParentheses:true});
const graph=program=>analyseSourceValueProducers(program,{ordinaryPrimitiveSdkNumbers:true});
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const item of value)walk(item,out);return out;}
    out.push(value);for(const [key,item]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType'].includes(key))walk(item,out);return out;};
const reads=program=>{const result=walk(program).filter(node=>node.type==='Member'&&node.name==='x'&&node.object?.type==='Identifier'&&node.object.name==='hero');assert.ok(result.length>=3);return result;};
const number=(analysis,node)=>{const types=analysis.typesAt(node);return types.size===1&&types.has('Number');};
const head='let hero:Sprite;let observed=0;function sample(){observed=hero.x;}';
const construction='hero=null;hero=sprites.create(img`1`,SpriteKind.Player);hero.setPosition(40,60);';
const registrations=event=>`controller.A.onEvent(${event},function(){hero.x=hero.x+8;sample();});controller.B.onEvent(${event},function(){hero.setPosition(40,60);sample();});`;
const mini=(wrapped=false,event='2049')=>head+(wrapped?`function __bwStartup(){${construction}${registrations(event)}sample();}__bwStartup();`:construction+registrations(event)+'sample();');
const accepted=source=>{const program=parse(source),analysis=graph(program),members=reads(program);for(const node of members)assert.equal(number(analysis,node),true,source);return {program,analysis,members};};
const refused=source=>{const program=parse(source),analysis=graph(program);for(const node of reads(program))assert.equal(number(analysis,node),false,source);};

test('direct and wrapped controller entries use exact numeric and symbolic events after real construction',()=>{
    assert.deepEqual(BUTTON_EVENTS,{Pressed:2049,Released:2048,Repeated:2054});
    for(const wrapped of [false,true])for(const event of ['2049','2048','2054','ControllerButtonEvent.Pressed']){
        const {program,analysis,members}=accepted(mini(wrapped,event));
        assert.equal(number(analyseSourceValueProducers(program),members[0]),false,'the optional Sprite producer remains independent');
        for(const node of members){const receiver=analysis.typesAt(node.object);assert.equal(receiver.has('Number'),false);assert.equal(receiver.has('Sprite'),false);assert.equal([...receiver].some(type=>type==='Array'||type?.kind==='Array'),false);}
    }
    // Parentheses around the registration expression were already accepted by
    // the top-level frontier and must retain the same call/evaluation.
    for(const wrapped of [false,true]){
        const calls='(controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hero.x=hero.x+8;sample();}));(controller.B.onEvent(2049,function(){hero.setPosition(40,60);sample();}));';
        accepted(head+(wrapped?`function __bwStartup(){${construction}${calls}sample();}__bwStartup();`:construction+calls+'sample();'));
    }
});

const clean=result=>{for(const key of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(result,key))assert.deepEqual(result[key],[],key);};
const creator=files=>{
    const imported=arcadeToPseudocode(files);clean(imported);const result=new Creator();result.parse(imported.code);clean(result);
    for(const art of imported.costumes)assert.equal(art.mode==='add'?result.addCustomSVGCostume(art.sprite,art.svg,art.name):result.applyCustomSVG(art.sprite,art.svg),true);
    return result;
};
const exportsFor=c=>{
    const before=JSON.stringify(c.project),options={costumeSvg:(target,costume)=>c.assets.get(costume.assetId)?.data};
    const direct=projectToArcade(c.project,options),json=projectJsonToArcade(before,options);clean(direct);clean(json);
    assert.deepEqual(direct.files,json.files);assert.equal(JSON.stringify(c.project),before,'source export retains every physical project row');
    for(const out of [direct,json]){
        assert.match(out.ts,/controller\.A\.onEvent\(2049,/);
        assert.match(out.ts,/controller\.B\.onEvent\(2049,/);
        assert.match(out.ts,/\.x\s*=\s*[^\n]*\.x[^\n]*\b8\b/,'retain the real coordinate read, addition and store');
        assert.match(out.ts,/\.setPosition\(40,\s*60\)/);
        assert.match(out.ts,/\.setText\(/);
        assert.ok([...out.ts.matchAll(/^\s*\w*sample\(\)/gm)].length>=3,'the startup and both actual callback calls remain');
        assert.doesNotMatch(out.ts,/\.join\(/);
    }
    return direct;
};

test('the actual owned text game retains all bodies and coordinates through direct/JSON export and reimport',()=>{
    const first=creator(ownedGameFiles({message:'PLAY',edited:true})),out=exportsFor(first);
    exportsFor(creator(out.files));
});

test('every actual sample caller and registration must cross the construction frontier',()=>{
    for(const wrapped of [false,true]){
        const source=mini(wrapped);
        refused(source.replace(construction+registrations('2049'),registrations('2049')+construction));
        refused(source.replace(construction,'sample();'+construction));
        refused(source.replace(construction,'function premature(){sample();}premature();'+construction));
    }
    refused(mini(true).replace('sample();}__bwStartup();','sample();}sample();__bwStartup();'));
    refused(mini(true).replace('__bwStartup();','__bwStartup();sample();hero=null;'));
    refused(mini(true).replace('sample();}__bwStartup();','sample();}let escaped=sample;__bwStartup();'));
});

test('unsupported event shapes, namespace edits and incompatible actual writers issue no Sprite Number fact',()=>{
    const source=mini(true);
    for(const event of ['0','2050','NaN','eventValue','2049.5','ControllerButtonEvent.Other'])refused(mini(true,event));
    for(const changed of [
        source.replace('controller.A.onEvent(2049,function(){','controller.A.onEvent(2049,function(value:number){'),
        source.replace('hero.x=hero.x+8;sample();});','hero.x=hero.x+8;sample();},0);'),
        'let controller:any=unknown();'+source,
        source.replace('controller.A.onEvent(2049,','let register=controller.A.onEvent;register(2049,'),
        source+'controller.A.onEvent=foreign;',
        source+'hero=null;',source+'hero=0 as any;',source+'hero.x="wrong" as any;',
        source+'foreign(hero);',source+'foreign(function(){hero.x=0;});',
        'sprites.onCreated(SpriteKind.Player,function(sprite:Sprite){sprite.flags=[] as any;});'+source,
        source+'sprites.onDestroyed(SpriteKind.Player,function(sprite:Sprite){sprite.x="wrong" as any;});'
    ])refused(changed);
    const lifecycle=parse('sprites.onCreated(SpriteKind.Player,function(sprite:Sprite){sprite.flags=[] as any;});let hero=sprites.create(img`1`,SpriteKind.Player);let flags=hero.flags;');
    const flag=walk(lifecycle).find(node=>node.type==='Member'&&node.name==='flags'&&node.object?.name==='hero');assert.ok(flag);
    const types=graph(lifecycle).typesAt(flag);assert.ok(types.has('Opaque'),'unproduced lifecycle parameters cannot hide a flags writer');
});

test('observed controller event or receiver edits permanently expire the exact source Number proof',()=>{
    for(const mode of ['event','receiver']){
        const {program,analysis,members}=accepted(mini(true)),selected=members[0];let restore;
        if(mode==='event'){
            const event=walk(program).find(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='onEvent').args[0];
            const value=event.value;event.value='2050';restore=()=>{event.value=value;};
        }else{const receiver=selected.object;selected.object={...receiver};restore=()=>{selected.object=receiver;};}
        assert.equal(number(analysis,selected),false);restore();assert.equal(number(analysis,selected),false,'restoration cannot renew an observed consumed fact');
        assert.equal(number(graph(program),selected),true,'fresh independent source analysis remains available');
    }
});

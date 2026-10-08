import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {STATIC} from '../scripts/lib/pxt-node.mjs';

const setup='let actor=sprites.create(img`1`,SpriteKind.Player);';

test('scene transitions and global lifecycle hooks match pinned original source',()=>{
    const target=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8'));
    const source=target.bundledpkgs.game['game.ts'];
    assert.match(source,/pushScene\(\)\s*\{[\s\S]*?_sceneStack\.push\(_scene\);[\s\S]*?init\([\s\S]*?true\);[\s\S]*?_scenePushHandlers\.forEach\(cb => cb\(oldScene\)\)/);
    assert.match(source,/popScene\(\)\s*\{[\s\S]*?_scene = _sceneStack\.pop\(\);[\s\S]*?_scene = undefined;[\s\S]*?_scenePopHandlers\.forEach\(cb => cb\(oldScene\)\)/);
    for(const kind of ['Push','Pop'])assert.match(source,new RegExp(`addScene${kind}Handler\\(handler: \\(oldScene: scene\\.Scene\\) => void\\)[\\s\\S]*?_scene${kind}Handlers\\.indexOf\\(handler\\) < 0`));
    assert.doesNotMatch(source,/function onScene(?:Push|Pop)/);
    assert.match(source,/game\.currentScene\(\)\.gameForeverHandlers\.push/);
    assert.match(target.bundledpkgs.game['gameoverrides.ts'],/function forever[\s\S]*?game\.forever\(a\)/);
});

test('scene-only programs select native handles and enforce exact transition arities',()=>{
    const result=arcadeToPseudocode('game.pushScene();game.popScene();game.popScene()');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/SPRITE Game:/);
    assert.equal((result.code.match(/arcade push scene/g)||[]).length,1);
    assert.equal((result.code.match(/arcade pop scene/g)||[]).length,2);
    for(const api of ['pushScene','popScene']) {
        const invalid=arcadeToPseudocode(`game.${api}(1)`);
        assert.ok(invalid.unsupported.some(note=>note.includes(`${api} requires no arguments`)));
        assert.doesNotMatch(invalid.code,new RegExp(`^  arcade ${api==='pushScene'?'push':'pop'} scene$`,'m'));
    }
});

test('global lifecycle hooks register at execution sites and accept only unused oldScene arguments',()=>{
    const result=arcadeToPseudocode('let count=0;game.addScenePushHandler(function(oldScene){count+=1});game.addScenePopHandler(function(){count+=2});game.pushScene();game.popScene()');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade register scene push as "__bwScenePush1" capturing ""/);
    assert.match(result.code,/WHEN arcade scene push handler "__bwScenePush1" runs:/);
    assert.match(result.code,/arcade register scene pop as "__bwScenePop1" capturing ""/);
    assert.match(result.code,/WHEN arcade scene pop handler "__bwScenePop1" runs:/);
    assert.ok(result.code.indexOf('arcade register scene push')<result.code.indexOf('arcade push scene'));
    assert.doesNotMatch(result.code,/set local oldScene/);
    // Discover lifecycle registrations even without a literal push/pop call.
    assert.match(arcadeToPseudocode('function install(){game.addScenePushHandler(function(){})}install()').code,/arcade register scene push/);
});

test('scene-aware updates, intervals and buttons are explicit registrations rather than eager hats',()=>{
    const result=arcadeToPseudocode('let interval=0;game.onUpdate(function(){interval+=1});game.pushScene();game.onUpdateInterval(interval,function(){interval+=2});controller.A.onEvent(ControllerButtonEvent.Released,function(){interval+=3});game.popScene()');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade register update as "__bwUpdate1"/);
    assert.match(result.code,/arcade register interval \(interval\) as "__bwInterval1"/);
    assert.match(result.code,/arcade register button "A" event \(2048\) as "__bwButton1"/);
    for(const kind of ['update','interval','button'])assert.match(result.code,new RegExp(`WHEN arcade ${kind} handler`));
    assert.doesNotMatch(result.code,/WHEN arcade updates:|WHEN arcade every|WHEN .+ key pressed:/);
    assert.ok(result.code.indexOf('arcade register update')<result.code.indexOf('arcade push scene'));
    assert.ok(result.code.indexOf('arcade push scene')<result.code.indexOf('arcade register interval'));
});

test('destroyed and overlap callbacks preserve typed mutable sprite arguments',()=>{
    const result=arcadeToPseudocode(setup+'game.pushScene();sprites.onDestroyed(SpriteKind.Player,function(sprite){sprite.x=7});sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(sprite,other){sprite=actor;other.y=sprite.x});game.popScene()');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade register destroyed kind "Player" as "__bwKindDestroyed1"/);
    assert.match(result.code,/WHEN arcade destroyed kind handler "__bwKindDestroyed1" runs:/);
    assert.match(result.code,/arcade register overlap kind "Player" with kind "Food" as "__bwOverlap1"/);
    assert.match(result.code,/arcade set local sprite to arcade event first/);
    assert.match(result.code,/arcade set local other to arcade event second/);
    assert.match(result.code,/arcade set local sprite to \(actor\)/);
    assert.match(result.code,/arcade set y of arcade local other to arcade property x of arcade local sprite/);
});

test('nested runtime registrations capture procedure cells and preserve local shadowing',()=>{
    const result=arcadeToPseudocode(`function install(amount:number){let actor=sprites.create(img\`1\`,SpriteKind.Player);game.onUpdate(function(){actor.x+=amount;controller.B.onEvent(ControllerButtonEvent.Pressed,function(){actor.y=amount})});game.addScenePopHandler(function(){let amount=7;actor.x=amount})}install(3);game.pushScene();game.popScene()`);
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/register update as "__bwUpdate1" capturing "amount actor"/);
    assert.match(result.code,/register button "B" event \(2049\) as "__bwButton1" capturing ""/);
    assert.match(result.code,/arcade set y of arcade captured actor to arcade captured amount/);
    const pop=result.code.split('WHEN arcade scene pop handler')[1].split('DEFINE install')[0];
    assert.match(pop,/arcade set local amount/);
    assert.doesNotMatch(pop,/arcade captured amount/);
});

test('interval expressions are evaluated once at registration and zero intervals stay valid',()=>{
    const result=arcadeToPseudocode('function period(){return 0}game.pushScene();game.onUpdateInterval(period(),function(){})');
    assert.deepEqual(result.unsupported,[]);
    assert.equal((result.code.match(/arcade call function "period"/g)||[]).length,1);
    assert.match(result.code,/register interval \(\(arcade call function "period"/);
    assert.deepEqual(arcadeToPseudocode('game.pushScene();game.onUpdateInterval(0,function(){})').unsupported,[]);
});

test('all button enum selectors retain actual PXT numeric values',()=>{
    const result=arcadeToPseudocode('game.pushScene();controller.A.onEvent(ControllerButtonEvent.Pressed,function(){});controller.B.onEvent(ControllerButtonEvent.Released,function(){});controller.left.onEvent(ControllerButtonEvent.Repeated,function(){})');
    assert.deepEqual(result.unsupported,[]);
    for(const number of [2049,2048,2054])assert.ok(result.code.includes(`event (${number})`));
    const bad=arcadeToPseudocode('game.pushScene();controller.A.onEvent(ControllerButtonEvent.Unknown,function(){})');
    assert.ok(bad.unsupported.some(note=>note.includes('ControllerButtonEvent.Unknown')));
});

test('unsupported scene object access, handler identity operations and malformed events retain gaps',()=>{
    for(const [source,api] of [
        ['game.addScenePushHandler(function(oldScene){let saved=oldScene})','addScenePushHandler'],
        ['game.addScenePopHandler(function(oldScene){let saved=oldScene.camera})','addScenePopHandler'],
        ['function handler(){}game.addScenePushHandler(handler)','addScenePushHandler'],
        ['game.removeScenePushHandler(function(){})','removeScenePushHandler'],
        ['game.pushScene();game.onUpdate(function(extra){})','onUpdate'],
        ['game.pushScene();game.onUpdateInterval(5)','onUpdateInterval'],
        ['game.pushScene();controller.A.onEvent(1,function(extra){})','onEvent'],
        ['game.pushScene();let kind=0; sprites.onDestroyed(kind,function(sprite){})','onDestroyed'],
        ['game.pushScene();sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(a,b,c){})','onOverlap']
    ])assert.ok(arcadeToPseudocode(source).unsupported.some(note=>note.includes(api)),source);
    const object=arcadeToPseudocode('game.pushScene();let saved=game.currentScene();let clock=saved.millis');
    assert.ok(object.unsupported.some(note=>note.includes('Scene.millis')));
});

test('scene-dependent forever wrappers and HUD events register at their execution sites',()=>{
    for(const [api,label] of [['forever','forever'],['game.forever','forever'],['basic.forever','forever'],['info.onLifeZero','life zero'],['info.player1.onLifeZero','life zero'],['info.onCountdownEnd','countdown']]) {
        const result=arcadeToPseudocode(`game.pushScene();${api}(function(){info.changeScoreBy(1)})`);
        assert.deepEqual(result.unsupported,[]);
        assert.ok(result.code.includes(`arcade register ${label}${label==='life zero'?' player (1)':''} as`));
        assert.ok(result.code.includes(`WHEN arcade ${label} handler`));
        assert.doesNotMatch(result.code,/^  FOREVER:|WHEN arcade countdown ends:/m);
    }
    for(const player of [2,3,4]) {
        const api=`info.player${player}.onLifeZero`;
        const result=arcadeToPseudocode(`game.pushScene();${api}(function(){info.changeScoreBy(1)})`);
        assert.deepEqual(result.unsupported,[]);
        assert.ok(result.code.includes(`arcade register life zero player (${player})`));
    }
});

test('frame and button callbacks register without scene lifecycle selection',()=>{
    const result=arcadeToPseudocode(setup+'game.onUpdate(function(){actor.x+=1});controller.A.onEvent(ControllerButtonEvent.Pressed,function(){actor.y+=1})');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade register update/);
    assert.match(result.code,/arcade register button/);
    assert.doesNotMatch(result.code,/WHEN arcade updates:|WHEN space key pressed:/);
});

test('default and multiplayer life primitives retain scene-local native state',()=>{
    const result=arcadeToPseudocode('game.pushScene();info.setLife(3);info.changeLifeBy(-1);let base=info.life();'+[1,2,3,4].map(player=>`info.player${player}.setLife(${player});info.player${player}.changeLifeBy(2);let remaining${player}=info.player${player}.life()`).join(';'));
    assert.deepEqual(result.unsupported,[]);
    for(const player of [1,2,3,4]) {
        assert.ok(result.code.includes(`arcade set life player (${player}) to (${player})`));
        assert.ok(result.code.includes(`arcade change life player (${player}) by (2)`));
        assert.ok(result.code.includes(`arcade life player (${player})`));
    }
    assert.doesNotMatch(result.code,/set lives|change lives/);
    for(const source of ['game.pushScene();info.setLife()','game.pushScene();info.player2.changeLifeBy(1,2)','game.pushScene();let remaining=info.life(2)'])assert.ok(arcadeToPseudocode(source).unsupported.some(note=>/requires (?:one life value|no arguments)/.test(note)));
});

test('all player score and presence reporters use scene-local initialized state',()=>{
    const result=arcadeToPseudocode('game.pushScene();'+['info','info.player1','info.player2','info.player3','info.player4'].map((api,index)=>`${api}.setScore(${index});${api}.changeScoreBy(1);let score${index}=${api}.score();let scored${index}=${api}.hasScore();let alive${index}=${api}.hasLife()`).join(';'));
    assert.deepEqual(result.unsupported,[]);
    for(const player of [1,2,3,4]) {
        for(const property of ['score','has score','has life'])assert.ok(result.code.includes(`arcade player (${player}) ${property}`));
        assert.ok(result.code.includes(`arcade change score player (${player}) by (1)`));
    }
    assert.match(result.code,/arcade set score player \(1\) to \(0\)/);
    assert.doesNotMatch(result.code,/set lives|change lives|set score to|change score by/);
    for(const source of ['game.pushScene();info.setScore()','game.pushScene();info.player4.changeScoreBy(1,2)','game.pushScene();let exists=info.hasLife(2)','game.pushScene();let exists=info.player3.hasScore(2)'])assert.ok(arcadeToPseudocode(source).unsupported.some(note=>/requires (?:one score value|no arguments)/.test(note)));
});

test('presence and first-read defaults are distinct in the pinned original HUD state',()=>{
    const target=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8'));
    const source=target.bundledpkgs.game['info.ts'];
    assert.match(source,/hasLife\(\): boolean\s*\{[\s\S]*?return state\.life !== undefined && state\.life !== null/);
    assert.match(source,/hasScore\(\)\s*\{[\s\S]*?return state\.score !== undefined/);
    assert.match(source,/life\(\): number\s*\{[\s\S]*?if \(state\.life === undefined\) \{\s*state\.life = 3;[\s\S]*?return state\.life \|\| 0/);
    assert.match(source,/raiseLifeZero\(gameOver: boolean\)\s*\{[\s\S]*?state\.life = null;[\s\S]*?state\.lifeZeroHandler\(\)/);
});

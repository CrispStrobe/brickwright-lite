import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const setup='let actor=sprites.create(img`1`,SpriteKind.Player);';

test('wall and tile registrations create separate token hats with typed mutable callback cells',()=>{
    const result=arcadeToPseudocode(setup+`
scene.onHitWall(SpriteKind.Player,function(sprite,location){sprite.x=location.x;tiles.setWallAt(location,false)})
scene.onOverlapTile(SpriteKind.Player,img\`2\`,function(sprite,location){sprite.y=location.row;tiles.placeOnTile(sprite,location)})`);
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade register wall kind \(arcade sprite kind value "Player"\) as "__bwWall1" capturing ""/);
    assert.match(result.code,/arcade register tile kind \(arcade sprite kind value "Player"\) image \(.+\) as "__bwTile1" capturing ""/);
    for(const kind of ['wall','tile'])assert.match(result.code,new RegExp(`WHEN arcade ${kind} handler "__bw${kind==='wall'?'Wall':'Tile'}1" runs:\\n  arcade set local sprite to arcade event first\\n  arcade set local location to arcade event location`));
    assert.match(result.code,/arcade set x of arcade local sprite to arcade tile x of \(arcade local location\)/);
    assert.match(result.code,/arcade set tile wall \(arcade local location\) to \(\(compare value \(1\) op "<" with \(0\)\)\)/);
    assert.match(result.code,/arcade place sprite \(arcade local sprite\) on tile \(arcade local location\)/);
});

test('procedure registrations capture real local cells and source parameters remain shadowed',()=>{
    const result=arcadeToPseudocode(setup+`
function install(amount:number){
 let calls=0
 scene.onHitWall(SpriteKind.Player,function(sprite,location){calls+=amount;sprite.x=calls;})
 scene.onOverlapTile(SpriteKind.Player,img\`2\`,function(sprite,location){let amount=7;sprite.y=amount+location.row;})
}
install(2)`);
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/register wall kind \(arcade sprite kind value "Player"\) as "__bwWall1" capturing "amount calls"/);
    assert.match(result.code,/arcade set captured calls to \(calculate value \(arcade captured calls\) op "\+" with \(arcade captured amount\)\)/);
    assert.match(result.code,/register tile kind \(arcade sprite kind value "Player"\) image \(.+\) as "__bwTile1" capturing "calls"/);
    const tile=result.code.split('WHEN arcade tile handler')[1].split('DEFINE install')[0];
    assert.match(tile,/arcade set local amount to/);
    assert.doesNotMatch(tile,/arcade captured amount/);
});

test('reserved callback names, reassignment and nested registrations use current local cells',()=>{
    const result=arcadeToPseudocode(setup+`
scene.onHitWall(SpriteKind.Player,function(x,y){
 x=actor
 y=tiles.getTileLocation(2,3)
 scene.onOverlapTile(SpriteKind.Player,img\`2\`,function(sprite,location){sprite.x=x.x+ y.x;})
 x.x=y.x
})`);
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade set local x_ to arcade event first/);
    assert.match(result.code,/arcade set local y_ to arcade event location/);
    assert.match(result.code,/arcade set local x_ to \(actor\)/);
    assert.match(result.code,/arcade set local y_ to \(arcade tile location column \(2\) row \(3\)\)/);
    assert.match(result.code,/register tile kind \(arcade sprite kind value "Player"\) image \(.+\) as "__bwTile1" capturing "x_ y_"/);
    assert.match(result.code,/arcade property x of arcade captured x_/);
    assert.match(result.code,/arcade tile x of \(arcade captured y_\)/);
    assert.match(result.code,/arcade set x of arcade local x_ to arcade tile x of \(arcade local y_\)/);
});

test('the location event argument retains TileLocation identity in arrays and procedure calls',()=>{
    const result=arcadeToPseudocode(setup+`
function wallOff(location:tiles.Location){tiles.setWallAt(location,false);return location.row;}
scene.onHitWall(SpriteKind.Player,function(sprite,location){let saved=[location];sprite.x=wallOff(saved[0]);})`);
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade function argument \(item .+ of array reference \(arcade local saved\)\)/);
    assert.match(result.code,/DEFINE wallOff \(location\):[\s\S]*arcade set tile wall \(arcade local location\)/);
    assert.match(result.code,/arcade return value \(arcade tile row of \(arcade local location\)\)/);
});

test('named callback and malformed callback forms remain explicit',()=>{
    for(const [source,api] of [
        [setup+'function handler(sprite:Sprite,location:tiles.Location){sprite.x=location.x}scene.onHitWall(SpriteKind.Player,handler)','scene.onHitWall'],
        [setup+'scene.onHitWall(SpriteKind.Player,function(a,b,c){})','scene.onHitWall'],
        [setup+'scene.onOverlapTile(SpriteKind.Player,img`2`)','scene.onOverlapTile'],
        [setup+'scene.onOverlapTile(SpriteKind.Player,img`2`,function(a,b,c){})','scene.onOverlapTile']
    ]) {
        const result=arcadeToPseudocode(source);
        assert.ok(result.unsupported.some(gap=>gap.includes(api) && gap.includes('inline callback')),source);
        assert.doesNotMatch(result.code,/WHEN arcade (wall|tile) handler/);
    }
});

test('creation registrations retain their existing token and event reporter semantics',()=>{
    const result=arcadeToPseudocode(`sprites.onCreated(SpriteKind.Player,function(sprite){sprite.x=20});`+setup+
        'scene.onHitWall(SpriteKind.Player,function(sprite,location){sprite.x=location.x})');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/WHEN arcade creation handler "__bwCreated1" runs:/);
    assert.match(result.code,/arcade register creation kind \(arcade sprite kind value "Player"\) as "__bwCreated1" capturing ""/);
    assert.match(result.code,/arcade set x of arcade event first to 20/);
});


test('nested inherited TileLocation arrays and unrelated numeric arrays keep separate capture bindings',async()=>{
    const {TERRAIN_CAPTURE_ARRAY_SOURCE,TERRAIN_CAPTURE_TRANSITIVE_SOURCE}=await import('./fixtures/arcade-terrain-event-captures.mjs');
    for(const source of [TERRAIN_CAPTURE_ARRAY_SOURCE,TERRAIN_CAPTURE_TRANSITIVE_SOURCE]) {
        const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[]);
        assert.match(result.code,/register wall kind \(arcade sprite kind value "Player"\) as "__bwWall1" capturing "__bwPxtValue1 sites"/);
        assert.match(result.code,/register wall kind \(arcade sprite kind value "Food"\) as "__bwWall2" capturing "__bwPxtValue2 sites"/);
        assert.match(result.code,/register tile kind \(arcade sprite kind value "Player"\) image \(.+\) as "__bwTile1" capturing "sprite location"/);
        assert.match(result.code,/arcade function argument \(arcade captured sites\)/);
        assert.match(result.code,/arcade tile x of \(arcade captured location\)/);
    }
});


test('primitive numeric kinds retain the actual local cell in terrain registrations',()=>{
    const result=arcadeToPseudocode(setup+'let kind=0;scene.onHitWall(kind,function(sprite,location){sprite.x=location.x})');
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade register wall kind \(kind\) as "__bwWall1" capturing ""/);
    assert.match(result.code,/WHEN arcade wall handler "__bwWall1" runs:/);
    assert.match(result.code,/arcade set local sprite to arcade event first/);
    assert.match(result.code,/arcade set local location to arcade event location/);
    assert.match(result.code,/arcade set x of arcade local sprite to arcade tile x of \(arcade local location\)/);
});


test('numeric terrain kind registrations survive native Code and export reconstruction',async()=>{
    const {runProgram,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const {importGuiDependency}=await import('./helpers/bw-integrated.mjs');
    const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
    const source='let kind=17;scene.onHitWall(kind,function(sprite:Sprite,location:tiles.Location){sprite.x=location.x})';
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const runs=[];
    const check=async code=>{
        const run=await runProgram(code,{frames:20});runs.push(run);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
        const service=run.vm.extensionManager._loadedExtensions.get('arcade');
        const actual=dispatch.services[service]._inst;
        assert.equal(actual._runtime,run.vm.runtime);
        assert.equal(actual._wallHandlers.length,1);
        assert.equal(actual._wallHandlers[0].kind,17);
        assert.equal(actual._wallHandlers[0].token,'__bwWall1');
        return run;
    };
    try{
        const run=await check(imported.code);await check(run.creator.decompile());
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);await check(again.code);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

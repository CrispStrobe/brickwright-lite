import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {PHYSICS_ENGINE_VALUES_SOURCE,PHYSICS_ENGINE_MEMBERSHIP_SOURCE,PHYSICS_ENGINE_CONTROLLER_SOURCE} from './fixtures/arcade-physics-engine.mjs';

test('qualified and scalar type assertions erase types at relational precedence',()=>{
    const source='let a=1+2 as number;let b=(game.currentScene().physicsEngine as ArcadePhysicsEngine).maxSpeed;let c=(engines as ArcadePhysicsEngine[])[0];let d=1+(2 as number)*3';
    const ast=parseMakeCodeTs(source);
    assert.equal(ast.body[0].decls[0].init.type,'Binary');
    assert.equal(ast.body[0].decls[0].init.op,'+');
    assert.equal(ast.body[1].decls[0].init.name,'maxSpeed');
    assert.equal(ast.body[2].decls[0].init.type,'Index');
    assert.equal(ast.body[3].decls[0].init.right.op,'*');
});
test('new belongs to the constructor call and preserves outer method/property/index chains',()=>{
    const ast=parseMakeCodeTs('let a=new ArcadePhysicsEngine;let b=new ArcadePhysicsEngine(20).maxSpeed;new ArcadePhysicsEngine(30).setMaxSpeed(40);let c=new scene.Engine()[0]');
    assert.equal(ast.body[0].decls[0].init.constructorCall,true);
    assert.equal(ast.body[1].decls[0].init.object.constructorCall,true);
    assert.equal(ast.body[2].expr.constructorCall,undefined);
    assert.equal(ast.body[2].expr.callee.object.constructorCall,true);
    assert.equal(ast.body[3].decls[0].init.object.constructorCall,true);
});
test('engine defaults and actual constructors select typed native operations',()=>{
    for(const source of ['let a=new ArcadePhysicsEngine','let a=new ArcadePhysicsEngine()','let a=new ArcadePhysicsEngine(40)','let a=new ArcadePhysicsEngine(40,3)','let a=new ArcadePhysicsEngine(40,3,5)']){
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade create physics engine max speed/);
    }
    const defaults=arcadeToPseudocode('let a=new ArcadePhysicsEngine()');assert.match(defaults.code,/max speed \(500\) min step \(2\) max step \(4\)/);
    const explicit=arcadeToPseudocode('let a=new ArcadePhysicsEngine(undefined,null,0)');assert.match(explicit.code,/max speed \(undefined value\) min step \(null value\) max step \(0\)/);
    for(const source of ['let a=ArcadePhysicsEngine(40)','let a=new ArcadePhysicsEngine(1,2,3,4)'])assert.ok(arcadeToPseudocode(source).unsupported.some(note=>note.includes('requires new and zero to three')));
});
test('shadowed engine constructor bindings are never converted to built-in native engines',()=>{
    for(const source of ['let ArcadePhysicsEngine=12;let fake=new ArcadePhysicsEngine()','function construct(ArcadePhysicsEngine){return new ArcadePhysicsEngine()}let fake=construct(12)']) {
        const imported=arcadeToPseudocode(source);assert.ok(imported.unsupported.some(note=>note.includes('shadowed binding')));assert.doesNotMatch(imported.code,/arcade create physics engine/);
    }
});
test('Scene and PhysicsEngine refs retain aliases, procedure/array types and property writes',()=>{
    for(const source of [PHYSICS_ENGINE_VALUES_SOURCE,PHYSICS_ENGINE_MEMBERSHIP_SOURCE,PHYSICS_ENGINE_CONTROLLER_SOURCE]){
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],source);assert.match(imported.code,/arcade current scene/);assert.match(imported.code,/arcade set physics engine/);
    }
    const compound=arcadeToPseudocode('let engine=new ArcadePhysicsEngine();let calls=0;function owner(){calls+=1;return engine}owner().maxSpeed+=10;engine.minStep++');assert.deepEqual(compound.unsupported,[]);assert.equal((compound.code.match(/arcade call function "owner"/g)||[]).length,1);
});
test('advanced Scene/PhysicsEngine APIs remain named gaps through scoped aliases',()=>{
    for(const source of ['game.currentScene().physicsEngine.move(10)','let engines=[new ArcadePhysicsEngine()];engines[0].addSprite(null)','function inspect(engine){return engine.draw()}inspect(new ArcadePhysicsEngine())','let view=game.currentScene();view.millis=1','game.currentScene().physicsEngine=null','game.currentScene().physicsEngine=12','let wrong=12;game.currentScene().physicsEngine=wrong']){
        const imported=arcadeToPseudocode(source);assert.ok(imported.unsupported.some(note=>/PhysicsEngine\.|Scene\./.test(note)),source);
    }
});

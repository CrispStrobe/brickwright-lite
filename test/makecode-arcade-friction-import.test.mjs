import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const actor='let actor=sprites.create(img`1`,SpriteKind.Player);';
test('literal sprites with friction select native properties rather than fixed-target velocity loops',()=>{
    const imported=arcadeToPseudocode(actor+'actor.fx=200;actor.fy=100;let drag=actor.fx+actor.fy');
    assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/arcade set fx of actor to 200/);assert.match(imported.code,/arcade set fy of actor to 100/);
    assert.match(imported.code,/arcade property fx of actor/);assert.match(imported.code,/arcade property fy of actor/);
});
test('computed compound friction assignments evaluate their receiver and amount once',()=>{
    const imported=arcadeToPseudocode(actor+'function owner(){return actor}function amount(){return 5}owner().fx+=amount();actor.fy++');
    assert.deepEqual(imported.unsupported,[]);
    for(const name of ['owner','amount'])assert.equal((imported.code.match(new RegExp(`arcade call function "${name}"`,'g'))||[]).length,1);
    assert.match(imported.code,/arcade set fx of arcade local/);assert.match(imported.code,/arcade set fy of arcade local/);
});
test('unknown friction receivers retain an explicit sprite diagnostic',()=>{
    const imported=arcadeToPseudocode('let object=12;let drag=object.fx');
    assert.ok(imported.unsupported.some(note=>note.includes('object.fx')));
});
test('advanced PhysicsEngine and Scene members keep named gaps through aliases',()=>{
    for(const [source,name] of [
        ['game.currentScene().physicsEngine.move(10)','move'],
        ['let view=game.currentScene();let engine=view.physicsEngine;let alias=engine;alias.draw()','draw'],
        ['let engines=[game.currentScene().physicsEngine];engines[0].addSprite(null)','addSprite'],
        ['function inspect(engine){return engine.overlaps(null)}inspect(game.currentScene().physicsEngine)','overlaps']
    ]) {
        const imported=arcadeToPseudocode(source);
        assert.ok(imported.unsupported.some(note=>note.includes(`PhysicsEngine.${name}`)),source);
    }
    const advanced=arcadeToPseudocode('game.currentScene().millis=1');
    assert.ok(advanced.unsupported.some(note=>note.includes('Scene.millis')));
});

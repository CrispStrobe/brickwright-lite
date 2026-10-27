import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const clean=out=>{for(const key of ['unsupported','errors','warnings','unparsed'])if(Object.hasOwn(out,key))assert.deepEqual(out[key],[],key);};
const create=text=>{const out=arcadeToPseudocode(text);clean(out);const c=new Creator();c.parse(out.code);clean(c);return c;};
const exported=text=>projectJsonToArcade(JSON.stringify(create(text).project));
// A negative may already be refused by the importer; otherwise the export
// must keep a native-addition refusal.
const refused=text=>{const imported=arcadeToPseudocode(text);if(imported.unsupported?.length)return true;
    const c=new Creator();c.parse(imported.code);if(c.errors?.length||c.unsupported?.length)return true;
    return projectJsonToArcade(JSON.stringify(c.project)).unsupported.some(reason=>/native addition/.test(reason));};

// Representative frame-clock accumulators beside numeric reads and builtin
// methods of a fresh published Array, as in a grid game's paint callback.
const level='let snake:number[];let x=0;let dx=1;let time=0;function lvl(){let f:number[]=[];f.push(1541);f.push(1285);snake=f;}lvl();';
const paint=body=>level+'game.onPaint(function(){'+body+'time=time+game.eventContext().deltaTime;x=x+dx;});';

test('frame delta accumulators admit numeric Array reads and builtin methods',()=>{
    for(const body of ['','x=snake[0]>>8;','x=snake[0]>>8;snake.unshift(x);snake.pop();','if(snake.indexOf(x,0)<0){x=0;}']){
        const out=exported(paint(body));clean(out);assert.match(out.ts,/deltaTime/);
        const direct=projectToArcade(create(paint(body)).project);clean(direct);assert.deepEqual(direct.files,out.files);
    }
});

test('the frame delta Number survives Code reimport and a second export',()=>{
    let c=create(paint('x=snake[0]>>8;snake.unshift(x);snake.pop();'));
    for(let generation=0;generation<2;generation++){
        const out=projectJsonToArcade(JSON.stringify(c.project));clean(out);
        const code=new Creator();code.parse(c.decompile());clean(code);clean(projectToArcade(code.project));c=create(out.files);
    }
});

test('index writes, opaque receivers and coercing indexOf arguments stay refused',()=>{
    assert.ok(refused((paint('snake[0]=x;'))));
    assert.ok(refused((paint('let s:any=sprites.create(img`.`,SpriteKind.Player);x=s[0];'))));
    assert.ok(refused((paint('let probe:any={valueOf(){return 0;}};if(snake.indexOf(x,probe)<0){x=0;}'))));
    // Imported cleanly: a non-Array receiver and a non-primitive fromIndex.
    for(const body of ['let s="ab";let t=s[0];','let other:number[]=[];if(snake.indexOf(x,other as any)<0){x=0;}']){
        const imported=arcadeToPseudocode(paint(body));assert.deepEqual(imported.unsupported||[],[],body);
        assert.ok(refused(paint(body)),body);
    }
});

test('mixed and non-numeric operands remain native-addition refusals',()=>{
    assert.ok(refused((level+'game.onPaint(function(){time=time+game.eventContext().deltaTime;time=time+controller.dx();x=x+(sprites.create(img`.`,SpriteKind.Player) as any);});')));
});

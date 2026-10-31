import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import getter from '../overlay/scratch-vm/src/util/bw-null-sprite-getter.js';
import primitive from '../overlay/scratch-vm/src/util/bw-primitive-owner.js';
import exceptions from '../overlay/scratch-vm/src/util/bw-arcade-exceptions.js';
import values from '../overlay/scratch-vm/src/util/bw-values.js';

// Synthetic engine-boundary controls for the missing Sprite/Image primitives. They
// follow the null Sprite getter: the same sealed registration, receipt and lineage.
const KINDS = {
    setSpriteImage:{args:{ID:null, IMAGE:'arcade-image:1'}, missing:['ID']},
    blitImage:{args:{IMAGE:'arcade-image:1', SOURCE:'arcade-image:2', OP:'drawTransparentImage', X:0, Y:0}, missing:['IMAGE','SOURCE']},
    drawImage:{args:{IMAGE:'arcade-image:1', OP:'fillRect'}, missing:['IMAGE']},
    drawImageCircle:{args:{IMAGE:'arcade-image:1', OP:'fillCircle'}, missing:['IMAGE']},
    setImagePixel:{args:{IMAGE:'arcade-image:1'}, missing:['IMAGE']},
    mutateImage:{args:{IMAGE:'arcade-image:1', OP:'fill'}, missing:['IMAGE']}
};
function fixture(method, args) {
    const runtime = new EventEmitter();
    const opcode = 'arcade_' + method;
    const block = {id:'op', opcode, inputs:{}, fields:{}, mutation:null};
    const root = {id:'root', inputs:{VALUE:{block:block.id}}}, blocks = {op:block, root};
    const func = () => 0;
    const operation = {id:block.id, opcode, _argValues:args, fields:block.fields, inputs:block.inputs, mutation:block.mutation, _blockFunction:func};
    const container = {getBlock:id=>blocks[id], getInputs:node=>node.inputs, _cache:{_executeCached:{root:{_ops:[operation]}}}};
    const target = {id:'target', blocks:container};
    const thread = {target, blockContainer:container, stack:['root'], stackFrames:[{}], status:0,
        constructor:{STATUS_DONE:4}, peekStack:()=> 'root', peekStackFrame(){return this.stackFrames[0];}};
    Object.assign(runtime, {targets:[target], threads:[thread], _blockInfo:[],
        sequencer:{activeThread:thread, retireThread(value){value.status=4;value.stack=[];}},
        isActiveThread:value=>runtime.threads.includes(value) && value.status!==4,
        getOpcodeFunction:()=>operation._blockFunction});
    const util = {runtime, thread, target};
    const instance = {}, owner = {isInstance:value=>value===instance, isCurrent:()=>true};
    const adapter = Object.assign(Object.create({getInfo(){}}), {_inst:instance, [method]:func});
    const kind = getter.kinds.find(entry => entry.method === method).kind;
    const faults = kind.create(runtime, owner), exception = exceptions.create(runtime, () => null);
    const info = kind.declaration({id:'arcade', blocks:[{opcode:method, arguments:{}}]}, owner);
    kind.bindAdapterInfo(info, adapter, instance);
    const entry = {json:{type:opcode}, info:{...info.blocks[0], func}};
    const category = {id:'arcade', blocks:[entry]};runtime._blockInfo.push(category);runtime.emit('EXTENSION_ADDED', category);
    runtime.emit('PROJECT_START');
    return {runtime, args, block, thread, util, faults, exception, invoke:fn=>primitive.invoke(runtime, thread, container, operation, args, util, fn)};
}

test('the null Sprite getter keeps its own opcode and the new kinds are the exact census', () => {
    assert.deepEqual(getter.kinds.map(entry => entry.method), ['spriteProperty', ...Object.keys(KINDS)]);
    assert.equal(typeof getter.create, 'function');
    for (const method of Object.keys(KINDS)) assert.equal(primitive.handles('arcade_' + method), true);
});

test('only an actual null or Undefined operand is missing', () => {
    for (const value of [null, values.UNDEFINED, {bwUndefined:true}]) assert.equal(getter.isMissing(value), true, String(value));
    for (const value of [undefined, 0, 5, '', 'null', 'undefined', false, 'arcade-image:1', {}, {bwNull:true}, {toString(){return 'null';}}]) assert.equal(getter.isMissing(value), false, String(value));
});

for (const [method, spec] of Object.entries(KINDS)) {
    for (const name of spec.missing) for (const [label, value, type] of [['null', null, 'null'], ['Undefined', values.UNDEFINED, 'undefined']]) {
        test(method + ': a ' + label + ' ' + name + ' issues one receipt naming the operand', () => {
            const f = fixture(method, {...spec.args, [name]:value});
            f.invoke(() => {
                const fault = f.faults.fault(f.args, f.util);
                assert.ok(fault.error instanceof TypeError);
                assert.match(fault.error.message, new RegExp('received type ' + type));
                assert.deepEqual(getter.consume(f.runtime, f.args, f.util, fault.error, fault.lease), {block:'op', property:name});
                assert.equal(getter.consume(f.runtime, f.args, f.util, fault.error, fault.lease), null);
            });
        });
    }
    test(method + ': present, non-image and missing-argument operands cannot issue receipts', () => {
        for (const value of [undefined, 5, 'x', 'arcade-image:1', false]) {
            const f = fixture(method, {...spec.args, [spec.missing[0]]:value});
            f.invoke(() => assert.throws(() => f.faults.fault(f.args, f.util), /actual null or Undefined|supported current/));
        }
    });
    test(method + ': copied arguments or utility and calls outside the primitive loan are refused', () => {
        const f = fixture(method, {...spec.args, [spec.missing[0]]:null});
        assert.throws(() => f.faults.fault(f.args, f.util), /original current primitive/);
        f.invoke(() => {
            assert.throws(() => f.faults.fault({...f.args}, f.util), /original current primitive/);
            assert.throws(() => f.faults.fault(f.args, {...f.util}), /original current primitive/);
        });
    });
    test(method + ': the fault retires the real caller through the shared exception lineage', () => {
        const f = fixture(method, {...spec.args, [spec.missing[0]]:null});
        let actual;
        assert.throws(() => f.invoke(() => {
            const fault = f.faults.fault(f.args, f.util);actual = fault.error;
            f.exception.rejectPrimitiveFault(f.args, f.util, fault.error, fault.lease);
            assert.fail('no successful primitive completion');
        }), error => error === actual);
        assert.equal(f.thread.status, 4);
        assert.equal(exceptions.consume(f.runtime, f.thread, actual), true);
        assert.deepEqual(exceptions.diagnostic(f.runtime, actual), {kind:'primitive-fault', message:actual.message, block:'op', target:'target'});
    });
}

test('operation menus are exact: other operations of the same primitive never fault', () => {
    for (const [method, op] of [['blitImage', 'overlapsWith'], ['drawImage', 'fill'], ['drawImageCircle', 'fillRect'], ['mutateImage', 'fillRect']]) {
        const f = fixture(method, {...KINDS[method].args, IMAGE:null, OP:op});
        f.invoke(() => assert.throws(() => f.faults.fault(f.args, f.util), /supported current operation/));
    }
});

test('a receipt from one kind cannot be consumed as another kind', () => {
    const a = fixture('setSpriteImage', {...KINDS.setSpriteImage.args}), b = fixture('setImagePixel', {...KINDS.setImagePixel.args, IMAGE:null});
    let fault;b.invoke(() => {fault = b.faults.fault(b.args, b.util);});
    a.invoke(() => assert.equal(getter.consume(a.runtime, a.args, a.util, fault.error, fault.lease), null));
});

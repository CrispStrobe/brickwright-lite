/**
 * Diagnostic-only observer around the original compiled PXT factory. The
 * original binary.js expression is embedded unchanged and its entry point,
 * callbacks, arguments and return values are retained. This is an instrumented
 * derivative, never an original-simulator qualification or a device model.
 * Trace lines use the harness's existing serial collector; selected inputs
 * must have no serial operations. Clock, buffer, timer and mixer implementations
 * remain the originals.
 */
export const CPX_TRACE_PREFIX = 'A12_PXT_TRACE ';

function observeFactory (originalFactory) {
    'use strict';
    return function (iface) {
        const {pxsim} = iface;
        let count = 0;
        const pending = [];
        const buffers = new WeakMap();
        let bufferId = 0;
        const identity = b => {
            if (!b || typeof b !== 'object') return null;
            if (!buffers.has(b)) buffers.set(b, ++bufferId);
            return buffers.get(b);
        };
        const pixels = state => state && state.buffer ? Array.from({length: state.length}, (_, i) => {
            const [r, g, b] = state.pixelColor(i);
            return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
        }) : null;
        const ring = () => {
            const board = pxsim.board();
            if (!board || typeof board.tryGetNeopixelState !== 'function') return {buffer: null, pixels: null};
            const state = board.tryGetNeopixelState(board.defaultNeopixelPin().id);
            return {buffer: identity(state && state.buffer), pixels: pixels(state)};
        };
        const emit = (kind, fields) => {
            if (++count > 10000) throw new Error('CPX diagnostic trace bound exceeded');
            pending.push('A12_PXT_TRACE ' + JSON.stringify({kind, t: Date.now(), ...fields}) + '\n');
            const board = pxsim.board();
            if (board) while (pending.length) board.writeSerial(pending.shift());
        };
        const wrap = (owner, key, observer) => {
            const original = owner && owner[key];
            if (typeof original !== 'function') throw new Error(`Missing original CPX diagnostic boundary ${key}`);
            owner[key] = function (...args) {
                return observer(original, this, args);
            };
        };
        wrap(iface, 'maybeYield', (original, receiver, args) => {
            const before = {pc: args[1], function: args[0] && args[0].fn && args[0].fn.name};
            const result = Reflect.apply(original, receiver, args);
            // Only actual yielding entries matter; avoid flooding the trace
            // with ordinary instruction-budget checks which return false.
            if (result) emit('yield', {...before, result, ring: ring()});
            return result;
        });
        wrap(pxsim.EventBus.prototype, 'queue', (original, receiver, args) => {
            emit('event-queue', {id: args[0], event: args[1]});
            return Reflect.apply(original, receiver, args);
        });
        wrap(pxsim.Runtime.prototype, 'runFiberAsync', (original, receiver, args) => {
            emit('fiber-request', {function: args[0] && args[0].func && args[0].func.name});
            return Reflect.apply(original, receiver, args);
        });
        wrap(pxsim.light, 'sendBuffer', (original, receiver, args) => {
            const before = ring();
            const input = identity(args[3] && args[3].data);
            const result = Reflect.apply(original, receiver, args);
            emit('send-buffer', {input, before, after: ring()});
            return result;
        });
        wrap(pxsim.AudioContextManager, 'queuePlayInstructions', (original, receiver, args) => {
            emit('audio-queue', {when: args[0], bytes: Array.from((args[1] && args[1].data) || [])});
            return Reflect.apply(original, receiver, args);
        });
        return originalFactory(iface);
    };
}

export function traceCpxPxtFactory (code) {
    if (typeof code !== 'string' || !code.trim()) throw new Error('Original PXT factory expression required');
    return `(${observeFactory.toString()})(\n${code}\n)`;
}

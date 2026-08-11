/**
 * rp2040js → Boundary A adapter.
 *
 * The adapter deliberately exposes the same electrical contract as the AVR
 * adapter: program time advances first, then GPIO edges reach BoardImpl. The
 * RP2040 is 3.3 V logic, so input sampling and output drive use that domain.
 * Source-level breakpoints are not fabricated; raw flash-address breakpoints
 * are supported when a caller already knows the address.
 *
 * @module
 */

import {RP2040, GPIOPinState} from 'rp2040js';

const CLOCK_HZ = 125_000_000;
const VCC = 3.3;
const FLASH_BASE = 0x10000000;
const RAM_BASE = 0x20000000;

function pinName(index) { return `GP${index}`; }
function pcOf(rp2040) { return rp2040.core.PC; }

export function createRp2040jsAdapter(opts = {}) {
    const rp2040 = new RP2040();
    const board = opts.board || null;
    let timeNs = 0n;
    let attached = board;
    let instructionObserver = null;
    const stats = {instructionCount: 0, pinChangeCount: 0, advanceToCount: 0};

    function publishPin(index) {
        if (!attached) return;
        const pin = rp2040.gpio[index];
        // Boundary rule: board time is current before the edge is published.
        attached.advanceTo?.(timeNs);
        const high = pin.outputValue;
        const state = pin.outputEnable
            ? (high ? GPIOPinState.High : GPIOPinState.Low)
            : pin.value;
        if (state === GPIOPinState.High || state === GPIOPinState.Low) {
            attached.setPin(pinName(index), 'pushpull', state === GPIOPinState.High);
        } else if (state === GPIOPinState.InputPullUp) {
            attached.setPin(pinName(index), 'input-pullup', true);
        } else {
            attached.setPin(pinName(index), 'input', false);
        }
        stats.pinChangeCount++;
    }

    function publishAll() {
        for (let i = 0; i < rp2040.gpio.length; i++) publishPin(i);
    }

    function sampleInputs() {
        if (!attached) return;
        for (let i = 0; i < rp2040.gpio.length; i++) {
            const volts = Number(attached.readAnalog?.(pinName(i)) ?? 0);
            rp2040.gpio[i].setInputValue(volts >= VCC / 2);
        }
    }

    function tick(deltaNs) {
        if (deltaNs <= 0) return;
        rp2040.clock.tick(deltaNs);
        timeNs += BigInt(Math.round(deltaNs));
    }

    function executeOne() {
        if (instructionObserver && instructionObserver({pc: rp2040.core.pc, timeNs, phase: 'before'}) === false) {
            return false;
        }
        sampleInputs();
        if (rp2040.core.waiting) {
            const next = rp2040.clock.nanosToNextAlarm;
            tick(next > 0 ? next : 1);
        } else {
            const cycles = rp2040.core.executeInstruction();
            tick(cycles * (1e9 / CLOCK_HZ));
        }
        publishAll();
        stats.instructionCount++;
        return true;
    }

    return {
        rp2040,
        stats,
        loadProgram(bytes) {
            rp2040.reset();
            rp2040.flash.fill(0xff);
            rp2040.flash.set(bytes, 0);
            // A boot ROM image is not shipped by rp2040js. Starting at the
            // XIP flash entry lets native test images execute while keeping
            // the omission explicit; UF2/boot-ROM handling is a later layer.
            if (bytes.length > 0) rp2040.core.PC = FLASH_BASE;
            timeNs = 0n;
            publishAll();
        },
        attachBoard(nextBoard) {
            attached = nextBoard;
            publishAll();
        },
        advanceNs(deltaNs) {
            const target = timeNs + BigInt(Math.max(0, Math.round(deltaNs)));
            while (timeNs < target && executeOne()) { /* instruction observer may halt */ }
            attached?.advanceTo?.(timeNs);
            stats.advanceToCount++;
        },
        stepInstruction() { executeOne(); },
        setInstructionObserver(observer) { instructionObserver = observer || null; },
        reset() {
            rp2040.reset();
            timeNs = 0n;
            publishAll();
        },
        timeNs() { return timeNs; },
    };
}

/** Parse a UF2 image into a flash-offset byte image. */
export function parseUf2(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const MAGIC0 = 0x0a324655;
    const MAGIC1 = 0x9e5d5157;
    const MAGIC_END = 0x0ab16f30;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const blocks = [];
    let max = 0;
    for (let offset = 0; offset + 512 <= bytes.length; offset += 512) {
        if (view.getUint32(offset, true) !== MAGIC0 ||
            view.getUint32(offset + 4, true) !== MAGIC1 ||
            view.getUint32(offset + 508, true) !== MAGIC_END) continue;
        const address = view.getUint32(offset + 12, true);
        const payloadSize = view.getUint32(offset + 16, true);
        if (payloadSize === 0 || payloadSize > 476 || address < FLASH_BASE) continue;
        const target = address - FLASH_BASE;
        blocks.push({target, payload: bytes.slice(offset + 32, offset + 32 + payloadSize)});
        max = Math.max(max, target + payloadSize);
    }
    if (!blocks.length) throw new Error('Invalid or empty UF2 image');
    const image = new Uint8Array(max);
    for (const block of blocks) image.set(block.payload, block.target);
    return image;
}

/** Small Boundary D target for the shared debug session. */
export function createRp2040jsDebugTarget(adapter) {
    const listeners = new Set();
    let running = false;
    let nextHandle = 1;
    const breakpoints = new Map();
    let resumePc = null;
    let stepPending = false;

    const announce = (cause, details = {}) => {
        const why = {cause, pc: pcOf(adapter.rp2040), tNs: adapter.timeNs(), skewNs: 0n, ...details};
        for (const cb of listeners) cb(why);
        return why;
    };

    adapter.setInstructionObserver?.(({pc, phase}) => {
        if (!running) return true;
        if (phase !== 'before') return true;
        if (resumePc !== null && pc === resumePc) {
            resumePc = null;
            return true;
        }
        for (const [handle, bp] of breakpoints) {
            if (bp.addr === pc) {
                running = false;
                resumePc = pc;
                announce('breakpoint', {handle, kind: 'code'});
                return false;
            }
        }
        return true;
    });

    return {
        onHalt(cb) { listeners.add(cb); return () => listeners.delete(cb); },
        capabilities() {
            return {
                target: 'rp2040js',
                execution: ['run', 'pause', 'reset'],
                steps: ['insn'],
                stepping: ['instruction'],
                breakpoints: ['code'],
                spaces: ['code', 'sram'],
                writable: ['sram'],
                symbols: false,
                consumes: ['GPIO', 'ADC'],
                timeFreezes: true,
            };
        },
        state() { return running ? 'running' : 'halted'; },
        run() { running = true; },
        halt() {
            if (!running) return;
            running = false;
            announce('user');
        },
        reset() { running = false; stepPending = false; resumePc = null; adapter.reset(); },
        step(kind) {
            if (kind !== 'instruction' && kind !== 'insn') return {unsupported: 'Pico currently supports instruction stepping only.'};
            stepPending = true;
            running = true;
            return undefined;
        },
        runFor(deltaNs) {
            if (!running) return 'idle';
            if (stepPending) {
                stepPending = false;
                adapter.stepInstruction();
                running = false;
                announce('step');
                return 'halted';
            }
            adapter.advanceNs(deltaNs);
            if (!running) return 'halted';
            return 'ran';
        },
        position() { return {pc: pcOf(adapter.rp2040)}; },
        regs() {
            const core = adapter.rp2040.core;
            return {
                pc: core.PC,
                sp: core.SP,
                lr: core.LR,
                xpsr: core.xPSR,
                r: Array.from(core.registers),
                cycles: core.cycles,
            };
        },
        readMem(space, addr, len) {
            if (space !== 'code' && space !== 'sram') {
                return {unsupported: `no such address space: ${space}`};
            }
            const base = space === 'code' ? FLASH_BASE : RAM_BASE;
            if (!Number.isInteger(addr) || !Number.isInteger(len) || len < 0 || addr < base) {
                return {unsupported: `${space} address/range is invalid`};
            }
            const out = new Uint8Array(len);
            for (let i = 0; i < len; i++) out[i] = adapter.rp2040.readUint8(addr + i);
            return out;
        },
        writeMem(space, addr, data) {
            if (space !== 'sram') return {refused: `space not writable: ${space}`};
            if (!Number.isInteger(addr) || addr < RAM_BASE) return {refused: 'invalid SRAM address'};
            for (let i = 0; i < data.length; i++) adapter.rp2040.writeUint8(addr + i, data[i]);
            return undefined;
        },
        setSymbols() { return {unsupported: 'rp2040js symbol mapping requires an ELF/debug-map contract.'}; },
        setBreakpoint(bp) {
            if (!bp || bp.kind !== 'code') {
                return {unsupported: 'Pico supports raw code-address breakpoints only.'};
            }
            if (!Number.isInteger(bp.addr) || bp.addr < FLASH_BASE) {
                return {unsupported: `Pico code breakpoint needs an integer XIP address >= 0x${FLASH_BASE.toString(16)}.`};
            }
            const handle = nextHandle++;
            breakpoints.set(handle, {addr: bp.addr});
            return handle;
        },
        clearBreakpoint(handle) {
            breakpoints.delete(handle);
        },
    };
}

export {CLOCK_HZ as RP2040_CLOCK_HZ, FLASH_BASE};

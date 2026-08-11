/**
 * rp2040js → Boundary A adapter.
 *
 * The adapter deliberately exposes the same electrical contract as the AVR
 * adapter: program time advances first, then GPIO edges reach BoardImpl. The
 * RP2040 is 3.3 V logic, so input sampling and output drive use that domain.
 * Source-level breakpoints are not fabricated; the first target milestone is
 * deterministic instruction stepping and circuit GPIO feedback.
 *
 * @module
 */

import {RP2040, GPIOPinState} from 'rp2040js';

const CLOCK_HZ = 125_000_000;
const VCC = 3.3;
const FLASH_BASE = 0x10000000;

function pinName(index) { return `GP${index}`; }

export function createRp2040jsAdapter(opts = {}) {
    const rp2040 = new RP2040();
    const board = opts.board || null;
    let timeNs = 0n;
    let attached = board;
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
            if (bytes.length > 0) rp2040.core.pc = FLASH_BASE;
            timeNs = 0n;
            publishAll();
        },
        attachBoard(nextBoard) {
            attached = nextBoard;
            publishAll();
        },
        advanceNs(deltaNs) {
            const target = timeNs + BigInt(Math.max(0, Math.round(deltaNs)));
            while (timeNs < target) executeOne();
            attached?.advanceTo?.(timeNs);
            stats.advanceToCount++;
        },
        stepInstruction() { executeOne(); },
        reset() {
            rp2040.reset();
            timeNs = 0n;
            publishAll();
        },
        timeNs() { return timeNs; },
    };
}

/** Small Boundary D target for the shared debug session. */
export function createRp2040jsDebugTarget(adapter) {
    const listeners = new Set();
    let running = false;
    return {
        onHalt(cb) { listeners.add(cb); return () => listeners.delete(cb); },
        capabilities() {
            return {
                target: 'rp2040js',
                execution: ['run', 'pause', 'reset'],
                stepping: ['instruction'],
                breakpoints: [],
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
            const why = {cause: 'user', pc: adapter.rp2040.core.pc, tNs: adapter.timeNs(), skewNs: 0n};
            for (const cb of listeners) cb(why);
        },
        reset() { running = false; adapter.reset(); },
        step(kind) {
            if (kind !== 'instruction') return {unsupported: 'Pico currently supports instruction stepping only.'};
            adapter.stepInstruction();
            return undefined;
        },
        runFor(deltaNs) {
            if (!running) return 'idle';
            adapter.advanceNs(deltaNs);
            return 'ran';
        },
        position() { return {pc: adapter.rp2040.core.pc}; },
        setSymbols() { return {unsupported: 'rp2040js symbol mapping is not wired yet.'}; },
        setBreakpoint() { return {unsupported: 'Pico breakpoints require a symbol/debug map.'}; },
    };
}

export {CLOCK_HZ as RP2040_CLOCK_HZ, FLASH_BASE};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The NXT VM's system calls (SYSCALL id, cluster of arguments): the subset NXC programs for the Robot
// Lab need — sound, the display (recorded as events), buttons (never pressed in the Lab), the
// low-speed (I²C) port for the ultrasonic sensor, Random, the start tick, the mailboxes, keep-alive.
//
// CLEAN ROOM. The numbering (0..47), each call's argument order and what it returns are FACTS read from
// LEGO's open-source NXT firmware 1.29 (`lego-1.29` tag of schodet/nxt-firmware: the command module's
// system-call table and its wrappers), cited in docs/NXT-RXE-VM.md §Syscalls. The code is ours.
//
// Every call the table lists without `run` stops the program with UNIMPLEMENTED_SYSCALL (nxt-vm.js) —
// files, Bluetooth, RS-485, the IO-map access calls, the colour sensor, datalogging, pictures.

import {TC, VM_STATUS} from './rxe-file.js';

const ERR = VM_STATUS;
/** A brick status byte (as the direct commands answer them) as the VM's signed status. */
const signed = byte => (byte << 24) >> 24;
const LS_MAX = 16;
const MAX_MESSAGE = 59;
const LOWSPEED_TYPES = new Set([0x0a, 0x0b]);
const SOUND_STOP = 0x04;

/** A cluster argument's members (a point: x, y). */
const members = (vm, id) => {
    const out = [];
    let m = id + 1;
    for (let k = 0; k < vm._members(id); k++) { out.push(m); m = vm._next(m); }
    return out;
};
const point = (vm, id) => {
    if (vm._type(id) !== TC.CLUSTER) return {x: 0, y: 0};
    const [x, y] = members(vm, id);
    return {x: (vm._get(x) << 0), y: (vm._get(y) << 0)};
};
const num = (vm, id) => vm._get(id);
const sNum = (vm, id) => vm._get(id) | 0;

/** Whether a port's low-speed channel is usable: type LOWSPEED / LOWSPEED_9V and its data valid. */
const lsReady = (vm, port) => LOWSPEED_TYPES.has(vm.s.in[port].type) && !vm.s.in[port].invalid;

const drawing = kind => (vm, args) => {
    const [result, ...rest] = args;
    const ev = {kind: 'display', what: kind};
    if (kind === 'text') Object.assign(ev, point(vm, rest[0]), {text: vm._string(rest[1]), options: num(vm, rest[2])});
    else if (kind === 'point') Object.assign(ev, point(vm, rest[0]), {options: num(vm, rest[1])});
    else if (kind === 'line') Object.assign(ev, {from: point(vm, rest[0]), to: point(vm, rest[1]), options: num(vm, rest[2])});
    else if (kind === 'circle') Object.assign(ev, point(vm, rest[0]), {radius: num(vm, rest[1]), options: num(vm, rest[2])});
    else if (kind === 'rect') Object.assign(ev, {from: point(vm, rest[0]), to: point(vm, rest[1]), options: num(vm, rest[2])});
    vm._event('display', ev);
    vm._set(result, 0);
};

/** id → {name, run?(vm, args, io)}; run returns nothing (NO_ERR) or the interpreter's outcome. */
export const SYSCALLS = Object.freeze([
    {name: 'FileOpenRead'}, {name: 'FileOpenWrite'}, {name: 'FileOpenAppend'}, {name: 'FileRead'},
    {name: 'FileWrite'}, {name: 'FileClose'}, {name: 'FileResolveHandle'}, {name: 'FileRename'}, {name: 'FileDelete'},
    {name: 'SoundPlayFile', run (vm, [result, file, loop, volume], io) {
        io.playFile?.(vm._string(file), num(vm, loop) !== 0, Math.min(4, num(vm, volume)));
        vm._event('sound', {file: vm._string(file), loop: num(vm, loop) !== 0});
        vm._set(result, 0);
    }},
    {name: 'SoundPlayTone', run (vm, [result, frequency, duration, loop, volume], io) {
        const f = num(vm, frequency) & 0xffff;
        const ms = num(vm, duration) & 0xffff;
        io.playTone?.(f, ms, num(vm, loop) !== 0, Math.min(4, num(vm, volume)));
        vm._event('tone', {frequency: f, duration: ms, loop: num(vm, loop) !== 0});
        vm._set(result, 0);
    }},
    {name: 'SoundGetState', run (vm, [state, flags], io) {
        const st = io.soundState ? io.soundState() : {state: 0, flags: 0};
        vm._set(state, st.state);
        vm._set(flags, st.flags);
    }},
    {name: 'SoundSetState', run (vm, [result, state, flags], io) {
        const v = num(vm, state) & 0xff;
        if (v === SOUND_STOP) io.stopSound?.();
        vm._set(result, v);
        void flags;
    }},
    {name: 'DrawText', run: drawing('text')},
    {name: 'DrawPoint', run: drawing('point')},
    {name: 'DrawLine', run: drawing('line')},
    {name: 'DrawCircle', run: drawing('circle')},
    {name: 'DrawRect', run: drawing('rect')},
    {name: 'DrawPicture'},
    {name: 'SetScreenMode', run (vm, [result, mode]) {
        vm._event('display', {what: 'screen-mode', mode: num(vm, mode)});
        vm._set(result, 0);
    }},
    // The Lab has no buttons to press: every button reads released, never counted.
    {name: 'ReadButton', run (vm, [result, index, pressed, count]) {
        vm._set(pressed, 0);
        vm._set(count, 0);
        vm._set(result, num(vm, index) < 4 ? 0 : (ERR.ERR_INVALID_PORT >>> 0));
    }},
    {name: 'CommLSWrite', run (vm, [result, port, buffer, rxLength], io) {
        const p = num(vm, port);
        const bytes = vm._bytes(buffer);
        const rx = num(vm, rxLength);
        let status;
        if (p >= 4) status = ERR.ERR_COMM_CHAN_INVALID;
        else if (bytes.length > LS_MAX || rx > LS_MAX) status = ERR.ERR_INVALID_SIZE;
        else if (!lsReady(vm, p)) status = ERR.ERR_COMM_CHAN_NOT_READY;
        else status = signed(io.lsWrite(p, bytes, rx));
        vm._set(result, status >>> 0);
    }},
    {name: 'CommLSRead', run (vm, [result, port, buffer, length], io) {
        const p = num(vm, port);
        const check = lsCheck(vm, p, io);
        let status = check.status;
        let data = [];
        if (status >= 0 && check.bytesReady > 0) {
            const n = Math.min(num(vm, length), check.bytesReady, LS_MAX);
            const r = io.lsRead(p, n);
            status = signed(r.status);
            data = r.data.slice(0, n);
        }
        vm._setBytes(buffer, data);
        vm._set(result, status >>> 0);
    }},
    {name: 'CommLSCheckStatus', run (vm, [result, port, bytesReady], io) {
        const check = lsCheck(vm, num(vm, port), io);
        vm._set(result, check.status >>> 0);
        vm._set(bytesReady, check.bytesReady);
    }},
    {name: 'RandomNumber', run (vm, [result]) { vm._set(result, vm._random()); }},
    {name: 'GetStartTick', run (vm, [result]) { vm._set(result, vm.s.startTick >>> 0); }},
    {name: 'MessageWrite', run (vm, [result, queue, message], io) {
        const q = num(vm, queue) & 0xff;
        const bytes = vm._bytes(message);
        let status;
        if (q >= 20) status = ERR.ERR_INVALID_QUEUE;
        else if (bytes.length > MAX_MESSAGE) status = ERR.ERR_INVALID_SIZE;
        else status = signed(io.messageWrite(q, bytes));
        vm._event('message-out', {queue: q, text: String.fromCharCode(...bytes.filter(b => b !== 0)), status});
        vm._set(result, status >>> 0);
    }},
    {name: 'MessageRead', run (vm, [result, queue, remove, message], io) {
        const r = io.messageRead(num(vm, queue) & 0xff, num(vm, remove) !== 0);
        const status = signed(r.status);
        if (status === 0 && r.message && r.message.length) vm._setBytes(message, r.message);
        else vm._setBytes(message, [0]);
        vm._set(result, status >>> 0);
    }},
    {name: 'CommBTCheckStatus'}, {name: 'CommBTWrite'}, {name: 'CommBTRead'},
    {name: 'KeepAlive', run (vm, [result], io) { vm._set(result, (io.keepAlive ? io.keepAlive() : 600000) >>> 0); }},
    {name: 'IOMapRead'}, {name: 'IOMapWrite'}, {name: 'ColorSensorRead'}, {name: 'CommBTOnOff'}, {name: 'CommBTConnection'},
    {name: 'CommHSWrite'}, {name: 'CommHSRead'}, {name: 'CommHSCheckStatus'}, {name: 'ReadSemData'}, {name: 'WriteSemData'},
    {name: 'ComputeCalibValue'}, {name: 'UpdateCalibCacheInfo'}, {name: 'DatalogWrite'}, {name: 'DatalogGetTimes'},
    {name: 'SetSleepTimeout'}, {name: 'ListFiles'}
]);

/** The low-speed channel's status and bytes ready, as the VM sees them (the firmware's check first, then the channel's). */
const lsCheck = (vm, p, io) => {
    if (p >= 4) return {status: ERR.ERR_COMM_CHAN_INVALID, bytesReady: 0};
    if (!lsReady(vm, p)) return {status: ERR.ERR_COMM_CHAN_NOT_READY, bytesReady: 0};
    const r = io.lsStatus(p);
    return {status: signed(r.status), bytesReady: r.bytesReady};
};

export const SYSCALL_NAMES = Object.freeze(SYSCALLS.map(c => c.name));
export const IMPLEMENTED_SYSCALLS = Object.freeze(SYSCALLS.flatMap((c, i) => (c.run ? [i] : [])));

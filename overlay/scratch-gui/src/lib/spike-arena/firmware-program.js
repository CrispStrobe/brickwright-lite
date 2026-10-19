// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Compile a deliberately bounded Scratch subset to our simulation guest ABI
 * (firmware-program v1: CrispStrobe/brickwright-spike-prime-fw apps/hubprogram/program.c,
 * mirrored by upload-protocol.js encodeInstructions and the desktop's arena_inputs.rs).
 *
 * A refusal is a FirmwareProgramError: its English message as before, plus `code`
 * (what the firmware cannot do), `blockId`/`opcode` and `block` — the refused block
 * written as the pseudocode line it reads as (`move forward 10 cm`) — and `params`,
 * so a pane can say exactly which block, in its own language.
 */
import {validateTopology} from '../spike-nuttx/motor-topology.js';

export class FirmwareProgramError extends Error {
    constructor (code, message, {blockId = null, opcode = null, block = null, params = {}} = {}) {
        super(block ? `${message} (in “${block}”)` : message);
        this.name = 'FirmwareProgramError';
        this.code = code;
        this.blockId = blockId;
        this.opcode = opcode;
        this.block = block;
        this.params = params;
    }
}

const NUMBER_SHADOWS = ['math_number', 'math_integer', 'math_positive_number', 'math_whole_number', 'math_angle', 'text'];
const fieldValue = field => (field === undefined || field === null ? undefined : String(field.value ?? field[0]));

/**
 * One block as the pseudocode line it reads as (the dialect's own words for the
 * blocks this compiler knows; the opcode for any other), with its literal values.
 * Never throws: a value that is not a literal reads as `(…)`.
 */
export const describeBlock = (blocks, block) => {
    if (!block) return 'missing block';
    const value = name => {
        if (block.fields?.[name]) return fieldValue(block.fields[name]);
        const child = blocks[block.inputs?.[name]?.block];
        if (!child) return '(…)';
        const fields = Object.values(child.fields || {});
        return (child.shadow || NUMBER_SHADOWS.includes(child.opcode)) && fields.length === 1 ? fieldValue(fields[0]) : '(…)';
    };
    const motorDirection = () => (value('DIRECTION') === '-1' ? 'backward' : 'forward');
    const condition = () => {
        const c = blocks[block.inputs?.CONDITION?.block];
        if (!c) return '…';
        const r = blocks[c.inputs?.OPERAND1?.block];
        const port = r ? describeBlock(blocks, {...r, opcode: 'port'}) : '';
        const reporter = !r ? '(…)' : {
            spikeprime_getDistance: `spike distance ${port} in cm`,
            spikeprime_getDistanceIn: `spike distance ${port} in ${describeBlock(blocks, {...r, opcode: 'unit'})}`,
            spikeprime_getReflection: `spike reflection ${port}`,
            spikeprime_getColor: `spike color ${port}`
        }[r.opcode] || r.opcode;
        const sign = {operator_lt: '<', operator_gt: '>', operator_equals: '='}[c.opcode];
        if (c.opcode === 'spikeprime_isForceSensorPressed') return `force sensor ${describeBlock(blocks, {...c, opcode: 'port'})} pressed`;
        return sign ? `${reporter} ${sign} ${describeBlock(blocks, {...c, opcode: 'operand2'})}` : c.opcode;
    };
    switch (block.opcode) {
    case 'control_wait': return `wait ${value('DURATION')} seconds`;
    case 'port': return value('PORT');
    case 'operand2': return value('OPERAND2');
    case 'unit': return value('UNIT');
    case 'control_wait_until': return `wait until ${condition()}`;
    case 'control_repeat': return `repeat ${value('TIMES')}`;
    case 'control_forever': return 'forever';
    case 'control_repeat_until': return `repeat until ${condition()}`;
    case 'control_stop': return `stop ${value('STOP_OPTION')}`;
    case 'spikeprime_motorSetSpeed': return `set motor speed ${value('PORT')} ${value('SPEED')}`;
    case 'spikeprime_setMovementSpeed': return `set movement speed ${value('SPEED')}`;
    case 'spikeprime_setMovementMotors': return `set movement motors ${value('PORT_A')} ${value('PORT_B')}`;
    case 'spikeprime_motorStart': return `start motor ${value('PORT')} ${motorDirection()}`;
    case 'spikeprime_startMotor': return `start motor ${value('PORT')} at ${value('SPEED')} %`;
    case 'spikeprime_motorStop': return `stop motor ${value('PORT')}`;
    case 'spikeprime_stopMotor': return `stop motor ${value('PORT')} ${value('ACTION')}`;
    case 'spikeprime_stopMovement': return 'stop movement';
    case 'spikeprime_startTank': return `start tank ${value('LEFT_SPEED')} ${value('RIGHT_SPEED')}`;
    case 'spikeprime_moveForward': return `move ${value('DIRECTION')} ${value('VALUE')} ${value('UNIT')}`;
    case 'spikeprime_motorRunFor': return `run motor ${value('PORT')} ${motorDirection()} ${value('VALUE')} ${value('UNIT')}`;
    default: return block.opcode;
    }
};

export function compileFirmwareProgram (vm, {topology = 'default'} = {}) {
    validateTopology(topology);
    const six = topology === 'six-motors', dual = topology === 'dual-ultrasonic';
    const targets = vm?.runtime?.targets || [];
    const scripts = targets.filter(t => t.isOriginal !== false).flatMap(target =>
        (target.blocks?.getScripts() || []).map(id => ({target, id})));
    if (scripts.length !== 1) {
        throw new FirmwareProgramError('script-count', 'Firmware programs need exactly one green-flag script', {params: {count: scripts.length}});
    }
    const {target, id} = scripts[0];
    const blocks = target.blocks._blocks;
    const refuse = (code, message, block, params = {}) => new FirmwareProgramError(code, message,
        {blockId: block?.id ?? null, opcode: block?.opcode ?? null, block: block ? describeBlock(blocks, block) : null, params});
    if (blocks[id]?.opcode !== 'event_whenflagclicked') {
        throw refuse('no-green-flag', 'Firmware programs need a green-flag script', blocks[id]);
    }
    const code = [], speeds = Array(six ? 6 : 2).fill(75); let movementSpeed = 50;
    // The statement being compiled: what a refusal names (a reporter or a menu is part of it).
    let statement = null;
    const fail = block => {
        throw refuse('unsupported-block', `Firmware does not support ${block?.opcode || 'missing block'}`, statement || block,
            {opcode: block?.opcode || null});
    };
    const emit = (...words) => {
        if (code.length >= 256) throw refuse('too-long', 'Firmware program exceeds 256 instructions', statement, {limit: 256});
        code.push(words);
    };
    let work = 0;
    const consumeWork = () => {
        if (++work > 4096) throw refuse('too-long', 'Firmware program exceeds compiler expansion budget', statement, {limit: 256});
    };
    const input = (block, name) => blocks[block.inputs?.[name]?.block];
    const literal = (block, name) => {
        if (block.fields?.[name]) return fieldValue(block.fields[name]);
        const child = input(block, name);
        const notLiteral = () => {
            throw refuse('not-literal', `Firmware ${name} must be a literal value`, statement || block, {name});
        };
        if (!child || !(child.shadow || NUMBER_SHADOWS.includes(child.opcode))) notLiteral();
        const fields = Object.values(child.fields || {});
        if (fields.length !== 1) notLiteral();
        return fieldValue(fields[0]);
    };
    const number = (block, name, min, max) => {
        const raw = literal(block, name), n = raw.trim() === '' ? NaN : Number(raw);
        if (!Number.isFinite(n) || n < min || n > max) {
            throw refuse('range', `Firmware ${name} must be a literal in ${min}…${max}`, statement || block, {name, min, max});
        }
        return n;
    };
    const ports = block => {
        const raw = literal(block, 'PORT').toUpperCase();
        if (six ? !/^[A-F]{1,6}$/.test(raw) || new Set(raw).size !== raw.length : !/^(A|B|AB)$/.test(raw)) {
            throw six ? refuse('ports', 'Firmware motor ports must be distinct literal A–F letters', block, {ports: 'A–F'}) :
                refuse('ports', 'Firmware guest supports motors A and B only', block, {ports: 'A, B'});
        }
        return [...raw].sort().map(p => p.charCodeAt(0) - 65);
    };
    const direction = block => number(block, 'DIRECTION', -1, 1) < 0 ? -1 : 1;
    // The movement block's DIRECTION is the menu's word (`forward`/`backward`, as the
    // extension and the dialect store it); the motor blocks' is the number 1/−1.
    const moveDirection = block => {
        const raw = literal(block, 'DIRECTION').trim().toLowerCase();
        if (raw === 'forward' || raw === '1') return 1;
        if (raw === 'backward' || raw === '-1') return -1;
        throw refuse('direction', `Firmware movement direction must be forward or backward, not '${raw}'`, block, {value: raw});
    };
    const speed = percent => Math.round(percent * 11.1);
    const stop = port => emit(1, port, 0, 0);
    const predicate = block => {
        if (six) throw refuse('no-sensors', 'Six-motor topology has no arena sensors', statement);
        if (block?.opcode === 'spikeprime_isForceSensorPressed') {
            if (dual) throw refuse('sensor-port', 'Dual ultrasonic topology has no force sensor', statement, {sensor: 'force', ports: '—'});
            if (literal(block, 'PORT') !== 'E') throw refuse('sensor-port', 'Firmware force sensor is E', statement, {sensor: 'force', ports: 'E'});
            return [3, 1];
        }
        if (!['operator_lt', 'operator_gt', 'operator_equals'].includes(block?.opcode)) fail(block);
        const reporter = input(block, 'OPERAND1');
        let kind, max, scale = 1;
        if (reporter?.opcode === 'spikeprime_getDistance' || reporter?.opcode === 'spikeprime_getDistanceIn') {
            const port = literal(reporter, 'PORT');
            if (dual ? !['E', 'F'].includes(port) : port !== 'D') {
                throw dual ? refuse('sensor-port', 'Dual ultrasonic distance ports are E and F', statement, {sensor: 'distance', ports: 'E, F'}) :
                    refuse('sensor-port', 'Firmware distance sensor is D', statement, {sensor: 'distance', ports: 'D'});
            }
            const unit = reporter.opcode === 'spikeprime_getDistance' ? 'cm' : literal(reporter, 'UNIT');
            scale = {mm: 1, cm: 10, in: 25.4}[unit];
            if (!scale || block.opcode === 'operator_equals') fail(block);
            kind = (dual ? 0x100 + ((port.charCodeAt(0) - 65) << 3) : 0) +
                (block.opcode === 'operator_lt' ? 1 : 2); max = 65535 / scale;
        } else if (reporter?.opcode === 'spikeprime_getReflection') {
            if (literal(reporter, 'PORT') !== 'C' || block.opcode === 'operator_equals') fail(block);
            kind = block.opcode === 'operator_lt' ? 5 : 6; max = 100;
        } else if (reporter?.opcode === 'spikeprime_getColor') {
            if (literal(reporter, 'PORT') !== 'C' || block.opcode !== 'operator_equals') fail(block);
            const name = literal(block, 'OPERAND2').toLowerCase();
            const colors = {black: 0, magenta: 1, purple: 2, blue: 3, azure: 4, turquoise: 5, green: 6, yellow: 7, orange: 8, red: 9, white: 10, none: 255};
            if (!(name in colors)) fail(block);
            return [4, colors[name]];
        } else fail(reporter);
        return [kind, Math.round(number(block, 'OPERAND2', 0, max) * scale)];
    };
    const walk = (first, ancestors = new Set(), dynamic = false) => {
        consumeWork();
        let current = first; const seen = new Set(ancestors);
        while (current) {
            consumeWork();
            if (seen.has(current)) throw refuse('cyclic', 'Firmware script contains a cyclic block graph', null);
            seen.add(current);
            const block = blocks[current]; if (!block) fail(block);
            const op = block.opcode;
            statement = {...block, id: block.id ?? current};
            if (op === 'control_wait') emit(2, Math.round(number(block, 'DURATION', 0, 120) * 1000), 0, 0);
            else if (op === 'control_wait_until') emit(3, ...predicate(input(block, 'CONDITION')), 0);
            else if (op === 'control_repeat') {
                const times = number(block, 'TIMES', 0, 255);
                if (!Number.isInteger(times)) throw refuse('repeat-integer', 'Firmware repeat count must be an integer', statement);
                for (let i = 0; i < times; i++) walk(block.inputs?.SUBSTACK?.block, seen, dynamic);
            } else if (op === 'control_forever' || op === 'control_repeat_until') {
                const start = code.length;
                const loop = statement;
                if (op === 'control_repeat_until') emit(5, ...predicate(input(block, 'CONDITION')), 0);
                walk(block.inputs?.SUBSTACK?.block, seen, true); statement = loop; emit(4, start, 0, 0);
                if (op === 'control_repeat_until') code[start][3] = code.length;
                if (op === 'control_forever' && block.next) throw refuse('after-forever', 'Firmware cannot run blocks after forever', loop);
            } else if (op === 'spikeprime_motorSetSpeed') {
                if (dynamic) throw refuse('speed-in-loop', 'Firmware speed settings must be outside dynamic loops', statement);
                const value = number(block, 'SPEED', -100, 100); ports(statement).forEach(p => {speeds[p] = value;});
            } else if (op === 'spikeprime_setMovementSpeed') {
                if (dynamic) throw refuse('speed-in-loop', 'Firmware speed settings must be outside dynamic loops', statement);
                movementSpeed = number(block, 'SPEED', -100, 100);
            } else if (op === 'spikeprime_setMovementMotors') {
                if (literal(block, 'PORT_A') !== 'A' || literal(block, 'PORT_B') !== 'B') throw refuse('movement-motors', 'Firmware movement motors must be A and B', statement);
            } else if (op === 'spikeprime_motorStart' || op === 'spikeprime_startMotor') {
                ports(statement).forEach(p => emit(1, p, speed(op === 'spikeprime_startMotor' ? number(block, 'SPEED', -100, 100) : speeds[p] * direction(block)), 0));
            } else if (op === 'spikeprime_motorStop' || op === 'spikeprime_stopMotor') {
                if (op === 'spikeprime_stopMotor' && literal(block, 'ACTION') !== 'brake') throw refuse('brake-only', 'Firmware subset supports brake only', statement);
                ports(statement).forEach(stop);
            } else if (op === 'spikeprime_stopMovement') { stop(0); stop(1); }
            else if (op === 'spikeprime_startTank') {
                emit(1, 0, -speed(number(block, 'LEFT_SPEED', -100, 100)), 0);
                emit(1, 1, speed(number(block, 'RIGHT_SPEED', -100, 100)), 0);
            } else if (op === 'spikeprime_moveForward') {
                const unit = literal(block, 'UNIT');
                // Both wheels by a distance is a two-motor position move: ABI v1 has none
                // (op 6 moves ONE motor and waits for it), docs/ROBOT-LAB-SPIKE-EMULATION.md §7.4.
                if (unit !== 'seconds') throw refuse('two-motor-position', 'Firmware movement currently supports seconds only', statement, {unit});
                const d = moveDirection(statement); emit(1, 0, -speed(movementSpeed * d), 0); emit(1, 1, speed(movementSpeed * d), 0);
                emit(2, Math.round(number(block, 'VALUE', 0, 120) * 1000), 0, 0); stop(0); stop(1);
            } else if (op === 'spikeprime_motorRunFor') {
                const selected = ports(statement), unit = literal(block, 'UNIT'), d = direction(block);
                if (unit === 'seconds') {
                    selected.forEach(p => emit(1, p, speed(speeds[p] * d), 0));
                    emit(2, Math.round(number(block, 'VALUE', 0, 120) * 1000), 0, 0); selected.forEach(stop);
                } else {
                    if (!['degrees', 'rotations'].includes(unit)) throw refuse('unit', `Firmware motor moves support seconds, degrees or rotations, not '${unit}'`, statement, {unit});
                    if (selected.length !== 1) throw refuse('two-motor-position', 'Firmware position moves support one motor in degrees/rotations', statement, {unit});
                    const p = selected[0], degrees = Math.round(number(block, 'VALUE', 0, unit === 'degrees' ? 36000 : 100) * (unit === 'rotations' ? 360 : 1));
                    if (!speeds[p]) throw refuse('zero-speed', 'Firmware position move needs a nonzero speed', statement);
                    emit(6, p, degrees * d * Math.sign(speeds[p]), Math.abs(speed(speeds[p])));
                }
            } else if (op === 'control_stop' && literal(block, 'STOP_OPTION') === 'all') emit(0, 0, 0, 0);
            else fail(block);
            current = block.next;
        }
    };
    walk(blocks[id].next); statement = null; emit(0, 0, 0, 0);
    return {version: 1, instructions: code};
}

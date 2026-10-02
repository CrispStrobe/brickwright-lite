// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Compile a deliberately bounded Scratch subset to our simulation guest ABI. */
export function compileFirmwareProgram (vm) {
    const targets = vm?.runtime?.targets || [];
    const scripts = targets.filter(t => t.isOriginal !== false).flatMap(target =>
        (target.blocks?.getScripts() || []).map(id => ({target, id})));
    if (scripts.length !== 1) throw new Error('Firmware programs need exactly one green-flag script');
    const {target, id} = scripts[0];
    const blocks = target.blocks._blocks;
    if (blocks[id]?.opcode !== 'event_whenflagclicked') throw new Error('Firmware programs need a green-flag script');
    const code = [], speeds = [75, 75]; let movementSpeed = 50;
    const fail = block => { throw new Error(`Firmware does not support ${block?.opcode || 'missing block'}`); };
    const emit = (...words) => {
        if (code.length >= 255) throw new Error('Firmware program exceeds 256 instructions');
        code.push(words);
    };
    const input = (block, name) => blocks[block.inputs?.[name]?.block];
    const literal = (block, name) => {
        if (block.fields?.[name]) return String(block.fields[name].value ?? block.fields[name][0]);
        const child = input(block, name);
        if (!child || !(child.shadow || ['math_number', 'math_integer', 'math_positive_number', 'math_whole_number', 'math_angle', 'text'].includes(child.opcode))) fail(child);
        const fields = Object.values(child.fields || {});
        if (fields.length !== 1) fail(child);
        return String(fields[0].value ?? fields[0][0]);
    };
    const number = (block, name, min, max) => {
        const raw = literal(block, name), n = raw.trim() === '' ? NaN : Number(raw);
        if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Firmware ${name} must be a literal in ${min}…${max}`);
        return n;
    };
    const ports = block => {
        const raw = literal(block, 'PORT').toUpperCase();
        if (!/^(A|B|AB)$/.test(raw)) throw new Error('Firmware guest supports motors A and B only');
        return [...raw].map(p => p === 'A' ? 0 : 1);
    };
    const direction = block => number(block, 'DIRECTION', -1, 1) < 0 ? -1 : 1;
    const speed = percent => Math.round(percent * 11.1);
    const stop = port => emit(1, port, 0, 0);
    const predicate = block => {
        if (block?.opcode === 'spikeprime_isForceSensorPressed') {
            if (literal(block, 'PORT') !== 'E') throw new Error('Firmware force sensor is E');
            return [3, 1];
        }
        if (!['operator_lt', 'operator_gt', 'operator_equals'].includes(block?.opcode)) fail(block);
        const reporter = input(block, 'OPERAND1');
        let kind, max, scale = 1;
        if (reporter?.opcode === 'spikeprime_getDistance' || reporter?.opcode === 'spikeprime_getDistanceIn') {
            if (literal(reporter, 'PORT') !== 'D') throw new Error('Firmware distance sensor is D');
            const unit = reporter.opcode === 'spikeprime_getDistance' ? 'cm' : literal(reporter, 'UNIT');
            scale = {mm: 1, cm: 10, in: 25.4}[unit];
            if (!scale || block.opcode === 'operator_equals') fail(block);
            kind = block.opcode === 'operator_lt' ? 1 : 2; max = 65535 / scale;
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
        let current = first; const seen = new Set(ancestors);
        while (current) {
            if (seen.has(current)) throw new Error('Firmware script contains a cyclic block graph');
            seen.add(current);
            const block = blocks[current]; if (!block) fail(block);
            const op = block.opcode;
            if (op === 'control_wait') emit(2, Math.round(number(block, 'DURATION', 0, 120) * 1000), 0, 0);
            else if (op === 'control_wait_until') emit(3, ...predicate(input(block, 'CONDITION')), 0);
            else if (op === 'control_repeat') {
                const times = number(block, 'TIMES', 0, 255);
                if (!Number.isInteger(times)) throw new Error('Firmware repeat count must be an integer');
                for (let i = 0; i < times; i++) walk(block.inputs?.SUBSTACK?.block, seen, dynamic);
            } else if (op === 'control_forever' || op === 'control_repeat_until') {
                const start = code.length;
                if (op === 'control_repeat_until') emit(5, ...predicate(input(block, 'CONDITION')), 0);
                walk(block.inputs?.SUBSTACK?.block, seen, true); emit(4, start, 0, 0);
                if (op === 'control_repeat_until') code[start][3] = code.length;
                if (op === 'control_forever' && block.next) throw new Error('Firmware cannot run blocks after forever');
            } else if (op === 'spikeprime_motorSetSpeed') {
                if (dynamic) throw new Error('Firmware speed settings must be outside dynamic loops');
                const value = number(block, 'SPEED', -100, 100); ports(block).forEach(p => {speeds[p] = value;});
            } else if (op === 'spikeprime_setMovementSpeed') {
                if (dynamic) throw new Error('Firmware speed settings must be outside dynamic loops');
                movementSpeed = number(block, 'SPEED', -100, 100);
            } else if (op === 'spikeprime_setMovementMotors') {
                if (literal(block, 'PORT_A') !== 'A' || literal(block, 'PORT_B') !== 'B') throw new Error('Firmware movement motors must be A and B');
            } else if (op === 'spikeprime_motorStart' || op === 'spikeprime_startMotor') {
                ports(block).forEach(p => emit(1, p, speed(op === 'spikeprime_startMotor' ? number(block, 'SPEED', -100, 100) : speeds[p] * direction(block)), 0));
            } else if (op === 'spikeprime_motorStop' || op === 'spikeprime_stopMotor') {
                if (op === 'spikeprime_stopMotor' && literal(block, 'ACTION') !== 'brake') throw new Error('Firmware subset supports brake only');
                ports(block).forEach(stop);
            } else if (op === 'spikeprime_stopMovement') { stop(0); stop(1); }
            else if (op === 'spikeprime_startTank') {
                emit(1, 0, -speed(number(block, 'LEFT_SPEED', -100, 100)), 0);
                emit(1, 1, speed(number(block, 'RIGHT_SPEED', -100, 100)), 0);
            } else if (op === 'spikeprime_moveForward') {
                const unit = literal(block, 'UNIT');
                if (unit !== 'seconds') throw new Error('Firmware movement currently supports seconds only');
                const d = direction(block); emit(1, 0, -speed(movementSpeed * d), 0); emit(1, 1, speed(movementSpeed * d), 0);
                emit(2, Math.round(number(block, 'VALUE', 0, 120) * 1000), 0, 0); stop(0); stop(1);
            } else if (op === 'spikeprime_motorRunFor') {
                const selected = ports(block), unit = literal(block, 'UNIT'), d = direction(block);
                if (unit === 'seconds') {
                    selected.forEach(p => emit(1, p, speed(speeds[p] * d), 0));
                    emit(2, Math.round(number(block, 'VALUE', 0, 120) * 1000), 0, 0); selected.forEach(stop);
                } else {
                    if (selected.length !== 1 || !['degrees', 'rotations'].includes(unit)) throw new Error('Firmware position moves support one motor in degrees/rotations');
                    const p = selected[0], degrees = Math.round(number(block, 'VALUE', 0, unit === 'degrees' ? 36000 : 100) * (unit === 'rotations' ? 360 : 1));
                    if (!speeds[p]) throw new Error('Firmware position move needs a nonzero speed');
                    emit(6, p, degrees * d * Math.sign(speeds[p]), Math.abs(speed(speeds[p])));
                }
            } else if (op === 'control_stop' && literal(block, 'STOP_OPTION') === 'all') emit(0, 0, 0, 0);
            else fail(block);
            current = block.next;
        }
    };
    walk(blocks[id].next); emit(0, 0, 0, 0);
    return {version: 1, instructions: code};
}

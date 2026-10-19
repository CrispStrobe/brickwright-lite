/**
 * Finite block-stack driver for CPX extension comparisons. The INPUT is the
 * actual project parsed by SB3Creator, never a handwritten counterpart of the
 * source program. Device operations always call the original pinned extension.
 * Unsupported Scratch operations fail explicitly. This is a host comparison
 * harness; the production browser gate separately exercises the actual VM.
 */
export function cpxBlockProgram (project) {
    const stage = project.targets.find(t => t.isStage);
    const blocks = stage.blocks;
    const variables = new Map(Object.values(stage.variables || {}).map(([name, value]) => [name, value]));
    const tops = Object.values(blocks).filter(b => b.topLevel);
    let operations = 0;
    const number = v => Number(v) || 0;
    const field = (b, name) => b.fields[name][0];
    const input = (b, name, ext) => value(b.inputs[name] && b.inputs[name][1], ext);
    const args = (b, ext) => ({...Object.fromEntries(Object.keys(b.inputs).map(k => [k, input(b, k, ext)])),
        ...Object.fromEntries(Object.keys(b.fields).map(k => [k, field(b, k)]))});

    function value (slot, ext) {
        if (slot == null) return '';
        if (Array.isArray(slot)) {
            if (slot[0] === 12) return variables.get(slot[1]) ?? 0;
            if ([4, 5, 6, 7, 8].includes(slot[0])) return number(slot[1]);
            if ([9, 10].includes(slot[0])) return slot[1];
            throw new Error(`Unhandled CPX comparison literal ${JSON.stringify(slot)}`);
        }
        const b = blocks[slot];
        if (!b) throw new Error(`Missing CPX comparison input block ${slot}`);
        if (b.opcode.startsWith('circuitplayground_menu_')) return Object.values(b.fields)[0][0];
        if (b.opcode.startsWith('circuitplayground_')) {
            const method = b.opcode.slice('circuitplayground_'.length);
            if (typeof ext[method] !== 'function') throw new Error(`Missing original CPX reporter ${method}`);
            return ext[method](args(b, ext));
        }
        const read = k => input(b, k, ext);
        switch (b.opcode) {
        case 'data_variable': return variables.get(field(b, 'VARIABLE')) ?? 0;
        case 'operator_add': return number(read('NUM1')) + number(read('NUM2'));
        case 'operator_subtract': return number(read('NUM1')) - number(read('NUM2'));
        case 'operator_multiply': return number(read('NUM1')) * number(read('NUM2'));
        case 'operator_divide': return number(read('NUM1')) / number(read('NUM2'));
        case 'operator_mod': return ((number(read('NUM1')) % number(read('NUM2'))) + number(read('NUM2'))) % number(read('NUM2'));
        case 'operator_lt': return number(read('OPERAND1')) < number(read('OPERAND2'));
        case 'operator_gt': return number(read('OPERAND1')) > number(read('OPERAND2'));
        case 'operator_equals': return String(read('OPERAND1')).toLowerCase() === String(read('OPERAND2')).toLowerCase();
        case 'operator_and': return Boolean(read('OPERAND1')) && Boolean(read('OPERAND2'));
        case 'operator_or': return Boolean(read('OPERAND1')) || Boolean(read('OPERAND2'));
        case 'operator_not': return !read('OPERAND');
        default: throw new Error(`Unhandled CPX comparison reporter ${b.opcode}`);
        }
    }

    async function stack (first, ext, wait) {
        for (let id = first; id;) {
            if (++operations > 10000) throw new Error('CPX comparison operation bound exceeded');
            const b = blocks[id];
            if (!b) throw new Error(`Missing CPX comparison command block ${id}`);
            if (b.opcode.startsWith('circuitplayground_')) {
                const method = b.opcode.slice('circuitplayground_'.length);
                if (typeof ext[method] !== 'function') throw new Error(`Missing original CPX command ${method}`);
                await ext[method](args(b, ext));
            } else {
                switch (b.opcode) {
                case 'data_setvariableto': variables.set(field(b, 'VARIABLE'), input(b, 'VALUE', ext)); break;
                case 'data_changevariableby': {
                    const name = field(b, 'VARIABLE');
                    variables.set(name, number(variables.get(name)) + number(input(b, 'VALUE', ext)));
                    break;
                }
                case 'control_wait': await wait(number(input(b, 'DURATION', ext)) * 1000); break;
                case 'control_if':
                    if (input(b, 'CONDITION', ext)) await stack(b.inputs.SUBSTACK && b.inputs.SUBSTACK[1], ext, wait);
                    break;
                case 'control_if_else': {
                    const key = input(b, 'CONDITION', ext) ? 'SUBSTACK' : 'SUBSTACK2';
                    await stack(b.inputs[key] && b.inputs[key][1], ext, wait);
                    break;
                }
                case 'control_repeat':
                    for (let i = 0, n = Math.round(number(input(b, 'TIMES', ext))); i < n; i++) {
                        await stack(b.inputs.SUBSTACK && b.inputs.SUBSTACK[1], ext, wait);
                    }
                    break;
                default: throw new Error(`Unhandled CPX comparison command ${b.opcode}`);
                }
            }
            id = b.next;
        }
    }

    return {
        drive: (ext, wait) => Promise.all(tops.filter(b => b.opcode === 'event_whenflagclicked')
            .map(b => stack(b.next, ext, wait))),
        onHat: (opcode, fields, ext, wait) => Promise.all(tops.filter(b => b.opcode === opcode &&
            Object.entries(fields).every(([k, v]) => field(b, k) === v)).map(b => stack(b.next, ext, wait)))
    };
}

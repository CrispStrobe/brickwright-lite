/**
 * The other direction: a BrickWright project → a file MakeCode opens.
 *
 * Two halves, and the second is the surprising one.
 *
 * **Blocks → TypeScript.** A walk over the compiled project's blocks,
 * emitting the MakeCode vocabulary that microbit-translate.js reads on
 * the way in. It is the inverse of that table, which is why the two live
 * next to each other: a mapping added on one side and forgotten on the
 * other is a round trip that quietly loses a block.
 *
 * **TypeScript → a .hex MakeCode will import.** MakeCode's own importer
 * (`pxt.cpp.unpackSourceFromHexAsync`) does not care about the machine
 * code in a .hex — it scans for the source-embedding header, reads the
 * JSON meta and the project text, and opens THAT. The `compression`
 * field is optional. So a hex carrying nothing but the embed is a
 * perfectly good MakeCode project file: a few hundred bytes that
 * makecode.microbit.org opens as the project it describes.
 *
 * That is the same container embedded-source.js reads, written from the
 * other end, which is exactly how the test proves it: the export is fed
 * back through the importer.
 *
 * @module
 */

const MAGIC = [0x41, 0x14, 0x0E, 0x2F, 0xB8, 0x2F, 0xA2, 0xBB];

/** Where the embed sits in flash. Any page MakeCode does not use will do. */
const EMBED_ADDRESS = 0x3B400;

// ─── blocks → TypeScript ────────────────────────────────────────────────

const PIN = field => String(field || 'P0').toUpperCase();

/** MakeCode's enum spellings for the values our fields hold. */
const BUTTON = {a: 'Button.A', b: 'Button.B', ab: 'Button.AB'};
const AXIS = {x: 'Dimension.X', y: 'Dimension.Y', z: 'Dimension.Z', strength: 'Dimension.Strength'};
const PULL = {up: 'PinPullMode.PullUp', down: 'PinPullMode.PullDown', none: 'PinPullMode.PullNone'};

class Emitter {
    constructor (blocks) {
        this.blocks = blocks;
        this.unsupported = [];
    }

    block (id) {
        return id ? this.blocks[id] : null;
    }

    field (block, name) {
        return block.fields && block.fields[name] ? block.fields[name][0] : '';
    }

    /** An input, as a TypeScript expression. */
    value (block, name, fallback = '0') {
        const input = block.inputs && block.inputs[name];
        if (!input) return fallback;
        const slot = input[1];
        if (Array.isArray(slot)) {
            const [type, text] = slot;
            if (type === 10 || type === 11) return JSON.stringify(String(text));
            if (type === 12 || type === 13) return this.variableName(text);
            return String(text);
        }
        if (typeof slot === 'string') return this.reporter(this.block(slot));
        return fallback;
    }

    variableName (name) {
        return String(name).replace(/[^A-Za-z0-9_]/g, '_') || 'v';
    }

    /** A boolean input. */
    condition (block, name) {
        const input = block.inputs && block.inputs[name];
        if (!input) return 'false';
        const slot = input[1];
        if (typeof slot === 'string') return this.reporter(this.block(slot));
        return 'false';
    }

    reporter (b) {
        if (!b) return '0';
        const v = name => this.value(b, name);
        const f = name => this.field(b, name);
        switch (b.opcode) {
        case 'data_variable': return this.variableName(f('VARIABLE'));
        case 'operator_add': return `(${v('NUM1')} + ${v('NUM2')})`;
        case 'operator_subtract': return `(${v('NUM1')} - ${v('NUM2')})`;
        case 'operator_multiply': return `(${v('NUM1')} * ${v('NUM2')})`;
        case 'operator_divide': return `(${v('NUM1')} / ${v('NUM2')})`;
        case 'operator_mod': return `(${v('NUM1')} % ${v('NUM2')})`;
        case 'operator_round': return `Math.round(${v('NUM')})`;
        case 'operator_random': return `randint(${v('FROM')}, ${v('TO')})`;
        case 'operator_join': return `("" + ${v('STRING1')} + ${v('STRING2')})`;
        case 'operator_gt': return `(${v('OPERAND1')} > ${v('OPERAND2')})`;
        case 'operator_lt': return `(${v('OPERAND1')} < ${v('OPERAND2')})`;
        case 'operator_equals': return `(${v('OPERAND1')} == ${v('OPERAND2')})`;
        case 'operator_and': return `(${this.condition(b, 'OPERAND1')} && ${this.condition(b, 'OPERAND2')})`;
        case 'operator_or': return `(${this.condition(b, 'OPERAND1')} || ${this.condition(b, 'OPERAND2')})`;
        case 'operator_not': return `(!(${this.condition(b, 'OPERAND')}))`;
        case 'operator_mathop': {
            const op = f('OPERATOR');
            const map = {abs: 'Math.abs', floor: 'Math.floor', ceiling: 'Math.ceil', sqrt: 'Math.sqrt'};
            if (map[op]) return `${map[op]}(${v('NUM')})`;
            this.unsupported.push(`${op} of …`);
            return v('NUM');
        }
        case 'microbitplus_accel': return `input.acceleration(${AXIS[f('AXIS')] || 'Dimension.X'})`;
        case 'microbitplus_pitch': return 'input.rotation(Rotation.Pitch)';
        case 'microbitplus_roll': return 'input.rotation(Rotation.Roll)';
        case 'microbitplus_compass': return 'input.compassHeading()';
        case 'microbitplus_magforce': return `input.magneticForce(${AXIS[f('AXIS')] || 'Dimension.X'})`;
        case 'microbitplus_light': return 'input.lightLevel()';
        case 'microbitplus_temp': return 'input.temperature()';
        case 'microbitplus_sound': return 'input.soundLevel()';
        case 'microbitplus_isbutton': return `input.buttonIsPressed(${BUTTON[f('BTN')] || 'Button.A'})`;
        case 'microbitplus_digitalread': return `pins.digitalReadPin(DigitalPin.${PIN(f('PIN'))})`;
        case 'microbitplus_analogread': return `pins.analogReadPin(AnalogPin.${PIN(f('PIN'))})`;
        case 'microbitplus_radiolastnum': return 'receivedNumber';
        case 'microbitplus_radiolaststr': return 'receivedString';
        case 'sensing_timer': return '(input.runningTime() / 1000)';
        default:
            this.unsupported.push(`${b.opcode} as a value`);
            return '0';
        }
    }

    /** A stack of blocks, as TypeScript statements. */
    stack (id, indent) {
        const out = [];
        let b = this.block(id);
        while (b) {
            this.statement(b, indent, out);
            b = this.block(b.next);
        }
        return out;
    }

    substack (b, name, indent) {
        const input = b.inputs && b.inputs[name];
        const first = input && typeof input[1] === 'string' ? input[1] : null;
        return this.stack(first, indent);
    }

    statement (b, indent, out) {
        const pad = '    '.repeat(indent);
        const push = line => out.push(pad + line);
        const v = name => this.value(b, name);
        const f = name => this.field(b, name);

        switch (b.opcode) {
        case 'control_forever':
            push('basic.forever(function () {');
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('})');
            return;
        case 'control_repeat':
            push(`for (let i = 0; i < ${v('TIMES')}; i++) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('}');
            return;
        case 'control_repeat_until':
            push(`while (!(${this.condition(b, 'CONDITION')})) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('}');
            return;
        case 'control_if':
            push(`if (${this.condition(b, 'CONDITION')}) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('}');
            return;
        case 'control_if_else':
            push(`if (${this.condition(b, 'CONDITION')}) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('} else {');
            out.push(...this.substack(b, 'SUBSTACK2', indent + 1));
            push('}');
            return;
        case 'control_wait':
            push(`basic.pause(${v('DURATION')} * 1000)`);
            return;
        case 'control_wait_until':
            push(`pauseUntil(() => ${this.condition(b, 'CONDITION')})`);
            return;
        case 'control_stop':
            push('control.reset()');
            return;

        case 'data_setvariableto':
            push(`${this.variableName(f('VARIABLE'))} = ${v('VALUE')}`);
            return;
        case 'data_changevariableby':
            push(`${this.variableName(f('VARIABLE'))} += ${v('VALUE')}`);
            return;

        case 'microbitplus_showmatrix':
            push(`basic.showLeds(\`${ledsOf(f('MATRIX'))}\n${pad}    \`)`);
            return;
        case 'microbitplus_showtext':
            push(`basic.showString(${v('TEXT', '""')})`);
            return;
        case 'microbitplus_scrolltext':
            push(`basic.showString(${v('TEXT', '""')})`);
            return;
        case 'microbit_display':
            push(f('MODE') === 'text' ?
                `basic.showString(${v('VALUE', '""')})` :
                `basic.showNumber(${v('VALUE')})`);
            return;
        case 'microbitplus_cleardisplay':
            push('basic.clearScreen()');
            return;
        case 'microbitplus_plot':
            push(`led.${f('STATE') === 'off' ? 'unplot' : 'plot'}(${v('X')}, ${v('Y')})`);
            return;

        case 'microbitplus_digitalwrite':
            push(`pins.digitalWritePin(DigitalPin.${PIN(f('PIN'))}, ${f('LEVEL') === '0' ? 0 : 1})`);
            return;
        case 'microbitplus_analogwrite':
            // Ours is a percentage, MakeCode's range is 0..1023.
            push(`pins.analogWritePin(AnalogPin.${PIN(f('PIN'))}, Math.round(${v('PCT')} * 1023 / 100))`);
            return;
        case 'microbitplus_setpull':
            push(`pins.setPull(DigitalPin.${PIN(f('PIN'))}, ${PULL[f('MODE')] || 'PinPullMode.PullNone'})`);
            return;
        case 'microbitplus_servo':
            push(`pins.servoWritePin(AnalogPin.${PIN(f('PIN'))}, ${v('DEG')})`);
            return;

        case 'microbitplus_playtone':
            push(`music.playTone(${v('FREQ', '440')}, ${v('MS', '500')})`);
            return;
        case 'microbitplus_stoptone':
            push('music.stopAllSounds()');
            return;

        case 'microbitplus_radioon':
            push(`radio.setGroup(${v('GROUP', '1')})`);
            push(`radio.setTransmitPower(${v('POWER', '6')})`);
            return;
        case 'microbitplus_radiosendnum':
            push(`radio.sendNumber(${v('NUM')})`);
            return;
        case 'microbitplus_radiosendstr':
            push(`radio.sendString(${v('TEXT', '""')})`);
            return;

        default:
            this.unsupported.push(b.opcode);
            push(`// unsupported: ${b.opcode}`);
        }
    }
}

/** `09900:…` → MakeCode's `# . #` grid, one row per line. */
function ledsOf (matrix) {
    const digits = String(matrix || '').replace(/[^0-9]/g, '').padEnd(25, '0').slice(0, 25);
    const rows = [];
    for (let y = 0; y < 5; y++) {
        rows.push([...digits.slice(y * 5, (y + 1) * 5)].map(d => (d === '0' ? '.' : '#')).join(' '));
    }
    return rows.map(row => `    ${row}`).join('\n');
}

/**
 * Compile a project's blocks into MakeCode TypeScript.
 *
 * @param {object} project an sb3 project (SB3Creator.parse's output)
 * @returns {{ts: string, unsupported: Array<string>}}
 */
export function projectToMakeCodeTs (project) {
    const targets = (project && project.targets) || [];
    const lines = [];
    const declared = new Set();
    const unsupported = [];

    for (const target of targets) {
        const blocks = target.blocks || {};
        const emitter = new Emitter(blocks);

        // Variables first: MakeCode is TypeScript, and TypeScript wants
        // them declared before the code that assigns them.
        for (const entry of Object.values(target.variables || {})) {
            const name = emitter.variableName(Array.isArray(entry) ? entry[0] : entry);
            if (declared.has(name)) continue;
            declared.add(name);
            lines.push(`let ${name} = 0`);
        }

        for (const [id, block] of Object.entries(blocks)) {
            if (!block || !block.topLevel) continue;
            if (block.opcode !== 'event_whenflagclicked') {
                if (/^event_|^control_start_as_clone/.test(block.opcode)) {
                    unsupported.push(`${block.opcode} — MakeCode has no equivalent hat`);
                }
                continue;
            }
            lines.push(...emitter.stack(block.next, 0));
            void id;
        }
        unsupported.push(...emitter.unsupported);
    }

    return {
        ts: `${lines.join('\n').trimEnd()}\n`,
        unsupported: [...new Set(unsupported)]
    };
}

// ─── the .hex MakeCode will import ──────────────────────────────────────

const hexRecord = (addr, type, bytes) => {
    const all = [bytes.length, (addr >> 8) & 0xFF, addr & 0xFF, type, ...bytes];
    const checksum = ((~all.reduce((a, b) => a + b, 0)) + 1) & 0xFF;
    return `:${[...all, checksum].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
};

/**
 * Wrap a project's files in the source-embedding container and write it
 * as an Intel HEX — the file format MakeCode's "Import File" accepts.
 *
 * Uncompressed on purpose: the header's `compression` field is optional,
 * and shipping an LZMA *compressor* to save a few kilobytes on a file
 * the user downloads once would be a poor trade.
 *
 * @param {Object<string, string>} files the project, e.g. {'main.ts', 'pxt.json'}
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {string} [opts.editorUrl]
 * @returns {string} Intel HEX text
 */
export function makeCodeSourceHex (files, opts = {}) {
    const text = JSON.stringify(files);
    const meta = JSON.stringify({
        name: opts.name || 'BrickWright project',
        eURL: opts.editorUrl || 'https://makecode.microbit.org/',
        eVER: opts.editorVersion || '0.0.0',
        pxtTarget: opts.target || 'microbit'
    });

    const encoder = new TextEncoder();
    const metaBytes = encoder.encode(meta);
    const textBytes = encoder.encode(text);
    const header = new Uint8Array(16);
    header.set(MAGIC);
    header[8] = metaBytes.length & 0xFF;
    header[9] = (metaBytes.length >> 8) & 0xFF;
    header[10] = textBytes.length & 0xFF;
    header[11] = (textBytes.length >> 8) & 0xFF;
    header[12] = (textBytes.length >> 16) & 0xFF;
    header[13] = (textBytes.length >>> 24) & 0xFF;

    const body = new Uint8Array(header.length + metaBytes.length + textBytes.length);
    body.set(header);
    body.set(metaBytes, header.length);
    body.set(textBytes, header.length + metaBytes.length);

    const lines = [];
    let upper = -1;
    for (let p = 0; p < body.length; p += 16) {
        const address = EMBED_ADDRESS + p;
        const hi = address >>> 16;
        if (hi !== upper) {
            upper = hi;
            lines.push(hexRecord(0, 0x04, [(hi >> 8) & 0xFF, hi & 0xFF]));
        }
        lines.push(hexRecord(address & 0xFFFF, 0x00, [...body.subarray(p, p + 16)]));
    }
    lines.push(':00000001FF');
    return `${lines.join('\n')}\n`;
}

/**
 * A whole project, ready to hand to the browser as a download.
 *
 * @param {object} project an sb3 project
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @returns {{hex: string, ts: string, files: object, unsupported: Array<string>, filename: string}}
 */
export function exportToMakeCode (project, opts = {}) {
    const name = opts.name || 'brickwright';
    const {ts, unsupported} = projectToMakeCodeTs(project);
    const files = {
        'main.ts': ts,
        'main.blocks': '',
        'pxt.json': `${JSON.stringify({
            name,
            description: 'Exported from BrickWright',
            dependencies: {core: '*', radio: '*'},
            files: ['main.ts', 'main.blocks', 'pxt.json'],
            preferredEditor: 'tsprj'
        }, null, 4)}\n`,
        'README.md': `# ${name}\n\nExported from BrickWright.\n`
    };
    return {
        hex: makeCodeSourceHex(files, {name, target: opts.target || 'microbit'}),
        ts,
        files,
        unsupported,
        filename: `${String(name).replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase() || 'project'}.hex`
    };
}

export default exportToMakeCode;

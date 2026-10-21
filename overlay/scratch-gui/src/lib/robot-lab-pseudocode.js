// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's `lab` words, layered over the PINNED sb3-creator compiler
// (docs/SIM-LAB.md "Steering the Lab"; docs/ROBOT-LAB-HUBS-PLAN.md P1). The vendored
// files (sb3-creator.js, sb3-creator-python.js, sb3-creator-javascript.js) stay
// byte-identical to upstream at the pin (test/sb3-creator-vendor-identity.test.mjs);
// everything the Robot Lab adds comes through the two doors lite already has:
//
//   - the COMPILER: `withRobotLab(Base)`, a subclass handed out by the registering
//     door (sb3-creator-register-art.js, where the Peer Sessions words are layered the
//     same way): `lab …` commands and the `when lab …` hat before any generic rule,
//     `lab …` reporters before the vendored reporter rules, the decompiler's three
//     sites, the robotlab 'simulator' driver, and robotlab hats registered with their
//     own arguments (`_robotlab.on("robotlab_whenTouch", fn, "gear", "ground")`) in
//     Python/JS events mode; RUNTIME_EXTENSIONS.robotlab is set at the same door;
//   - the READERS: `readPython` / `readJavaScript` below, which the Code tab calls in
//     place of the vendored defaults. Both vendored readers translate with the ONE
//     shared Translator class (the JavaScript reader imports it from the Python one),
//     so the lift is installed on that class once, here: `_robotlab.<method>(…)` is
//     its `lab` word again, and `_robotlab.on(…)` names the function that is the
//     hat's script.
//
// The word table itself is robotLabDialect.js (one table for all of this).

import pythonToPseudocode, {Translator} from './sb3-creator-python.js';
import javascriptToPseudocode from './sb3-creator-javascript.js';
import {compileArcadeWord} from './arcadeDialect.js';
import {ROBOTLAB_RUNTIME, robotLabWordFor, robotLabWordsOf, robotLabCallToPseudo} from './robotLabDialect.js';
// The LEGO hub words (`pup …`, `boost …`, `wedo …`: legopoweredup, legoboostunified, wedo2unified) ride the
// same door and the same machinery, from their own table (lib/legoHubsDialect.js).
import {legoHubWordFor, legoHubWordsOf, isLegoHubText} from './legoHubsDialect.js';

/** The `lab` words, then the LEGO hub words, of the given kinds (table order is precedence within each). */
const wordsOf = kinds => [...robotLabWordsOf(kinds), ...legoHubWordsOf(kinds)];
/** The entry for a robotlab or LEGO hub opcode, or null. */
const wordFor = opcode => robotLabWordFor(opcode) || legoHubWordFor(opcode);

// ---- top-level matching (the compiler's own masking rule, which it does not export) ----

/** The line with everything inside quotes and inner parentheses blanked, so literals only match at top level. */
const maskTopLevel = line => {
    let depth = 0;
    let inStr = false;
    let masked = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inStr && ch === '\\' && i + 1 < line.length) { masked += '\u0001\u0001'; i++; continue; }
        if (ch === '"') { inStr = !inStr; masked += ch; continue; }
        if (!inStr && ch === '(') { depth++; masked += depth === 1 ? ch : '\u0001'; continue; }
        if (!inStr && ch === ')') { masked += depth === 1 ? ch : '\u0001'; depth = Math.max(0, depth - 1); continue; }
        masked += (inStr || depth > 0) ? '\u0001' : ch;
    }
    return masked;
};

/** A word's regex matched at top level; the groups are the ORIGINAL text's (as the compiler's matchTopLevel). */
const matchTopLevel = (line, re) => {
    const rd = new RegExp(re.source, re.flags.includes('d') ? re.flags : `${re.flags}d`);
    const m = rd.exec(maskTopLevel(line));
    if (!m) return null;
    return m.indices.map(span => (span ? line.slice(span[0], span[1]) : undefined));
};

const isLabLine = text => /^(?:lab|when\s+lab)\s/i.test(text) || isLegoHubText(text);

// ---- the compiler ------------------------------------------------------------------------

/**
 * The compiler with the Robot Lab's words.
 * @param {Function} Base the registered SB3Creator class
 * @returns {Function} its subclass
 */
export const withRobotLab = Base => class RobotLabCreator extends Base {
    /** A `lab …` statement or `WHEN lab …:` hat as its block, or null (the vendored rules then read the line). */
    parseLabCommand (line, target) {
        let text = String(line).trim();
        let hat = false;
        if (/^when\b/i.test(text)) {
            hat = /:\s*$/.test(text);
            text = text.replace(/\s*:\s*$/, '');
        }
        if (!isLabLine(text)) return null;
        const context = {target, extraBlocks: {}, parentId: null};
        const read = s => {
            // As the compiler's own statements: a reporter spread over the slots is refused by name.
            if (typeof this.refuseSpilledReporter === 'function') this.refuseSpilledReporter(text, s, target);
            return this.parseValue(s, context);
        };
        for (const entry of wordsOf(hat ? ['hat'] : ['command'])) {
            const m = matchTopLevel(text, compileArcadeWord(entry).re);
            if (!m) continue;
            const {id, block} = this.createBlock(entry.op, entry.kind === 'hat' ? {topLevel: true} : {});
            context.parentId = id;
            const slots = this.arcadeSlots(entry, m, context, read);
            if (!slots) continue;
            Object.assign(block[id], slots);
            return {block, extraBlocks: context.extraBlocks};
        }
        return null;
    }

    parseCommand (line, target, allowLoop = false) {
        return this.parseLabCommand(line, target) || super.parseCommand(line, target, allowLoop);
    }

    /** `lab …` reporters, read whole: they hold no operator of their own. */
    parseReporter (s, context) {
        const text = String(s).trim();
        if (/^lab\s/i.test(text) || isLegoHubText(text)) {
            for (const entry of wordsOf(['reporter', 'boolean'])) {
                const m = matchTopLevel(text, compileArcadeWord(entry).re);
                if (!m) continue;
                const id = this.pushBlock(context, entry.op);
                const was = context.parentId;
                context.parentId = id;
                let slots;
                try {
                    slots = this.arcadeSlots(entry, m, context, t => this.parseValue(t, context));
                } finally {
                    context.parentId = was;
                }
                if (!slots) { delete context.extraBlocks[id]; continue; }
                Object.assign(context.extraBlocks[id], slots);
                return this.valueOfBlock(id);
            }
        }
        return super.parseReporter(s, context);
    }

    /** A hub Boolean word (`nxt touch sensor S1 pressed`) is a condition as it stands. */
    parseCondition (conditionStr, context) {
        const text = this.stripOuterParens(String(conditionStr || '').trim());
        if (isLegoHubText(text) && !/\s(?:and|or)\s|[<>=]/i.test(text)) {
            for (const entry of legoHubWordsOf(['boolean'])) {
                if (matchTopLevel(text, compileArcadeWord(entry).re)) return this.parseReporter(text, context)[1];
            }
        }
        return super.parseCondition(conditionStr, context);
    }

    drep (b, blocks) {
        const entry = b && wordFor(b.opcode);
        if (entry && entry.kind !== 'command' && entry.kind !== 'hat') return this.spellArcade(entry, b, blocks);
        return super.drep(b, blocks);
    }

    decompileHat (b, blocks) {
        const entry = b && wordFor(b.opcode);
        if (entry && entry.kind === 'hat') return this.spellArcade(entry, b, blocks);
        return super.decompileHat(b, blocks);
    }

    decompileStackBlock (b, blocks, level) {
        const entry = b && wordFor(b.opcode);
        if (entry && entry.kind === 'command') return [`${'  '.repeat(level)}${this.spellArcade(entry, b, blocks)}`];
        return super.decompileStackBlock(b, blocks, level);
    }

    runtimeShim (extId, lang, mode = 'shim') {
        if (extId === 'robotlab' && mode === 'simulator') return robotLabSimulatorDriver(lang);
        return super.runtimeShim(extId, lang, mode);
    }

    generatePython (project = this.project, opts = {}) {
        return this.withLabHatArguments(super.generatePython(project, opts), project, 'py');
    }

    generateJavaScript (project = this.project, opts = {}) {
        return this.withLabHatArguments(super.generateJavaScript(project, opts), project, 'js');
    }

    /**
     * Events mode writes a runtime hat as `_robotlab.on("robotlab_whenTouch", handler)`, which
     * loses the hat's own arguments (which part, touching what). They follow the handler here,
     * so the readers can rebuild the hat. The emitter registers hats in its walk's order —
     * the scripted targets in project order, each one's blocks in insertion order — and this
     * walks the same order, so the k-th registration is the k-th robotlab hat.
     */
    withLabHatArguments (code, project, lang) {
        if (typeof code !== 'string' || !code.includes('_robotlab.on(')) return code;
        const targets = (project && project.targets) || [];
        const hats = [];
        for (const t of targets.filter(x => !x.isStage || Object.values(x.blocks || {}).some(b => b.topLevel))) {
            for (const b of Object.values(t.blocks || {})) {
                const entry = b.topLevel && robotLabWordFor(b.opcode);
                if (entry && entry.kind === 'hat') hats.push({b, entry, blocks: t.blocks});
            }
        }
        let k = 0;
        return code.replace(/_robotlab\.on\(("robotlab_\w+"), (\w+)\)/g, (whole, opcode, fn) => {
            const hat = hats[k++];
            if (!hat || JSON.parse(opcode) !== hat.b.opcode) return whole;
            const val = key => (lang === 'py' ? this.pyVal(hat.b.inputs[key], hat.blocks) : this.jsVal(hat.b.inputs[key], hat.blocks));
            const args = hat.entry.args.map(key => this.runtimeArg(hat.b, key, hat.blocks, val));
            return `_robotlab.on(${[opcode, fn, ...args].join(', ')})`;
        });
    }
};

/**
 * The robotlab 'simulator' driver: `_robotlab` IS the Robot Lab API (window.__bwSimLab.api)
 * when the program runs in the page beside an open Lab — every `_robotlab.<method>` of
 * RUNTIME_EXTENSIONS.robotlab is a method of that object, so nothing is translated. Elsewhere
 * (a Web Worker, Python's Skulpt) there is no Lab to reach: neutral, and it says how to run
 * the program in the Lab instead (⇦ To blocks, then the green flag).
 */
export const robotLabSimulatorDriver = lang => {
    const methods = [...new Map(Object.values(ROBOTLAB_RUNTIME.ops).map(op => [op.method, op])).values()];
    const neutralOf = op => (op.kind === 'reporter' ? (op.neutral || '0') : null);
    if (lang === 'py') {
        return [
            '# _robotlab driver — Python cannot reach the Robot Lab from the Code tab\'s console:',
            '# press ⇦ To blocks and run the blocks (green flag) to steer the Lab. Neutral here.',
            'class _RobotlabDriver:',
            ...methods.map(op => `    def ${op.method}(self, *a): return ${neutralOf(op) === null ? 'None' : neutralOf(op)}`),
            '    def on(self, *a): pass',
            '_robotlab = _RobotlabDriver()'
        ];
    }
    return [
        '// _robotlab driver — the Robot Lab API (window.__bwSimLab.api) while the Lab is open in this page;',
        '// neutral otherwise (a Web Worker has no Lab: press ⇦ To blocks and run the blocks instead).',
        'const _robotlab = (typeof globalThis !== "undefined" && globalThis.__bwSimLab && globalThis.__bwSimLab.api) || {',
        ...methods.map(op => `    ${op.method}: () => ${neutralOf(op) === null ? 'undefined' : neutralOf(op)},`),
        '    on: () => () => {},',
        '};'
    ];
};

/** The registry entry the door sets: SB3Creator.RUNTIME_EXTENSIONS.robotlab. */
export {ROBOTLAB_RUNTIME};

// ---- the readers ---------------------------------------------------------------------------

const asLab = node => (node && node.type === 'Call' && node.func.type === 'Attribute' &&
    node.func.value.type === 'Name' && node.func.value.id === '_robotlab' ? {method: node.func.attr, args: node.args} : null);

/** `_robotlab.on("robotlab_whenTouch", handler, part, other)` as {fn, header}, or null. */
const labRegistration = (translator, statement) => {
    const v = statement && statement.type === 'Expr' ? statement.value : null;
    const call = asLab(v);
    if (!call || call.method !== 'on' || call.args.length < 2 || call.args[1].type !== 'Name') return null;
    const opcode = String(translator.expr(call.args[0])).replace(/^"|"$/g, '');
    const entry = robotLabWordFor(opcode);
    const header = entry ? robotLabCallToPseudo(entry.method, call.args.slice(2).map(x => translator.expr(x)), {hat: true}) : null;
    return {fn: call.args[1].id, header};
};

const LIFT = Symbol.for('brickwright.robotLabLift');

/** Teaches the shared Translator the `_robotlab` calls, once (idempotent). */
export const installRobotLabReaders = () => {
    const proto = Translator.prototype;
    if (proto[LIFT]) return false;
    const {callExpr, exprStmt, program, resolveHat} = proto;
    proto.callExpr = function (node) {
        const call = asLab(node);
        if (call) {
            const word = robotLabCallToPseudo(call.method, call.args.map(x => this.expr(x)));
            if (word) return `(${word})`;
            this.warn(`unknown _robotlab.${call.method} in expression`);
            return '""';
        }
        return callExpr.call(this, node);
    };
    proto.exprStmt = function (eRaw, indent) {
        const e = eRaw && eRaw.type === 'Await' ? eRaw.value : eRaw;
        const call = asLab(e);
        if (call) {
            const word = robotLabCallToPseudo(call.method, call.args.map(x => this.expr(x)));
            if (word) return [this.pad(indent) + word];
            this.warn(`unknown _robotlab.${call.method}`);
            return [];
        }
        return exprStmt.call(this, eRaw, indent);
    };
    proto.program = function (ast) {
        // The hats' registrations are read first (the emitter writes them after the handlers).
        this.labHats = new Map();
        const body = ast.body.filter(statement => {
            const reg = labRegistration(this, statement);
            if (!reg) return true;
            if (reg.header) this.labHats.set(reg.fn, reg.header);
            else this.warn('unknown Robot Lab event');
            return false;
        });
        return program.call(this, {...ast, body});
    };
    proto.resolveHat = function (name, args) {
        return (this.labHats && this.labHats.get(name)) || resolveHat.call(this, name, args);
    };
    proto[LIFT] = true;
    return true;
};
installRobotLabReaders();

/** The Code tab's Python reader: the vendored one, with the Robot Lab lift installed. */
export const readPython = source => pythonToPseudocode(source);

/** The Code tab's JavaScript reader: the vendored one, with the Robot Lab lift installed. */
export const readJavaScript = source => javascriptToPseudocode(source);

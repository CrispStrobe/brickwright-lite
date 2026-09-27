/**
 * What the two MakeCode translators share: the walk, not the vocabulary.
 *
 * micro:bit and Arcade are different machines with different block sets,
 * but the SHAPE of the translation is identical — the same expression
 * tree, the same control flow, the same "an unmapped call is reported,
 * never dropped" rule, and above all the same slot discipline, which is
 * a property of the pseudocode GRAMMAR rather than of any one device:
 *
 *   single-token — `radio send number X`, `change score by X`: captured
 *       as \S+, so a variable fits and `i * 30` does not. Hoisted.
 *   literal-only — `show text "..."`, `plot x 2 y 3`: the parser reads
 *       the characters. An expression cannot be said at all, so it is
 *       reported.
 *   condition-lowered — `set pin P0 to 0|1`: only two literals parse,
 *       so a computed value becomes the IF/ELSE it really is.
 *
 * Subclasses supply the two halves that ARE the vocabulary: `command()`
 * for calls that do something, `callExpression()` for calls that report
 * something, plus `enumToken()` for their own enums.
 *
 * @module
 */

/**
 * 180/pi, to five places. The pseudocode has no pi of its own without
 * pulling in an extension, and a literal is exact enough for an angle
 * a game is about to round to a pixel.
 */
const RADIANS_TO_DEGREES = '57.29578';

/**
 * The core grammar has no bitwise operators, but the bundled `bitops`
 * extension does, and the pseudocode spells them as words. Mapping to
 * those beats the alternative: `set x to x & 255` parses to a
 * set-variable block with NO VALUE AT ALL — silently, which is the one
 * outcome this translator exists to prevent.
 */
const BITWISE = {
    '&': 'bitand', '|': 'bitor', '^': 'bitxor',
    '<<': 'shiftleft', '>>': 'shiftright',
    // JavaScript's `>>>` is the unsigned shift; the extension has only the
    // signed one. They agree on every non-negative value, which is every
    // value a MakeCode program shifting a pixel mask or a colour byte has.
    '>>>': 'shiftright'
};

/**
 * Names that are NOT a variable in the pseudocode, however you spell them.
 *
 * `set x to 7` compiles to `motion_setx` — the Scratch MOTION block — and
 * `change x by 1` to `motion_changexby`, case-insensitively. A MakeCode
 * program with `let x = 0` therefore moved a sprite instead of keeping a
 * number, silently and while compiling perfectly. `x` and `y` are the two
 * most ordinary names a program that draws on a 5x5 grid can have.
 *
 * Reads are fine (`show text x` reads the variable), so this is only about
 * where the name is WRITTEN.
 */
const NOT_A_VARIABLE = new Set(['x', 'y', 'size', 'volume', 'tempo']);

/** Trim a computed number to something a human would have typed. */
export const num = value => String(Math.round(value * 1000) / 1000);

/** The statements inside a function-expression argument. */
export const bodyOf = node => (node && node.type === 'FunctionExpression' ? node.body : []);

const isEmptyString = node => !!node && node.type === 'String' && node.value === '';

/** `(…)` whose first parenthesis closes at the very end: already one operand. */
const wrapped = value => {
    if (!value.startsWith('(') || !value.endsWith(')')) return false;
    let depth = 0;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        else if (value[i] === ')' && --depth === 0) return i === value.length - 1;
    }
    return false;
};

/** ` — it calls a.b(), c()` for a construct refused whole, or '' when it calls nothing. */
const callList = calls => (calls && calls.length ? ` — not translated; it calls ${calls.map(c => `${c}()`).join(', ')}` : '');

/** `c ? 1 : 0` (or true/false) — a truth value written as a number. */
const isOneZero = node => {
    const lit = (n, v) => n && ((n.type === 'Number' && Number(n.value) === v) || (n.type === 'Boolean' && n.value === !!v));
    return lit(node.consequent, 1) && lit(node.alternate, 0);
};

/** An expression whose value is true/false: a comparison, a logical, a negation. */
const isTruthValue = node => !!node && (
    (node.type === 'Binary' && ['==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||'].includes(node.op)) ||
    (node.type === 'Unary' && node.op === '!'));

export class BaseTranslator {
    constructor () {
        this.enums = new Map();          // user `enum X {}` → {member: value}
        this.functions = [];             // DEFINE blocks, hoisted
        this.unsupported = [];
        this.declared = new Set();
        this.temps = 0;
        this.usesBitops = false;      // the `bitops` extension is needed
        this.usesArrays = false;      // the `arrays` extension is needed
        this.arrays = new Set();      // names known to hold an array
    }

    /**
     * Every name the program itself uses, so a rename cannot shadow one.
     * Called once, before the walk.
     */
    claimNames (node, seen = new Set()) {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (!this.taken) this.taken = new Set();
        if (typeof node.name === 'string') this.taken.add(node.name);
        // Variables that hold TEXT, so `+` on them joins: `time = time +
        // minutes` after `let time = ""` is a string, and as operator_add it
        // added "12:" to a number. Known text on the right makes the name text.
        if (!this.textVars) this.textVars = new Set();
        const holds = (name, value) => { if (name && this.isText(value)) this.textVars.add(name); };
        if (node.type === 'Declaration') for (const d of node.decls || []) holds(d.name, d.init);
        if (node.type === 'Assignment' && node.op === '=' && node.left && node.left.type === 'Identifier') holds(node.left.name, node.right);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(v => this.claimNames(v, seen));
            else if (value && typeof value === 'object') this.claimNames(value, seen);
        }
    }

    /**
     * The pseudocode name for a MakeCode variable.
     *
     * Renaming is a last resort — the reader should see the names they
     * wrote — so it happens only for the handful the grammar takes for
     * itself, and the new name is the old one with as little added as
     * possible, extended again if the program already used it.
     */
    varName (name) {
        const original = String(name);
        if (!NOT_A_VARIABLE.has(original.toLowerCase())) return original;
        if (!this.renamed) this.renamed = new Map();
        if (this.renamed.has(original)) return this.renamed.get(original);
        let renamed = `${original}_`;
        while (this.taken && this.taken.has(renamed)) renamed += '_';
        this.renamed.set(original, renamed);
        // NOT a refusal — the variable is fully supported, it just cannot
        // keep its name. It is announced once at the top of the program
        // rather than counted among the things we could not do.
        return renamed;
    }

    /** Lines explaining any renames, for the top of the program. */
    renameNotes () {
        if (!this.renamed || !this.renamed.size) return [];
        return [...this.renamed].map(([from, to]) =>
            `# "${from}" is written as "${to}" here: the pseudocode reads a bare ` +
            `"${from}" as a Scratch block, not as a variable.`);
    }

    note (what, line) {
        this.unsupported.push(what);
        return `# unsupported: ${what}${line ? ` (line ${line})` : ''}`;
    }

    // ── expressions ─────────────────────────────────────────────────────

    /** The dotted path of a member expression, or null. */
    path (node) {
        const parts = [];
        let cur = node;
        while (cur && cur.type === 'Member') {
            parts.unshift(cur.name);
            cur = cur.object;
        }
        if (!cur || cur.type !== 'Identifier') return null;
        parts.unshift(cur.name);
        return parts.join('.');
    }

    expr (node) {
        if (!node) return '0';
        switch (node.type) {
        case 'Number': {
            const v = node.value;
            if (/^0[xX]/.test(v)) return String(parseInt(v, 16));
            if (/^0[bB]/.test(v)) return String(parseInt(v.slice(2), 2));
            return v;
        }
        case 'String': return `"${node.value.replace(/\\n/g, ' ')}"`;
        // A VALUE: the dialect's truth is 1 and 0 (its conditions read a
        // variable as `not (v = 0)`), so `let A = false` is `set A to 0`.
        // The word `false` here became the string "false" on the way back out,
        // which MakeCode refuses to assign to a number (census 2026-09-25).
        // In a condition, condition() below keeps true/false.
        case 'Boolean': return node.value ? '1' : '0';
        case 'Null': return '0';
        case 'Identifier':
            // A handler's parameter that IS a reporter here (radio's
            // receivedNumber inside onReceivedNumber) reads as that reporter.
            if (this.aliases && this.aliases.has(node.name)) return this.aliases.get(node.name);
            return this.varName(node.name);
        case 'Unary':
            if (node.op === '!') return `not (${this.condition(node.argument)})`;
            // Parenthesised, and not optionally: `maxSpeed * -cos(a)` written
            // as `maxSpeed * 0 - cos(a)` is `(maxSpeed*0) - cos(a)`, which
            // runs and is wrong.
            if (node.op === '-') return `(0 - ${this.expr(node.argument)})`;
            if (node.op === '~') {
                this.usesBitops = true;
                return `(bitnot ${this.expr(node.argument)})`;
            }
            return this.expr(node.argument);
        case 'Binary': {
            const op = node.op;
            if (op === '&&') return `(${this.condition(node.left)}) and (${this.condition(node.right)})`;
            if (op === '||') return `(${this.condition(node.left)}) or (${this.condition(node.right)})`;
            if (op === '==' || op === '===') return `${this.expr(node.left)} = ${this.expr(node.right)}`;
            if (op === '!=' || op === '!==') return `not (${this.expr(node.left)} = ${this.expr(node.right)})`;
            if (op === '<=') return `not (${this.expr(node.left)} > ${this.expr(node.right)})`;
            if (op === '>=') return `not (${this.expr(node.left)} < ${this.expr(node.right)})`;
            if (op === '%') return `${this.expr(node.left)} mod ${this.expr(node.right)}`;
            // `+` with text on either side is concatenation, and the dialect
            // spells that `join`: written as `+` it became operator_add, which
            // adds " " + pi as NUMBERS. `("" + a + b)` is how the export writes
            // `a join b`, so that shape reads back as exactly that join (a
            // round trip stays a fixed point); a lone `"" + x` keeps its "",
            // because it is what makes x text.
            if (op === '+' && (this.isText(node.left) || this.isText(node.right))) {
                const l = node.left;
                if (l.type === 'Binary' && l.op === '+' && isEmptyString(l.left)) {
                    return `(${this.joinOperand(l.right)} join ${this.joinOperand(node.right)})`;
                }
                return `(${this.joinOperand(l)} join ${this.joinOperand(node.right)})`;
            }
            if (BITWISE[op]) {
                this.usesBitops = true;
                if (op === '>>>') this.needsBitopsNote = true;
                return `(${this.expr(node.left)} ${BITWISE[op]} ${this.expr(node.right)})`;
            }
            return `${this.expr(node.left)} ${op} ${this.expr(node.right)}`;
        }
        case 'Member': {
            // `Math.PI` is a constant, and a game that computes a bounce
            // angle wants the number, not a variable called PI.
            if (node.object && node.object.type === 'Identifier' &&
                node.object.name === 'Math' && node.name === 'PI') return '3.14159';
            const arrayLength = node.name === 'length' && this.arrayName(node.object);
            if (arrayLength) return `length of ${this.arrayRef(arrayLength)}`;
            // A property read on a CALL (`a.filter(…).length`) must still
            // evaluate the call, or its refusal never happens and the
            // property name alone is emitted as if it were a variable.
            if (node.object && node.object.type === 'Call') {
                const inner = this.expr(node.object);
                if (node.name === 'length') return `length of ${inner}`;
                this.unsupported.push(`.${node.name} of a call result`);
                return inner;
            }
            const token = this.enumToken(node);
            if (token !== null) return /^-?\d+$/.test(token) ? token : `"${token}"`;
            return node.name;                            // a bare property read
        }
        case 'Index': {
            const name = this.arrayName(node.object);
            if (name) return `item ${this.expr(node.index)} of ${this.arrayRef(name)}`;
            // The index is dropped with the indexing, so the calls in it are named too.
            this.unsupported.push(`indexing something that is not an array${callList(this.callsIn(node.index))}`);
            return this.expr(node.object);
        }
        case 'Call': return this.callExpression(node);
        // `c ? 1 : 0` of a reporter that is already a truth value is that
        // reporter (the export writes a boolean reporter in a value slot that
        // way). Any other `? :` in the middle of an expression has no value
        // form here; a whole assignment of one is lowered by assign().
        case 'Conditional':
            if (isOneZero(node)) {
                const bool = this.condition(node.test);
                if (this.isBooleanValue(bool) && !/^not /.test(bool)) return bool;
            }
            this.unsupported.push('a ? b : c inside an expression');
            return this.expr(node.consequent);
        case 'Template': return '"(image)"';
        // An object literal is opaque here; say so, with the calls it made.
        case 'Object':
            this.unsupported.push(`an object literal${callList(node.calls)}`);
            return '0';
        default:
            this.unsupported.push(`${node.type || 'an expression'} as a value`);
            return '0';
        }
    }

    /** An expression used where a boolean is expected. */
    condition (node) {
        if (!node) return 'false';
        if (node.type === 'Binary' || node.type === 'Unary') return this.expr(node);
        if (node.type === 'Boolean') return node.value ? 'true' : 'false';
        const value = this.expr(node);
        if (this.isBooleanValue(value)) return value;
        if (/^(not |\()|( = | > | < | and | or )/.test(value)) return value;
        // A bare number or variable in a condition means "non-zero".
        return `not (${value} = 0)`;
    }

    /**
     * `set target to value`, when value HAS a value form. A truth value does
     * not: `set b to x > 100` parses as the TEXT "x > 100", and the program
     * then tests a string that is never 0 (census 2026-09-27: five of
     * MakeCode's apps). The dialect's truth is 1 and 0, so a comparison or a
     * `? :` is written as the choice it is — the same lowering
     * `pins.digitalWritePin(p, <computed>)` already gets.
     */
    assign (target, value, indent, out) {
        const pad = '  '.repeat(indent);
        const node = value && value.type === 'Conditional' && isOneZero(value) &&
            this.isBooleanValue(this.condition(value.test)) && !/^not /.test(this.condition(value.test)) ? null : value;
        if (node && node.type === 'Conditional') {
            out.push(`${pad}IF ${this.condition(node.test)} THEN:`);
            this.assign(target, node.consequent, indent + 1, out);
            out.push(`${pad}ELSE:`);
            this.assign(target, node.alternate, indent + 1, out);
            return;
        }
        if (node && isTruthValue(node)) {
            out.push(`${pad}IF ${this.condition(node)} THEN:`, `${pad}  set ${target} to 1`,
                `${pad}ELSE:`, `${pad}  set ${target} to 0`);
            return;
        }
        out.push(`${pad}set ${target} to ${this.expr(value)}`);
    }

    /**
     * An argument in a slot bounded by the next keyword: bare when it is
     * one token, parenthesised otherwise, so `map a + 1 from low …` cannot
     * be read as `(map a) + 1` and `abs of (a - b)` is not |a| - b.
     */
    operand (node) {
        const value = this.expr(node);
        return /^[^\s()]+$/.test(value) || wrapped(value) ? value : `(${value})`;
    }

    /** The dotted names of every call inside an expression. */
    callsIn (node, out = new Set()) {
        if (!node || typeof node !== 'object') return [...out];
        if (node.type === 'Call') {
            const name = this.path(node.callee);
            if (name) out.add(name);
        }
        for (const v of Object.values(node)) {
            if (Array.isArray(v)) v.forEach(x => this.callsIn(x, out));
            else if (v && typeof v === 'object') this.callsIn(v, out);
        }
        return [...out];
    }

    /** Is this expression text (so `+` on it concatenates)? */
    isText (node) {
        if (!node) return false;
        if (node.type === 'String' || node.type === 'Template') return true;
        if (node.type === 'Identifier') return !!(this.textVars && this.textVars.has(node.name));
        if (node.type === 'Binary' && node.op === '+') return this.isText(node.left) || this.isText(node.right);
        if (node.type === 'Call') {
            const name = this.path(node.callee);
            return /(^|\.)(convertToText|toString|substr|charAt|join)$/.test(name || '') ||
                /^(radio\.receivedString|control\.deviceName)$/.test(name || '');
        }
        return false;
    }

    /** One side of a join: a nested join or a literal stays bare, anything else is parenthesised. */
    joinOperand (node) {
        if (node && node.type === 'String') return this.expr(node);
        return this.operand(node);
    }

    // ── argument slots ──────────────────────────────────────────────────
    //
    // The pseudocode parser is not uniformly permissive, and the shape of
    // each slot decides what we may emit. Three kinds, learned by probing
    // the real parser rather than assumed:
    //
    //   single-token — `radio send number X`, `set pin P1 analog X %`:
    //       captured as \S+, so a variable is fine but `i * 30` is not.
    //       An expression is hoisted into a temporary first.
    //   literal-only — `show text "..."`, `plot x 2 y 3`: the parser reads
    //       the characters themselves. An expression cannot be expressed
    //       at all, so it is reported rather than silently dropped.
    //   condition-lowered — `set pin P0 to 0|1`: only the two literals
    //       parse, so a computed level becomes an IF/ELSE over both.

    /** A slot that takes one token: hoist anything with a space in it. */
    single (node, out, pad) {
        // A truth value has no value form, so it is hoisted as the choice it
        // is (see assign()) — `set _mc2 to i < n` stored the TEXT "i < n".
        const value = isTruthValue(node) ? null : this.expr(node);
        if (value !== null && /^\S+$/.test(value)) return value;
        const name = `_mc${++this.temps}`;
        this.assign(name, node, pad.length / 2, out);
        this.declared.add(name);
        return name;
    }

    /** The literal text of a string argument, or null if it is computed. */
    literalString (node) {
        if (!node) return null;
        if (node.type === 'String') return node.value.replace(/\\n/g, ' ').replace(/"/g, '');
        if (node.type === 'Number') return String(node.value);
        return null;
    }

    /** A plain non-negative integer, or null. */
    literalNumber (node) {
        if (node && node.type === 'Number' && /^\d+$/.test(node.value)) return node.value;
        return null;
    }

    // ── statements ──────────────────────────────────────────────────────

    /**
     * @param {Array} body statements
     * @param {number} indent nesting level
     * @param {Array<string>} out lines are appended here
     */
    block (body, indent, out) {
        for (const st of body) this.statement(st, indent, out);
        if (!body.length) out.push(`${'  '.repeat(indent)}# (empty)`);
    }

    /**
     * Emit one statement, and make sure anything its EXPRESSIONS could
     * not translate is visible in the output too.
     *
     * A command with no mapping writes its own `# unsupported:` line. A
     * reporter with no mapping cannot — it is in the middle of a
     * condition — so this wrapper notices the list grew and puts the
     * reason above the statement it belongs to.
     */
    statement (st, indent, out) {
        const before = this.unsupported.length;
        const mark = out.length;
        this.statementInner(st, indent, out);
        const added = this.unsupported.slice(before);
        if (added.length && !out.slice(mark).some(line => line.includes('# unsupported'))) {
            out.splice(mark, 0, ...added.map(what => `${'  '.repeat(indent)}# unsupported: ${what}`));
        }
    }

    statementInner (st, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);
        if (!st) return;

        switch (st.type) {
        case 'Declaration':
            for (const d of st.decls) {
                this.declared.add(d.name);
                if (d.init && d.init.type === 'FunctionExpression') {
                    this.functions.push({name: d.name, params: d.init.params, body: d.init.body});
                    continue;
                }
                if (d.isArray || (d.init && d.init.type === 'Array')) {
                    this.declareArray(d.name, d.init, push);
                    continue;
                }
                if (d.init) this.assign(this.varName(d.name), d.init, indent, out);
                else push(`set ${this.varName(d.name)} to 0`);
            }
            return;

        case 'ExpressionStatement':
            this.expressionStatement(st.expr, indent, out);
            return;

        case 'If':
            push(`IF ${this.condition(st.test)} THEN:`);
            this.block(st.consequent, indent + 1, out);
            if (st.alternate && st.alternate.length) {
                push('ELSE:');
                this.block(st.alternate, indent + 1, out);
            }
            return;

        case 'While':
            if (st.test && st.test.type === 'Boolean' && st.test.value) {
                push('FOREVER:');
                this.block(st.body, indent + 1, out);
                return;
            }
            push(`REPEAT UNTIL not (${this.condition(st.test)}):`);
            this.block(st.body, indent + 1, out);
            return;

        case 'For': {
            // `for (let i = 0; i < N; i++)` — the only shape MakeCode
            // emits — becomes an explicit counter, because our REPEAT
            // takes a count and not a condition-with-a-variable.
            const counter = st.init && st.init.type === 'Declaration' ? st.init.decls[0] : null;
            // `for (let i = 0; i < N; i++)` whose body never reads i IS our
            // `REPEAT N` — and it is what the export writes for REPEAT, so reading
            // it back as REPEAT keeps a round trip a fixed point (it drifted into
            // a manual counter with a double negation before).
            const isCount = counter && counter.init && counter.init.type === 'Number' && Number(counter.init.value) === 0 &&
                st.test && st.test.type === 'Binary' && st.test.op === '<' &&
                st.test.left && st.test.left.type === 'Identifier' && st.test.left.name === counter.name &&
                st.update && st.update.type === 'Update' && st.update.op === '++' &&
                st.update.argument && st.update.argument.name === counter.name &&
                !JSON.stringify(st.body).includes(`"name":${JSON.stringify(counter.name)}`) &&
                !JSON.stringify(st.test.right).includes(`"name":${JSON.stringify(counter.name)}`);
            if (isCount) {
                push(`REPEAT ${this.expr(st.test.right)}:`);
                this.block(st.body, indent + 1, out);
                return;
            }
            if (counter) {
                this.declared.add(counter.name);
                push(`set ${this.varName(counter.name)} to ${counter.init ? this.expr(counter.init) : '0'}`);
            }
            push(`REPEAT UNTIL not (${this.condition(st.test)}):`);
            this.block(st.body, indent + 1, out);
            if (st.update) this.statement({type: 'ExpressionStatement', expr: st.update}, indent + 1, out);
            return;
        }

        case 'FunctionDeclaration':
            this.functions.push({name: st.name, params: st.params, body: st.body});
            return;

        case 'Enum':
            this.enums.set(st.name, Object.fromEntries(st.members.map(m => [m.name, m.value])));
            return;

        case 'Namespace':
            // `namespace SpriteKind { ... }` and friends: the bodies are
            // constant definitions, which our variables cover.
            this.block(st.body, indent, out);
            return;

        case 'Block':
            this.block(st.body, indent, out);
            return;

        // A class has behaviour we cannot express; it is refused BY NAME, with
        // the MakeCode calls inside it, so none of them disappears unsaid.
        case 'Class':
            push(this.note(`class ${st.name || ''}${callList(st.calls)}`.replace(/ +/g, ' ')));
            return;

        case 'Return':
            push(this.note('return from a function'));
            return;

        case 'Break':
        case 'Continue':
            push(this.note(`${st.type.toLowerCase()} inside a loop`));
            return;

        default:
            push(this.note(st.type));
        }
    }

    expressionStatement (expr, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);

        if (expr.type === 'Assignment') {
            if (expr.op === '=' && expr.left.type === 'Index') {
                const name = this.arrayName(expr.left.object);
                if (name) {
                    push(`set item ${this.expr(expr.left.index)} of ${this.arrayRef(name)} ` +
                        `to ${this.expr(expr.right)}`);
                    return;
                }
            }
            if (expr.op === '=' && expr.left.type === 'Identifier' && expr.right.type === 'Array') {
                this.declareArray(expr.left.name, expr.right, push);
                return;
            }
            const target = expr.left.type === 'Identifier' ?
                this.varName(expr.left.name) : this.expr(expr.left);
            this.declared.add(target);
            if (expr.op === '=') this.assign(target, expr.right, indent, out);
            else if (expr.op === '+=') push(`change ${target} by ${this.expr(expr.right)}`);
            else if (expr.op === '-=') push(`change ${target} by 0 - ${this.expr(expr.right)}`);
            else push(`set ${target} to ${target} ${expr.op[0]} ${this.expr(expr.right)}`);
            return;
        }
        if (expr.type === 'Update') {
            const target = expr.argument.type === 'Identifier' ?
                this.varName(expr.argument.name) : this.expr(expr.argument);
            push(`change ${target} by ${expr.op === '++' ? '1' : '0 - 1'}`);
            return;
        }
        if (expr.type === 'Call') {
            this.command(expr, indent, out);
            return;
        }
        push(this.note(`${expr.type} statement`));
    }

    /**
     * A member expression naming an enum member, resolved to the token
     * our vocabulary uses. Subclasses add their device's enums; user
     * `enum` declarations are handled here for both.
     */
    enumToken (node) {
        if (!node || node.type !== 'Member') return null;
        const owner = node.object;
        if (!owner || owner.type !== 'Identifier') return null;
        const user = this.enums.get(owner.name);
        if (user && user[node.name] !== undefined) return String(user[node.name]);
        return null;
    }

    /** Reporter calls. Subclasses override; the base knows only maths. */

    // ── arrays ──────────────────────────────────────────────────────────
    //
    // MakeCode arrays map to the bundled `arrays` extension rather than to
    // Scratch lists, for one decisive reason: the extension indexes from 0,
    // exactly as TypeScript does. Lists index from 1, so every `a[i]` would
    // need a +1 that is invisible in the resulting blocks — and any index
    // the program computed would be silently off by one.

    /** Is this expression a reference to an array we know about? */
    arrayName (node) {
        if (!node || node.type !== 'Identifier') return null;
        return this.arrays.has(node.name) ? node.name : null;
    }

    /** The array a `.push`/`.length`/`a[i]` is reaching into, or null. */
    arrayOf (node) {
        return node ? this.arrayName(node.object) : null;
    }

    /** `array "name"`, the way every rule in the grammar spells it. */
    arrayRef (name) {
        this.usesArrays = true;
        return `array "${name}"`;
    }

    /** Register a name as an array and emit its declaration. */
    declareArray (name, init, push) {
        this.arrays.add(name);
        this.declared.add(name);
        this.usesArrays = true;
        const items = init && init.type === 'Array' ? init.items || [] : [];
        // `new array "a" = [1,2,3]` takes JSON, so only a literal-valued
        // initialiser can ride along; anything computed is pushed after.
        const literals = items.map(i => this.expr(i));
        if (literals.length && literals.every(v => /^(-?\d+(\.\d+)?|"[^"]*")$/.test(v))) {
            push(`new ${this.arrayRef(name)} = [${literals.join(', ')}]`);
            return;
        }
        push(`new ${this.arrayRef(name)}`);
        for (const item of items) push(`push ${this.expr(item)} to ${this.arrayRef(name)}`);
    }

    /** An array method used as a value, or null if it is not one. */
    arrayValue (node) {
        const name = this.arrayOf(node.callee);
        if (!name) return null;
        const ref = this.arrayRef(name);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);
        switch (node.callee.name) {
        case 'pop': return `pop from ${ref}`;
        case 'get': return `item ${arg(0)} of ${ref}`;
        case 'indexOf': return `index of ${arg(0)} in ${ref}`;
        case 'find':
        case 'filter':
        case 'map':
        case 'some':
        case 'every':
            // These take a callback. The extension's own map/filter want a
            // named function, and inlining an arrow here would invent a
            // name the project does not have.
            this.unsupported.push(`${node.callee.name}() on an array — it takes a function`);
            return '0';
        case 'reverse': return `reverse of ${ref}`;
        case 'slice': return a.length === 2 ? `slice of ${ref} from ${arg(0)} to ${arg(1)}` : null;
        case 'join': return `${ref} as text`;
        default: return null;
        }
    }

    /** An array method used as a statement, or false if it is not one. */
    arrayCommand (node, push) {
        const name = this.arrayOf(node.callee);
        if (!name) return false;
        const ref = this.arrayRef(name);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);
        switch (node.callee.name) {
        case 'push': push(`push ${arg(0)} to ${ref}`); return true;
        case 'insertAt': push(`insert ${arg(1)} at ${arg(0)} of ${ref}`); return true;
        case 'set': push(`set item ${arg(0)} of ${ref} to ${arg(1)}`); return true;
        case 'removeAt': push(`remove item ${arg(0)} of ${ref}`); return true;
        // `shift()` removes the first element; as a statement the removed
        // value is discarded, which is exactly `remove item 0`.
        case 'shift': push(`remove item 0 of ${ref}`); return true;
        case 'pop': push(`pop from ${ref}`); return true;
        case 'removeElement': push(`remove item (index of ${arg(0)} in ${ref}) of ${ref}`); return true;
        case 'sort': push(`sort of ${ref} ascending`); return true;
        default: return false;
        }
    }

    callExpression (node) {
        const arrayValue = this.arrayValue(node);
        if (arrayValue !== null) return arrayValue;
        const name = this.path(node.callee);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);
        switch (name) {
        case 'Math.randomRange':
        case 'randint': return `pick random ${arg(0)} to ${arg(1)}`;
        case 'Math.random': return 'pick random 0 to 1';
        // `abs of` and friends bind TIGHTER than the operators, so a compound
        // argument is parenthesised: `abs of a - b` is |a| - b.
        case 'Math.abs': return `abs of ${this.operand(a[0])}`;
        case 'Math.floor': return `floor of ${this.operand(a[0])}`;
        case 'Math.ceil': return `ceiling of ${this.operand(a[0])}`;
        case 'Math.sqrt': return `sqrt of ${this.operand(a[0])}`;
        case 'Math.round': return `round ${this.operand(a[0])}`;
        // Trigonometry, with the unit change spelled out: MakeCode's
        // Math.cos takes RADIANS and the block takes DEGREES, so the
        // argument is converted rather than quietly reinterpreted — a
        // bounce angle read as degrees when it meant radians is the kind
        // of wrong that still runs.
        case 'Math.cos': return `cos of ((${arg(0)}) * ${RADIANS_TO_DEGREES})`;
        case 'Math.sin': return `sin of ((${arg(0)}) * ${RADIANS_TO_DEGREES})`;
        case 'Math.tan': return `tan of ((${arg(0)}) * ${RADIANS_TO_DEGREES})`;
        case 'Math.atan': return `(atan of ${arg(0)}) / ${RADIANS_TO_DEGREES}`;
        case 'Math.asin': return `(asin of ${arg(0)}) / ${RADIANS_TO_DEGREES}`;
        case 'Math.acos': return `(acos of ${arg(0)}) / ${RADIANS_TO_DEGREES}`;
        case 'Math.log': return `ln of ${arg(0)}`;
        case 'Math.log10': return `log of ${arg(0)}`;
        case 'Math.exp': return `e ^ of ${arg(0)}`;
        // Planète Maths' reporters, which the dialect reads on every device.
        // These used to keep only their FIRST argument — Math.max(0, x - 1)
        // was 0 and Math.pow(2, n) was 2 — which runs and is wrong.
        case 'Math.pow': return `${this.operand(a[0])} to the power of ${this.operand(a[1])}`;
        case 'Math.min': return `min of ${this.operand(a[0])} and ${this.operand(a[1])}`;
        case 'Math.max': return `max of ${this.operand(a[0])} and ${this.operand(a[1])}`;
        // No map reporter off the micro:bit: written out as its definition,
        // which computes the same number, and named, because the way back is
        // arithmetic rather than Math.map.
        case 'Math.map': {
            this.unsupported.push('Math.map() — written out as its formula; it goes back to MakeCode as arithmetic');
            const [v, a0, b0, c0, d0] = [0, 1, 2, 3, 4].map(i => this.operand(a[i]));
            return `((${v} - ${a0}) * (${d0} - ${c0}) / (${b0} - ${a0}) + ${c0})`;
        }
        default:
            this.unsupported.push(`${name || 'call'}() as a value`);
            return '0';
        }
    }

    /** Values that are already true/false and must not be compared to 0. */
    isBooleanValue (value) {
        return /^(not )/.test(value);
    }

    /** Commands. Subclasses override; the base can only report. */
    command (node, indent, out) {
        if (this.arrayCommand(node, line => out.push(`${'  '.repeat(indent)}${line}`))) return;
        const name = this.path(node.callee);
        const fn = name && this.functions.find(f => f.name === name);
        if (fn) {
            // `zeigen(3)` used to become `zeigen` — the arguments were
            // dropped, and the function ran on whatever its parameters
            // happened to hold. A call is matched TOKEN BY TOKEN against
            // the DEFINE's template, so each argument has to be one token,
            // which is what single() guarantees.
            const pad = '  '.repeat(indent);
            const args = (node.args || []).map(arg => this.single(arg, out, pad));
            out.push(`${pad}${[name, ...args].join(' ')}`);
            return;
        }
        out.push(`${'  '.repeat(indent)}${this.note(`${name || 'call'}()`)}`);
    }
}

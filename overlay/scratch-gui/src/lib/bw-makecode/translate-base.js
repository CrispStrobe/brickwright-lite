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

/**
 * Function names that the pseudocode reads as one of its own statements, not
 * as a call of the program's procedure (probed against sb3-creator's parser:
 * `show`, `hide`, `clear` alone; `say`, `think`, `display`, `print`, `scroll`,
 * `broadcast` with an argument).
 */
const PROCEDURE_WORDS = new Set(['show', 'hide', 'clear', 'say', 'think', 'display', 'print', 'scroll', 'broadcast']);

/** Trim a computed number to something a human would have typed. */
export const num = value => String(Math.round(value * 1000) / 1000);

/** The statements inside a function-expression argument. */
export const bodyOf = node => (node && node.type === 'FunctionExpression' ? node.body : []);

/** Arithmetic binding strength, for side(): `*` `/` `%` bind tighter than `+` `-`. */
const ARITH = {'*': 2, '/': 2, '%': 2, '+': 1, '-': 1};

const isEmptyString = node => !!node && node.type === 'String' && node.value === '';

/**
 * Does this statement list `break` out of THE loop it is in — not out of a
 * loop nested inside it, whose break is its own?
 */
const breaks = body => {
    let found = false;
    const walk = node => {
        if (found || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node.type === 'Break') {
            found = true;
            return;
        }
        // A `break` inside a switch leaves the switch (switchStatement), not the loop.
        if (['While', 'For', 'ForOf', 'Switch', 'FunctionExpression', 'FunctionDeclaration'].includes(node.type)) return;
        for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(body);
    return found;
};

/** Is anything assigned to a member of `name` (`name.k = …`, `name.k++`)? */
const writesMember = (ast, name) => {
    let found = false;
    const isIt = n => n && n.type === 'Member' && n.object && n.object.type === 'Identifier' && n.object.name === name;
    const walk = node => {
        if (found || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if ((node.type === 'Assignment' && isIt(node.left)) || (node.type === 'Update' && isIt(node.argument)) ||
            (node.type === 'Assignment' && node.left && node.left.type === 'Identifier' && node.left.name === name)) {
            found = true;
            return;
        }
        for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(ast);
    return found;
};

/** Does this body `return` (not counting functions nested in it)? */
const returnsAnywhere = body => {
    let found = false;
    const walk = node => {
        if (found || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node.type === 'Return') {
            found = true;
            return;
        }
        if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') return;
        for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(body);
    return found;
};

/** `game.createSprite(…)` */
const isCreateSprite = (node, t) => !!node && node.type === 'Call' && t.path(node.callee) === 'game.createSprite';

/** Does this case body `break` anywhere but its end (which switchStatement has already dropped)? */
const switchBreaks = body => breaks(body);

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

/** A value that says `of` (an array item, a letter), parenthesised unless it already is one group. */
const ofGuard = value => (/\sof\s/.test(value) && !wrapped(value) ? `(${value})` : value);

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

    /**
     * A procedure's name, when the program's function name is also a
     * statement of the dialect: `show` alone is Scratch's `show` block, so
     * gameofLife's `function show()` was CALLED as looks_show and never ran.
     * Measured against sb3-creator's parser (a bare name, and the name with
     * one argument, that did not come out as a procedure call).
     */
    procName (name) {
        if (!PROCEDURE_WORDS.has(String(name).toLowerCase())) return name;
        let renamed = `${name}_`;
        while (this.taken && this.taken.has(renamed)) renamed += '_';
        if (this.taken) this.taken.add(renamed);
        if (!this.renamedProcs) this.renamedProcs = new Map();
        this.renamedProcs.set(name, renamed);
        return renamed;
    }

    /** Lines explaining any renames, for the top of the program. */
    renameNotes () {
        return [...(this.renamed || [])].map(([from, to]) =>
            `# "${from}" is written as "${to}" here: the pseudocode reads a bare ` +
            `"${from}" as a Scratch block, not as a variable.`).concat([...(this.renamedProcs || [])].map(([from, to]) =>
            `# the function "${from}" is written as "${to}" here: the pseudocode reads "${from}" as a Scratch block, ` +
            'not as a call of the function.'));
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
            // An operand that says `of` (`item a of array "P_x"`) is
            // parenthesised: two of them side by side were read as ONE item
            // whose index ran to the second (`item a of array "P_x" + item b`).
            const e = n => ofGuard(this.expr(n));
            if (op === '&&') return `(${this.condition(node.left)}) and (${this.condition(node.right)})`;
            if (op === '||') return `(${this.condition(node.left)}) or (${this.condition(node.right)})`;
            if (op === '==' || op === '===') return `${e(node.left)} = ${e(node.right)}`;
            if (op === '!=' || op === '!==') return `not (${e(node.left)} = ${e(node.right)})`;
            if (op === '<=') return `not (${e(node.left)} > ${e(node.right)})`;
            if (op === '>=') return `not (${e(node.left)} < ${e(node.right)})`;
            if (op === '%') return `${this.side(node.left, op, false)} mod ${this.side(node.right, op, true)}`;
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
                return `(${e(node.left)} ${BITWISE[op]} ${e(node.right)})`;
            }
            if (ARITH[op]) return `${this.side(node.left, op, false)} ${op} ${this.side(node.right, op, true)}`;
            return `${e(node.left)} ${op} ${e(node.right)}`;
        }
        case 'Member': {
            // A record's field, and an entry of a constant table.
            const field = this.recordMember(node);
            if (field !== null) return field;
            const constant = this.resolveConst(node);
            if (constant !== node) return this.expr(constant);
            // `Math.PI` is a constant, and a game that computes a bounce
            // angle wants the number, not a variable called PI.
            if (node.object && node.object.type === 'Identifier' &&
                node.object.name === 'Math' && node.name === 'PI') return '3.14159';
            const arrayLength = node.name === 'length' && this.arrayName(node.object);
            if (arrayLength) return `length of ${this.arrayRef(arrayLength)}`;
            // A text's length (`code.length`) — it came out as a variable
            // called `length`.
            if (node.name === 'length' && this.isText(node.object)) return `length of ${this.operand(node.object)}`;
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
            // A character of a text: `letter` counts from 1, TypeScript from 0.
            if (this.isText(node.object)) {
                const k = node.index;
                // `s[n - 1]` is how the export writes `letter n of s`: read back as that.
                let i = k && k.type === 'Number' && /^\d+$/.test(k.value) ? String(Number(k.value) + 1) :
                    k && k.type === 'Binary' && k.op === '-' && k.right.type === 'Number' && Number(k.right.value) === 1 ?
                        this.operand(k.left) : `(${this.expr(k)} + 1)`;
                // `letter X of S` is split at the first ` of `, so an index
                // that itself says `of` (a record field, an array item) is
                // read into a variable first.
                if (/\sof\s/.test(i) && this.pre) {
                    const t = `_mc${++this.temps}`;
                    this.declared.add(t);
                    this.pre.push(`set ${t} to ${i}`);
                    i = t;
                }
                return `letter ${i} of ${this.operand(node.object)}`;
            }
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
            // Anywhere else in a statement: the choice is made first, into a
            // variable, and the expression reads that (only the chosen branch
            // is evaluated, as in TypeScript). A loop's condition, tested on
            // every pass, has no "before", so there it stays refused.
            if (this.pre && !this.inLoopCondition) {
                const t = `_mc${++this.temps}`;
                this.declared.add(t);
                const lines = [];
                this.assign(t, node, 0, lines);
                this.pre.push(...lines);
                return t;
            }
            this.unsupported.push('a ? b : c inside an expression');
            return this.expr(node.consequent);
        case 'Template': return '"(image)"';
        // An object literal is opaque here; say so, with the calls it made.
        case 'Object':
            // An object literal of a record type (a declared variable, a
            // function's declared return): a new record with these fields.
            if (node.recordType && this.recordLowerable(node.recordType)) {
                const rt = this.recordTypes.get(node.recordType);
                const unknown = (node.props || []).filter(p => !rt.arrays.has(p.key));
                if (!unknown.length) return this.allocRecord(node.recordType, new Map(node.props.map(p => [p.key, p.value])), []);
            }
            this.unsupported.push(`an object literal${callList(node.calls)}`);
            return '0';
        default:
            // With the calls it made, so a call inside it is named, not lost.
            this.unsupported.push(`${node.type || 'an expression'} as a value${callList(this.callsIn(node))}`);
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
        // `target` is a variable's name, or a function that writes the line
        // for a value (a record's field: `set item h of array "P_x" to v`).
        const set = v => (typeof target === 'function' ? target(v) : `set ${target} to ${v}`);
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
            out.push(`${pad}IF ${this.condition(node)} THEN:`, `${pad}  ${set('1')}`,
                `${pad}ELSE:`, `${pad}  ${set('0')}`);
            return;
        }
        out.push(`${pad}${set(this.expr(value))}`);
    }

    /**
     * One operand of an arithmetic operator, parenthesised when the grouping
     * would otherwise change. The parser drops TypeScript's parentheses, and
     * writing `(a + b) * c` back as `a + b * c` computed a different number
     * without a word (census 2026-09-27: MakeCode's own seriesSum,
     * `(n * (n + 1)) / 2`, became `n * n + 1 / 2`).
     */
    side (child, parentOp, isRight) {
        const value = this.expr(child);
        if (!child || child.type !== 'Binary') return ofGuard(value);
        const mine = ARITH[child.op];
        if (!mine) return ['<', '>', '<=', '>=', '==', '===', '!=', '!=='].includes(child.op) ? `(${value})` : value;
        const theirs = ARITH[parentOp];
        const wrap = mine < theirs || (isRight && mine === theirs && ['-', '/', '%'].includes(parentOp));
        return wrap && !wrapped(value) ? `(${value})` : value;
    }

    /** A name nothing in the program uses yet, for a flag or counter we introduce. */
    freshName (base) {
        if (!this.taken) this.taken = new Set();
        let n = 1;
        while (this.taken.has(`${base}${n}`)) n++;
        const name = `${base}${n}`;
        this.taken.add(name);
        this.declared.add(name);
        return name;
    }

    /**
     * A loop's condition. A function called for its result cannot be hoisted
     * out of a condition that is tested on every pass, so there it is refused.
     */
    loopCondition (node) {
        const was = this.inLoopCondition;
        this.inLoopCondition = true;
        const cond = this.condition(node);
        this.inLoopCondition = was;
        return cond;
    }

    /**
     * A loop body that may `break`: statements after one that may break run
     * only while the flag is still 0.
     */
    breakBlock (body, indent, out, flag) {
        const was = this.breakFlag;
        this.breakFlag = flag;
        const emit = (list, level) => {
            for (let k = 0; k < list.length; k++) {
                this.statement(list[k], level, out);
                if (breaks([list[k]]) && k < list.length - 1) {
                    out.push(`${'  '.repeat(level)}IF ${flag} = 0 THEN:`);
                    emit(list.slice(k + 1), level + 1);
                    return;
                }
            }
        };
        emit(body, indent);
        if (!body.length) out.push(`${'  '.repeat(indent)}# (empty)`);
        this.breakFlag = was;
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
        // Where the walk is, for a statement that needs to know what follows it.
        if (!this.blockStack) this.blockStack = [];
        const frame = {body, i: 0};
        this.blockStack.push(frame);
        for (let i = 0; i < body.length; i++) {
            frame.i = i;
            this.statement(body[i], indent, out);
        }
        this.blockStack.pop();
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
        // A function called for its RESULT runs as its own line first, and
        // its result variable is read in its place (see callExpression). The
        // lines are this statement's own: a nested statement keeps its own.
        const outerPre = this.pre;
        this.pre = [];
        this.statementInner(st, indent, out);
        if (this.pre.length) out.splice(mark, 0, ...this.pre.map(line => `${'  '.repeat(indent)}${line}`));
        this.pre = outerPre;
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
                // A constant table is read where it is used (resolveConst).
                if (this.constObjects && this.constObjects.has(d.name)) continue;
                this.declared.add(d.name);
                if (d.init && d.init.type === 'FunctionExpression') {
                    this.functions.push({name: this.procName(d.name), source: d.name, params: d.init.params, body: d.init.body});
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

        case 'While': {
            const forever = st.test && st.test.type === 'Boolean' && st.test.value;
            if (breaks(st.body)) {
                // No `break` in the dialect: a flag the loop also tests, and
                // everything after a statement that may break runs only if it
                // did not.
                const flag = this.freshName('_brk');
                push(`set ${flag} to 0`);
                push(forever ? `REPEAT UNTIL ${flag} = 1:` :
                    `REPEAT UNTIL (${flag} = 1) or (not (${this.loopCondition(st.test)})):`);
                this.breakBlock(st.body, indent + 1, out, flag);
                return;
            }
            if (forever) {
                push('FOREVER:');
                this.block(st.body, indent + 1, out);
                return;
            }
            // `while (!(c))` is how the export writes `REPEAT UNTIL c`: read it
            // back as that, not as `not (not (c))`, which grew by one `not`
            // per round trip.
            if (st.test && st.test.type === 'Unary' && st.test.op === '!') {
                push(`REPEAT UNTIL ${this.loopCondition(st.test.argument)}:`);
                this.block(st.body, indent + 1, out);
                return;
            }
            push(`REPEAT UNTIL not (${this.loopCondition(st.test)}):`);
            this.block(st.body, indent + 1, out);
            return;
        }

        case 'ForOf': {
            // `for (let x of list)`: a counter over the list, which is what
            // MakeCode's for-of means for the arrays we carry.
            const name = this.arrayName(st.iterable);
            if (!name) {
                push(this.note(`for … of something that is not an array${callList(this.callsIn(st.iterable))}`));
                return;
            }
            const i = this.freshName('_i');
            const flag = breaks(st.body) ? this.freshName('_brk') : null;
            push(`set ${i} to 0`);
            if (flag) push(`set ${flag} to 0`);
            const more = `${i} < length of ${this.arrayRef(name)}`;
            push(flag ? `REPEAT UNTIL (${flag} = 1) or (not (${more})):` : `REPEAT UNTIL not (${more}):`);
            this.declared.add(st.name);
            out.push(`${pad}  set ${this.varName(st.name)} to item ${i} of ${this.arrayRef(name)}`);
            if (flag) this.breakBlock(st.body, indent + 1, out, flag);
            else this.block(st.body, indent + 1, out);
            out.push(`${pad}  change ${i} by 1`);
            return;
        }

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
            if (isCount && !breaks(st.body)) {
                push(`REPEAT ${this.expr(st.test.right)}:`);
                this.block(st.body, indent + 1, out);
                return;
            }
            if (counter) {
                this.declared.add(counter.name);
                push(`set ${this.varName(counter.name)} to ${counter.init ? this.expr(counter.init) : '0'}`);
            }
            if (breaks(st.body)) {
                const flag = this.freshName('_brk');
                push(`set ${flag} to 0`);
                push(`REPEAT UNTIL (${flag} = 1) or (not (${this.loopCondition(st.test)})):`);
                this.breakBlock(st.body, indent + 1, out, flag);
                // the update runs only for an iteration that did not break
                if (st.update) {
                    out.push(`${pad}  IF ${flag} = 0 THEN:`);
                    this.statement({type: 'ExpressionStatement', expr: st.update}, indent + 2, out);
                }
                return;
            }
            push(`REPEAT UNTIL not (${this.loopCondition(st.test)}):`);
            this.block(st.body, indent + 1, out);
            if (st.update) this.statement({type: 'ExpressionStatement', expr: st.update}, indent + 1, out);
            return;
        }

        case 'FunctionDeclaration':
            this.functions.push({name: this.procName(st.name), source: st.name, params: st.params, paramTypes: st.paramTypes,
                returnType: st.returnType, body: st.body, scope: st.name});
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
        case 'Class': {
            // Lowered (claimRecords registered its methods as procedures):
            // nothing to emit where it stands.
            if (this.recordLowerable(st.name)) return;
            const rt = this.recordTypes && this.recordTypes.get(st.name);
            const why = rt && rt.reasons.length ? ` (${[...new Set(rt.reasons)].join(', ')})` : '';
            push(this.note(`class ${st.name || ''}${why}${callList(st.calls)}`.replace(/ +/g, ' ')));
            return;
        }

        // A function's `return X` sets its result variable (read by the
        // caller) and leaves: `stop this script` inside a DEFINE ends the
        // procedure, and inside a radio hat ends that handler — both what
        // MakeCode's return does. Anywhere else (a polled handler, a forever
        // loop) it would stop the whole loop, so it stays refused.
        case 'Return':
            if (!this.returnable) {
                push(this.note('return from a function'));
                return;
            }
            if (st.value && this.returnable.result) this.assign(this.returnable.result, st.value, indent, out);
            push('stop this script');
            return;

        case 'Switch':
            this.switchStatement(st, indent, out);
            return;

        // An interface has no runtime behaviour; its fields were read by the
        // records pass (claimRecords), if the translator has one.
        case 'Interface':
            return;

        case 'Break':
            if (this.breakFlag) {
                push(`set ${this.breakFlag} to 1`);
                return;
            }
            push(this.note('break inside a loop'));
            return;

        case 'Continue':
            push(this.note('continue inside a loop'));
            return;

        default:
            push(this.note(st.type));
        }
    }

    /**
     * `switch` as the IF/ELSE chain it means. The discriminant is compared
     * with each label in order and ONE body runs, so a chain of ELSE IFs is
     * exact — provided no body falls through into the next, which is checked:
     * a body must end in `break` or `return` (or be the last), and an EMPTY
     * body shares the next one's (`case A: case B: …` is `d = A or d = B`).
     * A `break` inside a case leaves the switch, not an enclosing loop, so
     * the trailing one is dropped; one anywhere else in a case is refused.
     * The discriminant is read once, into a variable, unless it is a plain
     * name (a body that changes it cannot re-trigger a test: only one runs).
     */
    switchStatement (st, indent, out) {
        const pad = '  '.repeat(indent);
        const groups = [];
        let labels = [];
        for (let k = 0; k < st.cases.length; k++) {
            const c = st.cases[k];
            labels.push(c.test);
            if (!c.body.length && k < st.cases.length - 1) continue;
            let body = c.body;
            const last = body[body.length - 1];
            const ends = last && (last.type === 'Break' || last.type === 'Return');
            if (last && last.type === 'Break') body = body.slice(0, -1);
            if (!ends && k < st.cases.length - 1) {
                out.push(pad + this.note('a switch case that falls through into the next'));
                return;
            }
            if (switchBreaks(body)) {
                out.push(pad + this.note('break in the middle of a switch case'));
                return;
            }
            groups.push({labels, body});
            labels = [];
        }
        let subject;
        const d = st.discriminant;
        if (d && (d.type === 'Identifier' || d.type === 'Number' || d.type === 'String')) subject = this.expr(d);
        else {
            subject = this.freshName('_sw');
            this.assign(subject, d, indent, out);
        }
        // `default` may stand anywhere; it runs only when no label matched.
        const fallback = groups.find(g => g.labels.includes(null));
        const tested = groups.filter(g => g !== fallback);
        const emit = (k, level) => {
            const p = '  '.repeat(level);
            if (k === tested.length) {
                if (fallback) this.block(fallback.body.length ? fallback.body : [], level, out);
                return;
            }
            const g = tested[k];
            const test = g.labels.map(l => `${subject} = ${this.expr(l)}`);
            out.push(`${p}IF ${test.length === 1 ? test[0] : test.map(t => `(${t})`).join(' or ')} THEN:`);
            this.block(g.body, level + 1, out);
            if (k + 1 < tested.length || (fallback && fallback.body.length)) {
                out.push(`${p}ELSE:`);
                emit(k + 1, level + 1);
            }
        };
        if (!tested.length) {
            if (fallback) this.block(fallback.body, indent, out);
            return;
        }
        emit(0, indent);
    }

    expressionStatement (expr, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);

        if (expr.type === 'Assignment' && this.recordField(expr.left)) {
            const f = this.recordField(expr.left);
            const handle = this.single(f.handle, out, pad);
            const item = `item ${handle} of ${this.arrayRef(f.array)}`;
            const setter = v => `set ${item} to ${v}`;
            if (expr.op === '=') this.assign(setter, expr.right, indent, out);
            else {
                push(setter(`(${item}) ${expr.op[0]} ${this.operand(expr.right)}`));
            }
            return;
        }
        if (expr.type === 'Update' && this.recordField(expr.argument)) {
            const f = this.recordField(expr.argument);
            const handle = this.single(f.handle, out, pad);
            const item = `item ${handle} of ${this.arrayRef(f.array)}`;
            push(`set ${item} to (${item}) ${expr.op === '++' ? '+' : '-'} 1`);
            return;
        }
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
            if (expr.op === '=' && this.arrayName(expr.left) && this.arrayName(expr.right) &&
                this.arrayName(expr.left) !== this.arrayName(expr.right)) {
                this.copyArray(this.arrayName(expr.left), this.arrayName(expr.right), expr.right.name, indent, out);
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
            // `basic.showIcon(paired ? A : B)`: an argument that is a choice
            // makes the whole call the choice — one call per branch, each
            // with that branch's value. (A `? :` has no value form here, and a
            // slot like an icon's takes no expression at all.)
            const k = (expr.args || []).findIndex(a => a && a.type === 'Conditional' && !isOneZero(a));
            if (k >= 0) {
                const branch = value => ({...expr, args: expr.args.map((a, i) => (i === k ? value : a))});
                push(`IF ${this.condition(expr.args[k].test)} THEN:`);
                this.statement({type: 'ExpressionStatement', expr: branch(expr.args[k].consequent)}, indent + 1, out);
                push('ELSE:');
                this.statement({type: 'ExpressionStatement', expr: branch(expr.args[k].alternate)}, indent + 1, out);
                return;
            }
            this.command(expr, indent, out);
            return;
        }
        push(this.note(`${expr.type} statement`));
    }

    // ── records: classes, interfaces and object literals ───────────────
    //
    // The dialect has numbers, text, lists and procedures, and no objects. A
    // record type (a class, or an interface its object literals are typed
    // by) is lowered to PARALLEL ARRAYS — one per field, `array "Player_id"`
    // — and an instance to its INDEX in them, a number, exactly as a sprite
    // is a numbered handle. Index 0 is a placeholder every array starts
    // with, so the handle 0 is "no record" and `if (!p)` still reads as
    // MakeCode meant it. A method is a procedure `Player_show (self)` that
    // takes the instance first; `this.x` inside it reads `item self of
    // array "Player_x"`. What cannot be lowered (accessors, statics,
    // inheritance) keeps the class refused by name, as before.
    //
    // Which expression holds which record is found before the walk
    // (claimRecords): declared types, `new X()`, a function's declared return
    // type, the arrays they are pushed into and the loops over those arrays.
    // A name given two different record types is not guessed at.

    /** `Player` / `Player[]` / `Array<Player>` → {type, array} when it names a known record type. */
    recordTypeFromText (text) {
        const t = String(text || '').replace(/\s+/g, '');
        const m = t.match(/^(?:Array<(\w+)>|(\w+)\[\])$/);
        if (m) {
            const name = m[1] || m[2];
            return this.recordTypes.has(name) ? {type: name, array: true} : null;
        }
        return this.recordTypes.has(t) ? {type: t, array: false} : null;
    }

    /** Remember that `name` holds a `type` record (or an array of them); a second, different type makes it unknown. */
    noteRecordName (map, name, type) {
        if (!name || !type) return false;
        if (!map.has(name)) {
            map.set(name, type);
            return true;
        }
        if (map.get(name) !== type && map.get(name) !== null) {
            map.set(name, null);
            return true;
        }
        return false;
    }

    /**
     * Find the record types and which names hold them. Called once before the
     * walk; registers each lowerable class's methods as procedures.
     */
    claimRecords (ast) {
        this.recordTypes = new Map();
        this.recordVars = new Map();         // variable -> record type
        this.recordArrays = new Map();       // array variable -> record type of its items
        this.recordFns = new Map();          // function -> record type it returns
        this.constObjects = new Map();       // const X = {k: literal} -> Map(k -> node)
        this.usedRecords = new Set();
        const top = ast.body || [];
        for (const st of top) {
            if (st.type === 'Interface' && !st.opaque && st.fields.length) {
                this.recordTypes.set(st.name, {name: st.name, kind: 'interface', fields: st.fields.map(f => ({...f})),
                    methods: new Map(), ctor: null, spriteFields: new Set(), reasons: []});
            }
            if (st.type === 'Class' && st.fields) {
                const reasons = [...(st.unsupported || [])];
                for (const m of st.methods) {
                    if (m.kind !== 'method') reasons.push(`a ${m.kind} accessor (${m.name})`);
                    if (m.isStatic) reasons.push(`a static method (${m.name})`);
                }
                for (const f of st.fields) if (f.isStatic) reasons.push(`a static field (${f.name})`);
                this.recordTypes.set(st.name, {name: st.name, kind: 'class', fields: st.fields.map(f => ({...f})),
                    methods: new Map(), ctor: st.ctor, spriteFields: new Set(), reasons, node: st});
            }
        }
        // Constant tables: `const GameIcons = {Pairing: IconNames.Ghost, …}`,
        // never written, every value a literal or an enum member. A read is
        // the value itself.
        const constValue = n => n && (['Number', 'String', 'Boolean'].includes(n.type) ||
            (n.type === 'Member' && n.object && n.object.type === 'Identifier') ||
            (n.type === 'Unary' && n.op === '-' && n.argument.type === 'Number'));
        for (const st of top) {
            if (st.type !== 'Declaration' || st.kind !== 'const') continue;
            for (const d of st.decls) {
                if (d.init && d.init.type === 'Object' && d.init.props && d.init.props.length &&
                    !this.recordTypeFromText(d.typeName) && d.init.props.every(p => constValue(p.value)) &&
                    !writesMember(ast, d.name)) {
                    this.constObjects.set(d.name, new Map(d.init.props.map(p => [p.key, p.value])));
                }
            }
        }
        if (!this.recordTypes.size) return;
        // Class fields' own types, and sprite fields.
        for (const rt of this.recordTypes.values()) {
            for (const f of rt.fields) if (/LedSprite/.test(f.typeName || '')) rt.spriteFields.add(f.name);
        }
        // Propagate: a few passes, until nothing new is learned.
        const typeOf = node => this.recordTypeOfNode(node);
        // Names are typed PER FUNCTION: a parameter or a local of one
        // function (`mid(a: Point, …)`) is not the global of the same name
        // (`let a = make(…)`, a Counter). A function's scope is its name, a
        // method's `Class.method`.
        this.scopeDecls = new Set();
        const declare = name => {
            if (this.scope) this.scopeDecls.add(`${this.scope}:${name}`);
        };
        const inScope = (scope, fn) => {
            const was = this.scope;
            this.scope = scope;
            fn();
            this.scope = was;
        };
        const learn = () => {
            let changed = false;
            const hold = (name, value, text) => {
                const key = this.recordKey(name);
                const declared = this.recordTypeFromText(text);
                if (declared) {
                    changed = declared.array ? this.noteRecordName(this.recordArrays, name, declared.type) || changed :
                        this.noteRecordName(this.recordVars, key, declared.type) || changed;
                    if (value && value.type === 'Object') value.recordType = declared.array ? null : declared.type;
                    return;
                }
                const t = typeOf(value);
                if (t) changed = this.noteRecordName(this.recordVars, key, t) || changed;
            };
            const walk = (node, fnReturn) => {
                if (!node || typeof node !== 'object') return;
                if (Array.isArray(node)) return node.forEach(n => walk(n, fnReturn));
                switch (node.type) {
                case 'Declaration':
                    for (const d of node.decls || []) {
                        declare(d.name);
                        hold(d.name, d.init, d.typeName);
                    }
                    break;
                case 'Assignment':
                    if (node.op === '=' && node.left.type === 'Identifier') hold(node.left.name, node.right, '');
                    // `x.sprite = game.createSprite(…)`: a sprite field.
                    if (node.op === '=' && node.left.type === 'Member') {
                        const rt = this.recordTypes.get(typeOf(node.left.object));
                        if (rt && isCreateSprite(node.right, this)) rt.spriteFields.add(node.left.name);
                    }
                    break;
                case 'FunctionDeclaration': {
                    const ret = this.recordTypeFromText(node.returnType);
                    if (ret && !ret.array) changed = this.noteRecordName(this.recordFns, node.name, ret.type) || changed;
                    inScope(node.name, () => {
                        for (const p of node.params || []) declare(p);
                        for (const [p, t] of Object.entries(node.paramTypes || {})) hold(p, null, t.text);
                        walk(node.body, ret && !ret.array ? ret.type : null);
                    });
                    return;
                }
                case 'Return':
                    if (node.value && node.value.type === 'Object' && fnReturn) node.value.recordType = fnReturn;
                    break;
                case 'ForOf':
                    declare(node.name);
                    if (node.iterable && node.iterable.type === 'Identifier' && this.recordArrays.get(node.iterable.name)) {
                        changed = this.noteRecordName(this.recordVars, this.recordKey(node.name), this.recordArrays.get(node.iterable.name)) || changed;
                    }
                    break;
                case 'Call': {
                    // `players.push(p)`: an array of records.
                    const c = node.callee;
                    if (c && c.type === 'Member' && c.name === 'push' && c.object.type === 'Identifier') {
                        const t = typeOf(node.args[0]);
                        if (t) changed = this.noteRecordName(this.recordArrays, c.object.name, t) || changed;
                    }
                    break;
                }
                case 'Class':
                    for (const m of node.methods || []) {
                        inScope(`${node.name}.${m.name}`, () => {
                            for (const p of m.params || []) declare(p);
                            for (const [p, t] of Object.entries(m.paramTypes || {})) hold(p, null, t.text);
                            const ret = this.recordTypeFromText(m.returnType);
                            walk(m.body, ret && !ret.array ? ret.type : null);
                        });
                    }
                    if (node.ctor) {
                        inScope(`${node.name}.constructor`, () => {
                            for (const p of node.ctor.params || []) declare(p);
                            for (const [p, t] of Object.entries(node.ctor.paramTypes || {})) hold(p, null, t.text);
                            walk(node.ctor.body, null);
                        });
                    }
                    for (const f of node.fields || []) {
                        const rt = this.recordTypes.get(node.name);
                        if (rt && isCreateSprite(f.init, this)) rt.spriteFields.add(f.name);
                    }
                    return;
                case 'Object':
                    if (node.recordType && node.props) {
                        const rt = this.recordTypes.get(node.recordType);
                        for (const p of node.props) if (rt && isCreateSprite(p.value, this)) rt.spriteFields.add(p.key);
                    }
                    break;
                default:
                }
                for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, fnReturn);
            };
            walk(ast, null);
            return changed;
        };
        for (let i = 0; i < 6 && learn(); i++) { /* until nothing new */ }
        // Each lowerable class's methods and constructor are procedures.
        for (const rt of this.recordTypes.values()) {
            rt.arrays = new Map();
            const fields = rt.fields.length ? rt.fields.map(f => f.name) : ['_n'];
            if (!rt.fields.length) rt.fields.push({name: '_n', init: null});
            for (const f of fields) {
                let a = `${rt.name}_${f}`;
                while (this.taken && this.taken.has(a)) a += '_';
                if (this.taken) this.taken.add(a);
                rt.arrays.set(f, a);
            }
            if (rt.kind !== 'class' || rt.reasons.length) continue;
            const fnName = m => {
                let n = `${rt.name}_${m}`;
                while (this.taken && this.taken.has(n)) n += '_';
                if (this.taken) this.taken.add(n);
                return n;
            };
            for (const m of rt.node.methods) {
                const entry = {name: fnName(m.name), params: ['self', ...m.params], paramTypes: m.paramTypes,
                    returnType: m.returnType, body: m.body, record: rt.name, scope: `${rt.name}.${m.name}`};
                rt.methods.set(m.name, entry);
                this.functions.push(entry);
            }
            if (rt.ctor) {
                rt.ctorFn = {name: fnName('constructor'), params: ['self', ...rt.ctor.params], paramTypes: rt.ctor.paramTypes,
                    body: rt.ctor.body, record: rt.name, scope: `${rt.name}.constructor`};
                this.functions.push(rt.ctorFn);
            }
        }
    }

    /** The key a name's record type is kept under: `scope:name` for a parameter or local of the function in scope. */
    recordKey (name) {
        return this.scope && this.scopeDecls && this.scopeDecls.has(`${this.scope}:${name}`) ? `${this.scope}:${name}` : name;
    }

    /** Can this record type be lowered? (an interface always; a class without accessors, statics or heritage) */
    recordLowerable (type) {
        const rt = this.recordTypes && this.recordTypes.get(type);
        return !!rt && !rt.reasons.length;
    }

    /** The record type an expression holds, or null. */
    recordTypeOfNode (node) {
        if (!node || !this.recordTypes || !this.recordTypes.size) return null;
        switch (node.type) {
        case 'Identifier':
            if (node.name === 'this') return this.selfRecord || null;
            return this.recordVars.get(this.recordKey(node.name)) || null;
        case 'Call': {
            if (node.isNew && node.callee.type === 'Identifier' && this.recordTypes.has(node.callee.name)) return node.callee.name;
            const name = this.path(node.callee);
            if (name && this.recordFns.has(name)) return this.recordFns.get(name);
            // A method that returns a record (declared).
            if (node.callee.type === 'Member') {
                const rt = this.recordTypes.get(this.recordTypeOfNode(node.callee.object));
                const m = rt && rt.node && rt.node.methods.find(x => x.name === node.callee.name);
                const ret = m && this.recordTypeFromText(m.returnType);
                if (ret && !ret.array) return ret.type;
            }
            // `players.removeAt(i)` / `pop()`
            const c = node.callee;
            if (c.type === 'Member' && /^(removeAt|pop|shift|get)$/.test(c.name) && c.object.type === 'Identifier') {
                return this.recordArrays.get(c.object.name) || null;
            }
            return null;
        }
        case 'Index':
            return node.object.type === 'Identifier' ? this.recordArrays.get(node.object.name) || null : null;
        case 'Object':
            return node.recordType || null;
        case 'Member': {
            // A field whose declared type is a record.
            const rt = this.recordTypes.get(this.recordTypeOfNode(node.object));
            const f = rt && rt.fields.find(x => x.name === node.name);
            const t = f && this.recordTypeFromText(f.typeName);
            return t && !t.array ? t.type : null;
        }
        default:
            return null;
        }
    }

    /** The array a record field lives in, for `e.f` when e holds a lowerable record — or null. */
    recordField (node) {
        if (!node || node.type !== 'Member' || !this.recordTypes || !this.recordTypes.size) return null;
        const type = this.recordTypeOfNode(node.object);
        if (!type || !this.recordLowerable(type)) return null;
        const rt = this.recordTypes.get(type);
        if (!rt.arrays.has(node.name)) return null;
        this.usedRecords.add(type);
        return {type, array: rt.arrays.get(node.name), handle: node.object};
    }

    /** `item h of array "R_f"` for a field read, or null when it is not one. */
    recordMember (node) {
        const f = this.recordField(node);
        if (!f) return null;
        return `item ${this.expr(f.handle)} of ${this.arrayRef(f.array)}`;
    }

    /** A `const` table's entry (`GameIcons.Dead` → `IconNames.Skull`), or the node itself. */
    resolveConst (node) {
        if (node && node.type === 'Member' && node.object && node.object.type === 'Identifier' &&
            this.constObjects && this.constObjects.has(node.object.name)) {
            const v = this.constObjects.get(node.object.name).get(node.name);
            if (v) return v;
        }
        return node;
    }

    /**
     * A new record: one entry pushed onto each field's array (its initialiser,
     * or 0), the handle — its index — into a variable, and the constructor
     * called on it. Emitted as lines BEFORE the statement (this.pre) and
     * read as that variable.
     */
    allocRecord (type, values, ctorArgs) {
        const rt = this.recordTypes.get(type);
        this.usedRecords.add(type);
        if (!this.pre) {
            this.unsupported.push(`a new ${type} inside a loop's condition`);
            return '0';
        }
        for (const f of rt.fields) {
            const v = values.has(f.name) ? values.get(f.name) : f.init;
            this.pre.push(`push ${v ? this.expr(v) : '0'} to ${this.arrayRef(rt.arrays.get(f.name))}`);
        }
        const handle = `_mc${++this.temps}`;
        this.declared.add(handle);
        this.pre.push(`set ${handle} to (length of ${this.arrayRef(rt.arrays.get(rt.fields[0].name))}) - 1`);
        if (rt.ctorFn) {
            const args = (ctorArgs || []).map(a => this.single(a, this.pre, ''));
            this.pre.push([rt.ctorFn.name, handle, ...args].join(' '));
        }
        return handle;
    }

    /**
     * A record expression: `new X(…)` or a typed object literal as a value,
     * or a method call (`p.show()` → the procedure `Player_show p`). Returns
     * the value (for a value) or true (for a statement), or null when the
     * node is none of these.
     */
    recordCall (node, statement) {
        if (!this.recordTypes || !this.recordTypes.size || !node) return null;
        if (node.type === 'Call' && node.isNew && node.callee.type === 'Identifier' && this.recordTypes.has(node.callee.name)) {
            const type = node.callee.name;
            if (!this.recordLowerable(type)) return null;
            const value = this.allocRecord(type, new Map(), node.args);
            return statement ? true : value;
        }
        if (node.type !== 'Call' || !node.callee || node.callee.type !== 'Member') return null;
        const type = this.recordTypeOfNode(node.callee.object);
        if (!type || !this.recordLowerable(type)) return null;
        const method = this.recordTypes.get(type).methods.get(node.callee.name);
        if (!method) return null;
        this.usedRecords.add(type);
        const call = {type: 'Call', callee: {type: 'Identifier', name: method.name}, args: [node.callee.object, ...(node.args || [])]};
        if (statement) {
            this.command(call, statement.indent, statement.out);
            return true;
        }
        return this.callExpression(call);
    }

    /**
     * A handler body that `return`s — leaves the handler early. In a polled
     * handler or a forever's body, `stop this script` would stop the loop
     * that polls it, so a body that returns becomes a procedure of its own
     * (where `stop this script` leaves just the procedure, as MakeCode's
     * return leaves just the handler) and the handler calls it. Returns the
     * statements to emit in the body's place.
     */
    leavable (body, what) {
        if (!returnsAnywhere(body)) return body;
        const name = this.freshName(`on_${what}_`);
        this.functions.push({name, params: [], body});
        return [{type: 'ExpressionStatement', expr: {type: 'Call', callee: {type: 'Identifier', name}, args: []}}];
    }

    /** The arrays every record type the program used starts with: index 0, "no record". */
    recordPrelude () {
        const lines = [];
        for (const type of this.usedRecords || []) {
            const rt = this.recordTypes.get(type);
            for (const f of rt.fields) lines.push(`new ${this.arrayRef(rt.arrays.get(f.name))} = [0]`);
        }
        return lines;
    }

    /**
     * A member expression naming an enum member, resolved to the token
     * our vocabulary uses. Subclasses add their device's enums; user
     * `enum` declarations are handled here for both.
     */
    enumToken (node) {
        node = this.resolveConst(node);
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
        // An array parameter, in a procedure specialised for the array it was given.
        if (this.arrayAliases && this.arrayAliases.has(node.name)) return this.arrayAliases.get(node.name);
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

    /**
     * `a = b` of two arrays. The dialect's arrays are named, not values, so
     * `a` cannot be made to refer to `b`'s array; it gets a copy of it. A copy
     * is the same program only if nothing uses `b` afterwards — so it is
     * lowered only when `b` is declared in the procedure it is assigned from
     * (made anew on every call) and not mentioned after the assignment
     * (gameofLife's `state = result`); otherwise it is refused.
     */
    copyArray (to, from, fromName, indent, out) {
        const pad = '  '.repeat(indent);
        const frames = this.blockStack || [];
        const mention = new RegExp(`"name":${JSON.stringify(fromName)}[,}]`);
        const later = frames.some(f => f.body.slice(f.i + 1).some(st => mention.test(JSON.stringify(st))));
        const outer = frames.length ? frames[0].body : [];
        const local = this.inProcedure && outer.some(st => st.type === 'Declaration' && st.decls.some(d => d.name === fromName));
        if (later || !local) {
            out.push(pad + this.note(`an array assigned to another (${to} = ${from}) — the dialect's arrays are named, and a copy is not the same array`));
            return;
        }
        const i = this.freshName('_i');
        out.push(`${pad}new ${this.arrayRef(to)}`, `${pad}set ${i} to 0`,
            `${pad}REPEAT UNTIL not (${i} < length of ${this.arrayRef(from)}):`,
            `${pad}  push item ${i} of ${this.arrayRef(from)} to ${this.arrayRef(to)}`,
            `${pad}  change ${i} by 1`);
    }

    /**
     * A call of a function that takes ARRAYS: the dialect names an array in
     * the block itself (`item i of array "state"`), so a procedure cannot be
     * handed one. It is specialised instead — one copy per array it is called
     * with (`getState_state`, `getState_result`), the parameter read as that
     * array (gameofLife's getState/setState). Returns the function to call and
     * the remaining arguments, or null when an argument is not a named array.
     */
    specialize (fn, args) {
        const types = fn.paramTypes || {};
        const arrayParams = (fn.params || []).filter(p => types[p] && types[p].isArray);
        if (!arrayParams.length) return {fn, args};
        const binding = new Map();
        for (const p of arrayParams) {
            const arr = this.arrayName(args[fn.params.indexOf(p)]);
            if (!arr) return null;
            binding.set(p, arr);
        }
        fn.generic = true;
        const name = `${fn.name}_${[...binding.values()].join('_')}`;
        let spec = this.functions.find(f => f.name === name && f.specialOf === fn);
        if (!spec) {
            spec = {name, params: fn.params.filter(p => !binding.has(p)), paramTypes: fn.paramTypes, body: fn.body,
                specialOf: fn, arrayAliases: binding, result: fn.result ? `${name}_result` : undefined, record: fn.record,
                scope: fn.scope};
            if (this.taken) this.taken.add(name);
            this.functions.push(spec);
        }
        return {fn: spec, args: args.filter((a, k) => !binding.has(fn.params[k]))};
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
        // `removeAt(i)` / `shift()` as a value: the item, read before it is
        // removed — two lines ahead of the statement, the value a variable.
        case 'removeAt':
        case 'shift': {
            if (!this.pre) return null;
            const i = node.callee.name === 'shift' ? '0' : this.single(a[0], this.pre, '');
            const v = `_mc${++this.temps}`;
            this.declared.add(v);
            this.pre.push(`set ${v} to item ${i} of ${ref}`, `remove item ${i} of ${ref}`);
            return v;
        }
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
        const record = this.recordCall(node, null);
        if (record !== null) return record;
        const arrayValue = this.arrayValue(node);
        if (arrayValue !== null) return arrayValue;
        const name = this.path(node.callee);
        let fn = name && this.functions.find(f => f.name === name || f.source === name);
        if (fn) {
            const special = this.specialize(fn, node.args || []);
            if (!special) {
                this.unsupported.push(`${name}() given an array that is not a named array`);
                return '0';
            }
            if (special.fn !== fn) node = {...node, args: special.args};
            fn = special.fn;
        }
        if (fn && fn.result) {
            if (this.inLoopCondition || !this.pre) {
                this.unsupported.push(`${name}() as a value in a loop's condition — its result is read after a call, ` +
                    'and a condition is tested again on every pass');
                return '0';
            }
            // The call as its own line (hoisted above the statement), and the
            // function's result variable in its place.
            const args = (node.args || []).map(arg => this.single(arg, this.pre, ''));
            this.pre.push([fn.name, ...args].join(' '));
            // Copied at once: a second call in the same statement
            // (`f(4) + f(0)`) would otherwise overwrite the first result
            // before either is read.
            const copy = `_mc${++this.temps}`;
            this.declared.add(copy);
            this.pre.push(`set ${copy} to ${fn.result}`);
            return copy;
        }
        const a = node.args || [];
        const arg = i => this.expr(a[i]);
        switch (name) {
        case 'Math.randomRange':
        case 'randint': return `pick random ${arg(0)} to ${arg(1)}`;
        case 'Math.random': return 'pick random 0 to 1';
        // A number as text: joined onto the empty text, which is what makes a
        // value text in the dialect (and what the export writes back as "" + x).
        case 'convertToText': return `("" join ${this.joinOperand(a[0])})`;
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
        if (this.recordCall(node, {indent, out})) return;
        if (this.arrayCommand(node, line => out.push(`${'  '.repeat(indent)}${line}`))) return;
        const name = this.path(node.callee);
        let fn = name && this.functions.find(f => f.name === name || f.source === name);
        if (fn) {
            const special = this.specialize(fn, node.args || []);
            if (!special) {
                out.push(`${'  '.repeat(indent)}${this.note(`${name}() given an array that is not a named array`)}`);
                return;
            }
            node = {...node, args: special.args};
            fn = special.fn;
            // `zeigen(3)` used to become `zeigen` — the arguments were
            // dropped, and the function ran on whatever its parameters
            // happened to hold. A call is matched TOKEN BY TOKEN against
            // the DEFINE's template, so each argument has to be one token,
            // which is what single() guarantees.
            const pad = '  '.repeat(indent);
            const args = (node.args || []).map(arg => this.single(arg, out, pad));
            out.push(`${pad}${[fn.name, ...args].join(' ')}`);
            return;
        }
        out.push(`${'  '.repeat(indent)}${this.note(`${name || 'call'}()`)}`);
    }
}

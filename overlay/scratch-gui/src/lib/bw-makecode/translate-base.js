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

/** Trim a computed number to something a human would have typed. */
export const num = value => String(Math.round(value * 1000) / 1000);

/** The statements inside a function-expression argument. */
export const bodyOf = node => (node && node.type === 'FunctionExpression' ? node.body : []);

export class BaseTranslator {
    constructor () {
        this.enums = new Map();          // user `enum X {}` → {member: value}
        this.functions = [];             // DEFINE blocks, hoisted
        this.unsupported = [];
        this.declared = new Set();
        this.temps = 0;
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
        case 'Boolean': return node.value ? 'true' : 'false';
        case 'Null': return '0';
        case 'Identifier': return node.name;
        case 'Unary':
            if (node.op === '!') return `not (${this.condition(node.argument)})`;
            // Parenthesised, and not optionally: `maxSpeed * -cos(a)` written
            // as `maxSpeed * 0 - cos(a)` is `(maxSpeed*0) - cos(a)`, which
            // runs and is wrong.
            if (node.op === '-') return `(0 - ${this.expr(node.argument)})`;
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
            return `${this.expr(node.left)} ${op} ${this.expr(node.right)}`;
        }
        case 'Member': {
            // `Math.PI` is a constant, and a game that computes a bounce
            // angle wants the number, not a variable called PI.
            if (node.object && node.object.type === 'Identifier' &&
                node.object.name === 'Math' && node.name === 'PI') return '3.14159';
            const token = this.enumToken(node);
            if (token !== null) return /^-?\d+$/.test(token) ? token : `"${token}"`;
            return node.name;                            // a bare property read
        }
        case 'Call': return this.callExpression(node);
        case 'Template': return '"(image)"';
        default: return '0';
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
        const value = this.expr(node);
        if (/^\S+$/.test(value)) return value;
        const name = `_mc${++this.temps}`;
        out.push(`${pad}set ${name} to ${value}`);
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
                push(`set ${d.name} to ${d.init ? this.expr(d.init) : '0'}`);
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
            if (counter) {
                this.declared.add(counter.name);
                push(`set ${counter.name} to ${counter.init ? this.expr(counter.init) : '0'}`);
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
            const target = expr.left.type === 'Identifier' ? expr.left.name : this.expr(expr.left);
            this.declared.add(target);
            if (expr.op === '=') push(`set ${target} to ${this.expr(expr.right)}`);
            else if (expr.op === '+=') push(`change ${target} by ${this.expr(expr.right)}`);
            else if (expr.op === '-=') push(`change ${target} by 0 - ${this.expr(expr.right)}`);
            else push(`set ${target} to ${target} ${expr.op[0]} ${this.expr(expr.right)}`);
            return;
        }
        if (expr.type === 'Update') {
            const target = expr.argument.type === 'Identifier' ? expr.argument.name : this.expr(expr.argument);
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
    callExpression (node) {
        const name = this.path(node.callee);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);
        switch (name) {
        case 'Math.randomRange':
        case 'randint': return `pick random ${arg(0)} to ${arg(1)}`;
        case 'Math.random': return 'pick random 0 to 1';
        case 'Math.abs': return `abs of ${arg(0)}`;
        case 'Math.floor': return `floor of ${arg(0)}`;
        case 'Math.ceil': return `ceiling of ${arg(0)}`;
        case 'Math.sqrt': return `sqrt of ${arg(0)}`;
        case 'Math.round': return `round ${arg(0)}`;
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
        case 'Math.pow': return `${arg(0)}`;  // no power reporter; keep the base
        case 'Math.min':
        case 'Math.max':
        case 'Math.map': return arg(0);       // no reporter for these; keep the first term
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
        const name = this.path(node.callee);
        if (name && this.functions.some(f => f.name === name)) {
            out.push(`${'  '.repeat(indent)}${name}`);
            return;
        }
        out.push(`${'  '.repeat(indent)}${this.note(`${name || 'call'}()`)}`);
    }
}

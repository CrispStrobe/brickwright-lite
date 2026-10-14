/**
 * "a AND NOT b" — a pseudocode boolean expression, as gates.
 *
 * This is option C from docs/PSEUDOCODE-TO-VERILOG.md: not a language target,
 * an ACTION on an expression that is already a circuit in disguise. It lowers
 * the one thing that needs no runtime and no state — a boolean over 1-bit
 * inputs — into the gate model the FPGA tab already synthesises, simulates and
 * renders.
 *
 * ## Why a parser and not `eval`, and why this grammar
 *
 * The same argument as bw-debug/condition.js: an expression out of a project
 * file must never reach `new Function`. But there is a second reason here, and
 * it is the interesting one — **the grammar's limits are the hardware's
 * limits**. Everything this refuses is exactly what cannot become
 * combinational logic, so refusal falls out of the parse instead of needing a
 * separate synthesisability check that could disagree with it.
 *
 *     expr   := term ('OR' term)*
 *     term   := factor ('AND' factor)*
 *     factor := 'NOT' factor | '(' expr ')' | name
 *     name   := a declared 1-bit INPUT pin
 *
 * `and`/`or`/`not` are accepted in any case, because pseudocode is written by
 * hand. Everything else is REFUSED BY NAME: comparisons (`>`, `<`, `=`) are
 * multi-bit arithmetic, numbers and strings are values rather than wires, and
 * an undeclared or non-digital name has no pin to be.
 *
 * MEASURED, and the reason this is an action rather than a tab: 0 of 282
 * shipped example programs contain an expression this accepts
 * (scripts/measure-verilog-subset.mjs). Every real boolean in the corpus
 * compares multi-bit variables. So this must be offered only where it applies
 * and must never present itself as the way to turn a program into hardware.
 *
 * @module
 */

/** Tokens: names, parens, and the three operators. Case-insensitive operators. */
const tokenise = text => {
    const out = [];
    // Multi-character comparisons FIRST, or ">=" tokenises as ">" then "=" and
    // the refusal degrades to "left over after the expression" — true, but not
    // the thing the reader needs to be told.
    const re = /\s*(>=|<=|==|!=|<>|\(|\)|[A-Za-z_][A-Za-z0-9_]*|[<>=]|\S)/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
        const t = m[1];
        const upper = t.toUpperCase();
        if (t === '(' || t === ')') out.push({kind: t});
        else if (/^(>=|<=|==|!=|<>|[<>=])$/.test(t)) out.push({kind: 'cmp', text: t});
        else if (/^[01]$/.test(t)) out.push({kind: 'bit', text: t});
        else if (upper === 'AND' || upper === 'OR' || upper === 'NOT') out.push({kind: upper});
        else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) out.push({kind: 'name', text: t});
        else out.push({kind: 'junk', text: t});
    }
    return out;
};

class Refusal extends Error {}
/** One wording for the refusal the corpus actually produces, used from both sites. */
const COMPARISON = op =>
    `"${op}" compares values; a comparison is arithmetic on numbers, not a gate`;
const refuse = msg => { throw new Refusal(msg); };

/**
 * Lower a boolean expression to a {nodes, edges} gate model.
 *
 * @param {string} text        e.g. "a AND NOT b"
 * @param {{inputs?: string[]}} [opts]  names that are 1-bit INPUT pins. An empty
 *   or absent list means "accept any name", which is what a bare expression
 *   outside a program gets.
 * @param {string} [opts.output]  name for the output port (default "y")
 * @returns {{model: object|null, problem: string|null, inputs: string[]}}
 */
export function expressionToModel (text, opts = {}) {
    const allowed = Array.isArray(opts.inputs) && opts.inputs.length ? new Set(opts.inputs) : null;
    const outName = opts.output || 'y';
    const toks = tokenise(text);
    let at = 0;
    const peek = () => toks[at];
    const take = () => toks[at++];

    const nodes = [];
    const edges = [];
    const used = [];
    let n = 0;
    const inputNode = name => {
        const found = nodes.find(x => x.kind === 'in' && x.name === name);
        if (found) return found.id;                 // one pin, one node, however often it is read
        const id = `i${++n}`;
        nodes.push({id, kind: 'in', name});
        used.push(name);
        return id;
    };
    const gate = (type, ins) => {
        const id = `g${++n}`;
        nodes.push({id, kind: 'gate', type});
        ins.forEach((src, i) => edges.push({from: {node: src, port: 'out'}, to: {node: id, port: 'ab'[i]}}));
        return id;
    };

    const factor = () => {
        const t = peek();
        if (!t) refuse('the expression ends where a value was expected');
        if (t.kind === 'NOT') { take(); return gate('not', [factor()]); }
        if (t.kind === '(') {
            take();
            const inner = expr();
            if (!peek() || peek().kind !== ')') refuse('a "(" is never closed');
            take();
            return inner;
        }
        if (t.kind === 'name') {
            take();
            // THE CURRICULUM'S OWN IDIOM. This pseudocode reads a pin as
            // `read btnA`, and tests it as `read btnA = 0` — which on an
            // active-low button is how "pressed" is written. Both are 1-bit and
            // both are gates: `= 1` is the level itself, `= 0` is an inverter.
            // Refusing them would have meant asking the curriculum to change
            // its language to suit this parser, when the existing AND/OR gate
            // lessons (examples 18 and 19) are written exactly this way.
            if (t.text.toLowerCase() === 'read') {
                const pin = peek();
                if (!pin || pin.kind !== 'name') refuse('"read" must be followed by a pin name');
                take();
                if (allowed && !allowed.has(pin.text)) {
                    refuse(`"${pin.text}" is not a 1-bit input pin — only declared INPUT pins can be wires`);
                }
                const level = inputNode(pin.text);
                if (peek() && peek().kind === 'cmp') {
                    const op = take();
                    if (op.text !== '=' && op.text !== '==') {
                        refuse(COMPARISON(op.text));
                    }
                    const bit = peek();
                    if (!bit || bit.kind !== 'bit') {
                        // `read p > 3` is arithmetic on something that has only
                        // two values; say so rather than "unexpected token".
                        refuse(`a 1-bit pin can only be compared with 0 or 1, not "${bit ? (bit.text || bit.kind) : 'nothing'}"`);
                    }
                    take();
                    return bit.text === '0' ? gate('not', [level]) : level;
                }
                return level;
            }
            if (allowed && !allowed.has(t.text)) {
                refuse(`"${t.text}" is not a 1-bit input pin — only declared INPUT pins can be wires`);
            }
            return inputNode(t.text);
        }
        if (t.kind === 'cmp') refuse(COMPARISON(t.text));
        if (t.kind === 'junk') {
            // Numbers are the corpus's other population, so say what they are
            // rather than "unexpected token".
            if (/^[0-9"']/.test(t.text)) refuse(`"${t.text}" is a value, and a value is not a wire`);
            refuse(`"${t.text}" is not part of a boolean expression`);
        }
        refuse(`"${t.kind}" cannot start a value`);
        return null;
    };
    const term = () => {
        let left = factor();
        while (peek() && peek().kind === 'AND') { take(); left = gate('and', [left, factor()]); }
        return left;
    };
    const expr = () => {
        let left = term();
        while (peek() && peek().kind === 'OR') { take(); left = gate('or', [left, term()]); }
        return left;
    };

    try {
        if (!toks.length) refuse('there is no expression here');
        const root = expr();
        if (peek()) {
            // A comparison after a good operand is the corpus's whole population
            // (`hit >= 0 AND key < 0`), so name it as arithmetic rather than as
            // leftover text.
            if (peek().kind === 'cmp') refuse(COMPARISON(peek().text));
            refuse(`"${peek().text || peek().kind}" is left over after the expression`);
        }
        // A bare `a` is a wire, not a gate — still a legitimate circuit.
        const oid = `o${++n}`;
        nodes.push({id: oid, kind: 'out', name: outName});
        edges.push({from: {node: root, port: 'out'}, to: {node: oid, port: 'in'}});
        return {model: {nodes, edges}, problem: null, inputs: used};
    } catch (e) {
        if (e instanceof Refusal) return {model: null, problem: e.message, inputs: []};
        throw e;
    }
}

/**
 * Is this line an expression the action should be offered on? Used to decide
 * whether to SHOW the affordance, which is the whole difference between option
 * C and a tab that is empty for every shipped example.
 */
export function isLowerable (text, opts = {}) {
    return expressionToModel(text, opts).problem === null;
}

/**
 * The expression inside a pseudocode line, if the line has an expression
 * position. `IF <cond> THEN:` and `set x to <expr>` are the two places a
 * boolean appears in this pseudocode; everything else is a statement.
 *
 * Lives here rather than in the census script so that ONE place decides what
 * is lowerable: the UI offering the action and the census counting it must
 * never be able to disagree.
 */
export const conditionOf = line => {
    const iff = /^IF\s+(.*?)\s+THEN\s*:?\s*$/i.exec(String(line || '').trim());
    if (iff) return iff[1];
    const set = /^set\s+[A-Za-z_][A-Za-z0-9_]*\s+to\s+(.*)$/i.exec(String(line || '').trim());
    if (set) return set[1];
    return null;
};

/** `PIN name = P1.0 INPUT` → the names that are 1-bit inputs. */
export const oneBitInputsOf = text => {
    const out = [];
    for (const raw of String(text || '').split('\n')) {
        const m = /^PIN\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\S+\s+INPUT\b/.exec(raw.split('#')[0].trim());
        if (m) out.push(m[1]);
    }
    return out;
};

/**
 * Every line of a pseudocode program that could become a circuit.
 *
 * This is what decides whether the "make this a circuit" action is OFFERED,
 * which is the whole difference between option C and a tab that is empty for
 * every shipped example — measured at 0 of 282 in
 * docs/PSEUDOCODE-TO-VERILOG.md, so an affordance that is always visible would
 * be an affordance that always refuses.
 *
 * @returns {Array<{lineNo:number, line:string, expr:string, model:object}>}
 */
export function lowerableLines (text) {
    const inputs = oneBitInputsOf(text);
    const out = [];
    String(text || '').split('\n').forEach((raw, i) => {
        const line = raw.split('#')[0].trim();
        const expr = conditionOf(line);
        if (!expr) return;
        const {model, problem} = expressionToModel(expr, {inputs, output: outputNameFor(line)});
        if (!problem) out.push({lineNo: i + 1, line, expr, model});
    });
    return out;
}

/** `set y to a AND b` names its output `y`; an IF condition has no name. */
const outputNameFor = line => {
    const m = /^set\s+([A-Za-z_][A-Za-z0-9_]*)\s+to\s+/i.exec(String(line || '').trim());
    return m ? m[1] : 'y';
};

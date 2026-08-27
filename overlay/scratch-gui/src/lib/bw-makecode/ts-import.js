/**
 * MakeCode TypeScript → BrickWright pseudocode.
 *
 * WHERE THIS SITS
 * ---------------
 * embedded-source.js recovers a MakeCode project's `main.ts` from a .hex,
 * .uf2 or .png. That is text; this turns it into a PROGRAM — pseudocode,
 * which the rest of the app already compiles to blocks, to MicroPython,
 * and into the simulator. So the import chain ends here rather than at a
 * read-only listing.
 *
 * WHY A PARSER AND NOT REGEXES. MakeCode's output is machine-generated
 * from blocks, so it is regular — but it nests: `basic.forever` takes a
 * function expression, handlers take function expressions, and the body
 * of each is arbitrary statements. Anything that has to walk into a
 * callback needs a tree. It is a small tree (this is "Static TypeScript",
 * a deliberately limited subset) which is why a few hundred lines cover
 * it.
 *
 * WHY NOT REUSE sb3-creator-javascript.js. That importer is the mirror of
 * OUR JavaScript generator — it reads the vocabulary we emit. MakeCode's
 * vocabulary (`basic.showNumber`, `input.acceleration`) is not in it, and
 * teaching it a second dialect would put two unrelated languages in one
 * parser. The translation table below is the actual work either way.
 *
 * WHAT IS NOT TRANSLATED IS SAID OUT LOUD. Every call we have no mapping
 * for becomes a `# unsupported:` comment in the output AND an entry in
 * the returned `unsupported` list, so the UI can tell the user what was
 * dropped. Silence would be the one unacceptable outcome: a program that
 * looks converted and quietly does less than it did.
 *
 * @module
 */

// ─── lexer ──────────────────────────────────────────────────────────────

const PUNCT = [
    '===', '!==', '==', '!=', '<=', '>=', '&&', '||', '++', '--',
    '+=', '-=', '*=', '/=', '=>', '...',
    '{', '}', '(', ')', '[', ']', ';', ',', '.', ':', '?',
    '+', '-', '*', '/', '%', '<', '>', '=', '!', '&', '|', '^', '~'
];

const KEYWORDS = new Set([
    'let', 'const', 'var', 'function', 'if', 'else', 'while', 'for', 'do',
    'return', 'break', 'continue', 'enum', 'namespace', 'export', 'class',
    'true', 'false', 'null', 'undefined', 'new', 'interface', 'type', 'switch',
    'case', 'default', 'public', 'private', 'static'
]);

/**
 * @param {string} src
 * @returns {Array<{type: string, value: string, line: number}>}
 */
export function tokenize (src) {
    const out = [];
    let i = 0;
    let line = 1;
    const push = (type, value) => out.push({type, value, line});

    while (i < src.length) {
        const c = src[i];
        if (c === '\n') {
            line++;
            i++;
            continue;
        }
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            i += 2;
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
                if (src[i] === '\n') line++;
                i++;
            }
            i += 2;
            continue;
        }
        if (c === '"' || c === "'") {
            let s = '';
            i++;
            while (i < src.length && src[i] !== c) {
                if (src[i] === '\\') {
                    s += src[i] + src[i + 1];
                    i += 2;
                    continue;
                }
                s += src[i++];
            }
            i++;
            push('string', s);
            continue;
        }
        if (c === '`') {
            // Template literals in MakeCode are image and tilemap
            // literals — `img`, `assets.image`, `tilemap` — so they are
            // kept RAW and decoded by whoever knows the asset format.
            let s = '';
            i++;
            while (i < src.length && src[i] !== '`') {
                if (src[i] === '\n') line++;
                s += src[i++];
            }
            i++;
            push('template', s);
            continue;
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
            let s = '';
            if (c === '0' && /[xXbB]/.test(src[i + 1] || '')) {
                s = src.substr(i, 2);
                i += 2;
                while (i < src.length && /[0-9a-fA-F]/.test(src[i])) s += src[i++];
            } else {
                while (i < src.length && /[0-9.eE]/.test(src[i])) s += src[i++];
            }
            push('number', s);
            continue;
        }
        if (/[A-Za-z_$]/.test(c)) {
            let s = '';
            while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) s += src[i++];
            push(KEYWORDS.has(s) ? s : 'ident', s);
            continue;
        }
        const punct = PUNCT.find(p => src.startsWith(p, i));
        if (punct) {
            i += punct.length;
            push('punct', punct);
            continue;
        }
        i++;                                             // an unknown byte is skipped, not fatal
    }
    push('eof', '');
    return out;
}

// ─── parser ─────────────────────────────────────────────────────────────

const BINARY_PRECEDENCE = {
    '||': 1, '&&': 2,
    '==': 3, '!=': 3, '===': 3, '!==': 3,
    '<': 4, '>': 4, '<=': 4, '>=': 4,
    '+': 5, '-': 5,
    '*': 6, '/': 6, '%': 6
};

class Parser {
    constructor (tokens) {
        this.toks = tokens;
        this.pos = 0;
    }

    peek (offset = 0) {
        return this.toks[Math.min(this.pos + offset, this.toks.length - 1)];
    }

    next () {
        return this.toks[this.pos++];
    }

    at (type, value) {
        const t = this.peek();
        return t.type === type && (value === undefined || t.value === value);
    }

    eat (type, value) {
        if (this.at(type, value)) return this.next();
        return null;
    }

    expect (type, value) {
        const t = this.eat(type, value);
        if (!t) {
            const got = this.peek();
            throw new Error(`MakeCode TS: expected ${value || type} but found "${got.value}" on line ${got.line}`);
        }
        return t;
    }

    /** Type annotations carry no runtime meaning here; step over them. */
    skipTypeAnnotation () {
        if (!this.eat('punct', ':')) return;
        let depth = 0;
        for (;;) {
            const t = this.peek();
            if (t.type === 'eof') return;
            // A return type ends at the function body: `): void {`.
            if (depth === 0 && t.type === 'punct' && t.value === '{') return;
            if (t.type === 'punct' && '<[('.includes(t.value)) depth++;
            if (t.type === 'punct' && '>])'.includes(t.value)) {
                if (depth === 0) return;
                depth--;
            }
            if (depth === 0 && t.type === 'punct' && (t.value === '=' || t.value === ';' || t.value === ',')) return;
            if (depth === 0 && t.type === 'punct' && t.value === ')') return;
            this.next();
        }
    }

    parseProgram () {
        const body = [];
        while (!this.at('eof')) {
            const st = this.parseStatement();
            if (st) body.push(st);
        }
        return {type: 'Program', body};
    }

    parseBlock () {
        this.expect('punct', '{');
        const body = [];
        while (!this.at('punct', '}') && !this.at('eof')) {
            const st = this.parseStatement();
            if (st) body.push(st);
        }
        this.expect('punct', '}');
        return body;
    }

    parseBlockOrStatement () {
        if (this.at('punct', '{')) return this.parseBlock();
        const st = this.parseStatement();
        return st ? [st] : [];
    }

    parseStatement () {
        if (this.eat('punct', ';')) return null;
        if (this.at('export')) {
            this.next();
            return this.parseStatement();
        }
        if (this.at('let') || this.at('const') || this.at('var')) return this.parseDeclaration();
        if (this.at('function')) return this.parseFunction();
        if (this.at('if')) return this.parseIf();
        if (this.at('while')) return this.parseWhile();
        if (this.at('for')) return this.parseFor();
        if (this.at('enum')) return this.parseEnum();
        if (this.at('namespace')) return this.parseNamespace();
        if (this.at('interface') || this.at('type') || this.at('class')) {
            // Declarations with no runtime behaviour we can express.
            this.next();
            this.skipBalanced();
            return null;
        }
        if (this.at('return')) {
            this.next();
            let value = null;
            if (!this.at('punct', ';') && !this.at('punct', '}')) value = this.parseExpression();
            this.eat('punct', ';');
            return {type: 'Return', value};
        }
        if (this.at('break')) {
            this.next();
            this.eat('punct', ';');
            return {type: 'Break'};
        }
        if (this.at('continue')) {
            this.next();
            this.eat('punct', ';');
            return {type: 'Continue'};
        }
        if (this.at('punct', '{')) return {type: 'Block', body: this.parseBlock()};

        const expr = this.parseExpression();
        this.eat('punct', ';');
        return {type: 'ExpressionStatement', expr};
    }

    /** Step over a `{...}` (or `(...)`) group whose contents we ignore. */
    skipBalanced () {
        while (!this.at('punct', '{') && !this.at('eof') && !this.at('punct', ';')) this.next();
        if (this.eat('punct', ';')) return;
        let depth = 0;
        do {
            const t = this.next();
            if (t.type === 'punct' && t.value === '{') depth++;
            if (t.type === 'punct' && t.value === '}') depth--;
            if (t.type === 'eof') return;
        } while (depth > 0);
    }

    parseDeclaration () {
        const kind = this.next().value;
        const decls = [];
        do {
            const name = this.expect('ident').value;
            this.skipTypeAnnotation();
            let init = null;
            if (this.eat('punct', '=')) init = this.parseExpression();
            decls.push({name, init});
        } while (this.eat('punct', ','));
        this.eat('punct', ';');
        return {type: 'Declaration', kind, decls};
    }

    parseParams () {
        this.expect('punct', '(');
        const params = [];
        while (!this.at('punct', ')') && !this.at('eof')) {
            const name = this.at('ident') ? this.next().value : this.next().value;
            this.skipTypeAnnotation();
            if (this.eat('punct', '=')) this.parseExpression();
            params.push(name);
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', ')');
        return params;
    }

    parseFunction () {
        this.expect('function');
        const name = this.at('ident') ? this.next().value : null;
        const params = this.parseParams();
        this.skipTypeAnnotation();
        const body = this.parseBlock();
        return {type: 'FunctionDeclaration', name, params, body};
    }

    parseIf () {
        this.expect('if');
        this.expect('punct', '(');
        const test = this.parseExpression();
        this.expect('punct', ')');
        const consequent = this.parseBlockOrStatement();
        let alternate = null;
        if (this.eat('else')) {
            alternate = this.at('if') ? [this.parseIf()] : this.parseBlockOrStatement();
        }
        return {type: 'If', test, consequent, alternate};
    }

    parseWhile () {
        this.expect('while');
        this.expect('punct', '(');
        const test = this.parseExpression();
        this.expect('punct', ')');
        return {type: 'While', test, body: this.parseBlockOrStatement()};
    }

    parseFor () {
        this.expect('for');
        this.expect('punct', '(');
        let init = null;
        if (!this.at('punct', ';')) {
            init = (this.at('let') || this.at('const') || this.at('var')) ?
                this.parseDeclaration() :
                {type: 'ExpressionStatement', expr: this.parseExpression()};
        }
        this.eat('punct', ';');
        const test = this.at('punct', ';') ? null : this.parseExpression();
        this.eat('punct', ';');
        const update = this.at('punct', ')') ? null : this.parseExpression();
        this.expect('punct', ')');
        return {type: 'For', init, test, update, body: this.parseBlockOrStatement()};
    }

    parseEnum () {
        this.expect('enum');
        const name = this.expect('ident').value;
        this.expect('punct', '{');
        const members = [];
        let nextValue = 0;
        while (!this.at('punct', '}') && !this.at('eof')) {
            const member = this.expect('ident').value;
            let value = nextValue++;
            if (this.eat('punct', '=')) {
                const expr = this.parseExpression();
                if (expr.type === 'Number') {
                    value = Number(expr.value);
                    nextValue = value + 1;
                }
            }
            members.push({name: member, value});
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', '}');
        return {type: 'Enum', name, members};
    }

    parseNamespace () {
        this.expect('namespace');
        const name = this.expect('ident').value;
        const body = this.parseBlock();
        return {type: 'Namespace', name, body};
    }

    parseExpression () {
        return this.parseAssignment();
    }

    parseAssignment () {
        const left = this.parseBinary(0);
        for (const op of ['=', '+=', '-=', '*=', '/=']) {
            if (this.at('punct', op)) {
                this.next();
                const right = this.parseAssignment();
                return {type: 'Assignment', op, left, right};
            }
        }
        return left;
    }

    parseBinary (minPrec) {
        let left = this.parseUnary();
        for (;;) {
            const t = this.peek();
            if (t.type !== 'punct') break;
            const prec = BINARY_PRECEDENCE[t.value];
            if (!prec || prec < minPrec) break;
            this.next();
            const right = this.parseBinary(prec + 1);
            left = {type: 'Binary', op: t.value, left, right};
        }
        return left;
    }

    parseUnary () {
        if (this.at('punct', '!') || this.at('punct', '-') || this.at('punct', '+')) {
            const op = this.next().value;
            return {type: 'Unary', op, argument: this.parseUnary()};
        }
        if (this.at('punct', '++') || this.at('punct', '--')) {
            const op = this.next().value;
            return {type: 'Update', op, prefix: true, argument: this.parseUnary()};
        }
        return this.parsePostfix();
    }

    parsePostfix () {
        let node = this.parsePrimary();
        for (;;) {
            if (this.eat('punct', '.')) {
                const name = this.next().value;
                node = {type: 'Member', object: node, name};
                continue;
            }
            if (this.at('punct', '(')) {
                node = {type: 'Call', callee: node, args: this.parseArguments()};
                continue;
            }
            if (this.eat('punct', '[')) {
                const index = this.parseExpression();
                this.expect('punct', ']');
                node = {type: 'Index', object: node, index};
                continue;
            }
            if (this.at('punct', '++') || this.at('punct', '--')) {
                const op = this.next().value;
                node = {type: 'Update', op, prefix: false, argument: node};
                continue;
            }
            break;
        }
        return node;
    }

    parseArguments () {
        this.expect('punct', '(');
        const args = [];
        while (!this.at('punct', ')') && !this.at('eof')) {
            args.push(this.parseExpression());
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', ')');
        return args;
    }

    parsePrimary () {
        const t = this.peek();
        if (t.type === 'number') {
            this.next();
            return {type: 'Number', value: t.value};
        }
        if (t.type === 'string') {
            this.next();
            return {type: 'String', value: t.value};
        }
        if (t.type === 'template') {
            this.next();
            return {type: 'Template', value: t.value};
        }
        if (t.type === 'true' || t.type === 'false') {
            this.next();
            return {type: 'Boolean', value: t.type === 'true'};
        }
        if (t.type === 'null' || t.type === 'undefined') {
            this.next();
            return {type: 'Null'};
        }
        if (t.type === 'function') {
            this.next();
            const params = this.parseParams();
            this.skipTypeAnnotation();
            const body = this.parseBlock();
            return {type: 'FunctionExpression', params, body};
        }
        if (t.type === 'new') {
            this.next();
            return this.parsePostfix();
        }
        if (t.type === 'ident') {
            this.next();
            // Arrow functions: `sprite => {...}` and `(a, b) => {...}`.
            if (this.at('punct', '=>')) {
                this.next();
                const body = this.at('punct', '{') ? this.parseBlock() :
                    [{type: 'Return', value: this.parseExpression()}];
                return {type: 'FunctionExpression', params: [t.value], body};
            }
            return {type: 'Identifier', name: t.value};
        }
        if (this.at('punct', '(')) {
            // Either a parenthesised expression or an arrow parameter list.
            const save = this.pos;
            try {
                const params = this.parseParams();
                if (this.at('punct', '=>')) {
                    this.next();
                    const body = this.at('punct', '{') ? this.parseBlock() :
                        [{type: 'Return', value: this.parseExpression()}];
                    return {type: 'FunctionExpression', params, body};
                }
            } catch (e) { /* not a parameter list after all */ }
            this.pos = save;
            this.expect('punct', '(');
            const expr = this.parseExpression();
            this.expect('punct', ')');
            return expr;
        }
        if (this.eat('punct', '[')) {
            const items = [];
            while (!this.at('punct', ']') && !this.at('eof')) {
                items.push(this.parseExpression());
                if (!this.eat('punct', ',')) break;
            }
            this.expect('punct', ']');
            return {type: 'Array', items};
        }
        if (this.eat('punct', '{')) {
            // Object literals appear in a few library calls; their shape
            // is never something we translate, so they become opaque.
            let depth = 1;
            while (depth > 0 && !this.at('eof')) {
                const tok = this.next();
                if (tok.type === 'punct' && tok.value === '{') depth++;
                if (tok.type === 'punct' && tok.value === '}') depth--;
            }
            return {type: 'Object'};
        }
        this.next();
        return {type: 'Unknown', token: t.value};
    }
}

/**
 * @param {string} source MakeCode TypeScript
 * @returns {object} the program AST
 */
export function parseMakeCodeTs (source) {
    return new Parser(tokenize(source)).parseProgram();
}

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
    '+=', '-=', '*=', '/=', '%=', '=>', '...', '>>>', '<<', '>>',
    '{', '}', '(', ')', '[', ']', ';', ',', '.', ':', '?',
    '+', '-', '*', '/', '%', '<', '>', '=', '!', '&', '|', '^', '~'
];

/**
 * Identifiers may hold any Unicode letter, because JavaScript's do and
 * real programs use them: `let ausgewählt = 0` is ordinary in the German
 * Calliope material, and an ASCII-only rule splits it into `ausgew` and
 * `hlt` with the umlaut dropped — which corrupts every token after it and
 * surfaces as a syntax error four lines further down.
 */
const IDENT_START = /[\p{L}\p{Nl}_$]/u;
const IDENT_PART = /[\p{L}\p{N}_$]/u;

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
        if (IDENT_START.test(c)) {
            let s = '';
            while (i < src.length && IDENT_PART.test(src[i])) s += src[i++];
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
    // Bitwise and shifts have no Scratch equivalent, but they must PARSE:
    // leaving them out did not fail, it silently ended the expression and
    // read the rest as a new statement.
    '|': 3, '^': 3, '&': 3,
    '==': 4, '!=': 4, '===': 4, '!==': 4,
    '<': 5, '>': 5, '<=': 5, '>=': 5,
    '<<': 6, '>>': 6, '>>>': 6,
    '+': 7, '-': 7,
    '*': 8, '/': 8, '%': 8
};

/** The dotted name of a template literal's tag, for `img` / `assets.image`. */
function taggedName (node) {
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

/** Collects `a.b(` and `f(` call names from a token stream the parser is skipping. */
class CallSpotter {
    constructor () {
        this.tokens = [];
    }

    push (t) {
        this.tokens.push(t);
    }

    calls () {
        const out = new Set();
        const tk = this.tokens;
        for (let i = 0; i < tk.length; i++) {
            if (!(tk[i].type === 'punct' && tk[i].value === '(')) continue;
            let j = i - 1;
            const parts = [];
            while (j >= 0 && tk[j].type === 'ident') {
                parts.unshift(tk[j].value);
                if (j >= 1 && tk[j - 1].type === 'punct' && tk[j - 1].value === '.') j -= 2;
                else break;
            }
            // A method DEFINITION (`show() {`, `get kind(): number {`) is not a call.
            let depth = 0;
            let k = i;
            for (; k < tk.length; k++) {
                if (tk[k].type === 'punct' && tk[k].value === '(') depth++;
                if (tk[k].type === 'punct' && tk[k].value === ')' && --depth === 0) break;
            }
            const after = tk[k + 1];
            const isDefinition = parts.length === 1 && after && after.type === 'punct' && (after.value === '{' || after.value === ':');
            if (parts.length && !isDefinition) out.add(parts.join('.'));
        }
        return [...out];
    }
}

const parameterDefaultStatements = params => (params.parameterDefaults || []).map(({name,value})=>({
    type:'If',test:{type:'Binary',op:'===',left:{type:'Identifier',name},right:{type:'Undefined'}},
    consequent:[{type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name},right:value}}],alternate:[]
}));

class Parser {
    constructor (tokens) {
        this.toks = tokens;
        this.pos = 0;
        this.parameterDefaults = false;
    }

    /** The default-parameter statements, when the caller asked for them (parseMakeCodeTs). */
    defaultStatements (params) {
        return this.parameterDefaults ? parameterDefaultStatements(params) : [];
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
    /**
     * Skip `: number[]`. Returns true when the type was an array — the
     * translator needs that to declare a Scratch LIST rather than a
     * variable, and `let a: number[] = []` carries the fact nowhere else.
     */
    skipTypeAnnotation () {
        // The type's text rides along (`lastType`): `let bird: game.LedSprite = null`
        // says it holds a sprite, and nothing else in the declaration does.
        this.lastType = '';
        if (!this.eat('punct', ':')) return false;
        let depth = 0;
        let isArray = false;
        let prev = this.toks[this.pos - 1];
        let complete = false;
        const prefixes = new Set(['readonly','keyof','typeof','unique','infer']);
        const continuations = new Set(['.','[','<','|','&','=>','?']);
        for (;;) {
            const t = this.peek();
            if (t.type === 'eof') return isArray;
            // A type ends at its line unless the line ends mid-type (`A |`):
            // `let p: Player` then `const all: Player[] = []` on the next line
            // are two declarations (the second was read as part of the type).
            if (depth === 0 && prev && t.line > prev.line && this.lastType &&
                !(prev.type === 'punct' && ['|', '&', '.', '<', ',', '=>', ':'].includes(prev.value))) return isArray;
            prev = t;
            // A return type ends at the function body: `): void {`.
            if (depth === 0 && t.type === 'punct' && t.value === '{') return isArray;
            // Once a type is complete, only a type suffix/operator can
            // continue it. A following declaration or expression belongs to
            // the program, even when an optional semicolon was omitted.
            if (depth === 0 && complete && !(t.type === 'punct' && continuations.has(t.value))) return isArray;
            if (t.type === 'punct' && '<[('.includes(t.value)) depth++;
            if (t.type === 'punct' && t.value === '[') isArray = true;
            if (t.type === 'ident' && t.value === 'Array') isArray = true;
            if (t.type === 'punct' && ['>',']',')','>>','>>>'].includes(t.value)) {
                if (depth === 0) return isArray;
                depth=Math.max(0,depth-(t.value.startsWith('>')?t.value.length:1));
                complete=true;
            } else if (depth === 0) {
                complete = t.type !== 'punct' && !prefixes.has(t.value);
            }
            if (depth === 0 && t.type === 'punct' && (t.value === '=' || t.value === ';' || t.value === ',')) return isArray;
            // (An unmatched `)` ends the type above, before the decrement; a
            // `)` that closes the type's own `(`, as in `fn: () => void`, is
            // part of the type and is consumed here.)
            this.lastType += this.next().value;
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
            const statement = this.parseStatement();
            return statement ? {...statement, exported: true} : statement;
        }
        if (this.at('let') || this.at('const') || this.at('var')) return this.parseDeclaration();
        if (this.at('function')) return this.parseFunction();
        if (this.at('if')) return this.parseIf();
        if (this.at('while')) return this.parseWhile();
        if (this.at('do')) return this.parseDoWhile();
        if (this.at('for')) return this.parseFor();
        if (this.at('enum')) return this.parseEnum();
        if (this.at('namespace')) return this.parseNamespace();
        if (this.at('interface')) {
            // No runtime behaviour, but its field names and types say what a
            // record of that type holds (radio-dashboard's `interface Client`
            // is what its object literals are).
            return this.parseInterface();
        }
        if (this.at('type')) {
            // A type alias: no runtime behaviour.
            this.next();
            this.skipBalanced();
            return null;
        }
        if (this.at('class')) return this.parseClass();
        if (this.at('switch')) return this.parseSwitch();
        if (this.at('return')) {
            const ret = this.next();
            let value = null;
            // A bare `return` ends at its line (automatic semicolon insertion):
            // `return` then `default:` on the next line is not `return default`.
            if (!this.at('punct', ';') && !this.at('punct', '}') && !this.at('case') && !this.at('default') &&
                this.peek().line === ret.line) value = this.parseExpression();
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
    /** Skip to the end of a braced body; returns the dotted calls (`a.b(`) seen in it. */
    skipBalanced () {
        const seen = new CallSpotter();
        while (!this.at('punct', '{') && !this.at('eof') && !this.at('punct', ';')) seen.push(this.next());
        if (this.eat('punct', ';')) return seen.calls();
        let depth = 0;
        do {
            const t = this.next();
            seen.push(t);
            if (t.type === 'punct' && t.value === '{') depth++;
            if (t.type === 'punct' && t.value === '}') depth--;
            if (t.type === 'eof') return seen.calls();
        } while (depth > 0);
        return seen.calls();
    }

    /** The dotted calls in the tokens from `start` to here, for a refusal that names them. */
    callsSince (start) {
        const seen = new CallSpotter();
        for (let i = start; i < this.pos; i++) seen.push(this.toks[i]);
        return seen.calls();
    }

    /**
     * A field's type, `id: number` — on ONE line, because a class body may
     * leave out the semicolons (`id: number` then `icon: number` on the
     * next line), and the ordinary annotation skipper would read both lines
     * as one type.
     */
    skipFieldType () {
        this.lastType = '';
        if (!this.eat('punct', ':')) return;
        const line = this.peek().line;
        let depth = 0;
        while (!this.at('eof')) {
            const t = this.peek();
            if (depth === 0 && (t.line !== line || (t.type === 'punct' && ['=', ';', '}', ','].includes(t.value)))) return;
            if (t.type === 'punct' && '<[('.includes(t.value)) depth++;
            if (t.type === 'punct' && '>])'.includes(t.value)) depth--;
            this.lastType += this.next().value;
        }
    }

    /**
     * `interface Client { id: number; sprite: game.LedSprite }` — the field
     * names and their types, which is what a record of that type holds.
     */
    parseInterface () {
        const start = this.pos;
        this.expect('interface');
        const name = this.at('ident') ? this.next().value : '';
        if (!this.at('punct', '{')) {
            this.skipBalanced();
            return null;
        }
        this.next();
        const fields = [];
        while (!this.at('punct', '}') && !this.at('eof')) {
            if (this.eat('punct', ';') || this.eat('punct', ',')) continue;
            if (!this.at('ident')) {
                // A method signature or an index signature: no data field.
                this.pos = start;
                this.skipBalanced();
                return {type: 'Interface', name, fields, opaque: true};
            }
            const field = this.next().value;
            this.eat('punct', '?');
            if (this.at('punct', '(')) {
                this.pos = start;
                this.skipBalanced();
                return {type: 'Interface', name, fields, opaque: true};
            }
            this.skipFieldType();
            fields.push({name: field, typeName: this.lastType});
        }
        this.expect('punct', '}');
        return {type: 'Interface', name, fields};
    }

    /**
     * A class: its fields (with their initialisers), its constructor and its
     * methods. The translator lowers a class to parallel arrays — one per
     * field, an instance being its index — and its methods to procedures
     * that take the instance first; what it cannot lower it refuses by name,
     * so `calls` (every call inside) rides along for that refusal (census
     * 2026-09-27: control.createBuffer and radio.sendBuffer vanished inside
     * one when a class was skipped whole).
     */
    parseClass () {
        const start = this.pos;
        this.expect('class');
        const name = this.at('ident') ? this.next().value : '';
        const node = {type: 'Class', name, fields: [], methods: [], ctor: null, unsupported: []};
        if (!this.at('punct', '{')) {
            // `class A extends B`, `implements`, generics: no lowering here.
            node.unsupported.push(`class ${name} with a heritage clause`);
            this.skipBalanced();
            node.calls = this.callsSince(start);
            return node;
        }
        this.next();
        const MODIFIERS = new Set(['public', 'private', 'protected', 'readonly']);
        while (!this.at('punct', '}') && !this.at('eof')) {
            if (this.eat('punct', ';')) continue;
            let isStatic = false;
            for (;;) {
                const t = this.peek();
                const nextIsName = this.peek(1).type === 'ident' || MODIFIERS.has(this.peek(1).value) ||
                    ['get', 'set', 'constructor'].includes(this.peek(1).value);
                if ((t.type === 'public' || t.type === 'private' || t.type === 'static' ||
                    (t.type === 'ident' && MODIFIERS.has(t.value))) && nextIsName) {
                    if (t.type === 'static') isStatic = true;
                    this.next();
                    continue;
                }
                break;
            }
            const t = this.next();
            const member = t.value;
            // `get kind(): number {` / `set kind(x) {`
            if ((member === 'get' || member === 'set') && this.at('ident') && this.peek(1).type === 'punct' &&
                this.peek(1).value === '(') {
                const prop = this.next().value;
                const params = this.parseParams();
                const paramTypes = this.lastParamTypes;
                this.skipTypeAnnotation();
                const returnType = this.lastType;
                const body = this.parseBlock();
                node.methods.push({name: prop, kind: member, params, paramTypes, returnType, body, isStatic});
                continue;
            }
            if (this.at('punct', '(')) {
                const params = this.parseParams();
                const paramTypes = this.lastParamTypes;
                this.skipTypeAnnotation();
                const returnType = this.lastType;
                const body = this.parseBlock();
                if (member === 'constructor') node.ctor = {params, paramTypes, body};
                else node.methods.push({name: member, kind: 'method', params, paramTypes, returnType, body, isStatic});
                continue;
            }
            this.eat('punct', '?');
            this.skipFieldType();
            const typeName = this.lastType;
            let init = null;
            if (this.eat('punct', '=')) init = this.parseExpression();
            node.fields.push({name: member, typeName, init, isStatic});
        }
        this.expect('punct', '}');
        node.calls = this.callsSince(start);
        return node;
    }

    /**
     * `switch (d) { case A: … break; default: … }`. It was not read at all:
     * `switch` became an Unknown statement and every case label a stray
     * Number statement (census 2026-09-28: gameofLife, karel, infection).
     */
    parseSwitch () {
        this.expect('switch');
        this.expect('punct', '(');
        const discriminant = this.parseExpression();
        this.expect('punct', ')');
        this.expect('punct', '{');
        const cases = [];
        while (!this.at('punct', '}') && !this.at('eof')) {
            let test = null;
            if (this.eat('case')) test = this.parseExpression();
            else this.expect('default');
            this.expect('punct', ':');
            const body = [];
            while (!this.at('case') && !this.at('default') && !this.at('punct', '}') && !this.at('eof')) {
                const st = this.parseStatement();
                if (st) body.push(st);
            }
            cases.push({test, body});
        }
        this.expect('punct', '}');
        return {type: 'Switch', discriminant, cases};
    }

    parseDeclaration () {
        const kind = this.next().value;
        const decls = [];
        do {
            const name = this.expect('ident').value;
            const isArray = this.skipTypeAnnotation();
            const typeName = this.lastType;
            let init = null;
            if (this.eat('punct', '=')) init = this.parseExpression();
            decls.push({name, init, isArray, typeName});
        } while (this.eat('punct', ','));
        this.eat('punct', ';');
        return {type: 'Declaration', kind, decls};
    }

    parseParams () {
        this.expect('punct', '(');
        const params = [];
        // Each parameter's type text, by name (`p: Player`, `arr: boolean[]`):
        // what a record or an array parameter is known by.
        const types = {};
        Object.defineProperties(params,{optionalParams:{value:[]},parameterDefaults:{value:[]}});
        while (!this.at('punct', ')') && !this.at('eof')) {
            // `radio.onDataPacketReceived(({receivedString: text}) => ...)`
            // binds a destructured object. The names that reach the body are
            // the ones after each colon (or the key itself, when shorthand).
            if (this.at('punct', '{')) {
                params.push(...this.parseObjectPatternNames());
            } else {
                const name = this.next().value;
                // `input?: Buffer` — an optional parameter: the marker changes
                // the type, not the name bound in the body; a default is
                // applied at the top of the body when the argument is undefined.
                if (this.eat('punct', '?')) params.optionalParams.push(name);
                const isArray = this.skipTypeAnnotation();
                types[name] = {text: this.lastType, isArray};
                if (this.eat('punct', '=')) {
                    params.optionalParams.push(name);
                    params.parameterDefaults.push({name, value: this.parseExpression()});
                }
                params.push(name);
            }
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', ')');
        this.lastParamTypes = types;
        return params;
    }

    /** Read `{a, b: c}` and return the names it binds. */
    parseObjectPatternNames () {
        this.expect('punct', '{');
        const names = [];
        while (!this.at('punct', '}') && !this.at('eof')) {
            const key = this.next().value;
            names.push(this.eat('punct', ':') ? this.next().value : key);
            if (this.eat('punct', '=')) this.parseExpression();
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', '}');
        this.skipTypeAnnotation();
        return names;
    }

    parseFunction () {
        this.expect('function');
        const name = this.at('ident') ? this.next().value : null;
        const params = this.parseParams();
        const paramTypes = this.lastParamTypes;
        this.skipTypeAnnotation();
        const returnType = this.lastType;
        const body = this.parseBlock();
        return {type: 'FunctionDeclaration', name, params, paramTypes, returnType,
            optionalParams: params.optionalParams, body: [...this.defaultStatements(params), ...body]};
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

    /**
     * `do BODY while (TEST)` as the loop it is: `while (true) { BODY; if
     * (!(TEST)) break }`, which the translators already lower (the body runs
     * once before the test). It used to be an Unknown statement followed by
     * the `while (TEST);` read as a SEPARATE, empty loop (pxt-ev3's gyroboy).
     */
    parseDoWhile () {
        this.expect('do');
        const body = this.parseBlockOrStatement();
        this.expect('while');
        this.expect('punct', '(');
        const test = this.parseExpression();
        this.expect('punct', ')');
        this.eat('punct', ';');
        const exit = {type: 'If', test: {type: 'Unary', op: '!', argument: test}, consequent: [{type: 'Break'}], alternate: null};
        return {type: 'While', test: {type: 'Boolean', value: true}, body: [...body, exit]};
    }

    parseFor () {
        this.expect('for');
        this.expect('punct', '(');
        // `for (let x of list)`. It was read as a counted for: `let x`, then
        // `of` as the test — and the body came out as stray statements
        // (census 2026-09-27: "Identifier statement" in three apps).
        if ((this.at('let') || this.at('const') || this.at('var')) &&
            this.peek(1).type === 'ident' && this.peek(2).type === 'ident' && this.peek(2).value === 'of') {
            const kind = this.next().value;
            const name = this.next().value;
            this.next();
            const iterable = this.parseExpression();
            this.expect('punct', ')');
            return {type: 'ForOf', name, kind, iterable, body: this.parseBlockOrStatement()};
        }
        let init = null;
        if (!this.at('punct', ';')) {
            init = (this.at('let') || this.at('const') || this.at('var')) ?
                this.parseDeclaration() :
                {type: 'ExpressionStatement', expr: this.parseExpression()};
        }
        // `for (let x: T of list)`: the typed form the check above does not see.
        if (this.eat('ident', 'of')) {
            if (init?.type !== 'Declaration' || init.decls.length !== 1 || init.decls[0].init) {
                throw new Error('for-of needs one declared loop variable');
            }
            const iterable = this.parseExpression();
            this.expect('punct', ')');
            return {type: 'ForOf', name: init.decls[0].name, kind: init.kind, iterable, body: this.parseBlockOrStatement()};
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
            let initializer = null;
            if (this.eat('punct', '=')) {
                const expr = initializer = this.parseExpression();
                if (expr.type === 'Number') {
                    value = Number(expr.value);
                    nextValue = value + 1;
                }
            }
            members.push({name: member, value, initializer});
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
        const left = this.parseConditional();
        for (const op of ['=', '+=', '-=', '*=', '/=', '%=']) {
            if (this.at('punct', op)) {
                this.next();
                const right = this.parseAssignment();
                return {type: 'Assignment', op, left, right};
            }
        }
        return left;
    }

    /**
     * `test ? a : b`. It was not read at all: the parse stopped at the `?`
     * and what followed came out as stray statements (`let m = t < 10 ?
     * "COLD" : "WARM"` stored the COMPARISON). Right-associative, below `||`.
     */
    parseConditional () {
        const test = this.parseBinary(0);
        if (!this.at('punct', '?')) return test;
        this.next();
        const consequent = this.parseAssignment();
        this.expect('punct', ':');
        const alternate = this.parseAssignment();
        return {type: 'Conditional', test, consequent, alternate};
    }

    parseBinary (minPrec) {
        let left = this.parseUnary();
        for (;;) {
            const t = this.peek();
            // Type assertions have relational precedence and erase only their
            // type; the expression's evaluation and identity are unchanged.
            if (t.type === 'ident' && t.value === 'as' && minPrec <= 5) {
                this.next();
                this.expect('ident');
                while (this.eat('punct', '.')) this.expect('ident');
                while (this.eat('punct', '[')) this.expect('punct', ']');
                continue;
            }
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
        if (this.at('punct', '!') || this.at('punct', '-') || this.at('punct', '+') ||
            this.at('punct', '~') || this.at('ident', 'typeof')) {
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
            if (this.at('template')) {
                // A TAGGED template: `img`…`` and `assets.image`name``.
                // The tag decides what the text means, so it travels with
                // it — this is how the artwork is found later.
                const tok = this.next();
                node = {type: 'Template', value: tok.value, tag: taggedName(node)};
                continue;
            }
            if (this.eat('punct', '[')) {
                const index = this.parseExpression();
                this.expect('punct', ']');
                node = {type: 'Index', object: node, index};
                continue;
            }
            if (this.at('punct', '++') || this.at('punct', '--')) {
                // Postfix updates cannot cross a line terminator. On the
                // next line this token begins a separate prefix update.
                if (this.peek().line > this.toks[this.pos - 1]?.line) break;
                const op = this.next().value;
                node = {type: 'Update', op, prefix: false, argument: node};
                break;
            }
            break;
        }
        return node;
    }

    /** `{a: 1, b}` as [{key, value}], or null (position unspecified) when it is not that shape. */
    tryObjectProps () {
        try {
            this.expect('punct', '{');
            const props = [];
            while (!this.at('punct', '}')) {
                const k = this.next();
                if (!['ident', 'string', 'number'].includes(k.type) && !KEYWORDS.has(k.type)) return null;
                if (this.eat('punct', ':')) props.push({key: k.value, value: this.parseExpression()});
                else if (k.type === 'ident' && (this.at('punct', ',') || this.at('punct', '}'))) {
                    props.push({key: k.value, value: {type: 'Identifier', name: k.value}});
                } else return null;
                if (!this.eat('punct', ',')) break;
            }
            this.expect('punct', '}');
            return props;
        } catch (e) {
            return null;
        }
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
            // An UNTAGGED template with a placeholder is a string: \`player ${p.id}\`
            // is "player " + p.id. Without one it stays a Template: micro:bit's
            // \`basic.showLeds(\`# . #…\`)\` is a picture, read by its translator.
            // (A tagged one, img\`…\`, is art: see the postfix loop.)
            return (t.value.includes('${') && templateString(t.value)) || {type: 'Template', value: t.value};
        }
        if (t.type === 'true' || t.type === 'false') {
            this.next();
            return {type: 'Boolean', value: t.type === 'true'};
        }
        if (t.type === 'null' || t.type === 'undefined') {
            this.next();
            return {type: t.type === 'undefined' ? 'Undefined' : 'Null'};
        }
        if (t.type === 'function') {
            this.next();
            const params = this.parseParams();
            const paramTypes = this.lastParamTypes;
            this.skipTypeAnnotation();
            const returnType = this.lastType;
            const body = this.parseBlock();
            return {type: 'FunctionExpression', params, paramTypes, returnType, optionalParams:params.optionalParams || [], body: [...this.defaultStatements(params), ...body]};
        }
        if (t.type === 'new') {
            // `new Player()`: a call, marked, so the translator knows it
            // constructs (a class lowered to records allocates one).
            this.next();
            // `new` binds to the constructor and its own argument list only:
            // `new X(1).m()` constructs X(1), then calls m on the result (the
            // caller's postfix loop reads `.m()`); `new X` takes no arguments.
            // `isNew` and `constructorCall` mark the same fact for both readers.
            let callee = this.parsePrimary();
            while (this.eat('punct', '.')) callee = {type: 'Member', object: callee, name: this.next().value};
            return {type: 'Call', callee, args: this.at('punct', '(') ? this.parseArguments() : [],
                isNew: true, constructorCall: true};
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
                const paramTypes = this.lastParamTypes;
                if (this.at('punct', '=>')) {
                    this.next();
                    const body = this.at('punct', '{') ? this.parseBlock() :
                        [{type: 'Return', value: this.parseExpression()}];
                    return {type: 'FunctionExpression', params, paramTypes, optionalParams:params.optionalParams || [], body: [...this.defaultStatements(params), ...body]};
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
        if (this.at('punct', '{')) {
            // `{id: id, sprite: game.createSprite(0, 0)}`: the properties,
            // which the translator can lower as a record. Anything else in
            // braces (a spread, a method) is kept opaque, with the calls
            // inside it, so the refusal can name them.
            const start = this.pos;
            const props = this.tryObjectProps();
            if (props) return {type: 'Object', props, calls: this.callsSince(start)};
            this.pos = start;
            this.next();
            const seen = new CallSpotter();
            let depth = 1;
            while (depth > 0 && !this.at('eof')) {
                const tok = this.next();
                seen.push(tok);
                if (tok.type === 'punct' && tok.value === '{') depth++;
                if (tok.type === 'punct' && tok.value === '}') depth--;
            }
            return {type: 'Object', calls: seen.calls()};
        }
        this.next();
        return {type: 'Unknown', token: t.value};
    }
}

/**
 * @param {string} source MakeCode TypeScript
 * @returns {object} the program AST
 */
/**
 * @param {string} source
 * @param {{parameterDefaults?: boolean}} [opts] parameterDefaults: start each
 *   function body with `if (p === undefined) p = <default>` for its default
 *   parameters. Only a translator whose `undefined` is a real value (Arcade's
 *   value heap) may ask for it: one that lowers `undefined` to 0 would apply
 *   the default when 0 was passed.
 */
/**
 * An untagged template's text as string concatenation, or null when it cannot
 * be read as one. Each \`${…}\` is parsed as an expression of its own.
 */
function templateString (raw) {
    const parts = [];
    let text = '';
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '\\' && i + 1 < raw.length) {
            const escaped = raw[++i];
            text += {n: '\n', t: '\t', r: '\r'}[escaped] ?? escaped;
            continue;
        }
        if (raw[i] === '$' && raw[i + 1] === '{') {
            let depth = 1;
            let j = i + 2;
            while (j < raw.length && depth) {
                if (raw[j] === '{') depth++;
                else if (raw[j] === '}') depth--;
                j++;
            }
            if (depth) return null;
            const parser = new Parser(tokenize(raw.slice(i + 2, j - 1)));
            let expr;
            try { expr = parser.parseExpression(); } catch (e) { return null; }
            if (!parser.at('eof')) return null;
            parts.push({type: 'String', value: text}, expr);
            text = '';
            i = j - 1;
            continue;
        }
        text += raw[i];
    }
    parts.push({type: 'String', value: text});
    // \`${n}\` alone is still text: "" + n, as in TypeScript.
    return parts.reduce((left, right) => ({type: 'Binary', op: '+', left, right}));
}

export function parseMakeCodeTs (source, opts = {}) {
    const parser = new Parser(tokenize(source));
    parser.parameterDefaults = Boolean(opts.parameterDefaults);
    return parser.parseProgram();
}

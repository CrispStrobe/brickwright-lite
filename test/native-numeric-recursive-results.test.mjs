import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {numericRecursiveNormalResults} from '../overlay/scratch-gui/src/lib/bw-makecode/numeric-recursive-normal-results.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {nativeArrayAddHelperSource, inspectNativeArrayAddHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';

// Profiles are immutable parser configurations, not reusable source proofs.
// In particular a spread copy is not a canonical generated-helper profile.
const profile = GENERATED_HELPER_PROFILES.ordinary;
const parse = text => parseMakeCodeTs(text, profile);
const metadata = new Set(['originalBody', 'parameterDefaults', 'paramTypes', 'returnType',
    'ordinaryParameterDefaultNames', 'parameterDefaultPrologue', 'typeParameters', 'typeArguments']);
const walk = (value, output = [], seen = new Set()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return output;
    seen.add(value);
    if (!Array.isArray(value)) output.push(value);
    for (const key of Object.keys(value)) {
        if (metadata.has(key)) continue;
        const d = Object.getOwnPropertyDescriptor(value, key);
        if (d && Object.hasOwn(d, 'value')) walk(d.value, output, seen);
    }
    return output;
};
const calls = (program, names) => walk(program).filter(node => node.type === 'Call' &&
    node.callee?.type === 'Identifier' && names.includes(node.callee.name));
const fn = (program, name) => {
    const result = program.body.find(node => node.type === 'FunctionDeclaration' && node.name === name);
    assert.ok(result, `actual function ${name}`); return result;
};
const rootCall = (program, name) => {
    const row = program.body.flatMap(node => node.type === 'Declaration' ? node.decls : [])
        .find(row => row.init?.type === 'Call' && row.init.callee?.name === name);
    assert.ok(row, `actual root call ${name}`); return row.init;
};
const statement = text => parse(text).body[0];
const expression = text => statement(`let donor=${text};`).decls[0].init;
const fib = 'function fib(n:number){if(n<2){return n}return fib(n-1)+fib(n-2)}let result=fib(6);';
const descend = 'function descend(n:number){if(n<=0){return 0}n-=1;return descend(n)+1}let result=descend(4);';
const header = nativeArrayAddHelperSource('__bwBinaryAdd', true, true);
const eligible = (text, names = ['fib']) => {
    const program = parse(text), selected = calls(program, names);
    assert.ok(selected.length, 'real selected calls exist');
    const proof = numericRecursiveNormalResults(program, profile);
    assert.equal(Object.isFrozen(proof), true);
    assert.deepEqual(Object.keys(proof).sort(), ['current', 'has']);
    assert.equal(proof.current(), true);
    for (const call of selected) assert.equal(proof.has(call), true, `${call.callee.name} baseline actual call`);
    return {program, selected, proof};
};
// Semantic negatives always construct a NEW proof after editing the current
// program. Query retained actual Calls accepted by the paired fresh baseline;
// never mistake invalidation of the old proof for semantic rejection.
const refusesEdited = (text, name, edit, names = [name]) => {
    const {program, proof: baseline} = eligible(text, names), actual = rootCall(program, name);
    assert.equal(baseline.has(actual), true);
    edit(program, actual);
    assert.ok(walk(program).includes(actual), 'negative retains the actual Call in an executable source slot');
    const fresh = numericRecursiveNormalResults(program, profile);
    assert.equal(typeof fresh.current(), 'boolean');
    assert.equal(fresh.has(actual), false, 'fresh semantic proof rejects the retained actual call');
    return {program, actual, fresh};
};
const domain = program => inspectNativeArrayBinaryDomains(program, profile);
const domainGood = text => {
    const program = parse(text), before = JSON.stringify(program), result = domain(program);
    assert.equal(result.reason, null); assert.equal(result.helpers.size, 1);
    assert.equal(result.current(), true); assert.equal(JSON.stringify(program), before);
    return {program, result};
};

test('recursive Number results use actual fib and mutual-call entries without changing generic cyclic facts', () => {
    const {program, selected, proof} = eligible(fib);
    assert.equal(selected.length, 3, 'two actual recursive calls and one actual root entry');
    assert.notEqual(selected[0], selected[1]);
    const graph = analyseSourceValueProducers(program, {arrayValues: true, parenthesized: true,
        unboundIsOpaque: true, declaredLocalUndefined: true, initializationEntries: true});
    assert.ok(selected.some(call => graph.typesAt(call).has('Opaque')), 'general graph keeps its cyclic refusal');
    assert.equal(proof.has(fn(program, 'fib')), false, 'a declaration is not a returned call result');
    const mutual = 'function odd(n:number){if(n==0){return 0}return even(n-1)}' +
        'function even(n:number){if(n==0){return 1}return odd(n-1)}let one=even(6);let two=odd(7);';
    const current = eligible(mutual, ['even', 'odd']); assert.equal(current.selected.length, 4);
    eligible(fib + 'let second=fib(3);');
    const before = JSON.stringify(program); for (const call of selected) assert.equal(proof.has(call), true);
    assert.equal(JSON.stringify(program), before, 'query does not rewrite source calls');
});

test('recursive parameters and local branch writers retain occurrence state and shadowed binding identity', () => {
    eligible(descend, ['descend']);
    eligible('function descend(n:number){let saved=n;n+=1;n--;if(n<=0){return saved}n-=1;return descend(n)+1}let result=descend(4);', ['descend']);
    eligible('function descend(n:number){let value=n;if(n>1){let value=n-1;value++;return descend(value-1)+1}return value}let result=descend(4);', ['descend']);
    for (const value of ['"bad"', '{}', '[1]', 'null', 'undefined', 'true']) {
        refusesEdited(descend, 'descend', program => {
            fn(program, 'descend').body.splice(1, 0, statement(`n=${value};`));
        });
    }
    const initialized = 'function descend(n:number){let local=0;if(n>0){local=descend(n-1)}return local}let result=descend(4);';
    refusesEdited(initialized, 'descend', program => {
        const declaration = fn(program, 'descend').body.find(node => node.type === 'Declaration');
        assert.ok(declaration.decls[0].init); declaration.decls[0].init = null;
    });
});

test('immutable aliases and forwarding meet every numeric entry and dynamic initialization frontier', () => {
    const aliases = 'function descend(n:number){if(n<=0){return 0}return alias(n-1)+1}' +
        'const alias=descend;let result=descend(3);';
    eligible(aliases, ['descend', 'alias']);
    refusesEdited(aliases, 'descend', program => {
        const aliasIndex = program.body.findIndex(node => node.type === 'Declaration' && node.decls[0].name === 'alias');
        const [declaration] = program.body.splice(aliasIndex, 1); program.body.push(declaration);
    }, ['descend', 'alias']);
    refusesEdited(aliases, 'descend', program => {
        program.body.push(statement('alias=foreign;'));
    }, ['descend', 'alias']);
    refusesEdited(aliases, 'descend', program => {
        program.body.push(statement('foreign(alias);'));
    }, ['descend', 'alias']);
    for (const extra of ['descend("bad");', 'descend();', 'descend(1,2);', 'descend(1,foreign());',
        'foreign(descend);', 'let escaped=[descend];', 'descend=foreign;', 'game.onUpdate(descend);']) {
        refusesEdited(descend, 'descend', program => { program.body.push(statement(extra)); });
    }
    const forwarded = 'function forward(n:number){return descend(n)}' + descend + 'let other=forward(2);';
    eligible(forwarded, ['descend', 'forward']);
    refusesEdited(forwarded, 'descend', program => {
        program.body.push(statement('forward(undefined);'));
    }, ['descend', 'forward']);
});

test('all returns arguments and physically present effects remain obligations of fresh recursive proofs', () => {
    for (const value of ['"bad"', '{}', '[1]', 'null', 'undefined', 'false']) {
        refusesEdited(fib, 'fib', program => {
            const base = fn(program, 'fib').body[0].consequent[0];
            assert.equal(base.type, 'Return'); base.value = expression(value);
        });
        refusesEdited(fib, 'fib', (program, actual) => { actual.args[0] = expression(value); });
    }
    refusesEdited(fib, 'fib', program => { fn(program, 'fib').body.pop(); });
    refusesEdited(fib, 'fib', program => { fn(program, 'fib').body[0].consequent[0].value = null; });
    refusesEdited(fib, 'fib', program => { fn(program, 'fib').body.push(statement('foreign();')); });
    refusesEdited(fib, 'fib', program => { program.body.push(statement('eval("result={}");')); });
    refusesEdited(fib, 'fib', program => {
        const internal = calls(fn(program, 'fib'), ['fib'])[0]; internal.args[0] = expression('"bad"');
    });
    refusesEdited(fib, 'fib', program => { fn(program, 'fib').body.push(statement('result=7;')); });
});

test('normal-return induction needs grounded complete returns and genuine reachable entries', () => {
    const {program, selected} = eligible(descend, ['descend']);
    const internal = selected.find(call => call !== rootCall(program, 'descend')); assert.ok(internal);
    fn(program, 'descend').body.shift();
    assert.equal(numericRecursiveNormalResults(program, profile).has(internal), false, 'bare self cycle has no grounded return');
    const dormant = eligible(descend, ['descend']);
    const retained = dormant.selected.find(call => call !== rootCall(dormant.program, 'descend'));
    dormant.program.body = dormant.program.body.filter(node => node.type === 'FunctionDeclaration');
    assert.equal(numericRecursiveNormalResults(dormant.program, profile).has(retained), false, 'dormant internal call cannot seed its own entry');
    const mutual = 'function left(n:number){if(n<=0){return 0}return right(n-1)}' +
        'function right(n:number){if(n<=0){return 1}return left(n-1)}let result=left(3);';
    refusesEdited(mutual, 'left', p => {
        fn(p, 'left').body.shift(); fn(p, 'right').body.shift();
    }, ['left', 'right']);
    refusesEdited(mutual, 'left', p => {
        fn(p, 'right').body[0].consequent[0].value = expression('"bad"');
    }, ['left', 'right']);
    const directCycle = 'function descend(n:number){if(n<=0){return 0}return descend(n)}let result=descend(4);';
    for (const literalDead of ['0', 'false']) refusesEdited(directCycle, 'descend', p => {
        fn(p, 'descend').body[0].test = expression(literalDead);
    });
    const chain = Array.from({length: 12}, (_, i) => i === 11 ?
        'function step11(n:number){if(n<=0){return 0}return step11(n-1)+1}' :
        `function step${i}(n:number){return step${i + 1}(n)}`).join('') + 'let result=step0(3);';
    eligible(chain, Array.from({length: 12}, (_, i) => `step${i}`));
});

test('actual retained signatures callbacks and constructor-like entries cannot erase recursive obligations', () => {
    const donor = fn(parse('function donor(n:number=0){return n}'), 'donor');
    const hidden = Object.getOwnPropertyDescriptor(donor.params, 'parameterDefaults');
    assert.equal(hidden.enumerable, false); assert.equal(hidden.value.length, 1);
    assert.equal(hidden.value[0].name, 'n'); assert.equal(hidden.value[0].value.type, 'Number');
    assert.deepEqual(donor.ordinaryParameterDefaultNames, ['n']);
    for (const edit of [
        p => { fn(p, 'fib').params.parameterDefaults.push(...hidden.value); },
        p => { fn(p, 'fib').parameterDefaults = {n: hidden.value[0].value}; },
        p => { fn(p, 'fib').ordinaryParameterDefaultNames.push('n'); },
        p => { fn(p, 'fib').params.optionalParams.push('n'); },
        p => { fn(p, 'fib').optionalParams = ['n']; },
        p => { fn(p, 'fib').parameterDefaultPrologue = donor.body.slice(0, -1); },
        p => { const f = fn(p, 'fib'); f.params = f.params.map(x => x); f.ordinaryParameterDefaultNames = ['n']; },
        p => { fn(p, 'fib').params.push('...rest'); },
        p => { fn(p, 'fib').typeParameters = ['T']; },
        p => { fn(p, 'fib').body.unshift(statement('n();')); }
    ]) refusesEdited(fib, 'fib', edit);
    for (const flag of ['async', 'isAsync', 'generator', 'isGenerator'])
        refusesEdited(fib, 'fib', p => { fn(p, 'fib')[flag] = true; });
    for (const edit of [
        (_p, call) => { call.isNew = true; call.constructorCall = true; },
        (_p, call) => { call.typeArguments = ['number']; },
        (_p, call) => { call.args = []; },
        (_p, call) => { call.args.push(expression('foreign()')); },
        (_p, call) => { call.args[0] = {type: 'Spread', expression: call.args[0]}; }
    ]) refusesEdited(fib, 'fib', edit);
});

test('owned raw source and actual call facts expire before first observation and remain revoked after ABA', () => {
    // No semantic negative relies on these old-proof invalidation checks.
    for (const first of ['none', 'has', 'current']) {
        const program = parse(fib), actual = rootCall(program, 'fib');
        const proof = numericRecursiveNormalResults(program, profile);
        if (first === 'has') assert.equal(proof.has(actual), true);
        if (first === 'current') assert.equal(proof.current(), true);
        const literal = fn(program, 'fib').body[0].test.right; assert.equal(literal.value, '2');
        literal.value = '3'; assert.equal(proof.current(), false); literal.value = '2';
        assert.equal(proof.has(actual), false); assert.equal(proof.current(), false);
        assert.equal(numericRecursiveNormalResults(program, profile).has(actual), true, 'fresh restored program has independent authority');
    }
    for (const edit of [
        p => { delete fn(p, 'fib').body; },
        p => { delete fn(p, 'fib').body[0]; },
        p => { fn(p, 'fib').body[0].test = {type: 'Unknown'}; },
        p => { p.body[0].fakeDeclaration = statement('let fake=7;'); },
        p => { p.nativeRecursiveSourceCall = Symbol('caller'); },
        p => { rootCall(p, 'fib').nativeRecursiveDomainNormalCall = Symbol('caller'); }
    ]) {
        const {program, selected} = eligible(fib), actual = selected[selected.length - 1]; edit(program);
        assert.equal(numericRecursiveNormalResults(program, profile).has(actual), false);
    }
    let reads = 0;
    const malformed = eligible(fib), actual = rootCall(malformed.program, 'fib');
    Object.defineProperty(malformed.program, 'body', {get() { reads++; throw Error('unowned getter'); }, configurable: true});
    const refused = numericRecursiveNormalResults(malformed.program, profile);
    assert.equal(refused.has(actual), false); assert.equal(reads, 0);
    const inherited = eligible(fib), call = rootCall(inherited.program, 'fib'), decl = inherited.program.body.find(node => node.type === 'Declaration');
    const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'kind'); assert.equal(prior, undefined);
    assert.equal(decl.kind, 'let'); delete decl.kind; let inheritedProof;
    try { Object.defineProperty(Object.prototype, 'kind', {value: 'let', configurable: true});
        inheritedProof = numericRecursiveNormalResults(inherited.program, profile);
    } finally { if (prior) Object.defineProperty(Object.prototype, 'kind', prior); else delete Object.prototype.kind; }
    assert.equal(inheritedProof.has(call), false, 'missing own kind cannot borrow inherited spelling');
    for (const mode of ['fresh', 'current']) {
        const paired = eligible(fib), actual = rootCall(paired.program, 'fib');
        const row = paired.program.body.find(node => node.type === 'Declaration').decls[0];
        assert.equal(Object.hasOwn(row, 'whenUsed'), false);
        const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'whenUsed'); assert.equal(previous, undefined);
        let reads = 0, fresh, observed;
        try {
            Object.defineProperty(Object.prototype, 'whenUsed', {get() { reads++; return true; }, configurable: true});
            if (mode === 'fresh') fresh = numericRecursiveNormalResults(paired.program, profile);
            else observed = paired.proof.current();
        } finally {
            if (previous) Object.defineProperty(Object.prototype, 'whenUsed', previous);
            else delete Object.prototype.whenUsed;
        }
        assert.equal(reads, 0, 'inherited optional flag getter is never evaluated');
        if (mode === 'fresh') assert.equal(fresh.has(actual), false);
        else { assert.equal(observed, false); assert.equal(paired.proof.has(actual), false); assert.equal(paired.proof.current(), false); }
    }
});

test('raw recursive membership stages exact native helper calls without replacing arguments or older producer paths', () => {
    const text = header + '\n' + fib.replace('fib(n-1)+fib(n-2)', '__bwBinaryAdd(fib(n-1),fib(n-2))') +
        'let answer=__bwBinaryAdd(result,1);';
    const {program, selected} = eligible(text), before = JSON.stringify(program);
    const good = domain(program); assert.equal(good.reason, null); assert.equal(good.helpers.size, 1);
    assert.equal(good.current(), true); assert.equal(JSON.stringify(program), before);
    assert.ok(selected.every(call => walk(program).includes(call)), 'all real recursive calls and argument edges survive analysis');
    // A changed body loses its exact canonical helper role. It can still be a
    // genuinely closed ordinary numeric function; its spelling must not forbid
    // that independent proof or supply canonical helper recognition.
    const ordinary = eligible(text), actual = rootCall(ordinary.program, 'fib');
    fn(ordinary.program, '__bwBinaryAdd').body = parse('function replacement(a:any,b:any){return 9}').body[0].body;
    const ordinaryBefore = JSON.stringify(ordinary.program);
    const ordinaryProof = numericRecursiveNormalResults(ordinary.program, profile);
    assert.equal(ordinaryProof.current(), true); assert.equal(ordinaryProof.has(actual), true);
    const canonical = inspectNativeArrayAddHelpers(ordinary.program, profile);
    assert.equal(canonical.current(), true); assert.equal(canonical.helpers.size, 0, 'ordinary Number result is not canonical helper authority');
    const noHelper = domain(ordinary.program);
    assert.equal(noHelper.helpers.size, 0); assert.equal(noHelper.reason, null, 'no helper has no fabricated domain refusal');
    assert.equal(JSON.stringify(ordinary.program), ordinaryBefore);
    for (const edit of [
        p => { fn(p, '__bwBinaryAdd').body = parse('function replacement(a:any,b:any){return "not Number"}').body[0].body; },
        p => { fn(p, '__bwBinaryAdd').params.parameterDefaults.push({name: 'left', value: expression('1')}); },
        p => { fn(p, '__bwBinaryAdd').ordinaryParameterDefaultNames.push('left'); },
        p => { p.body.push(statement('__bwBinaryAdd=foreign;')); },
        p => { p.body.push(statement('foreign(__bwBinaryAdd);')); },
        p => { calls(p, ['__bwBinaryAdd'])[0].args[0] = expression('"bad"'); }
    ]) refusesEdited(text, 'fib', edit);
    // The consumer must establish the new fact on raw source BEFORE any
    // prepare/map clone can drop the hidden parameter-array metadata.
    for (const {edit, canonicalCount, canonicalCurrent} of [
        {edit: p => { fn(p, 'fib').params.parameterDefaults.push({name: 'n', value: expression('0')}); },
            canonicalCount: 0, canonicalCurrent: false},
        {edit: p => { fn(p, 'fib').ordinaryParameterDefaultNames.push('n'); },
            canonicalCount: 1, canonicalCurrent: true},
        {edit: p => { const f = fn(p, 'fib'); f.params = f.params.map(x => x); f.ordinaryParameterDefaultNames = ['n']; },
            canonicalCount: 1, canonicalCurrent: true}
    ]) {
        const paired = eligible(text), actual = rootCall(paired.program, 'fib');
        assert.equal(domain(paired.program).helpers.size, 1); edit(paired.program);
        assert.equal(numericRecursiveNormalResults(paired.program, profile).has(actual), false);
        const syntax = inspectNativeArrayAddHelpers(paired.program, profile);
        assert.equal(syntax.helpers.size, canonicalCount); assert.equal(syntax.current(), canonicalCurrent);
        const refused = domain(paired.program);
        assert.equal(refused.helpers.size, 0, 'raw default obligation must not disappear during staging');
        assert.equal(refused.current(), canonicalCurrent);
        // A hidden default without its actual prologue invalidates syntax.
        // Ordinary retained default names instead reach the domain refusal.
        if (canonicalCount === 0) assert.equal(refused.reason, null);
        else assert.equal(typeof refused.reason, 'string');
    }
    const launched = header + '\nfunction count(n:number){if(n<=0){return 0}return __bwBinaryAdd(count(n-1),1)}' +
        'let result=0;function launch(){result=__bwBinaryAdd(count(3),0)}launch();';
    const start = eligible(launched, ['count']);
    assert.equal(start.proof.has(calls(start.program, ['launch'])[0]), false, 'startup role does not issue a returned Number');
    const launchedDomain = domain(start.program);
    assert.equal(launchedDomain.reason, null); assert.equal(launchedDomain.helpers.size, 1);
    for (const edit of [
        p => { p.body.push(statement('launch();')); },
        p => { fn(p, 'launch').params.push('argument'); },
        p => { p.body.push(statement('let escaped=launch;')); },
        p => { p.body.push(statement('game.onUpdate(launch);')); },
        p => { fn(p, 'launch').body.push(statement('launch();')); },
        p => { fn(p, 'count').body.unshift(statement('result=7;')); }
    ]) {
        const paired = eligible(launched, ['count']);
        const actual = calls(fn(paired.program, 'launch'), ['count'])[0]; assert.ok(actual);
        assert.equal(paired.proof.has(actual), true); edit(paired.program);
        assert.equal(numericRecursiveNormalResults(paired.program, profile).has(actual), false,
            'fresh source proof retains every startup entry and numeric-body write obligation');
    }
    for (const tag of ['nativeRecursiveSourceCall', 'nativeRecursiveDomainNormalCall']) {
        const supplied = eligible(text), actual = rootCall(supplied.program, 'fib'); actual[tag] = Symbol('caller');
        const canonical = inspectNativeArrayAddHelpers(supplied.program, profile);
        assert.equal(canonical.helpers.size, 1); assert.equal(canonical.current(), true);
        const refused = domain(supplied.program);
        assert.equal(refused.helpers.size, 0); assert.match(refused.reason, /supplied private/);
    }
    // Optional raw SCC rejection must leave the existing private closure route intact.
    const closure = header + '\nfunction make(start:number):()=>number{let n:number=undefined;n=start;return()=>{n=n+7;return n}}let one=make(2);let result=__bwBinaryAdd(one(),1);';
    const closed = parse(closure), closureCall = calls(closed, ['one'])[0]; assert.ok(closureCall);
    assert.equal(numericRecursiveNormalResults(closed, profile).has(closureCall), false); domainGood(closure);
    // Preserve the already-qualified Image fixture shape, including the real
    // nullable/global initialization and selected literal factory branch.
    const image = header + '\nfunction fresh(id:string):Image[]{if(id=="walk")return [img`2`,img`5`];console.log("missing "+id);return undefined;} function start(){let current:Image[]=null;current=fresh(""+"walk");frames=current;count=frames.length;first=frames[0].getPixel(0,0);second=frames[1].getPixel(0,0);count=__bwBinaryAdd(count,0);first=__bwBinaryAdd(first,0);second=__bwBinaryAdd(second,0);} let frames:Image[];let count:any=2;let first:any=4;let second:any=5;start();';
    const pixels = parse(image), pixel = walk(pixels).find(node => node.type === 'Call' && node.callee?.name === 'getPixel'); assert.ok(pixel);
    assert.equal(numericRecursiveNormalResults(pixels, profile).has(pixel), false); domainGood(image);
});

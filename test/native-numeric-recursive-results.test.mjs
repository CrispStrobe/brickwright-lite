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

const comparisonSource = (op='<') => `function compare(first:any,second:any):boolean{return first ${op} second}
function reduce(n:number):number{if(compare(n,0)){return 3}return reduce(n-1)+2}
let answer=reduce(4);`;

test('closed comparison helpers retain Boolean conditions and actual numeric recursion entries',()=>{
    for(const op of ['<','<=','>','>=','==','===','!=','!==']){
        const text=comparisonSource(op),{program,proof}=eligible(text,['reduce']);
        const selected=calls(program,['compare']);assert.equal(selected.length,1);
        assert.equal(proof.has(selected[0]),false,'a comparison result is never a Number result loan');
        assert.equal(program.body[0].name,'compare','recognition does not rewrite the source');
    }
    const text=header+'\n'+comparisonSource('<=')
        .replace('return reduce(n-1)+2','return __bwBinaryAdd(reduce(n-1),2)');
    domainGood(text);
});

test('comparison recognition retains actual argument, binding, body and result obligations',()=>{
    const text=comparisonSource();
    for(const edit of [
        p=>{calls(p,['compare'])[0].args[0]=expression('"opaque"');},
        p=>{calls(p,['compare'])[0].args[0]=expression('outside()');},
        p=>{fn(p,'reduce').body.unshift(statement('let pending:number;'));
            calls(p,['compare'])[0].args[0]=expression('pending');},
        p=>{calls(p,['compare'])[0].args.push(expression('0'));},
        p=>{fn(p,'compare').body[0].value=expression('"wrong result"');},
        p=>{p.body.unshift(statement('let escaped=compare;'));},
        p=>{p.body.push(statement('compare=reduce;'));},
        p=>{fn(p,'compare').params.parameterDefaults.push({name:'first',value:expression('0')});},
        p=>{fn(p,'reduce').body.at(-1).value=expression('compare(n,0)');},
        (_p,actual)=>{actual.args[0]=expression('compare(1,0)');},
        p=>{calls(p,['compare'])[0].args[0]=expression('compare(n,0)');}
    ])refusesEdited(text,'reduce',edit,['reduce']);
    // Evaluating the comparison's argument recurses BEFORE any possible base
    // return. Omitting that argument would invent a grounded return witness.
    refusesEdited(text,'reduce',p=>{
        calls(p,['compare'])[0].args[0]=expression('reduce(n-1)');
    },['reduce']);
});

test('a changed valid comparison is re-proved as Boolean rather than trusted by helper spelling',()=>{
    const {program,proof}=eligible(comparisonSource(),['reduce']),actual=rootCall(program,'reduce');
    const operation=fn(program,'compare').body[0].value,old=operation.op;
    operation.op='>=';assert.equal(proof.current(),false);operation.op=old;
    assert.equal(proof.has(actual),false,'restoration cannot revive the observed old proof');
    operation.op='>=';
    const fresh=numericRecursiveNormalResults(program,profile);
    assert.equal(fresh.has(actual),true,'all closed numeric comparisons have a genuine Boolean contract');
    assert.equal(fresh.has(calls(program,['compare'])[0]),false);
    // A complete Number body is instead an ordinary numeric function. A
    // familiar comparison name cannot force either its Boolean or Number role.
    operation.op='+';
    const ordinary=numericRecursiveNormalResults(program,profile);
    assert.equal(ordinary.has(actual),true);
    assert.equal(ordinary.has(calls(program,['compare'])[0]),true);
});

test('excluded comparison bodies and references remain in sticky source currentness',()=>{
    for(const edit of [
        p=>{const value=fn(p,'compare').body[0].value,old=value.op;value.op='+';return()=>{value.op=old;};},
        p=>{const call=calls(p,['compare'])[0],old=call.args[1];call.args[1]=expression('1');return()=>{call.args[1]=old;};},
        p=>{const body=fn(p,'compare').body,old=body[0];body[0]=statement('return first;');return()=>{body[0]=old;};}
    ]){
        const {program,proof}=eligible(comparisonSource(),['reduce']),actual=rootCall(program,'reduce');
        const restore=edit(program);assert.equal(proof.current(),false);restore();
        assert.equal(proof.current(),false);assert.equal(proof.has(actual),false);
    }
});

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

// Actual emitted drafts from the public synthetic return controls. These
// source proofs supplement the unchanged native/SDK/Code/SB3 journeys.
const emittedNumericCompositions = [
`function __bwCompareLess(left: any, right: any): boolean { return left < right }
function __bwBinaryAdd(left: any, right: any): any { let a: any = left; if (left !== null && typeof left === "object") { let array: any[] = left; a = array.join(",") }; let b: any = right; if (right !== null && typeof right === "object") { let array: any[] = right; b = array.join(",") }; return a + b }
function __bwBinarySubtract(left: any, right: any): number { return left - right }
function __bwCompareEqual(left: any, right: any): boolean { return left == right }
function Game_fib (n: number): number {
    if (__bwCompareLess(n, (0 + 2))) {
        return n
    }
    return __bwBinaryAdd(Game_fib(__bwBinarySubtract(n, (0 + 1))), Game_fib(__bwBinarySubtract(n, (0 + 2))))
}
function Game_even (n: number): number {
    if (__bwCompareEqual(n, (0 + 0))) {
        return (0 + 1)
    }
    return Game_odd(__bwBinarySubtract(n, (0 + 1)))
}
function Game_odd (n: number): number {
    if (__bwCompareEqual(n, (0 + 0))) {
        return (0 + 0)
    }
    return Game_even(__bwBinarySubtract(n, (0 + 1)))
}
let result: number
let parity: number
    result = Game_fib((0 + 8))
    parity = Game_even((0 + 12))
`,
`function __bwBinaryAdd(left: any, right: any): any { let a: any = left; if (left !== null && typeof left === "object") { let array: any[] = left; a = array.join(",") }; let b: any = right; if (right !== null && typeof right === "object") { let array: any[] = right; b = array.join(",") }; return a + b }
function __bwUnaryAdd(value: any): number { return +value }
function __bwCompareLessEqual(left: any, right: any): boolean { return left <= right }
function __bwBinarySubtract(left: any, right: any): number { return left - right }
function Game_bump (x_: number): number {
    x_ = __bwBinaryAdd(x_, (0 + 3))
    x_ = __bwBinaryAdd(__bwUnaryAdd(x_), (0 + 1))
    return x_
}
function Game_descend (n: number): number {
    if (__bwCompareLessEqual(n, (0 + 0))) {
        return (0 + 0)
    }
    n = __bwBinarySubtract(n, (0 + 1))
    return __bwBinaryAdd(Game_descend(n), (0 + 1))
}
let first: number
let second: number
let count: number
    first = Game_bump((0 + 2))
    second = Game_bump((0 + 8))
    count = Game_descend((0 + 8))
`
];

test('retained emitted numeric programs compose grouping comparisons subtraction and root assignments',()=>{
    for(const [index,text]of emittedNumericCompositions.entries()){
        const names=index===0?['Game_fib','Game_even','Game_odd']:['Game_bump','Game_descend'];
        const {program,proof}=eligible(text,names);
        assert.ok(walk(program).some(node=>node.type==='Binary'&&node.parenthesized===true),
            'actual retained parser marker, not a manufactured Parenthesized node');
        for(const node of calls(program,['__bwCompareLess','__bwCompareEqual','__bwCompareLessEqual']))
            assert.equal(proof.has(node),false,'comparison normal results remain Boolean');
        const consumer=inspectNativeArrayBinaryDomains(program,profile);
        assert.equal(consumer.reason,null);assert.equal(consumer.helpers.size,1);
    }
});

test('grouping metadata cannot issue a domain or hide malformed placement and observed edits',()=>{
    const grouped='function fib(n:number){if(n<(0+2)){return n}return fib(n-(0+1))+fib(n-(0+2))}let result=fib((0+6));';
    for(const change of [
        p=>{walk(p).find(node=>node.type==='Binary'&&node.parenthesized===true).parenthesized=false;},
        p=>{fn(p,'fib').parenthesized=true;},
        p=>{fn(p,'fib').params.parenthesized=true;},
        p=>{fn(p,'fib').body[0].parenthesized=true;},
        p=>{const node=walk(p).find(node=>node.type==='Binary'&&node.parenthesized===true);
            Object.setPrototypeOf(node,{parenthesized:true});delete node.parenthesized;},
        p=>{const returned=fn(p,'fib').body[0].consequent[0];returned.value={type:'Object',props:[],parenthesized:true};}
    ]){
        const {program,selected}=eligible(grouped);change(program);
        const fresh=numericRecursiveNormalResults(program,profile);
        assert.equal(fresh.has(selected[0]),false,'fresh malformed grouping cannot borrow an earlier Number proof');
    }
    const {program,selected,proof}=eligible(grouped),node=walk(program).find(n=>n.type==='Binary'&&n.parenthesized===true);
    node.parenthesized=false;assert.equal(proof.current(),false);node.parenthesized=true;
    assert.equal(proof.current(),false);assert.equal(proof.has(selected[0]),false);
    let reads=0;
    Object.defineProperty(node,'parenthesized',{get(){reads++;throw Error('must not invoke grouping metadata getter')},configurable:true});
    const fresh=numericRecursiveNormalResults(program,profile);
    assert.equal(fresh.has(selected[0]),false);assert.equal(reads,0);
});

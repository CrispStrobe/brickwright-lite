/**
 * MakeCode micro:bit library calls whose definition is TypeScript in pxt-microbit itself (libs/core, MIT,
 * pxt-microbit 9.1.1), or a constant / another member of the same library. Before the program is
 * translated they become what MakeCode runs: a constant, the member they call, an array literal, a few
 * statements, or one of the program's own functions with pxt's body. The functions are written in the
 * TypeScript the translator reads (no closures over globals other than their own); each says where its
 * body comes from. Calls with arguments these cannot take are left alone (and refused as before).
 */

// libs/core/melodies.ts (_getMelodyBuffer): two bytes a note, the MIDI note (0 a rest) and quarter beats.
const MELODY_HEX = {
    Dadadadum: '00024f024f024f024b0800024d024d024d024a08',
    Entertainer: '4a014b014c0154024c0154024c0154035401560157015801540156015802530156025404',
    Prelude: '48014c014f01540158014f015401580148014c014f01540158014f015401580148014a014f01560159014f015601590148014a014f01560159014f015601590147014a014f01560159014f015601590147014a014f01560159014f015601590148014c014f01540158014f015401580148014c014f01540158014f0154015801',
    Ode: '4c044c044d044f044f044d044c044a04480448044a044c044c064a024a084c044c044d044f044f044d044c044a04480448044a044c044a0648024808',
    Nyan: '5a025c02550157025301560155015302530255025602560155015301550157015a015c0157015a015501560153015501530157025a025c0157015a0155015701530156015701560155015301550156025301550157015a01550156015501530155025302550253024e01500153024e01500153015501570153015801570158015a01530253024e01500153014e0158015701550153014e014b014c014e0153024e01500153024e015001530153015501570153014e0150014e0153025301520153014e01500153015801570158015a0153025502',
    Ringtone: '48014a014c024f024a014c014d0251024c014d014f0253025404',
    Funk: '300230023302300135023001350236023702300230023702300136023001360235023302',
    Blues: '30023402370239023a0239023702340230023402370239023a02390237023402350239023c023e023f023e023c02390230023402370239023a0239023702340237023b023e024102350239023c023f0230023402370234023702350234023202',
    Birthday: '480348014a0448044d044c08480348014a0448044f044d0848034801540451044d044c044a045203520151044d044f044d08',
    Wedding: '48044d034d014d0848044f034c014d0848044d035101540451034d014d044c034d014f08',
    Funeral: '3c043c033c013c043f033e013e033c013c033b013c04',
    Punchline: '480343014201430144034303000347034803',
    Baddy: '3c0300033e023f0200023c0200024208',
    Chase: '5101530154015301510200025101530154015301510200025102580257025802590258025702580253015401560154015302000253015401560154015302000253025802570258025902580257025802',
    BaDing: '5f016403',
    Wawawawaa: '400300013f0300013e0400013d08',
    JumpUp: '54015601580159015b01',
    JumpDown: '5b015901580156015401',
    PowerUp: '4f01540158015b0258015b03',
    PowerDown: '5b01570154014f0253015403'
};

/** libs/core/music.ts _bufferToMelody: the note strings of a built-in melody (NOTE[octave][:duration], r a rest). */
export function builtInMelodyNotes (name) {
    const hex = MELODY_HEX[name];
    if (!hex) return null;
    const bytes = hex.match(/../g).map(h => parseInt(h, 16));
    const names = 'c#d#ef#g#a#b';
    const out = [];
    let duration = 4;
    let octave = -1;
    for (let i = 0; i < bytes.length; i += 2) {
        let current;
        let o = 4;
        if (bytes[i] === 0) current = 'r';
        else {
            current = names.charAt(bytes[i] % 12);
            if (current === '#') current = names.charAt((bytes[i] % 12) - 1) + current;
            o = Math.trunc((bytes[i] - 24) / 12);
        }
        if (o !== octave) {
            current += o;
            octave = o;
        }
        if (bytes[i + 1] !== duration) {
            current += `:${bytes[i + 1]}`;
            duration = bytes[i + 1];
        }
        out.push(current);
    }
    return out;
}

/** libs/core/music.ts getMelodyNotes (the old melody editor's text), for a literal. */
function melodyNotes (text) {
    const notes = String(text).split(' ').filter(n => !!n);
    let newOctave = false;
    for (let i = 0; i < notes.length; i++) {
        if (notes[i] === '-') notes[i] = 'R';
        else if (notes[i] === 'C5') newOctave = true;
        else if (newOctave) {
            notes[i] += '4';
            newOctave = false;
        }
    }
    if (notes[notes.length - 1] === 'C5' && notes[0] !== 'C5') notes[0] += '4';
    return notes;
}

const ARROWS = ['North', 'NorthEast', 'East', 'SouthEast', 'South', 'SouthWest', 'West', 'NorthWest'];
// radio.ts RadioPacketProperty
const PACKET_PROPERTIES = {0: 'Time', 1: 'SerialNumber', 2: 'SignalStrength'};

// libs/core/music.ts freqs: the frequency of every note from C1 (an index of (note + 12 * (octave - 1))).
const FREQS = [31, 33, 35, 37, 39, 41, 44, 46, 49, 52, 55, 58, 62, 65, 69, 73, 78, 82, 87, 92, 98, 104, 110, 117, 123, 131, 139,
    147, 156, 165, 175, 185, 196, 208, 220, 233, 247, 262, 277, 294, 311, 330, 349, 370, 392, 415, 440, 466, 494, 523, 554, 587,
    622, 659, 698, 740, 784, 831, 880, 932, 988, 1047, 1109, 1175, 1245, 1319, 1397, 1480, 1568, 1661, 1760, 1865, 1976, 2093, 2217,
    2349, 2489, 2637, 2794, 2960, 3136, 3322, 3520, 3729, 3951, 4186, 4435, 4699, 4978, 5274, 5588, 5920, 6272, 6645, 7040, 7459, 7902];

/**
 * The library functions, as the program's own: `globals` are declared ahead of the program; `defaults`
 * (by parameter, null for none) fill the arguments a call leaves out, so the functions take all `arity`. `$` is the function's own name,
 * `$g` its global's.
 */
const FUNCTIONS = {
    // libs/core/led.ts toggleAll
    'led.toggleAll': {arity: 0, source: `function $(): void {
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            led.toggle(i, j)
        }
    }
}`},
    // libs/core/led.ts fadeIn / fadeOut (the brightness steps every 50 ms until the time is up)
    'led.fadeIn': {arity: 1, defaults: ['700'], source: `function $(ms: number): void {
    if (ms < 20) {
        led.setBrightness(255)
        return
    }
    let brightness = led.brightness()
    let start = input.runningTime()
    let elapsed = 0
    while (elapsed < ms) {
        led.setBrightness(brightness + ((255 - brightness) * elapsed) / ms)
        basic.pause(50)
        elapsed = input.runningTime() - start
    }
    led.setBrightness(255)
}`},
    'led.fadeOut': {arity: 1, defaults: ['700'], source: `function $(ms: number): void {
    if (ms < 20) {
        led.setBrightness(0)
        return
    }
    let brightness = led.brightness()
    let start = input.runningTime()
    let elapsed = 0
    while (elapsed < ms) {
        led.setBrightness(brightness - (brightness * elapsed) / ms)
        basic.pause(50)
        elapsed = input.runningTime() - start
    }
    led.setBrightness(0)
}`},
    // libs/core/control.ts allocateEventSource: ++_evSource from 0x8000
    'control.allocateEventSource': {arity: 0, globals: 'let $g = 32768', source: `function $(): number {
    $g += 1
    return $g
}`},
    // CODAL's allocateNotifyEvent (codal-core CodalComponent: DEVICE_NOTIFY_USER_EVENT_BASE 1024, then up) and
    // pxsim's bus.nextNotifyEvent++ from 1024: the ids for control.raiseEvent(DAL.DEVICE_ID_NOTIFY, id).
    'control.allocateNotifyEvent': {arity: 0, globals: 'let $g = 1024', source: `function $(): number {
    $g += 1
    return $g - 1
}`},
    // libs/core/control.ts benchmark: the function's run time in microseconds
    'control.benchmark': {arity: 1, source: `function $(f: () => void): number {
    let t0 = control.micros()
    f()
    let t = control.micros() - t0
    if (t < 0) {
        t += 1073741823
    }
    return t
}`},
    // libs/core/music.ts getFrequencyForNote (the table above C1..B8, else 440 Hz equal temperament)
    'music.getFrequencyForNote': {arity: 2, globals: `let $g = [${FREQS.join(', ')}]`, source: `function $(octave: number, note: number): number {
    let index = (note + (12 * (octave - 1))) << 1
    if (index >= ${FREQS.length * 2}) {
        return Math.round(440 * Math.pow(2, (((octave + 1) * 12 + note) - 70) / 12))
    }
    if (index < 0) {
        return 0
    }
    return $g[index >> 1]
}`},
    // libs/core/icons.ts showArrow with a direction that is a value: images.arrowImage(direction).showImage(0, interval)
    'basic.showArrow': {arity: 2, defaults: [null, '600'], source: `function $(direction: number, interval: number): void {
${ARROWS.map((a, i) => `    ${i ? '} else ' : ''}if (direction == ${i}) {\n        images.arrowImage(ArrowNames.${a}).showImage(0, interval)`).join('\n')}
    } else {
        images.createImage(\`
        . . . . .
        . . . . .
        . . . . .
        . . . . .
        . . . . .
        \`).showImage(0, interval)
    }
}`}
};

const member = (object, name) => ({type: 'Member', object: {type: 'Identifier', name: object}, name});
const pathOf = node => {
    if (!node) return null;
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'Member') {
        const o = pathOf(node.object);
        return o ? `${o}.${node.name}` : null;
    }
    return null;
};
const literalNumber = node => {
    if (node && node.type === 'Number') return Number(node.value);
    if (node && node.type === 'Unary' && node.op === '-' && node.argument && node.argument.type === 'Number') return -Number(node.argument.value);
    return null;
};
const log = arg => ({type: 'ExpressionStatement', expr: {type: 'Call', callee: member('console', 'log'), args: [arg]}});
const panic = code => ({type: 'ExpressionStatement', expr: {type: 'Call', callee: member('control', 'panic'), args: [{type: 'Number', value: String(code)}]}});

/** A call that is another member of the library, or a constant. null when it is not one. */
function replacement (path, args) {
    switch (path) {
    case 'input.calibrate': return {type: 'Call', callee: member('input', 'calibrateCompass'), args: []};
    case 'radio.onReceivedNumberDeprecated': case 'radio.onReceivedValueDeprecated':
    case 'radio.onReceivedStringDeprecated': case 'radio.onReceivedBufferDeprecated':
        return {type: 'Call', callee: member('radio', path.slice('radio.'.length, -'Deprecated'.length)), args};
    // radio.ts: the last raw packet as JSON, the same packet writeReceivedPacketToSerial writes.
    case 'radio.writeValueToSerial': return {type: 'Call', callee: member('radio', 'writeReceivedPacketToSerial'), args: []};
    // music.ts: startMelodyInternal is what startMelody calls, with the same arguments.
    case 'music.startMelodyInternal': return {type: 'Call', callee: member('music', 'startMelody'), args};
    // TD_ID: the argument itself.
    case 'music.melodyEditor': return args[0] || null;
    case 'images.arrowNumber': {
        const a = args[0];
        if (a && a.type === 'Member' && a.object && a.object.name === 'ArrowNames' && ARROWS.includes(a.name)) return {type: 'Number', value: String(ARROWS.indexOf(a.name))};
        return null;
    }
    case 'music.builtInMelody': case 'music.getMelody': {
        const a = args[0];
        const notes = a && a.type === 'Member' && a.object && a.object.name === 'Melodies' ? builtInMelodyNotes(a.name) : null;
        return notes ? {type: 'Array', items: notes.map(n => ({type: 'String', value: n}))} : null;
    }
    case 'music.getMelodyNotes':
        return args[0] && args[0].type === 'String' ? {type: 'Array', items: melodyNotes(args[0].value).map(n => ({type: 'String', value: n}))} : null;
    // controlgc.cpp: false unless MakeCode built the program with PXT_PROFILE (it does not).
    case 'control.profilingEnabled': return {type: 'Boolean', value: false};
    // control.cpp _ramSize: __StackTop & 0x1fffffff, 128 KiB on the micro:bit V2 (pxsim's TypeScript body says 32 MiB).
    case 'control.ramSize': return {type: 'Number', value: '131072'};
    // control.cpp _hardwareVersion: "2.0" for a V2.00 board (0x9903/0x9904), as pxsim's body says.
    case 'control.hardwareVersion': return {type: 'String', value: '2.0'};
    // game.ts: an invalid sprite is null.
    case 'game.invalidSprite': return {type: 'Null'};
    case 'radio.receivedPacket': {
        const n = literalNumber(args[0]);
        return n !== null && PACKET_PROPERTIES[n] ? {type: 'Call', callee: member('radio', 'receivedPacket'), args: [member('RadioPacketProperty', PACKET_PROPERTIES[n])]} : null;
    }
    case 'images.arrowImage': {
        const n = literalNumber(args[0]);
        return n !== null && ARROWS[n] ? {type: 'Call', callee: member('images', 'arrowImage'), args: [member('ArrowNames', ARROWS[n])]} : null;
    }
    case 'basic.showArrow': {
        const n = literalNumber(args[0]);
        return n !== null && ARROWS[n] ? {type: 'Call', callee: member('basic', 'showArrow'), args: [member('ArrowNames', ARROWS[n]), ...args.slice(1)]} : null;
    }
    // MakeCode fills the parameters a call leaves out with undefined; the blocks take the ones given.
    case 'datalogger.log': case 'datalogger.setColumnTitles': {
        let n = args.length;
        while (n > 1 && args[n - 1] && args[n - 1].type === 'Undefined') n--;
        return n < args.length ? {type: 'Call', callee: member('datalogger', path.slice('datalogger.'.length)), args: args.slice(0, n)} : null;
    }
    default: return null;
    }
}

/** A statement call that is a few statements of pxt's: control.assert, control.fail. null otherwise. */
function statements (path, args) {
    // libs/core/control.ts assert: ASSERTION FAILED and the message on the console, then panic 98.
    if (path === 'control.assert' && args[0]) {
        const fails = [log({type: 'String', value: 'ASSERTION FAILED'})];
        if (args[1] && args[1].type !== 'Undefined' && args[1].type !== 'Null') fails.push(log(args[1]));
        fails.push(panic(98));
        return [{type: 'If', test: {type: 'Unary', op: '!', argument: args[0]}, consequent: fails, alternate: null}];
    }
    // libs/core/control.ts fail: "Fatal failure: ", the message, panic 108.
    if (path === 'control.fail' && args[0]) return [log({type: 'String', value: 'Fatal failure: '}), log(args[0]), panic(108)];
    return null;
}

/**
 * control.allocateEventSource() counts up from 0x8000 in the order the calls run. When every call is the
 * value of a top-level declaration the program never assigns again, the order is the program's, so each is
 * its number, and the name is that number where it is read: a handler on it (control.onEvent(id, ...)) is
 * registered for that source here and in the MakeCode export alike, as it is in MakeCode.
 */
function foldEventSources (ast) {
    const calls = [];
    JSON.stringify(ast.body, (k, v) => {
        if (v && v.type === 'Call' && pathOf(v.callee) === 'control.allocateEventSource') calls.push(v);
        return v;
    });
    if (!calls.length) return;
    const decls = [];
    for (const st of ast.body) {
        if (st.type !== 'Declaration' || st.decls.length !== 1) continue;
        const init = st.decls[0].init;
        if (init && calls.includes(init)) decls.push(st.decls[0]);
    }
    if (decls.length !== calls.length) return;
    const names = new Set(decls.map(d => d.name));
    let assigned = false;
    JSON.stringify(ast.body, (k, v) => {
        if (v && ((v.type === 'Assignment' && v.left && v.left.type === 'Identifier' && names.has(v.left.name)) ||
            (v.type === 'Update' && v.argument && v.argument.type === 'Identifier' && names.has(v.argument.name)))) assigned = true;
        return v;
    });
    // A name declared twice (a shadowing local) is not this one everywhere.
    let declared = 0;
    JSON.stringify(ast.body, (k, v) => {
        if (v && v.decls) declared += v.decls.filter(d => names.has(d.name)).length;
        if (v && v.params) declared += v.params.filter(p => names.has(p)).length;
        return v;
    });
    if (assigned || declared !== decls.length) return;
    const value = new Map(decls.map((d, i) => [d.name, String(32769 + i)]));
    decls.forEach(d => { d.init = {type: 'Number', value: value.get(d.name)}; });
    const swap = node => {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(swap);
        if (node.type === 'Identifier' && value.has(node.name)) return {type: 'Number', value: value.get(node.name)};
        for (const key of Object.keys(node)) {
            if (key === 'decls' || key === 'callee') {
                if (key === 'callee' && node[key] && node[key].type !== 'Identifier') node[key] = swap(node[key]);
                if (key === 'decls') node.decls.forEach(d => { d.init = swap(d.init); });
                continue;
            }
            if (node[key] && typeof node[key] === 'object') node[key] = swap(node[key]);
        }
        return node;
    };
    ast.body = ast.body.map(swap);
}

const SOUND_MAKERS = new Set(['music.createSoundEffect', 'music.createSoundExpression', 'music.builtinSoundEffect',
    'music.builtinPlayableSoundEffect', 'music.builtInPlayableMelody', 'music.stringPlayable', 'music.tonePlayable']);
const constant = node => !!node && (node.type === 'Number' || node.type === 'String' || node.type === 'Boolean' ||
    (node.type === 'Member' && node.object && node.object.type === 'Identifier') ||
    (node.type === 'Member' && node.object && node.object.type === 'Member' && node.object.object && node.object.object.type === 'Identifier') ||
    (node.type === 'Unary' && node.op === '-' && constant(node.argument)) ||
    // A note's frequency is fixed; a beat is, while the program never changes the tempo (tempoFixed).
    (node.type === 'Call' && (pathOf(node.callee) === 'music.noteFrequency' || (pathOf(node.callee) === 'music.beat' && constant.tempoFixed)) &&
        (node.args || []).every(constant)));

/**
 * A sound or a playable kept in a variable (`let s = music.createSoundEffect(...)`, `music.stringPlayable("C D", 120)`)
 * and only ever played (music.play(s, mode), music.playSoundEffect(s, mode)): its arguments are constants and it is
 * never assigned again, so each play is of that same sound, written where it is played.
 */
function inlineSoundValues (ast) {
    const text = JSON.stringify(ast.body);
    constant.tempoFixed = !/"name":"(setTempo|changeTempoBy)"/.test(text);
    const makers = new Map();
    const scan = (list) => {
        for (const st of list || []) {
            if (st && st.type === 'Declaration' && st.decls.length === 1) {
                const d = st.decls[0];
                if (d.init && d.init.type === 'Call' && SOUND_MAKERS.has(pathOf(d.init.callee)) && (d.init.args || []).every(constant)) {
                    makers.set(d.name, makers.has(d.name) ? null : {decl: st, init: d.init});
                }
            }
        }
    };
    JSON.stringify(ast.body, (k, v) => {
        if (Array.isArray(v)) scan(v);
        return v;
    });
    for (const [name, m] of [...makers]) if (!m) makers.delete(name);
    if (!makers.size) return;
    // Every other mention must be the sound a play call plays.
    const ok = new Map([...makers.keys()].map(n => [n, true]));
    const visit = (node, parent, key, index) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach((x, i) => visit(x, parent, key, i));
        if (node.type === 'Identifier' && ok.has(node.name)) {
            const played = parent && parent.type === 'Call' && key === 'args' && index === 0 &&
                /^music\.(play|playSoundEffect)$/.test(pathOf(parent.callee) || '');
            if (!played) ok.set(node.name, false);
        }
        if (node.decls) node.decls.forEach(d => { if (ok.has(d.name) && !(makers.get(d.name).decl.decls[0] === d)) ok.set(d.name, false); });
        if (node.params) node.params.forEach(p => { if (ok.has(p)) ok.set(p, false); });
        for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object' && k !== 'callee') visit(v, node, k, null);
    };
    visit(ast.body, null, null, null);
    const inline = new Map([...makers].filter(([n]) => ok.get(n)));
    if (!inline.size) return;
    const drop = new Set([...inline.values()].map(m => m.decl));
    const rewrite = node => {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.filter(x => !drop.has(x)).map(rewrite);
        if (node.type === 'Identifier' && inline.has(node.name)) return JSON.parse(JSON.stringify(inline.get(node.name).init));
        for (const key of Object.keys(node)) if (node[key] && typeof node[key] === 'object') node[key] = rewrite(node[key]);
        return node;
    };
    ast.body = rewrite(ast.body);
}

/**
 * Rewrite the program's calls of these library members in place. `parse` is parseMakeCodeTs; the
 * library functions a program calls are added to its body, once each.
 */
export function lowerLibraryCalls (ast, parse) {
    foldEventSources(ast);
    inlineSoundValues(ast);
    const taken = new Set();
    const collect = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(collect);
        if (node.type === 'Identifier' || node.type === 'FunctionDeclaration') taken.add(node.name);
        if (node.decls) node.decls.forEach(d => taken.add(d.name));
        for (const v of Object.values(node)) if (v && typeof v === 'object') collect(v);
    };
    collect(ast.body);
    const fresh = base => {
        let name = base;
        while (taken.has(name)) name += '_';
        taken.add(name);
        return name;
    };
    const added = new Map();
    const functionFor = path => {
        if (added.has(path)) return added.get(path).name;
        const def = FUNCTIONS[path];
        const name = fresh(path.replace('.', '_'));
        const global = def.globals ? fresh(`${name}_state`) : null;
        const text = s => s.replace(/\$g\b/g, global).replace(/\$/g, name);
        added.set(path, {name, globals: def.globals ? parse(text(def.globals)).body : [], body: parse(text(def.source)).body});
        return name;
    };
    // A built-in melody handed straight to a music call is that call's melody (the play-melody block), not an array.
    const handed = new WeakSet();
    const rewrite = node => {
        if (!node || typeof node !== 'object') return node;
        if (node.type === 'Call' && /^music\./.test(pathOf(node.callee) || '')) {
            for (const arg of node.args || []) {
                const p = arg && arg.type === 'Call' ? pathOf(arg.callee) : null;
                if (p === 'music.builtInMelody' || p === 'music.getMelody') {
                    arg.callee = member('music', 'builtInMelody');
                    handed.add(arg);
                }
            }
        }
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                const st = node[i];
                const call = st && st.type === 'ExpressionStatement' && st.expr && st.expr.type === 'Call' ? st.expr : null;
                const inline = call ? statements(pathOf(call.callee), call.args || []) : null;
                if (inline) {
                    node.splice(i, 1, ...inline);
                    i--;
                    continue;
                }
                node[i] = rewrite(st);
            }
            return node;
        }
        for (const key of Object.keys(node)) {
            const v = node[key];
            if (v && typeof v === 'object') node[key] = rewrite(v);
        }
        if (node.type !== 'Call') return node;
        const path = pathOf(node.callee);
        if (!path) return node;
        const args = node.args || [];
        if (handed.has(node)) return node;
        const swapped = replacement(path, args);
        if (swapped) return swapped;
        const def = FUNCTIONS[path];
        // basic.showArrow with a direction known here is the icon itself (above); with a value, pxt's body.
        if (!def || args.length > def.arity || (path === 'basic.showArrow' && args[0] && args[0].type === 'Member')) return node;
        const filled = [];
        for (let i = 0; i < def.arity; i++) {
            const d = def.defaults && def.defaults[i];
            if (args[i] && args[i].type !== 'Undefined') filled.push(args[i]);
            else if (d) filled.push({type: 'Number', value: d});
            else return node;
        }
        return {type: 'Call', callee: {type: 'Identifier', name: functionFor(path)}, args: filled};
        return node;
    };
    rewrite(ast.body);
    if (!added.size) return ast;
    const globals = [...added.values()].flatMap(f => f.globals);
    const functions = [...added.values()].flatMap(f => f.body);
    ast.body.unshift(...globals);
    ast.body.push(...functions);
    return ast;
}

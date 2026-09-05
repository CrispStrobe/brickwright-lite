/**
 * The six 8086 examples, and the only claim about them worth making: they
 * ASSEMBLE AND THEY RUN, and what they put on the screen is what the label
 * says.
 *
 * An example that loads and shows a blank screen is worse than one that is
 * absent, because a learner cannot tell it apart from a broken emulator. So
 * this gate does not check that the source parses, or that the assembler
 * returns bytes, or that a promise resolves. It boots each program and reads
 * the CGA text page back.
 *
 * IT DRIVES THE PATH THE USER DRIVES, as far as node can reach. Not
 * `assemble()` from `i8086-asm.js` — that would prove the assembler works
 * and prove nothing about the ▶ button. It calls `requestAssembly` with the
 * device the tab would pass and NO injected assembler, so the default local
 * path is the production one; it hands the result to `createI8086DosBench`,
 * the same module `debug-runner.js` imports; and it advances the machine
 * through `target.runFor`, which is what the debug session's frame loop
 * calls. The remaining gap is the React click and the CustomEvent hop
 * between them, which `test/asm-assemble-route.test.mjs` pins structurally
 * at both ends (producer names the slot, consumer forwards it).
 *
 * NO NETWORK IS INVOLVED AND NONE IS ALLOWED. `hostedFetch` is a function
 * that throws, so an 8086 program leaking onto the hosted route fails here
 * rather than skipping. That is the difference between this gate and
 * `asm-examples.test.mjs`, which legitimately skips when the hosted
 * assembler is unreachable: the local route has no excuse.
 *
 * PROVENANCE IS CHECKED WHEN IT CAN BE. These are MIT files carried verbatim
 * from a corpus that is not in this repo. When a checkout is present
 * (I8086_CORPUS, or the box's usual clone path) the shipped text is compared
 * against the upstream file; when it is not, the gate says so instead of
 * quietly passing. Either way the attribution fields and the in-source
 * header are required, because those are the terms.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import I8086_ALL, {I8086_EXAMPLES, AMEY_THAKUR}
    from '../overlay/scratch-gui/src/lib/bw-asm/examples-i8086.js';
import {asmExamplesFor} from '../overlay/scratch-gui/src/lib/bw-asm/examples.js';
import {requestAssembly} from '../overlay/scratch-gui/src/lib/bw-asm/assemble-route.js';
import {createI8086DosBench} from '../overlay/scratch-gui/src/lib/bw-debug/i8086-dos-bench.js';

/** A network that cannot be used without being noticed. */
const forbiddenFetch = () => {
    throw new Error('an 8086 example escaped to the hosted assembler');
};

const CORPUS = process.env.I8086_CORPUS ||
    '/mnt/volume1/code/retro-corpus-8086/8086-ASSEMBLY-LANGUAGE-PROGRAMS/Source Code';

test('the 8086 has examples, and they are the ones this file knows about', () => {
    assert.ok(I8086_EXAMPLES.length >= 5,
        'fewer than five 8086 examples — a device with one example is a device nobody uses');
    // THE TAB OFFERS THE FULL SET -- upstream's AND ours. It offered only
    // upstream's until 2026-09-04, so the 8255 pin panel, the keyboard demo
    // and mode 13h shipped in the file and were reachable from nowhere. The
    // roadmap still said "no graphics example" for exactly that reason.
    for (const spelling of ['i8086', '8086', 'i8088', '8088']) {
        assert.deepEqual(asmExamplesFor(spelling).map(e => e.id), I8086_ALL.map(e => e.id),
            `the ASM tab offers a different set for "${spelling}"`);
    }
    const ids = I8086_ALL.map(e => e.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate example id');
    // And the ones we wrote are actually in it, by name -- `length >= 5` would
    // pass on upstream's six alone and say nothing about ours.
    for (const mine of ['pins', 'keys', 'mode13', 'ether', 'ether2']) {
        assert.ok(ids.includes(mine), `"${mine}" is written here and offered nowhere`);
    }
});

test('our examples do NOT carry upstream\'s attribution', () => {
    // The split exists so that a `.map` stamping the upstream licence cannot
    // reach work that is not upstream's. Asserting it here means the two
    // populations stay distinguishable even as both grow.
    const upstream = new Set(I8086_EXAMPLES.map(e => e.id));
    for (const ex of I8086_ALL) {
        if (upstream.has(ex.id)) continue;
        assert.equal(ex.attribution, undefined,
            `"${ex.id}" is ours and must not be stamped with someone else's attribution`);
    }
});

test('every example carries the attribution it ships under', () => {
    for (const ex of I8086_EXAMPLES) {
        assert.equal(ex.attribution, AMEY_THAKUR, `${ex.id} has no attribution object`);
        // The tab renders the object; the SOURCE carries it into the editor,
        // which is what a learner who copies the text out takes with them.
        // MIT asks for the notice to accompany the code — a field in a build
        // artefact that never reaches the screen accompanies nothing.
        assert.match(ex.source, /^; TITLE:/m, `${ex.id} lost its upstream header`);
        assert.match(ex.source, /^; AUTHOR: Amey Thakur/m, `${ex.id} does not name its author`);
        assert.match(ex.source, /^; REPOSITORY: https:\/\/github\.com\/Amey-Thakur/m,
            `${ex.id} does not name where it came from`);
        assert.match(ex.source, /^; LICENSE: MIT License/m, `${ex.id} does not state its licence`);
        assert.ok(ex.label && ex.labelDe, `${ex.id} is missing a locale label`);
        assert.ok(ex.expect && ex.expect.length > 3,
            `${ex.id} has no expected output, so "it runs" is not a checkable claim`);
        assert.ok(Array.isArray(ex.warns), `${ex.id} does not declare its assembler warnings`);
    }
    assert.equal(AMEY_THAKUR.licence, 'MIT');
    assert.match(AMEY_THAKUR.author, /Amey Thakur/);
});

test('the shipped text is the upstream file, byte for byte', {
    skip: existsSync(CORPUS) ? false :
        `no corpus checkout at ${CORPUS} — set I8086_CORPUS to verify provenance`
}, () => {
    for (const ex of I8086_EXAMPLES) {
        const path = join(CORPUS, ex.file);
        assert.ok(existsSync(path), `${ex.id}: ${ex.file} is not in the corpus at ${CORPUS}`);
        // CRLF and trailing whitespace are the only permitted differences —
        // both are things git would have normalised anyway. Anything else is
        // an edit to someone else's MIT-licensed file.
        const upstream = readFileSync(path, 'utf8')
            .replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
        assert.equal(ex.source, upstream,
            `${ex.id} has drifted from ${ex.file} — these are carried verbatim`);
    }
});

/**
 * Assemble and run one example exactly as the tab does, and hand back what
 * ended up on the screen.
 */
async function runExample (ex) {
    const out = await requestAssembly({source: ex.source, device: 'i8086'},
        {hostedFetch: forbiddenFetch});
    const bench = await createI8086DosBench({bytes: out.bytes, format: out.format});
    bench.target.run();
    // 5 ms slices, the shape the frame loop pumps in. The cap is generous
    // and finite: a program that has not finished in two simulated seconds
    // is one this bench cannot run, and a gate that waited forever would
    // hang CI instead of reporting that.
    let slices = 0;
    while (!bench.terminated && slices++ < 400) bench.target.runFor(5e6);
    return {out, bench, slices, screen: bench.screenText().filter(Boolean)};
}

for (const ex of I8086_EXAMPLES) {
    test(`i8086/${ex.id} assembles locally, runs, and prints what it says it prints`, async () => {
        const {out, bench, slices, screen} = await runExample(ex);

        assert.equal(out.route, 'local');
        assert.ok(out.bytes.length > 0, `${ex.id} assembled to nothing`);
        // Not "no warnings" — "exactly the warnings this example DECLARES".
        // The local assembler gives ground in a handful of documented places
        // (an 80186 shift expanded, a segment override synthesised); every
        // one is recorded rather than silent, and the tab prints them. An
        // undeclared one means a program assembled differently from what was
        // written and nobody decided that was acceptable.
        assert.deepEqual(out.warnings.map(w => w.replace(/^L\d+: /, '')), ex.warns,
            `${ex.id}: the assembler's warnings are not the ones this example declares. ` +
            `It said ${JSON.stringify(out.warnings)}`);

        assert.ok(bench.terminated,
            `${ex.id} never reached INT 21h/4Ch in ${slices} slices — a program that does not ` +
            'end looks on screen exactly like one that hung');
        assert.equal(bench.exitCode & 0xff00, 0,
            `${ex.id} exited with a high byte set, which is not an exit code any of these set`);

        assert.ok(screen.length > 0,
            `${ex.id} left the screen BLANK. That is the failure this gate exists for: a blank ` +
            'screen is indistinguishable from a broken emulator, so an example that produces ' +
            'one is worse than no example at all');
        assert.ok(screen.join('\n').includes(ex.expect),
            `${ex.id} did not print ${JSON.stringify(ex.expect)}; the screen said ` +
            `${JSON.stringify(screen.slice(0, 4))}`);

        const report = bench.report();
        assert.deepEqual(report.unsupported, [],
            `${ex.id} asked for a DOS/BIOS service this layer does not implement: ` +
            `${JSON.stringify(report.unsupported)}. It would have run on with carry set and ` +
            'computed something plausible and wrong');
        assert.equal(report.keyRequests, 0,
            `${ex.id} waits for a keystroke, and this bench has no keyboard wired to the tab — ` +
            'it would sit there looking like a hang');
    });
}

test('the bench renders a frame, because the CGA screen is where the output IS', async () => {
    // The 8086 bench has no serial console: INT 21h writes go to the text
    // page at B8000 and reach the user through target.video(). A target that
    // assembled, ran and rendered nothing would put a correct program behind
    // a black pane — the exact shape of failure this codebase keeps paying
    // for, and one no assertion above would catch.
    const {bench} = await runExample(I8086_EXAMPLES[0]);
    assert.equal(typeof bench.target.video, 'function',
        'the 8086 DOS target exposes no video(), so the debug panel deletes runner.video ' +
        'and the screen never mounts');
    const frame = bench.target.video();
    assert.ok(frame && frame.width > 0 && frame.height > 0,
        `video() returned ${JSON.stringify(frame)} — no framebuffer, no visible program`);
});

test('a terminated program does not spin and does not stall', async () => {
    // Two failure modes, one branch. Returning zero cycles forever would
    // hang the caller's `while (machine.tMs < deadline)` loop with a browser
    // tab that never comes back; executing the trap page's `jmp $` forever
    // would burn every frame and look exactly like a program still working.
    const {bench} = await runExample(I8086_EXAMPLES[0]);
    assert.ok(bench.terminated);
    const t0 = bench.machine.tMs;
    bench.target.runFor(5e6);
    assert.ok(bench.machine.tMs > t0,
        'time stopped advancing after the program exited — the frame loop would spin forever');
    assert.equal(bench.machine.cpu.halted, true,
        'the CPU is still executing after the program exited, so the bench looks busy');
    // And the screen still holds the output: an exited program whose text
    // was scrolled or cleared away tells the learner nothing.
    assert.ok(bench.screenText().filter(Boolean).length > 0);
});

test('the Ethernet example REQUESTS its card, and hears its own frame', async () => {
    // AN ASSEMBLY PROGRAM HAS NO DECLARATIONS, so it cannot ask for hardware
    // the way a pseudocode program does. `; BW-CHIPS: ne2000@320` is a
    // COMMENT -- it assembles everywhere and means something only to the
    // bench, which is what lets an example request a card without inventing
    // an assembler directive MASM would reject.
    //
    // Without the card those ports are open bus and every read returns FFh,
    // so this example would print its failure message and still "pass" a test
    // that only checked it ran. The assertion is on what it SAYS.
    const ex = I8086_ALL.find(e => e.id === 'ether');
    assert.ok(ex, 'the example ships');
    assert.match(ex.source, /^\s*;\s*BW-CHIPS:\s*ne2000@320\s*$/m,
        'and declares the card it needs, at 320h rather than the ADC0809\'s 300h');

    const chips = [];
    for (const m of ex.source.matchAll(/^\s*;\s*BW-CHIPS:\s*(.+)$/gim)) {
        for (const spec of m[1].split(',')) {
            const b = spec.trim().match(/^([a-z0-9]+)(?:@([0-9a-f]+))?$/i);
            if (b) {
                chips.push({kind: b[1].toLowerCase(), name: `${b[1].toLowerCase()}0`,
                    ...(b[2] ? {at: parseInt(b[2], 16)} : {}), loopback: true});
            }
        }
    }
    assert.deepEqual(chips.map(c => c.kind), ['ne2000']);

    const out = await requestAssembly({source: ex.source, device: 'i8086'},
        {hostedFetch: forbiddenFetch});
    let text = '';
    const bench = await createI8086DosBench(
        {bytes: out.bytes, format: out.format, chips, onChar: (c) => { text += c; }});
    let n = 0;
    while (n < 2_000_000 && !bench.terminated) { bench.step(); n++; }
    assert.ok(bench.terminated, 'it finishes');
    assert.match(text, /heard its own frame/,
        `the loopback round trip worked — it said: ${JSON.stringify(text.trim())}`);
});

test('two cards on one hub: B hears one frame and IGNORES the other', async () => {
    // THE ASSERTION THAT MATTERS IS THE SECOND LINE. A hub is a repeater --
    // both cards see both frames -- so B staying silent on a frame addressed
    // to someone else is the MAC filter working, not the wire being clever.
    // A test that only checked the first line would pass against a card with
    // no filter at all.
    const ex = I8086_ALL.find(e => e.id === 'ether2');
    assert.ok(ex, 'the example ships');
    assert.match(ex.source, /BW-CHIPS:\s*ne2000@320,\s*ne2000@340/,
        'two cards, at two addresses — the machine refuses them at one');

    const chips = [
        {kind: 'ne2000', name: 'ne20000', at: 0x320, hub: true},
        {kind: 'ne2000', name: 'ne20001', at: 0x340, hub: true},
    ];
    const out = await requestAssembly({source: ex.source, device: 'i8086'},
        {hostedFetch: forbiddenFetch});
    let text = '';
    const bench = await createI8086DosBench(
        {bytes: out.bytes, format: out.format, chips, onChar: (c) => { text += c; }});
    let n = 0;
    while (n < 3_000_000 && !bench.terminated) { bench.step(); n++; }

    assert.ok(bench.terminated);
    assert.match(text, /B received the frame addressed to it/, 'the wire carries');
    assert.match(text, /B ignored the frame addressed to someone else/,
        'and the filter refuses — this is the half that a broken filter fails');
    assert.ok(!/filter is wrong/.test(text), 'B did not take a frame that was not its own');
});

test('two cards at ONE address is refused by the machine', async () => {
    // Why the example uses 320h and 340h rather than whatever came to hand.
    const {I8086Machine} = await import(
        new URL('../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js', import.meta.url).href);
    assert.throws(() => new I8086Machine({
        clockHz: 5e6,
        regions: [{kind: 'ram', start: 0, end: 0xffff}],
        chips: [{kind: 'ne2000', name: 'a', at: 0x320},
            {kind: 'ne2000', name: 'b', at: 0x320}],
    }), /both claim I\/O address/);
});

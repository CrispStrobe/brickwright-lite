/**
 * Which assembler the ▶ button uses, and why one tab now has two.
 *
 * THE INCONSISTENCY IS REAL AND IT IS ARGUED FOR, NOT APOLOGISED FOR.
 * Until now every ▶ Assemble & Run posted the editor's text to the hosted
 * service (stc-compiler /assemble — sdas8051, ca65+ld65, sdasz80, avr-gcc).
 * One route, one error surface, one thing to explain. The 8086 breaks that,
 * and the reason is not that nobody got round to it: NEITHER ca65 NOR
 * sdasz80 KNOWS THE 8086. There is no 8086 back end behind that URL, so the
 * choice was never "one route or two" — it was "two routes, or the 8086 has
 * no ASM tab at all". ROADMAP §4.4 recorded that as a decision owed rather
 * than a task pending, and this file is the decision.
 *
 * The case FOR, beyond necessity: where the local route applies it is
 * strictly better. It needs no network, so the button works on a train and
 * in a school that blocks the domain; it is the same assembler the 8086
 * corpus harness runs, differentially checked against MASM 1.10 across 404
 * programs and round-trip-verified against a disassembler that agrees with
 * 646,000 hardware vectors; and it returns a loadable image rather than a
 * base64 round trip.
 *
 * The case AGAINST is the one worth taking seriously: two routes mean two
 * error surfaces and two sets of behaviour to learn. A syntax error from
 * ca65 reads nothing like an `AsmError` from i8086-asm.js, and a user who
 * has learned one has not learned the other. That cost is paid, not dodged.
 * What is bought with it is that the SAME learner can write 8086 assembly at
 * all.
 *
 * THREE RULES KEEP THE COST BOUNDED, and each is asserted by
 * `test/asm-assemble-route.test.mjs`:
 *
 *   1. ONE function decides. `asmTargetForDevice` is the only place a device
 *      becomes a target and `asmRouteFor` the only place a target becomes a
 *      route. The call site does not get a vote, so the tab cannot pick
 *      differently in two places.
 *   2. NEITHER ROUTE CAN LEAK INTO THE OTHER. An 8086 program is never
 *      posted anywhere — the gate injects a `hostedFetch` that throws and
 *      requires it untouched — and a 6502/Z80/8051 program never reaches the
 *      local assembler, which would refuse its syntax with a message about
 *      the wrong architecture.
 *   3. THE RESULT SAYS WHICH ROUTE RAN. `route` comes back on every result
 *      and the tab puts it in the status line, because "it assembled" is a
 *      different sentence from "it assembled here, without the network".
 *      Silence about which of two things happened is the failure mode this
 *      whole codebase keeps paying for.
 *
 * NOT DONE, deliberately: moving the 6502/Z80/8051 targets local as well.
 * That is the change that would REMOVE the inconsistency, and it is much
 * larger — ca65, sdasz80 and sdas8051 are C programs, and lite already
 * carries one Emscripten toolchain (`lib/sdcc-wasm`) whose size is a
 * standing complaint. Recording it as the alternative that was weighed is
 * more honest than pretending two routes were the only shape available.
 *
 * @module
 */

/** The hosted assembler, verbatim from the call site it replaced. */
export const HOSTED_ASSEMBLER = 'https://stc-compiler.vercel.app/assemble';

/**
 * Targets assembled IN THE BROWSER. One entry, and it is a whitelist rather
 * than a "not hosted" fallback on purpose: a device this file has never
 * heard of must go to the hosted service, which knows about devices this
 * file does not, rather than to an 8086 assembler that would read its 8051
 * source as garbage.
 */
export const LOCAL_ASM_TARGETS = new Set(['i8086']);

/**
 * A refusal with its route attached, so the tab can say WHERE a program was
 * refused as well as why. `reason` separates a program the assembler read
 * and rejected ('source' — the user's problem, and the message names the
 * line) from a route that could not run at all ('transport' — the network,
 * or a missing module).
 */
export class AsmRouteError extends Error {
    constructor (message, {route, target, reason} = {}) {
        super(message);
        this.name = 'AsmRouteError';
        this.route = route;
        this.target = target;
        this.reason = reason || 'transport';
    }
}

/**
 * Device id → assembler target.
 *
 * The 8086 family is tested FIRST and by whole-string match. `i8088` and
 * `8088` answer to it because the 8088 is an 8086 with an eight-bit bus:
 * same instruction set, same encodings, so the same assembler emits the
 * same bytes — the difference is bus timing, which no assembler expresses.
 * Refusing the 8088 by name would refuse a machine we can in fact assemble
 * for, which is the reading `circuit-tab.jsx` already takes for the debug
 * core.
 */
export function asmTargetForDevice (device) {
    const d = String(device || '').toLowerCase();
    if (/^(i8086|8086|i8088|8088)$/.test(d)) return 'i8086';
    if (/6502|eater/.test(d)) return 'eater6502';
    if (/^(z80|zx48|zx128)$/.test(d)) return 'z80';
    // /assemble takes 8051 and AVR device ids directly (stc*, atmega*,
    // attiny*), so an unrecognised id is passed through rather than mapped.
    return d || 'stc12c5a60s2';
}

/** 'local' or 'hosted', for a device id. The tab shows this to the user. */
export function asmRouteFor (device) {
    return LOCAL_ASM_TARGETS.has(asmTargetForDevice(device)) ? 'local' : 'hosted';
}

/**
 * Targets whose **C** is compiled IN THE BROWSER, by SmallerC rather than by
 * `stc-compiler /compile`.
 *
 * A separate set from `LOCAL_ASM_TARGETS` even though today they hold the
 * same one id, because they answer different questions and will diverge: the
 * 8051 has a local C compiler (`sdcc-wasm`) and a HOSTED assembler, which is
 * the exact opposite pairing. Deriving one from the other would encode a
 * coincidence.
 *
 * The 8086 is here because the hosted service has no 8086 C back end at all
 * (ROADMAP §3.8.2b, door 1 — `ia16-elf-gcc` is not deployed), so this is not
 * "local instead of hosted", it is "local or nothing".
 */
export const LOCAL_C_TARGETS = new Set(['i8086']);

/** 'local' or 'hosted', for a C build on a device id. The tab shows this. */
export function cRouteFor (device) {
    return LOCAL_C_TARGETS.has(asmTargetForDevice(device)) ? 'local' : 'hosted';
}

/**
 * The in-browser 8086 assembler, loaded on demand.
 *
 * THE COMPONENT AND THE GATE BOTH REACH IT THROUGH THIS FUNCTION, and that
 * is the point of it existing rather than being inlined at the call site.
 * The recurring defect in this repo is "a test that supplied a precondition
 * production code never supplies"; a gate that imported `i8086-asm.js`
 * itself would prove the assembler works and prove nothing about the button.
 * `requestAssembly` DEFAULTS to this, the tab passes no override, and the
 * gate passes none either — so there is exactly one local path and both run
 * it.
 *
 * The chunk is ~90 KB of JavaScript and is not in the main bundle: nobody
 * who is not writing 8086 assembly pays for it.
 */
export async function assembleLocal8086 (source) {
    const mod = await import(/* webpackChunkName: "i8086-asm" */ '../bw-board/i8086-asm.js');
    const assemble = mod.assemble || mod.default;
    if (typeof assemble !== 'function') {
        throw new AsmRouteError(
            'the local 8086 assembler loaded but exports no assemble()',
            {route: 'local', target: 'i8086', reason: 'transport'});
    }
    // longJumps stays OFF. The module's header explains why at length: the
    // programs it rescues cannot assemble under MASM either, so promoting
    // them silently would hand a learner a program that works here and fails
    // on the lab machine with nothing to say why. A refusal that names the
    // line is the better teacher.
    return assemble(source, {});
}

/**
 * The C runtime startup a `.COM` needs around a C `main`.
 *
 * SMALLERC EMITS A MODULE, NOT A PROGRAM. `_main` is a function and nothing
 * calls it -- normally SmallerC's own linker supplies this, and we do not ship
 * the linker because our assembler produces the flat image directly.
 *
 * Without it the machine executes the compiler's data and epilogue as though
 * they were an entry point, terminates in single-digit steps and exits 0. A
 * program that exits immediately looks exactly like one that ran, which is why
 * this is six lines of assembly with a paragraph in front of it. Two probes
 * were written and believed before the missing startup was the answer.
 *
 * SmallerC's convention is cdecl with the result in AX, so INT 21h/AH=4Ch
 * carries `main`'s return value out as the DOS exit code.
 */
const C_STARTUP = [
    'bits 16',
    'org 100h',
    'section .text',
    // ARGC AND ARGV ARE PUSHED, and they were not. SmallerC is cdecl, so a
    // program declaring `main(int argc, char **argv)` reads argc from [bp+4]
    // and argv from [bp+6]. With nothing pushed those are whatever the stack
    // held below a .COM's SP -- measured: argc came out 0 by luck and argv
    // came out NON-NULL, so a program testing `argv == 0` took the wrong
    // branch. `int main(void)` never looks, which is why every earlier test
    // passed and this stayed invisible.
    //
    // It does not crash. It produces a program that walks arguments that do
    // not exist, which on this bench reads as the learner's own bug.
    //
    // Right-to-left, so argc lands nearest the return address; the caller
    // cleans, which is cdecl. A real DOS startup would parse the PSP command
    // tail into a real argv -- this hands over the honest empty case rather
    // than inventing one.
    '    xor ax, ax',
    '    push ax',          // argv = NULL
    '    push ax',          // argc = 0
    '    call _main',
    '    add sp, 4',        // cdecl: the caller cleans
    '    mov ah, 4Ch',
    '    int 21h',
].join('\n') + '\n';

/**
 * C -> 8086 image, entirely in the browser: SmallerC (BSD-2, compiled to
 * WASM) emits NASM `bits 16`, and our own assembler turns that into a .COM.
 *
 * WHY 80186 AND NOT 8086. SmallerC reaches for `LEAVE` in every function
 * epilogue and for `PUSH imm` and the three-operand `IMUL` from ordinary C --
 * all 80186 instructions. Assembling as an 8086 refuses the compiler's own
 * output at the first function, which is not a fact about the learner's
 * program. The 186 is a strict superset here and every board this runs on
 * declares `variant: '80186'` when it needs to.
 *
 * @param {string} cSource
 * @param {{compileC?: Function, assembleLocal?: Function}} [seams]
 */
export async function compileC8086 (cSource, seams = {}) {
    const {compileC, assembleLocal} = seams;
    const compile = compileC || (await import(
        /* webpackChunkName: "smallerc" */ '../smallerc-wasm/compiler.js')).compile;

    const out = await compile(cSource, {target: 'i8086'});
    if (!out || typeof out.asm !== 'string' || !out.asm.trim()) {
        throw new AsmRouteError(
            'the C compiler produced no assembly. Its diagnostics are in `warnings`.',
            {route: 'local', target: 'i8086', reason: 'source',
                detail: (out && out.warnings) || []});
    }

    // The compiler's own `bits 16` is dropped because the startup carries one;
    // two would be a duplicate directive rather than a harmless repeat.
    const body = out.asm.replace(/^\s*bits\s+16\s*$/im, '');
    const asm = C_STARTUP + body;

    const assemble = assembleLocal || (async (src) => {
        const mod = await import(/* webpackChunkName: "i8086-asm" */ '../bw-board/i8086-asm.js');
        // `setcc: true` IS FOR COMPILER OUTPUT ONLY, and the assembler's
        // default is off for a reason worth repeating here. SmallerC lowers a
        // comparison used as a VALUE -- `return a >= 1;`, `int b = (a > 1);`,
        // any ternary -- to SETcc, which is an 80386 instruction, so those
        // programs did not build at all while `if (a >= 1)` did. SmallerC has
        // no 8086 mode to ask for; its codegen emits SETcc unconditionally.
        //
        // The assembler synthesises it from MOV/Jcc/MOV and warns per site.
        // A learner hand-writing `setge al` in the ASM tab is still refused BY
        // NAME, because that instruction really is absent from the chip and a
        // silent substitution would hand them a program that works here and
        // fails on the lab machine. Nobody carries COMPILER output to a lab
        // machine, and the learner wrote `a >= 1`, not `setge`.
        return (mod.assemble || mod.default)(src, {variant: '80186', setcc: true});
    });
    const image = await assemble(asm);
    return {
        bytes: image.bytes || image,
        format: image.format || 'com',
        target: 'i8086', route: 'local', org: image.org ?? 0x100,
        asm,
        symbols: image.symbols,
        warnings: [...(out.warnings || []), ...(image.warnings || [])],
    };
}

/**
 * Build the C editor's buffer for a device, and return the SAME shape
 * `requestAssembly` returns, so the ▶ handler that boots an assembly program
 * boots a C one with no second code path.
 *
 * WHY THIS EXISTS RATHER THAN THE COMPONENT CALLING `compileC8086`. Rule 1 of
 * this module's header — one function decides the route — was written about
 * assembly and applies unchanged to C. `compileC8086` is the local PIPELINE;
 * it does not know what a device is and must not learn. This is where a
 * device becomes a decision, and it is the only such place for C.
 *
 * NO FALLBACK TO THE NETWORK, and that is a rule and not an omission. The
 * `sdcc-wasm/intercept.js` header states it for the 8051: "a supported request
 * never silently falls back after a local failure: that would turn
 * offline/debug failures into surprising network traffic". Here it is stronger
 * still, because there is nothing to fall back TO: the hosted service has no
 * 8086 C target, so a fallback would trade a message naming the learner's
 * construct for `unknown compile target 'i8086'`.
 *
 * A NON-LOCAL DEVICE IS REFUSED BY NAME rather than quietly posted, for the
 * same reason `requestAssembly` whitelists: the STC12's C already has a route
 * (hosted `/compile`, with `sdcc-wasm` intercepting it) and sending it here
 * would hand an 8051 program to a compiler that emits 8086.
 *
 * @param {{source: string, device: string}} req
 * @param {{compileC?: Function, assembleLocal?: Function}} [seams] passed
 *   straight to `compileC8086`; the tab injects neither.
 */
export async function requestCBuild ({source, device}, seams = {}) {
    const target = asmTargetForDevice(device);
    if (!LOCAL_C_TARGETS.has(target)) {
        throw new AsmRouteError(
            `${target} has no local C route — its C goes to the hosted compiler`,
            {route: 'hosted', target, reason: 'transport'});
    }
    if (typeof source !== 'string' || !source.trim()) {
        throw new AsmRouteError('there is no C to compile',
            {route: 'local', target, reason: 'source'});
    }
    let built;
    try {
        built = await compileC8086(source, seams);
    } catch (e) {
        // Both stages already name what they refused -- smlrc names the token
        // and the line, the assembler names the instruction or the symbol --
        // so re-wrapping the text would only bury it. What is added is the
        // route, because "the compiler in your browser refused this" and "the
        // service refused this" are different sentences.
        if (e instanceof AsmRouteError) throw e;
        throw new AsmRouteError(e.message, {route: 'local', target, reason: 'source'});
    }
    if (!built.bytes || !built.bytes.length) {
        throw new AsmRouteError('the local C route produced no image',
            {route: 'local', target, reason: 'source'});
    }
    // .COM, not ROM -- the same distinction requestAssembly draws, and for the
    // same reason: a .COM loaded as a ROM at F0000 executes nothing, and a
    // machine that executes nothing looks exactly like one that failed.
    const format = built.format === 'exe' ? 'exe' : 'com';
    return {
        bytes: built.bytes, target, route: 'local', format,
        slotId: format, profile: 'dos',
        org: built.org ?? null,
        asm: built.asm,
        warnings: (built.warnings || []).map(w => (typeof w === 'string' ?
            w : (w.line ? `L${w.line}: ` : '') + w.message)),
        listing: null
    };
}

/**
 * Assemble the ASM editor's buffer for a device, by whichever route that
 * device's target demands, and return an image the machine bench can boot.
 *
 * @param {{source: string, device: string}} req
 * @param {{assembleLocal?: Function, hostedFetch?: Function}} [seams]
 *   Only the NETWORK is normally injected (the gate replaces it with a spy
 *   that throws, to prove an 8086 never reaches it). `assembleLocal`
 *   defaults to the same function the tab uses — see `assembleLocal8086`.
 * @returns {Promise<{bytes: Uint8Array, target: string, route: 'local'|'hosted',
 *   format: 'rom'|'com'|'exe', slotId: string, profile: string|null,
 *   org: number|null, warnings: string[], listing: any}>}
 */
export async function requestAssembly ({source, device}, seams = {}) {
    const {assembleLocal = assembleLocal8086, hostedFetch = globalThis.fetch} = seams;
    const target = asmTargetForDevice(device);

    if (LOCAL_ASM_TARGETS.has(target)) {
        let out;
        try {
            out = await assembleLocal(source, {target});
        } catch (e) {
            // AsmError already names the line and the construct; re-wrapping
            // it would only bury that. `reason: 'source'` tells the tab this
            // is the user's program, not a broken toolchain.
            throw new AsmRouteError(e.message, {route: 'local', target, reason: 'source'});
        }
        if (!out || !out.bytes || !out.bytes.length) {
            throw new AsmRouteError(
                'the local 8086 assembler produced no image',
                {route: 'local', target, reason: 'source'});
        }
        // .COM and .EXE are DOS executables, not ROM images, and the bench
        // must be told so — a .COM loaded as a ROM at F0000 executes nothing
        // and a machine that executes nothing looks exactly like one that
        // failed to start. slotId/profile carry that to debug-runner.js.
        const format = out.format === 'exe' ? 'exe' : 'com';
        return {
            bytes: out.bytes, target, route: 'local', format,
            slotId: format, profile: 'dos',
            org: out.org ?? null,
            // Every give the assembler made (an expanded 80186 shift, a
            // synthesised segment override) is recorded rather than silent,
            // so the tab can show it.
            warnings: (out.warnings || []).map(w => (w.line ? `L${w.line}: ` : '') + w.message),
            listing: null
        };
    }

    let res;
    try {
        res = await hostedFetch(HOSTED_ASSEMBLER, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({asm: source, target})
        });
    } catch (e) {
        throw new AsmRouteError(e.message, {route: 'hosted', target, reason: 'transport'});
    }
    if (!res.ok) {
        throw new AsmRouteError(`Assembler HTTP ${res.status}`,
            {route: 'hosted', target, reason: 'transport'});
    }
    const result = await res.json();
    if (!result.success) {
        const msgs = (result.errors || []).map(e => (e.line ? `L${e.line}: ` : '') + e.message);
        throw new AsmRouteError(msgs.join('; ') || result.error || 'assembly failed',
            {route: 'hosted', target, reason: 'source'});
    }
    if (!result.base64) {
        throw new AsmRouteError('Assembler returned no image',
            {route: 'hosted', target, reason: 'transport'});
    }
    return {
        bytes: Uint8Array.from(atob(result.base64), c => c.charCodeAt(0)),
        target, route: 'hosted', format: 'rom', slotId: 'rom', profile: null,
        org: null, warnings: [], listing: result.listing || null
    };
}

export default requestAssembly;

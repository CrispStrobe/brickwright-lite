#!/usr/bin/env node
/**
 * The open Gowin FPGA flow, from a command line.
 *
 * Verilog + Gowin constraints in; a `.fs` bitstream and the two netlists out —
 * the same contract the editor's FPGA tab speaks, served by the same deployed
 * service (`bw-synth`, at synth.crispstro.be). This exists so the flow reaches a
 * terminal user without the editor: `bw-fpga synth blink.v --cst blink.cst
 * --mode online -o blink.fs`, then `bw-fpga flash blink.fs`.
 *
 * IT REUSES THE EDITOR'S LIBRARY, not a parallel copy: `synthesise()` builds and
 * validates the request, `screenForHostedSynthesis()` is the SAME licence screen
 * the tab runs before a copyleft source could leave the machine. A second
 * implementation would be a second thing to keep honest.
 *
 * NO DEFAULT MODE, DELIBERATELY — the same reason bw-toolchain.mjs gives: a
 * command line has no user session to read a preference from, and `online`
 * (send it to a shared server) and `local` (build it here) answer different
 * questions with different licence consequences. It names them and refuses to
 * guess.
 *
 *   node scripts/bw-fpga.mjs synth FILE.v [MORE.v...] --mode online|local
 *   node scripts/bw-fpga.mjs flash FILE.fs
 *   node scripts/bw-fpga.mjs check FILE.v
 *
 * @module
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {spawn} from 'node:child_process';

import {synthesise} from '../overlay/scratch-gui/src/lib/bw-fpga/synthesis.js';
import {screenForHostedSynthesis} from '../overlay/scratch-gui/src/lib/bw-fpga/licence.js';

const argv = process.argv.slice(2);
const verb = argv[0];
// Positional args are the ones that are not a flag and not a flag's value.
const flag = (name, fallback = null) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? fallback : argv[at + 1];
};
const has = name => argv.includes(`--${name}`);
const positionals = () => {
    const out = [];
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) { i++; continue; }   // skip the flag AND its value
        if (a === '-o') { i++; continue; }
        out.push(a);
    }
    return out;
};

const die = (message, code = 2) => { console.error(message); process.exit(code); };

// synth.crispstro.be is the deployed bw-synth; BW_SYNTHESIS_ENDPOINT overrides it
// (the editor reads the same variable), and --endpoint overrides that.
const DEFAULT_ENDPOINT = process.env.BW_SYNTHESIS_ENDPOINT || 'https://synth.crispstro.be/api';

const requireMode = () => {
    const mode = flag('mode');
    if (mode !== 'local' && mode !== 'online') {
        die('a mode is required and is not defaulted: --mode online | --mode local\n' +
            '  online  send the design to the hosted synthesis service (synth.crispstro.be)\n' +
            '  local   build it here — NOT available in Node: the in-browser toolchain\n' +
            '          (@yowasp/yosys) needs WebAssembly GC, which Node does not yet expose.\n' +
            '          Build locally in the editor or the native app instead.\n' +
            'There is no default: a command line has no user session to read a preference from.');
    }
    return mode;
};

/** Read the Verilog sources named on the command line. */
async function readSources (files) {
    if (!files.length) die('no Verilog given. Name at least one .v file.\n' +
        'usage: bw-fpga synth FILE.v [MORE.v...] --mode online [--cst FILE.cst]');
    const out = [];
    for (const f of files) {
        let source;
        try { source = await fsp.readFile(f, 'utf8'); }
        catch (e) { die(`cannot read ${f}: ${e.message}`); }
        out.push({name: path.basename(f), source});
    }
    return out;
}

/** Print licence refusals/warnings; return true if the hosted route is allowed. */
function reportLicence (files) {
    const {refusals, warnings, hostedAllowed} = screenForHostedSynthesis(files);
    for (const w of warnings) console.error(`warning: ${w.reason}`);
    for (const r of refusals) console.error(`refused: ${r.reason}`);
    return {hostedAllowed, refusals};
}

async function check () {
    const files = await readSources(positionals());
    const {hostedAllowed} = reportLicence(files);
    if (hostedAllowed) console.log('ok: nothing here refuses the hosted service.');
    return hostedAllowed ? 0 : 1;
}

async function synth () {
    const mode = requireMode();
    const files = await readSources(positionals());

    if (mode === 'local') {
        die('local synthesis is not available from the command line: the in-browser\n' +
            'toolchain needs WebAssembly GC, which Node does not expose. Use the editor\n' +
            "or the native app for a local build, or --mode online to use the service.", 1);
    }

    // The licence screen — the same one the tab runs, BEFORE anything is uploaded.
    const {hostedAllowed} = reportLicence(files);
    if (!hostedAllowed) {
        die('\nnot uploaded. A copyleft source may still be built LOCALLY (the editor or the\n' +
            'native app), where you compile it for yourself and nothing is conveyed.', 1);
    }

    let constraints = '';
    const cst = flag('cst');
    if (cst) {
        try { constraints = await fsp.readFile(cst, 'utf8'); }
        catch (e) { die(`cannot read --cst ${cst}: ${e.message}`); }
    } else {
        console.error('warning: no --cst given, so no pins are placed. The netlist is still ' +
            'produced; the bitstream will have nothing on its I/O.');
    }

    const endpoint = flag('endpoint') || DEFAULT_ENDPOINT;
    const top = flag('top') || null;
    console.error(`synthesising ${files.map(f => f.name).join(', ')} on ${endpoint} ...`);

    const r = await synthesise({files, constraints, top, endpoint});
    if (!r.ok) {
        die(`\nsynthesis refused (${r.code}): ${r.reason}` +
            (r.log ? `\n\n--- log ---\n${r.log}` : ''), 1);
    }

    // Save whatever came back. The bitstream is what a board is flashed with; the
    // netlists are for inspection and the gate-level simulator (simNetlist is the
    // technology-independent one, the only one a simulator can read).
    const derivedBase = path.basename(files[0].name).replace(/\.s?v$/i, '') || 'design';
    const outFs = argVal('o') || flag('o') || `${derivedBase}.fs`;
    const saved = [];
    if (r.bitstream) {
        await fsp.writeFile(outFs, Buffer.from(r.bitstream, 'base64'));
        saved.push(`${outFs} (${(Buffer.from(r.bitstream, 'base64').length / 1048576).toFixed(2)} MiB bitstream)`);
    } else {
        console.error('note: no bitstream came back (place & route or packing degraded); ' +
            'the netlist is still saved.');
    }
    if (flag('netlist')) {
        await fsp.writeFile(flag('netlist'), JSON.stringify(r.netlist));
        saved.push(`${flag('netlist')} (Gowin-mapped netlist)`);
    }
    if (flag('sim-netlist') && r.simNetlist) {
        await fsp.writeFile(flag('sim-netlist'), JSON.stringify(r.simNetlist));
        saved.push(`${flag('sim-netlist')} (generic sim netlist)`);
    }
    console.log(`ok: ${saved.length ? saved.join('\n    ') : 'nothing to save'}`);
    return r.bitstream ? 0 : 1;
}

/** `-o` takes a value like a flag but with a single dash. */
function argVal (name) {
    const at = argv.indexOf(`-${name}`);
    return at === -1 ? null : argv[at + 1];
}

async function flash () {
    const fs = positionals()[0];
    if (!fs) die('name the .fs bitstream to flash: bw-fpga flash design.fs');
    try { await fsp.access(fs); } catch { die(`cannot read ${fs}`); }
    const device = flag('device') || 'tangnano20k';

    // Flashing is openFPGALoader's job; it talks to the board over USB. We do not
    // reimplement it — we shell to it, and say plainly when it is not installed.
    const loader = 'openFPGALoader';
    const args = ['-b', device, fs];
    console.error(`$ ${loader} ${args.join(' ')}`);
    const code = await new Promise(resolve => {
        const child = spawn(loader, args, {stdio: 'inherit'});
        child.on('error', e => {
            if (e.code === 'ENOENT') {
                console.error(`\n${loader} is not installed. It is the open programmer for this board:\n` +
                    '  https://github.com/trabucayre/openFPGALoader\n' +
                    '  (Debian/Ubuntu: apt install openfpgaloader; macOS: brew install openfpgaloader)');
                resolve(127);
            } else { console.error(`${loader} failed to start: ${e.message}`); resolve(1); }
        });
        child.on('close', c => resolve(c === null ? 1 : c));
    });
    return code;
}

const verbs = {synth, flash, check};
if (!verb || verb === 'help' || has('help') || !verbs[verb]) {
    console.error(`usage: bw-fpga <synth|flash|check> [options]

  synth FILE.v [MORE.v...] --mode online   synthesise to a .fs bitstream + netlists
      --cst FILE.cst        Gowin pin constraints (IO_LOC ...)
      --top NAME            top module (default: the toolchain auto-selects)
      --endpoint URL        synthesis service base (default $BW_SYNTHESIS_ENDPOINT
                            or https://synth.crispstro.be/api)
      -o FILE.fs            where to write the bitstream (default <design>.fs)
      --netlist FILE        also save the Gowin-mapped netlist (JSON)
      --sim-netlist FILE    also save the generic simulator netlist (JSON)

  flash FILE.fs             flash a bitstream to the board via openFPGALoader
      --device NAME         board (default tangnano20k)

  check FILE.v [MORE.v...]  run the licence screen only; refuse copyleft by name

There is no default mode for synth. Copyleft sources are refused for the ONLINE
route (building them on a shared server would convey a derivative work) and must
be built locally instead — the same rule the editor enforces.`);
    process.exit(verb && verb !== 'help' && !has('help') ? 2 : 0);
}
process.exit(await verbs[verb]());

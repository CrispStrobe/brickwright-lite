/** SDCC 4.5.0 mcs51 toolchain in four single-threaded WASM stages. */
import {addCLineRecords, buildSymbolTable} from './symtab.js';

const LOCAL_TARGETS = Object.freeze({
    stc12c5a60s2: {iram: 0x100, xram: 0x400, code: 0xf000},
    stc12c5a16s2: {iram: 0x100, xram: 0x400, code: 0x4000},
    stc15f2k60s2: {iram: 0x100, xram: 0x700, code: 0xf000},
    stc15w408as: {iram: 0x100, xram: 0x200, code: 0x2000},
    stc89c52rc: {iram: 0x100, xram: 0x100, code: 0x2000}
});
let loaded = null;

export function localTargetSupported (target) {
    return Object.prototype.hasOwnProperty.call(LOCAL_TARGETS, String(target || '').toLowerCase());
}

const decodeBase64 = text => {
    const raw = atob(text);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
};

async function loadToolchain (base) {
    if (loaded) return loaded;
    loaded = (async () => {
        const resolve = name => new URL(`static/sdcc-wasm/${name}`, base).href;
        const [cc1, sdcc, sdas, sdld, response] = await Promise.all([
            import(/* webpackIgnore: true */ resolve('cc1.js')),
            import(/* webpackIgnore: true */ resolve('sdcc.js')),
            import(/* webpackIgnore: true */ resolve('sdas8051.js')),
            import(/* webpackIgnore: true */ resolve('sdld.js')),
            fetch(resolve('runtime.json'))
        ]);
        if (!response.ok) throw new Error(`runtime.json returned ${response.status}`);
        const packed = await response.json();
        if (packed.format !== 1 || !packed.files) throw new Error('unsupported SDCC runtime pack');
        const runtime = new Map(Object.entries(packed.files).map(([name, data]) => [name, decodeBase64(data)]));
        for (const name of ['/lib/small/mcs51.lib', '/lib/small/libsdcc.lib', '/include/mcs51/stc12.h']) {
            if (!runtime.has(name)) throw new Error(`SDCC runtime pack is missing ${name}`);
        }
        return {factories: [cc1, sdcc, sdas, sdld].map(m => m.default || m), runtime, resolve};
    })();
    try { return await loaded; } catch (e) { loaded = null; throw e; }
}

function mkdirp (FS, name) {
    let current = '';
    for (const part of name.split('/').filter(Boolean)) {
        current += `/${part}`;
        try { FS.mkdir(current); } catch { /* exists */ }
    }
}
function populateRuntime (FS, runtime) {
    for (const [name, bytes] of runtime) {
        mkdirp(FS, name.slice(0, name.lastIndexOf('/')));
        FS.writeFile(name, bytes);
    }
}
async function runTool (factory, name, args, resolve, setup, stdinBytes = null) {
    if (typeof factory !== 'function') throw new Error(`${name}.js did not export a module factory`);
    const errors = [];
    const module = await factory({
        noExitRuntime: true,
        thisProgram: name,
        arguments: args,
        locateFile: file => resolve(file),
        preRun: [M => {
            setup?.(M.FS);
            if (stdinBytes) {
                // SDCC's c1mode rewinds stdin. A MEMFS regular file works in both
                // Chromium and Node; Emscripten's callback device reports EOF in
                // Chromium and cannot provide seek semantics.
                mkdirp(M.FS, '/work');
                M.FS.writeFile('/work/main.i', stdinBytes);
                if (!M.FS.init.initialized) M.FS.init();
                const stdin = M.FS.getStream ? M.FS.getStream(0) : M.FS.streams[0];
                if (stdin) M.FS.close(stdin);
                // c1mode can reopen the standard-input pathname rather than
                // retaining fd 0. Point that pathname at the same regular file;
                // otherwise Chromium reopens Emscripten's prompt-backed TTY.
                M.FS.unlink('/dev/stdin');
                M.FS.symlink('/work/main.i', '/dev/stdin');
                const input = M.FS.open('/work/main.i', 'r');
                if (input.fd !== 0) throw new Error(`expected compiler input on fd 0, got ${input.fd}`);
                M.FS.chdir('/work');
            }
        }],
        print: () => {}, printErr: text => errors.push(String(text))
    });
    return {module, errors};
}
function readRequired (FS, name, stage, errors = []) {
    try { return FS.readFile(name); } catch {
        const detail = errors.filter(Boolean).slice(-6).join(' | ');
        const list = dir => {
            try { return FS.readdir(dir).filter(entry => entry !== '.' && entry !== '..').join(','); }
            catch { return '-'; }
        };
        throw new Error(`${stage} produced no ${name}${detail ? `: ${detail}` : ''} ` +
            `(root=${list('/')}; work=${list('/work')})`);
    }
}

export function linkerScript (limits = LOCAL_TARGETS.stc12c5a60s2) {
    return [
        '-muwx', '-i /work/main.ihx', '-M',
        `-I 0x${limits.iram.toString(16)}`, `-X 0x${limits.xram.toString(16)}`,
        `-C 0x${limits.code.toString(16)}`, '-y',
        '-b HOME = 0x0000', '-b XSEG = 0x0001', '-b PSEG = 0x0001',
        '-b ISEG = 0x0000', '-b BSEG = 0x0000',
        '-k /lib/small', '-l mcs51', '-l libsdcc', '-l libint', '-l liblong', '-l libfloat',
        '/work/main.rel', '', '-e', ''
    ].join('\n');
}
function bytesToBase64 (bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

export async function compileWithToolchain (code, {target = 'stc12c5a60s2', symbols = false,
    fosc = 11059200} = {}, toolchain) {
    const normalized = String(target).toLowerCase();
    if (!localTargetSupported(normalized)) return {success: false, unsupported: true,
        error: `the local compiler supports 8051 targets only; '${target}' needs the hosted toolchain`};
    try {
        const {factories, runtime, resolve} = toolchain;
        const source = new TextEncoder().encode(code);
        const cppArgs = [
            '-E', '-quiet', '-nostdinc', '-Wall', '-std=c11', '-D__SDCC_CHAR_UNSIGNED',
            '-D__SDCC_MODEL_SMALL', '-D__SDCC_FLOAT_REENT', '-D__SDCCCALL=0', '-D__SDCC=4_5_0',
            '-D__SDCC_VERSION_MAJOR=4', '-D__SDCC_VERSION_MINOR=5', '-D__SDCC_VERSION_PATCH=0',
            '-DSDCC=450', '-D__SDCC_REVISION=15242', '-D__SDCC_mcs51', '-D__STDC_NO_COMPLEX__=1',
            '-D__STDC_NO_THREADS__=1', '-D__STDC_NO_ATOMICS__=1', '-D__STDC_NO_VLA__=1',
            '-D__STDC_ISO_10646__=201409L', '-D__STDC_UTF_16__=1', '-D__STDC_UTF_32__=1',
            '-D__SIZEOF_FLOAT__=4', '-D__SIZEOF_DOUBLE__=4', '-D__SDCC_BITINT_MAXWIDTH=64',
            `-DFOSC_HZ=${Math.round(fosc)}UL`, '-isystem', '/include/mcs51', '-isystem', '/include',
            '-o', '/work/main.i', '/work/main.c'
        ];
        const cpp = await runTool(factories[0], 'cc1', cppArgs, resolve, FS => {
            populateRuntime(FS, runtime); mkdirp(FS, '/work'); FS.writeFile('/work/main.c', source);
        });
        const preprocessed = readRequired(cpp.module.FS, '/work/main.i', 'preprocessor', cpp.errors);

        const cc = await runTool(factories[1], 'sdcc', [
            '--c1mode', '-mmcs51', '--model-small', ...(symbols ? ['--debug'] : []), '-o', 'main.asm'
        ], resolve, FS => {
            populateRuntime(FS, runtime); mkdirp(FS, '/work');
            // Debug codegen follows the preprocessor's #line markers back to the
            // original file. Keep it in this stage's isolated MEMFS so SDCC can
            // emit C-line records instead of "No such file" assembly comments.
            FS.writeFile('/work/main.c', source);
        }, preprocessed);
        let asm = new TextDecoder().decode(readRequired(cc.module.FS, '/work/main.asm', 'compiler', cc.errors));
        if (!asm.includes('.optsdcc')) asm = asm.replace(/^(\s*\.module\s+\S+)/m,
            `$1\n\t.optsdcc -mmcs51 --model-small${symbols ? ' --debug' : ''}`);
        const adbPath = ['/main.adb', '/work/main.adb'].find(name => cc.module.FS.analyzePath(name).exists);
        const adb = symbols && adbPath ? cc.module.FS.readFile(adbPath) : null;

        const assembler = await runTool(factories[2], 'sdas8051', [
            symbols ? '-plosgffwy' : '-plosgffw', '/work/main.rel', '/work/main.asm'
        ], resolve, FS => {
            mkdirp(FS, '/work'); FS.writeFile('/work/main.asm', asm);
            if (adb) FS.writeFile('/work/main.adb', adb);
        });
        const rel = readRequired(assembler.module.FS, '/work/main.rel', 'assembler', assembler.errors);
        const optional = {};
        for (const ext of ['lst', 'sym', 'adb']) {
            const name = `/work/main.${ext}`;
            if (assembler.module.FS.analyzePath(name).exists) optional[ext] = assembler.module.FS.readFile(name);
        }

        const linker = await runTool(factories[3], 'sdld', ['-nf', '/work/main.lk'], resolve, FS => {
            populateRuntime(FS, runtime); mkdirp(FS, '/work'); FS.writeFile('/work/main.rel', rel);
            FS.writeFile('/work/main.lk', linkerScript(LOCAL_TARGETS[normalized]));
            for (const [ext, bytes] of Object.entries(optional)) FS.writeFile(`/work/main.${ext}`, bytes);
        });
        const ihx = readRequired(linker.module.FS, '/work/main.ihx', 'linker', linker.errors);
        const result = {success: true, hex: new TextDecoder().decode(ihx), base64: bytesToBase64(ihx),
            bytes: ihx.length, filename: 'firmware.ihx', format: 'ihx', f_cpu: fosc};
        if (symbols) {
            let cdb = '';
            try {
                cdb = new TextDecoder().decode(readRequired(linker.module.FS, '/work/main.cdb', 'debug linker'));
                cdb = addCLineRecords(cdb, asm);
                result.symbols = buildSymbolTable(cdb, code, {fosc, device: normalized});
                result.symbols_error = null;
            } catch (e) {
                result.symbols = null;
                result.symbols_error = `local symbol extraction failed: ${e.message}`;
            }
        }
        return result;
    } catch (e) {
        return {success: false, error: `local WASM compilation failed: ${e.message}`};
    }
}

export async function compile (code, options = {}) {
    try {
        const toolchain = await loadToolchain(document.baseURI);
        return await compileWithToolchain(code, options, toolchain);
    } catch (e) {
        return {success: false, error: `local WASM compilation failed: ${e.message}`};
    }
}

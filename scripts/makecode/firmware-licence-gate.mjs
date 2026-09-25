/**
 * The licence gate for a firmware base built FOR THE EMULATOR: what the linker
 * actually placed in the image, attributed to the component it came from, and a
 * refusal by name when any of it is chip-restricted code.
 *
 * WHY A MAP AND NOT A SOURCE LIST. A CODAL build compiles a Nordic nRF5 SDK
 * archive (libcodal-microbit-nrf5sdk.a, the Nordic 5-clause licence: "must only
 * be used with a Nordic Semiconductor ASA integrated circuit") and hands the
 * linker Nordic's SoftDevice, MBR and bootloader as objects
 * (codal-microbit-v2/lib/*.o) whether or not the image ends up using them. What
 * is COMPILED says nothing; what is LINKED is in the GNU ld map. This reads the
 * map's memory section ("Linker script and memory map" onwards: the discarded
 * list before it is not in the image) and counts every allocated input section
 * with a nonzero size by the file it came from.
 *
 * WHAT FAILS THE GATE (auditMap(...).violations):
 *   - any byte from libcodal-microbit-nrf5sdk.a;
 *   - any input section named .softdevice, .mbr, .bootloader, .settings or
 *     .uicr (the objects codal-microbit-v2 converts from Nordic's hex files);
 *   - any of those objects even LOADed (the emulator build removes them before
 *     the link, so their presence means the removal did not happen);
 *   - any byte whose source is not one of the known components — an
 *     unattributed byte fails closed rather than passing as "probably fine".
 * hexAudit() adds what the image itself must satisfy: no record outside the
 * application flash (none in UICR at 0x10001000), and a vector table that
 * boots with no MBR in front of it — initial SP in RAM, reset handler a Thumb
 * address inside the image.
 *
 * Shared by scripts/build-makecode-emu-bases.mjs (which refuses to write a base
 * that fails) and test/makecode-emu-bases.test.mjs (which proves the gate
 * reds on each forbidden kind).
 */

/** Components a byte may come from, by the input file the map names. First match wins. */
export const COMPONENTS = Object.freeze([
    // Forbidden: chip-restricted Nordic code.
    {id: 'nordic-nrf5sdk', forbidden: true, test: f => /libcodal-microbit-nrf5sdk\.a\(/.test(f),
        licence: 'Nordic 5-clause (must only be used with a Nordic Semiconductor ASA integrated circuit)'},
    {id: 'nordic-softdevice-objects', forbidden: true, test: f => /(^|\/)lib\/(softdevice|mbr|bootloader|bootloader_skip_validation|settings|uicr)\.o$/.test(f),
        licence: 'Nordic SoftDevice / MBR / bootloader binaries'},
    // Allowed.
    {id: 'nrfx-mdk', test: f => /libcodal-nrf52\.a\((gcc_startup_nrf52\d*\.S|system_nrf52\d*\.c)\.obj\)/.test(f),
        licence: 'Apache-2.0 (ARM Limited; nrfx MDK startup, modified by Nordic)'},
    {id: 'nrfx-driver', test: f => /libcodal-nrf52\.a\(nrfx_[^)]*\)/.test(f), licence: 'BSD-3-Clause (Nordic nrfx)'},
    {id: 'codal-nrf52', test: f => /libcodal-nrf52\.a\(/.test(f), licence: 'MIT (Lancaster University)'},
    {id: 'codal-core', test: f => /libcodal-core\.a\(/.test(f), licence: 'MIT (Lancaster University)'},
    {id: 'codal-microbit-v2', test: f => /libcodal-microbit-v2\.a\(/.test(f), licence: 'MIT (Lancaster University, Micro:bit Educational Foundation)'},
    {id: 'pxt-microbit', test: f => /(^|\/)CMakeFiles\/[^/]+\.dir\/pxtapp\//.test(f), licence: 'MIT (Microsoft Corporation)'},
    {id: 'toolchain', test: f => /(^|\/)(libc_nano|libc|libm|libg_nano|libgcc|libstdc\+\+_nano|libstdc\+\+|libsupc\+\+_nano|libsupc\+\+|libnosys)\.a\(|(^|\/)crt(i|n|0|begin|end)\.o$/.test(f),
        licence: 'newlib BSD-style / libgcc + libstdc++ GCC Runtime Library Exception'},
    {id: 'linker', test: f => f === '(linker)', licence: 'linker-generated'}
]);

/** Section names that carry Nordic's binaries (codal-microbit-v2/lib/*.o). */
export const FORBIDDEN_SECTIONS = Object.freeze(['.softdevice', '.mbr', '.bootloader', '.bootloader_skip_validation', '.settings', '.uicr']);

const NON_IMAGE = /^(\.debug|\.comment$|\.ARM\.attributes$|\/DISCARD\/$|\.stab|\.note|\.gnu\.attributes$)/;

/**
 * Every allocated input section in the map's memory section:
 * [{out, name, addr, size, file}]. Input sections may span two lines
 * (" .text.longname\n                0xADDR 0xSIZE file").
 */
export function mapSections (mapText) {
    const lines = mapText.split(/\r?\n/);
    const start = lines.findIndex(l => l.startsWith('Linker script and memory map'));
    if (start < 0) throw new Error('not a GNU ld map: no "Linker script and memory map" section');
    const out = [];
    const loads = [];
    let outSec = null;
    let pending = null;
    for (const l of lines.slice(start + 1)) {
        const load = /^LOAD (.+)$/.exec(l);
        if (load) { loads.push(load[1].trim()); continue; }
        if (l && !l.startsWith(' ')) {
            const m = /^(\S+)(\s+0x[0-9a-f]+\s+0x[0-9a-f]+)?/.exec(l);
            if (m) outSec = m[1];
            pending = null;
            continue;
        }
        if (!outSec || NON_IMAGE.test(outSec)) continue;
        const lone = /^ (\S+)\s*$/.exec(l);
        if (lone) { pending = lone[1]; continue; }
        const m = /^ (\S+)?\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S.*)$/.exec(l);
        if (!m) { pending = null; continue; }
        const name = m[1] || pending;
        pending = null;
        const size = parseInt(m[3], 16);
        if (!size || !name || name.startsWith('*fill*')) continue;
        out.push({out: outSec, name, addr: parseInt(m[2], 16), size, file: m[4].trim()});
    }
    return {sections: out, loads};
}

/** Which component a map input file belongs to (or null: unattributed). */
export function componentOf (file) {
    const c = COMPONENTS.find(k => k.test(file));
    return c ? c.id : null;
}

/** Output sections that occupy RAM only (no bytes in the image). */
const RAM_ONLY = /^\.(bss|heap|stack|noinit)/;

/**
 * The gate. Returns {bytes, image, members, violations}: per component, the
 * allocated input-section bytes (`bytes`: RAM-only sections included), the
 * bytes that are in the flash image (`image`: code, rodata, .data's initial
 * values), and how many distinct input files (`members`). Mergeable string
 * sections (.rodata.*.str1.*) are listed by ld at their size BEFORE merging, so
 * the per-component sums can exceed the image by a few KB (measured: 2105
 * bytes of 142276) — an overcount of the attributed, never a hidden byte.
 */
export function auditMap (mapText) {
    const {sections, loads} = mapSections(mapText);
    const bytes = {};
    const image = {};
    const members = {};
    const seen = new Set();
    const violations = [];
    for (const s of sections) {
        const id = componentOf(s.file);
        if (FORBIDDEN_SECTIONS.includes(s.name) || FORBIDDEN_SECTIONS.includes(s.out)) {
            violations.push(`${s.name} (${s.size} bytes from ${s.file}) lands in ${s.out}: a Nordic SoftDevice/MBR/bootloader section`);
        }
        if (!id) {
            violations.push(`${s.size} bytes of ${s.name} from ${s.file} are attributed to no known component`);
            continue;
        }
        if (COMPONENTS.find(k => k.id === id).forbidden) violations.push(`${s.size} bytes of ${s.name} from ${s.file}: ${id} is chip-restricted`);
        bytes[id] = (bytes[id] || 0) + s.size;
        if (!RAM_ONLY.test(s.out) && s.name !== 'COMMON') image[id] = (image[id] || 0) + s.size;
        if (!seen.has(s.file)) { seen.add(s.file); members[id] = (members[id] || 0) + 1; }
    }
    for (const f of loads) {
        if (COMPONENTS[1].test(f)) violations.push(`${f} is LOADed: the Nordic binaries were not removed before the link`);
    }
    for (const c of COMPONENTS.filter(k => k.forbidden)) {
        bytes[c.id] = bytes[c.id] || 0;
        image[c.id] = image[c.id] || 0;
        members[c.id] = members[c.id] || 0;
    }
    return {bytes, image, members, violations};
}

/** Intel HEX -> [{start, end}] contiguous ranges (absolute addresses). */
export function hexRanges (text) {
    let base = 0;
    const rs = [];
    for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim();
        if (!l.startsWith(':')) continue;
        const b = Buffer.from(l.slice(1), 'hex');
        const n = b[0], a = b.readUInt16BE(1), t = b[3];
        if (t === 4) base = b.readUInt16BE(4) * 0x10000;
        else if (t === 2) base = b.readUInt16BE(4) * 16;
        else if (t === 0) {
            const s = base + a;
            const last = rs[rs.length - 1];
            if (last && last.end === s) last.end = s + n;
            else rs.push({start: s, end: s + n});
        } else if (t === 1) break;
    }
    return rs;
}

/** Intel HEX -> flat Buffer from 0 to the highest address below `limit`. */
export function hexToFlat (text, limit = 0x10000000) {
    const rs = hexRanges(text).filter(r => r.start < limit);
    const size = rs.reduce((m, r) => Math.max(m, Math.min(r.end, limit)), 0);
    const img = Buffer.alloc(size, 0xff);
    let base = 0;
    for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim();
        if (!l.startsWith(':')) continue;
        const b = Buffer.from(l.slice(1), 'hex');
        const n = b[0], a = b.readUInt16BE(1), t = b[3];
        if (t === 4) base = b.readUInt16BE(4) * 0x10000;
        else if (t === 2) base = b.readUInt16BE(4) * 16;
        else if (t === 0 && base + a + n <= size) b.copy(img, base + a, 4, 4 + n);
        else if (t === 1) break;
    }
    return img;
}

/**
 * What the image must satisfy to boot bare on the emulated chip. `flash` and
 * `ram` are [start, end) of the part (nRF52833: 512 KB at 0, 128 KB at 0x20000000).
 */
export function hexAudit (text, {flash = [0, 0x80000], ram = [0x20000000, 0x20020000]} = {}) {
    const violations = [];
    const ranges = hexRanges(text);
    for (const r of ranges) {
        if (r.start < flash[0] || r.end > flash[1]) {
            violations.push(`record 0x${r.start.toString(16)}-0x${r.end.toString(16)} is outside application flash` +
                (r.start >= 0x10001000 && r.start < 0x10002000 ? ' (UICR: a bootloader/MBR address record)' : ''));
        }
    }
    const img = hexToFlat(text, flash[1]);
    const sp = img.length >= 8 ? img.readUInt32LE(0) : 0;
    const reset = img.length >= 8 ? img.readUInt32LE(4) : 0;
    const end = ranges.filter(r => r.end <= flash[1]).reduce((m, r) => Math.max(m, r.end), 0);
    if (!(sp > ram[0] && sp <= ram[1])) violations.push(`initial SP 0x${sp.toString(16)} is not in RAM`);
    if (!(reset & 1)) violations.push(`reset vector 0x${reset.toString(16)} is not a Thumb address`);
    if (!((reset & ~1) >= 0x40 && (reset & ~1) < end)) violations.push(`reset handler 0x${reset.toString(16)} is not inside the image (0x40-0x${end.toString(16)})`);
    return {ranges, sp, reset, imageEnd: end, violations};
}

/**
 * Byte-level check, independent of the map: does any 256-byte aligned chunk of
 * `blob` (a Nordic binary, read as DATA — never executed or disassembled)
 * appear anywhere in `image` (flat, from address 0)? Uniform chunks (all one
 * byte value) are skipped. Returns {chunks, matches: [image offset]}.
 */
export function chunksFound (blob, image, size = 256) {
    const want = new Set();
    for (let o = 0; o + size <= blob.length; o += size) {
        const c = blob.subarray(o, o + size);
        if (c.every(x => x === c[0])) continue;
        want.add(c.toString('base64'));
    }
    const matches = [];
    for (let o = 0; o + size <= image.length; o += 2) {
        if (want.has(image.subarray(o, o + size).toString('base64'))) matches.push(o);
    }
    return {chunks: want.size, matches};
}

/**
 * Who a byte-level match belongs to: the input sections of the map that the
 * matched range [offset, offset+size) overlaps. A match lying wholly inside the
 * TOOLCHAIN's code is the same public library routine linked into both images
 * — measured: newlib's memcpy (memcpy-armv7m.S), which Nordic's bootloader links
 * too — and is recorded, not refused. Any other match is a violation.
 * Returns {toolchain: [..], violations: [..]}.
 */
export function classifyMatches (name, matches, mapText, size = 256) {
    const {sections} = mapSections(mapText);
    const toolchain = [];
    const violations = [];
    for (const o of matches) {
        const hit = sections.filter(s => s.addr < o + size && s.addr + s.size > o && s.addr < 0x20000000);
        const who = [...new Set(hit.map(s => componentOf(s.file) || s.file))];
        const where = `${name} chunk at image 0x${o.toString(16)} (${hit.map(s => `${s.name} of ${s.file.replace(/^.*\//, '')}`).join(', ') || 'no input section'})`;
        if (who.length === 1 && who[0] === 'toolchain') toolchain.push(where);
        else violations.push(`${where} — ${who.join(', ') || 'unattributed'}: Nordic binary bytes in the image`);
    }
    return {toolchain, violations};
}

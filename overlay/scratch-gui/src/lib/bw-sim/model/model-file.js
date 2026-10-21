// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's model files: what "Open…" reads and "Save as…" writes.
// Everything is turned into, or made from, LDraw text (model/ldraw-model.js),
// the format of record the project stores.
//
//   .ldr  LDraw model                     open, save
//   .mpd  LDraw multi-part document       open (sub-models flattened), save (one FILE)
//   .io   BrickLink Studio                open (unencrypted only), save
//   .lxf  LEGO Digital Designer           open
//   .lcd  LeoCAD project (binary, 0.x)    open
//
// BRICKLINK STUDIO .io: a ZIP archive whose `model.ldr` is the model in plain
// LDraw with LDraw colour codes (LDraw wiki "IO"; the open-source readers in
// vengi's StudioIOFormat.cpp and brick-mcp's io_file.py read the same entry).
// Studio also writes `model2.ldr` (BrickLink colour codes), `modelv2.ldr`,
// `.info`, `thumbnail.png`, instruction settings and `CustomParts/` (parts
// Studio has and LDraw does not); none of that is read except the CustomParts
// names, so a model line placing one is refused as a Studio-only part rather
// than as an unknown one. Older Studio versions encrypt the archive: such a
// file is refused with a message to re-save it in a current Studio or export
// LDraw from Studio — the Robot Lab does not open protected archives.
// Studio's own part library ships 127 part names in a different frame from
// upstream LDraw (the MIT-licensed census in tribixbite/craftmatic,
// class-b-reframe-generated.ts); none of them is a part the Robot Lab knows,
// so no re-framing is applied and any of them is refused as unknown anyway.
// Writing: a ZIP holding `model.ldr` exactly as the .ldr save writes it, the
// shape newer Studio versions write (unencrypted). Not written: thumbnail,
// .info, model2/modelv2, instruction settings, CustomParts — Studio rebuilds
// the first ones; the Robot Lab's `0 !BW` lines (ports, ids, groups) travel
// inside model.ldr as LDraw comments.
//
// LEGO DIGITAL DESIGNER .lxf: a ZIP with `IMAGE100.LXFML` (model/lxf-model.js)
// and a thumbnail.
//
// LEOCAD .lcd: LeoCAD's own binary project file until LeoCAD 0.80 (model/lcd-model.js):
// the pieces with their LDraw part numbers, colours (LeoCAD's table) and the poses of
// the building instructions, step by step. It becomes a model from elsewhere (its
// author is the project's), so its motors and sensors are plugged in as for an MPD.

import JSZip from 'jszip';
import {serializeModel} from './ldraw-model.js';
import {LxfError, parseLxfml, lxfDesigns} from './lxf-model.js';
import {lddColours} from './ldd-parts.js';
import {LcdError, leoCadToLdraw} from './lcd-model.js';

/** Formats by extension: what Open accepts and what Save as offers. */
export const MODEL_FORMATS = Object.freeze({
    ldr: {open: true, save: true, mime: 'text/plain'},
    mpd: {open: true, save: true, mime: 'text/plain'},
    io: {open: true, save: true, mime: 'application/zip'},
    lxf: {open: true, save: false, mime: 'application/zip'},
    lcd: {open: true, save: false, mime: 'application/octet-stream'}
});
/** The file input's `accept`. */
export const OPEN_ACCEPT = Object.keys(MODEL_FORMATS).filter(k => MODEL_FORMATS[k].open).map(k => `.${k}`).join(',');
/** The formats Save as offers, in menu order. */
export const SAVE_FORMATS = Object.keys(MODEL_FORMATS).filter(k => MODEL_FORMATS[k].save);

/** A model file that cannot be opened at all. `code` names why (the pane words it). */
export class ModelFileError extends Error {
    constructor (code, message) {
        super(message);
        this.name = 'ModelFileError';
        this.code = code;
    }
}

/** The format of a file name (lower-case extension), or null. */
export const formatOf = name => {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    const ext = m ? m[1].toLowerCase() : '';
    return MODEL_FORMATS[ext] ? ext : null;
};

/** Same name, other extension. */
export const renameTo = (name, format) => `${String(name || 'model').replace(/\.[a-z0-9]+$/i, '') || 'model'}.${format}`;

/**
 * Largest model text read out of an archive, in bytes (as its directory declares it; a
 * 2,000-part model is about 250 KB). A bigger entry is refused before it is inflated.
 */
export const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const isZip = bytes => bytes.length >= 4 && ZIP_MAGIC.every((b, i) => bytes[i] === b);

/**
 * The names of a ZIP's entries and whether any is encrypted, from its central
 * directory (general-purpose flag bit 0 = encrypted). Read here, not by JSZip,
 * so an encrypted archive is recognised before anything tries to inflate it.
 * @param {Uint8Array} bytes
 * @returns {{names: string[], encrypted: boolean, sizes: number[]}} sizes: each entry's declared
 *          uncompressed size
 * @throws {ModelFileError} `not-a-zip` when there is no readable central directory
 */
export const zipDirectory = bytes => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new ModelFileError('not-a-zip', 'not a ZIP archive');
    const count = view.getUint16(eocd + 10, true);
    let at = view.getUint32(eocd + 16, true);
    const names = [];
    const sizes = [];
    let encrypted = false;
    const text = new TextDecoder();
    for (let n = 0; n < count; n++) {
        if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) {
            throw new ModelFileError('not-a-zip', 'the ZIP directory is damaged');
        }
        if (view.getUint16(at + 8, true) & 1) encrypted = true;
        const nameLength = view.getUint16(at + 28, true);
        const extra = view.getUint16(at + 30, true);
        const comment = view.getUint16(at + 32, true);
        if (at + 46 + nameLength > bytes.length) throw new ModelFileError('not-a-zip', 'the ZIP directory is damaged');
        sizes.push(view.getUint32(at + 24, true));
        names.push(text.decode(bytes.subarray(at + 46, at + 46 + nameLength)));
        at += 46 + nameLength + extra + comment;
    }
    return {names, encrypted, sizes};
};

/**
 * The archive as JSZip reads it; a damaged one (a bad CRC, a size that does not match,
 * entries cut off) is `not-a-zip`, not JSZip's own error.
 */
const loadZip = async bytes => {
    if (zipDirectory(bytes).sizes.some(size => size > MAX_ENTRY_BYTES)) {
        throw new ModelFileError('model-too-big', `the archive holds an entry larger than ${MAX_ENTRY_BYTES} bytes`);
    }
    try {
        return await JSZip.loadAsync(bytes, {checkCRC32: true});
    } catch (error) {
        throw new ModelFileError('not-a-zip', `the ZIP archive is damaged (${error && error.message})`);
    }
};

/** An entry's text; a damaged entry is `not-a-zip`. */
const entryText = async entry => {
    try {
        return await entry.async('string');
    } catch (error) {
        throw new ModelFileError('not-a-zip', `the ZIP archive is damaged (${error && error.message})`);
    }
};

/** The file entry (not a folder) whose path matches `test`, as JSZip names it. */
const entryWhere = (zip, test) => Object.values(zip.files).find(e => !e.dir && test(e.name.replace(/\\/g, '/'))) || null;

/**
 * The LDraw model inside a BrickLink Studio .io.
 * @param {Uint8Array} bytes
 * @returns {Promise<{text: string, refusals: object[]}>} refusals: lines placing a Studio-only part
 * @throws {ModelFileError} `io-encrypted`, `io-no-model`, `not-a-zip`
 */
export const readStudioIo = async bytes => {
    if (!isZip(bytes)) throw new ModelFileError('not-a-zip', 'not a ZIP archive');
    const {names, encrypted} = zipDirectory(bytes);
    if (encrypted) throw new ModelFileError('io-encrypted', 'the Studio file is password-protected (an older Studio version)');
    const zip = await loadZip(bytes);
    const entry = entryWhere(zip, n => n.toLowerCase() === 'model.ldr');
    if (!entry) throw new ModelFileError('io-no-model', 'the Studio file has no model.ldr');
    const text = await entryText(entry);
    // Parts Studio carries itself: CustomParts/<name>.dat (any sub-folder below is a primitive).
    const studioOnly = new Set(names.map(n => n.replace(/\\/g, '/'))
        .filter(n => /^customparts\/(?:parts\/)?[^/]+\.dat$/i.test(n))
        .map(n => n.split('/').pop().toLowerCase()));
    const refusals = [];
    if (studioOnly.size) {
        text.split(/\r?\n/).forEach((line, i) => {
            const m = /^\s*1\s+(?:\S+\s+){13}(.+?)\s*$/.exec(line);
            if (m && studioOnly.has(m[1].replace(/\\/g, '/').split('/').pop().toLowerCase())) {
                refusals.push({line: i + 1, code: 'studio-only-part', message: `Line ${i + 1} places a part only BrickLink Studio has`});
            }
        });
    }
    return {text, refusals};
};

/** A fixed timestamp for archive entries, so the same model always writes the same bytes. */
const ZIP_DATE = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

/**
 * A BrickLink Studio .io holding the model's LDraw text as `model.ldr`.
 * @param {string} ldraw the text serializeModel wrote
 * @returns {Promise<Uint8Array>}
 */
export const writeStudioIo = async ldraw => {
    const zip = new JSZip();
    zip.file('model.ldr', ldraw, {date: ZIP_DATE, binary: false, createFolders: false});
    return zip.generateAsync({type: 'uint8array', compression: 'DEFLATE', compressionOptions: {level: 6}});
};

/**
 * The model as an LDraw multi-part document: one `0 FILE` section holding the
 * .ldr text, which reads back to the same parts, ids, ports, groups and steps.
 */
export const serializeMpd = (model, {name = 'model.ldr', title, author} = {}) => {
    const section = renameTo(name, 'ldr');
    const text = serializeModel(model, {name: section, title, author});
    // A model that ships parts of its own is written as an MPD already (its FILE sections).
    if (/^0 FILE /.test(text)) return text;
    return `0 FILE ${section}\r\n${text}0 NOFILE\r\n`;
};

/**
 * An LDD .lxf's model as LDraw text.
 * @param {Uint8Array} bytes
 * @param {{ldconfig: string, catalog?: Map<string, object>, prepareCatalog?: (parts: string[]) => Promise<*>}} options
 *        ldconfig: LDConfig.ldr text (the LEGO colour numbers); catalog: the Robot Lab's parts (a design outside
 *        ldd-parts.js may then be placed with a derived frame or by its connections: lxf-model.js);
 *        prepareCatalog: loads the LDraw parts the designs may be into `catalog` first (the app derives the
 *        ones it lacks from the LDraw library, sim-lab.js catalogFor)
 * @returns {Promise<{text: string, refusals: object[]}>}
 * @throws {ModelFileError} `not-a-zip`, `lxf-no-lxfml`, `lxf-unreadable`, `lxf-version`
 */
export const readLxf = async (bytes, {ldconfig, catalog, prepareCatalog, name = 'model.lxf', title}) => {
    let xml;
    if (isZip(bytes)) {
        const {encrypted} = zipDirectory(bytes);
        if (encrypted) throw new ModelFileError('lxf-unreadable', 'the LDD file is encrypted');
        const zip = await loadZip(bytes);
        const lxfml = entryWhere(zip, n => /(^|\/)[^/]*\.lxfml$/i.test(n));
        if (!lxfml) throw new ModelFileError('lxf-no-lxfml', 'the LDD file has no .LXFML model');
        xml = await entryText(lxfml);
    } else {
        xml = new TextDecoder().decode(bytes); // a bare .lxfml
    }
    if (prepareCatalog && catalog) {
        const designs = lxfDesigns(xml).filter(d => /^[0-9A-Za-z]+$/.test(d));
        try {
            await prepareCatalog(designs.map(d => `${d.toLowerCase()}.dat`));
        } catch (_) { /* offline: the designs the catalogue lacks are refused by name */ }
    }
    let parsed;
    try {
        parsed = parseLxfml(xml, {colours: lddColours(ldconfig), catalog});
    } catch (error) {
        if (error instanceof LxfError) throw new ModelFileError(error.code, error.message);
        throw error;
    }
    // A model from elsewhere, not ours: its motors and sensors are plugged in for it (sim-session.js prepareModel).
    const text = serializeModel(parsed.model, {name: renameTo(name, 'ldr'), title, author: 'LEGO Digital Designer model (imported)'});
    return {text, refusals: parsed.refusals};
};

/**
 * A LeoCAD .lcd project as LDraw text.
 * @param {Uint8Array} bytes
 * @returns {{text: string, refusals: object[]}}
 * @throws {ModelFileError} `lcd-unreadable`, `lcd-version`
 */
export const readLeoCad = (bytes, {name = 'model.lcd'} = {}) => {
    try {
        return leoCadToLdraw(bytes, {name});
    } catch (error) {
        if (error instanceof LcdError) throw new ModelFileError(error.code, error.message);
        throw error;
    }
};

/**
 * Open any supported model file as LDraw text.
 * @param {string} name the file's name (its extension picks the reader)
 * @param {Uint8Array} bytes its contents
 * @param {{ldconfig?: string, title?: string, catalog?: Map<string, object>}} [options] ldconfig: needed for .lxf;
 *        catalog: the Robot Lab's parts, for .lxf designs placed with a derived frame
 * @returns {Promise<{text: string, name: string, refusals: object[]}>} name: the model's name from now on (.ldr for converted files)
 * @throws {ModelFileError}
 */
export const openModelFile = async (name, bytes, {ldconfig = '', title, catalog, prepareCatalog} = {}) => {
    const format = formatOf(name);
    if (format === 'ldr' || format === 'mpd') return {text: new TextDecoder().decode(bytes), name, refusals: []};
    if (format === 'io') return {...await readStudioIo(bytes), name: renameTo(name, 'ldr')};
    if (format === 'lxf') return {...await readLxf(bytes, {ldconfig, catalog, prepareCatalog, name, title}), name: renameTo(name, 'ldr')};
    if (format === 'lcd') return {...readLeoCad(bytes, {name}), name: renameTo(name, 'ldr')};
    throw new ModelFileError('unsupported-format', `files ending in ${(/\.[^.]*$/.exec(String(name)) || [''])[0] || '(nothing)'} are not model files the Robot Lab opens`);
};

/**
 * The model as a file to save.
 * @param {object} model PlacedModel
 * @param {'ldr'|'mpd'|'io'} format
 * @param {{name?: string, title?: string, author?: string}} [options] name: the base file name; author: the model's
 *        own (an imported model keeps it: `Brickwright` would make it one of ours, sim-session.js OWN_FILE)
 * @returns {Promise<{data: string|Uint8Array, filename: string, mime: string}>}
 */
export const saveModelFile = async (model, format, {name = 'my-model.ldr', title, author} = {}) => {
    if (!MODEL_FORMATS[format]?.save) throw new ModelFileError('unsupported-format', `cannot save as .${format}`);
    const ldrName = renameTo(name, 'ldr');
    const filename = renameTo(name, format);
    const ldraw = serializeModel(model, {name: ldrName, title, author});
    const data = format === 'ldr' ? ldraw : format === 'mpd' ? serializeMpd(model, {name: ldrName, title, author}) : await writeStudioIo(ldraw);
    return {data, filename, mime: MODEL_FORMATS[format].mime};
};

/**
 * The import's own notes first, then the reader's, without saying one line twice: a line
 * the import already explained (a Studio-only part) drops the reader's `unknown-part`.
 */
export const mergeImportIssues = (imported, issues) => {
    const explained = new Set(imported.filter(r => r.line).map(r => r.line));
    return [...imported, ...issues.filter(i => !(i.code === 'unknown-part' && explained.has(i.line)))];
};

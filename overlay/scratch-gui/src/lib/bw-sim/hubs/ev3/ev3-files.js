// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Virtual EV3's file system: what the system commands download into and list, and what
// opFILE LOAD_IMAGE reads a program from (docs/EV3-RBF-VM.md §Files). Plain data in the hub's state
// (`s.fs`), so the physics worker's mirror copies it.
//
// Facts: LEGO's EV3 Communication Developer Kit §3 (the commands, their statuses, "destination
// filename path is addressed relative to lms2012/sys", "LIST_FILES … 32 chars (hex) of MD5SUM + space
// + 8 chars (hex) of filesize + space + filename + new line", folders as "name/") and LEGO's lms2012
// source (c_com.c, c_memory.c; GPL-2, read as a fact source, nothing copied): 64 file handles; the
// file is written as it arrives and closed when the announced size is reached (END_OF_FILE); an
// upload closes its handle at the end; a name is at most 119 characters, its folder part below 84,
// its name below 32 and its extension below 5. Ours: the order of a listing (sorted), the space the
// brick has, and one flat map of absolute paths.

export const HOME = '/home/root/lms2012';
/** The brick's working folder: a relative path starts here ("../prjs/x/x.rbf" is HOME/prjs/x/x.rbf). */
export const WORKING_DIR = `${HOME}/sys`;
export const MAX_FILE_HANDLES = 64;
/** The user's space for files (ours: about what a fresh EV3's flash leaves free). */
export const USER_SPACE_BYTES = 6 * 1024 * 1024;

/** System reply statuses [CDK §3.1]. */
export const STATUS = Object.freeze({
    SUCCESS: 0x00, UNKNOWN_HANDLE: 0x01, HANDLE_NOT_READY: 0x02, CORRUPT_FILE: 0x03, NO_HANDLES_AVAILABLE: 0x04,
    NO_PERMISSION: 0x05, ILLEGAL_PATH: 0x06, FILE_EXITS: 0x07, END_OF_FILE: 0x08, SIZE_ERROR: 0x09,
    UNKNOWN_ERROR: 0x0a, ILLEGAL_FILENAME: 0x0b, ILLEGAL_CONNECTION: 0x0c
});

const DEFAULT_DIRS = ['/', '/home', '/home/root', HOME, `${HOME}/apps`, `${HOME}/prjs`, `${HOME}/sys`, `${HOME}/tools`];

/** The file system of a fresh brick. */
export const freshFs = () => ({files: {}, dirs: [...DEFAULT_DIRS], handles: [], images: {}, nextImage: 1});

const parentOf = path => (path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/');

/**
 * A path as the brick resolves it: absolute, "~/" (root's home), or relative to its working folder;
 * "." and ".." resolved. null when the brick would refuse the name (too long; folder, name or
 * extension too long; empty).
 */
export const resolvePath = path => {
    const text = String(path || '');
    if (!text || text.length >= 120 || text.includes('\0')) return null;
    const slash = text.lastIndexOf('/');
    const dir = slash >= 0 ? text.slice(0, slash) : '';
    const file = text.slice(slash + 1);
    const dot = file.lastIndexOf('.');
    const name = dot > 0 ? file.slice(0, dot) : file;
    const ext = dot > 0 ? file.slice(dot) : '';
    if (dir.length >= 84 || name.length >= 32 || ext.length >= 5) return null;
    const start = text.startsWith('/') ? '' : text.startsWith('~/') ? '/home/root' : WORKING_DIR;
    const rest = text.startsWith('~/') ? text.slice(2) : text;
    const parts = [];
    for (const part of `${start}/${rest}`.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
    }
    return `/${parts.join('/')}`;
};

const isDir = (fs, path) => fs.dirs.includes(path) || Object.keys(fs.files).some(f => f.startsWith(`${path === '/' ? '' : path}/`));
const usedBytes = fs => Object.values(fs.files).reduce((n, f) => n + f.length, 0);
export const freeBytes = fs => Math.max(0, USER_SPACE_BYTES - usedBytes(fs));

const ensureDirs = (fs, path) => {
    for (let d = parentOf(path); d && !fs.dirs.includes(d); d = parentOf(d)) fs.dirs.push(d);
};

const newHandle = (fs, entry) => {
    for (let h = 0; h < MAX_FILE_HANDLES; h++) {
        if (!fs.handles[h]) {
            fs.handles[h] = entry;
            return h;
        }
    }
    return -1;
};
const freeHandle = (fs, h) => {
    if (h >= 0 && h < MAX_FILE_HANDLES && fs.handles[h]) {
        fs.handles[h] = null;
        return true;
    }
    return false;
};

/** A file's bytes (a copy), or null. */
export const readFile = (fs, path) => {
    const p = resolvePath(path);
    return p && fs.files[p] ? fs.files[p].slice() : null;
};

/** Puts a whole file (a host's completed download; tests). Returns a status. */
export const putFile = (fs, path, bytes) => {
    const p = resolvePath(path);
    if (!p || isDir(fs, p)) return STATUS.ILLEGAL_FILENAME;
    if (bytes.length > freeBytes(fs) + (fs.files[p] ? fs.files[p].length : 0)) return STATUS.SIZE_ERROR;
    ensureDirs(fs, p);
    fs.files[p] = Array.from(bytes, b => b & 0xff);
    return STATUS.SUCCESS;
};

// ---- download (host → brick) --------------------------------------------------------------------

/**
 * BEGIN_DOWNLOAD: opens `path` for `size` bytes (folders are created), writes what came with the
 * command. END_OF_FILE once the size is reached (the handle is then closed).
 */
export const beginDownload = (fs, path, size, bytes = []) => {
    const p = resolvePath(path);
    if (!p || isDir(fs, p)) return {status: STATUS.UNKNOWN_HANDLE, handle: -1, error: true};
    if (size > freeBytes(fs) + (fs.files[p] ? fs.files[p].length : 0)) return {status: STATUS.SIZE_ERROR, handle: -1, error: true};
    const handle = newHandle(fs, {kind: 'download', path: p, size, pointer: 0});
    if (handle < 0) return {status: STATUS.NO_HANDLES_AVAILABLE, handle: -1, error: true};
    ensureDirs(fs, p);
    fs.files[p] = [];
    let status = STATUS.SUCCESS;
    let data = Array.from(bytes);
    if (data.length > size) {
        status = STATUS.SIZE_ERROR;
        data = data.slice(0, size);
    }
    const r = writeChunk(fs, handle, data);
    return {status: r.done ? STATUS.END_OF_FILE : status, handle};
};

const writeChunk = (fs, handle, data) => {
    const h = fs.handles[handle];
    const room = h.size - h.pointer;
    const take = data.slice(0, Math.max(0, room));
    fs.files[h.path].push(...take.map(b => b & 0xff));
    h.pointer += take.length;
    if (h.pointer >= h.size) {
        freeHandle(fs, handle);
        return {done: true};
    }
    return {done: false};
};

/** CONTINUE_DOWNLOAD: appends to an open download; bytes past the announced size are dropped. */
export const continueDownload = (fs, handle, bytes) => {
    const h = fs.handles[handle];
    if (!h || h.kind !== 'download') return {status: STATUS.UNKNOWN_HANDLE, handle: -1, error: true};
    const r = writeChunk(fs, handle, Array.from(bytes));
    return {status: r.done ? STATUS.END_OF_FILE : STATUS.SUCCESS, handle};
};

// ---- upload (brick → host) ------------------------------------------------------------------------

/**
 * BEGIN_UPLOAD / BEGIN_GETFILE: the file's size, a handle and its first `count` bytes. An upload's
 * handle closes at the end of the file (END_OF_FILE); a getfile's stays open until CLOSE_FILEHANDLE.
 */
export const beginUpload = (fs, path, count, {keepOpen = false} = {}) => {
    const p = resolvePath(path);
    if (!p || !fs.files[p]) return {status: STATUS.UNKNOWN_HANDLE, handle: -1, size: 0, data: [], error: true};
    const handle = newHandle(fs, {kind: keepOpen ? 'getfile' : 'upload', path: p, pointer: 0});
    if (handle < 0) return {status: STATUS.NO_HANDLES_AVAILABLE, handle: -1, size: 0, data: [], error: true};
    return readChunk(fs, handle, count);
};

const readChunk = (fs, handle, count) => {
    const h = fs.handles[handle];
    const file = fs.files[h.path] || [];
    const data = file.slice(h.pointer, h.pointer + Math.max(0, count));
    h.pointer += data.length;
    const end = h.pointer >= file.length;
    if (end && h.kind === 'upload') freeHandle(fs, handle);
    return {status: end ? STATUS.END_OF_FILE : STATUS.SUCCESS, handle, size: file.length, data};
};

/** CONTINUE_UPLOAD / CONTINUE_GETFILE: the next `count` bytes. */
export const continueUpload = (fs, handle, count, {getfile = false} = {}) => {
    const h = fs.handles[handle];
    if (!h || h.kind !== (getfile ? 'getfile' : 'upload')) return {status: STATUS.UNKNOWN_HANDLE, handle: -1, size: 0, data: [], error: true};
    return readChunk(fs, handle, count);
};

// ---- folders ----------------------------------------------------------------------------------------

/** The listing text of a folder [CDK §3.3.4], or null if it is not a folder. Sorted (ours). */
export const listing = (fs, path) => {
    const p = resolvePath(path.endsWith('/') ? path.slice(0, -1) || '/' : path);
    if (!p || !isDir(fs, p)) return null;
    const prefix = p === '/' ? '/' : `${p}/`;
    const dirs = new Set(['.', '..']);
    const files = [];
    for (const d of fs.dirs) if (d !== p && d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) dirs.add(d.slice(prefix.length));
    for (const f of Object.keys(fs.files)) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        if (rest.includes('/')) dirs.add(rest.slice(0, rest.indexOf('/')));
        else files.push(rest);
    }
    const lines = [...[...dirs].sort().map(d => `${d}/`)];
    for (const name of files.sort()) {
        const bytes = fs.files[prefix + name];
        lines.push(`${md5Hex(bytes).toUpperCase()} ${bytes.length.toString(16).toUpperCase().padStart(8, '0')} ${name}`);
    }
    return lines.map(l => `${l}\n`).join('');
};

/** LIST_FILES: the listing's size, a handle and its first `count` bytes. */
export const listFiles = (fs, path, count) => {
    const text = listing(fs, String(path || ''));
    if (text === null) return {status: STATUS.UNKNOWN_ERROR, handle: -1, size: 0, data: [], error: true};
    const handle = newHandle(fs, {kind: 'list', text, pointer: 0});
    if (handle < 0) return {status: STATUS.UNKNOWN_ERROR, handle: -1, size: 0, data: [], error: true};
    return listChunk(fs, handle, count);
};

const listChunk = (fs, handle, count) => {
    const h = fs.handles[handle];
    const data = [...h.text.slice(h.pointer, h.pointer + Math.max(0, count))].map(ch => ch.charCodeAt(0) & 0xff);
    h.pointer += data.length;
    const end = h.pointer >= h.text.length;
    if (end) freeHandle(fs, handle);
    return {status: end ? STATUS.END_OF_FILE : STATUS.SUCCESS, handle, size: h.text.length, data};
};

/** CONTINUE_LIST_FILES. */
export const continueList = (fs, handle, count) => {
    const h = fs.handles[handle];
    if (!h || h.kind !== 'list') return {status: STATUS.UNKNOWN_ERROR, handle: -1, data: [], error: true};
    return listChunk(fs, handle, count);
};

/** CLOSE_FILEHANDLE: UNKNOWN_HANDLE for a handle not in use. */
export const closeHandle = (fs, handle) => (freeHandle(fs, handle) ? {status: STATUS.SUCCESS} : {status: STATUS.UNKNOWN_HANDLE, error: true});

/** CREATE_DIR: NO_PERMISSION when it exists or its parent does not (mkdir's refusals). */
export const createDir = (fs, path) => {
    const p = resolvePath(path.endsWith('/') ? path.slice(0, -1) : path);
    if (!p || isDir(fs, p) || fs.files[p] || !isDir(fs, parentOf(p))) return {status: STATUS.NO_PERMISSION, error: true};
    fs.dirs.push(p);
    return {status: STATUS.SUCCESS};
};

/** DELETE_FILE: a file, or an empty folder (remove()'s rule); NO_PERMISSION otherwise. */
export const deleteFile = (fs, path) => {
    const p = resolvePath(path.endsWith('/') ? path.slice(0, -1) : path);
    if (!p) return {status: STATUS.NO_PERMISSION, error: true};
    if (fs.files[p]) {
        delete fs.files[p];
        return {status: STATUS.SUCCESS};
    }
    const prefix = `${p}/`;
    if (fs.dirs.includes(p) && !DEFAULT_DIRS.includes(p) && !fs.dirs.some(d => d.startsWith(prefix)) &&
        !Object.keys(fs.files).some(f => f.startsWith(prefix))) {
        fs.dirs = fs.dirs.filter(d => d !== p);
        return {status: STATUS.SUCCESS};
    }
    return {status: STATUS.NO_PERMISSION, error: true};
};

/** LIST_OPEN_HANDLES: a bit per handle in use, handle 0 the lowest bit of the first byte. */
export const openHandleBits = fs => {
    const bytes = new Array(MAX_FILE_HANDLES / 8 + 1).fill(0);
    fs.handles.forEach((h, i) => { if (h) bytes[i >> 3] |= 1 << (i & 7); });
    return bytes;
};

// ---- MD5 (RFC 1321), for LIST_FILES -------------------------------------------------------------------

const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({length: 64}, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** The MD5 digest of a byte array, as lower-case hex. */
export const md5Hex = bytes => {
    const n = bytes.length;
    const total = (((n + 8) >> 6) + 1) * 64;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[n] = 0x80;
    const bits = n * 8;
    for (let k = 0; k < 8; k++) m[total - 8 + k] = k < 4 ? (bits >>> (8 * k)) & 0xff : Math.floor(bits / 2 ** (8 * k)) & 0xff;
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const w = new Array(16);
    for (let off = 0; off < total; off += 64) {
        for (let j = 0; j < 16; j++) w[j] = m[off + 4 * j] | (m[off + 4 * j + 1] << 8) | (m[off + 4 * j + 2] << 16) | (m[off + 4 * j + 3] << 24);
        let [a, b, c, d] = [a0, b0, c0, d0];
        for (let i = 0; i < 64; i++) {
            const round = i >> 4;
            let f;
            let g;
            if (round === 0) { f = (b & c) | (~b & d); g = i; }
            else if (round === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
            else if (round === 2) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
            else { f = c ^ (b | ~d); g = (7 * i) & 15; }
            const sum = (a + f + MD5_K[i] + w[g]) | 0;
            const s = MD5_S[(round << 2) | (i & 3)];
            a = d;
            d = c;
            c = b;
            b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
        }
        a0 = (a0 + a) | 0;
        b0 = (b0 + b) | 0;
        c0 = (c0 + c) | 0;
        d0 = (d0 + d) | 0;
    }
    return [a0, b0, c0, d0].map(v => [0, 1, 2, 3].map(k => ((v >>> (8 * k)) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
};

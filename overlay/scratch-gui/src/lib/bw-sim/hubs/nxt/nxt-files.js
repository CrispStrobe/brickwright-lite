// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Virtual NXT's flash files: what the system commands OPEN WRITE / WRITE / CLOSE / DELETE /
// OPEN READ / READ / FIND FIRST / FIND NEXT reach (nxt-direct-commands.js), and where STARTPROGRAM finds
// a `.rxe` (nxt-virtual-hub.js → routes/nxt-vm/nxt-vm.js). All state is plain data in the brick's
// state (`s.files`: name → bytes; `s.handles`: handle → what it is open for), so it travels with the
// brick to the physics worker's mirror.
//
// Behaviour per LEGO's open-source NXT firmware 1.29's loader (cited in docs/NXT-RXE-VM.md §Files;
// docs/NXT-PROTOCOL-FACTS.md for the command layouts): a file is created with its full size; writing
// past that size stores what fits and answers EOF EXPECTED; a file is only kept when it was written
// completely before CLOSE (program data files instead retain partial writes); an existing name is
// FILE EXISTS; a file in use (the running program, an open handle) cannot be deleted (FILE IS BUSY);
// 16 handles. Names are 15.3 characters. The flash
// size is ours (the Virtual NXT reports it in GET DEVICE INFO).

/** The loader's status bytes (the high byte of its status word), as a system command's reply carries them. */
export const LOADER = Object.freeze({
    SUCCESS: 0x00, NO_MORE_HANDLES: 0x81, NO_SPACE: 0x82, NO_MORE_FILES: 0x83, EOF_EXPECTED: 0x84, END_OF_FILE: 0x85,
    NOT_LINEAR_FILE: 0x86, FILE_NOT_FOUND: 0x87, HANDLE_ALREADY_CLOSED: 0x88, NO_LINEAR_SPACE: 0x89, UNDEFINED_ERROR: 0x8a,
    FILE_IS_BUSY: 0x8b, NO_WRITE_BUFFERS: 0x8c, APPEND_NOT_POSSIBLE: 0x8d, FILE_IS_FULL: 0x8e, FILE_EXISTS: 0x8f,
    MODULE_NOT_FOUND: 0x90, OUT_OF_BOUNDARY: 0x91, ILLEGAL_FILE_NAME: 0x92, ILLEGAL_HANDLE: 0x93
});
export const MAX_HANDLES = 16;
/** Loader 1.29: two 256-byte directory sectors, one reserved entry; four write buffers. */
export const MAX_FILES = 127;
export const MAX_WRITE_BUFFERS = 4;
/** The longest name: 15.3 characters (19), a terminator in a 20-byte field. */
export const MAX_NAME = 19;
/** User flash the Virtual NXT offers (ours: the real brick has about 128 KB less its firmware's files). */
export const FLASH_BYTES = 65536;

export const freshFiles = () => ({files: {}, handles: {}, fileInfo: {}, fileOrder: []});

const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const put = (object, key, value) => Object.defineProperty(object, key,
    {value, writable: true, enumerable: true, configurable: true});
export const contents = (s, name) => own(s.files, name) && Array.isArray(s.files[name]) ? s.files[name] : null;
const info = (s, name) => own(s.fileInfo, name) ? s.fileInfo[name] : null;
const dataFile = (s, name) => {
    const f = info(s, name);
    return f && f.dataFile === true && Number.isSafeInteger(f.capacity) && f.capacity >= 0 && f.capacity <= FLASH_BYTES;
};
const writing = h => h && (h.mode === 'write' || h.mode === 'data-write');
const getHandle = (s, handle) => Number.isInteger(handle) && handle >= 0 && handle < MAX_HANDLES &&
    own(s.handles, handle) ? s.handles[handle] : null;
const fileCount = s => Object.keys(s.files).length + Object.values(s.handles).filter(h => h && h.mode === 'write').length;
const writers = s => Object.values(s.handles).filter(writing).length;
const directory = s => s.fileOrder || (s.fileOrder = Object.keys(s.files).reverse());

const validName = name => typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME && /^[\x21-\x7e]+$/.test(name);

/** Bytes in use by complete files and files being written. */
export const usedFlash = s => Object.entries(s.files).reduce((n, [name, f]) => n +
    (dataFile(s, name) ? Math.max(f.length, info(s, name).capacity) : f.length), 0) +
    Object.values(s.handles).reduce((n, h) => n + (h.mode === 'write' ? h.size : 0), 0);
export const freeFlash = s => Math.max(0, FLASH_BYTES - usedFlash(s));

export const freeHandle = s => {
    for (let h = 0; h < MAX_HANDLES; h++) if (!getHandle(s, h)) return h;
    return -1;
};

const busy = (s, name, running) => name === running || Object.values(s.handles).some(h => h && h.name === name);

/** OPEN WRITE: a new file of `size` bytes → {status, handle}. */
export const openWrite = (s, name, size) => {
    if (!validName(name)) return {status: LOADER.ILLEGAL_FILE_NAME, handle: 0};
    if (contents(s, name) || Object.values(s.handles).some(h => writing(h) && h.name === name)) return {status: LOADER.FILE_EXISTS, handle: 0};
    const handle = freeHandle(s);
    if (handle < 0) return {status: LOADER.NO_MORE_HANDLES, handle: 0};
    if (fileCount(s) >= MAX_FILES) return {status: LOADER.NO_MORE_FILES, handle: 0};
    if (writers(s) >= MAX_WRITE_BUFFERS) return {status: LOADER.NO_WRITE_BUFFERS, handle: 0};
    if (!Number.isSafeInteger(size) || size < 0) return {status: LOADER.OUT_OF_BOUNDARY, handle: 0};
    if (size > freeFlash(s)) return {status: LOADER.NO_SPACE, handle: 0};
    s.handles[handle] = {mode: 'write', name, size, data: [], overflow: false};
    return {status: LOADER.SUCCESS, handle};
};

/** Program FileOpenWrite creates a data file: capacity is reserved, partial closes are valid. */
export const openDataWrite = (s, name, size) => {
    const result = openWrite(s, name, size);
    if (result.status !== LOADER.SUCCESS) return result;
    s.handles[result.handle].mode = 'data-write';
    directory(s).unshift(name);
    if (!s.fileInfo) s.fileInfo = {};
    put(s.fileInfo, name, {dataFile: true, capacity: size});
    put(s.files, name, []);
    return result;
};

/** Append only a data file's unfilled reservation; ordinary downloads remain non-appendable. */
export const openAppend = (s, name) => {
    if (!contents(s, name)) return {status: LOADER.FILE_NOT_FOUND, handle: 0, size: 0};
    const handle = freeHandle(s);
    if (handle < 0) return {status: LOADER.NO_MORE_HANDLES, handle: 0, size: 0};
    if (Object.values(s.handles).some(h => writing(h) && h.name === name)) {
        return {status: LOADER.FILE_IS_BUSY, handle, size: 0};
    }
    if (!dataFile(s, name)) return {status: LOADER.APPEND_NOT_POSSIBLE, handle, size: 0};
    const remaining = info(s, name).capacity - s.files[name].length;
    if (remaining <= 0) return {status: LOADER.FILE_IS_FULL, handle, size: 0};
    if (writers(s) >= MAX_WRITE_BUFFERS) return {status: LOADER.NO_WRITE_BUFFERS, handle, size: 0};
    s.handles[handle] = {mode: 'data-write', name, size: info(s, name).capacity,
        data: s.files[name].slice(), overflow: false};
    return {status: LOADER.SUCCESS, handle, size: remaining};
};

/** WRITE: bytes to an open-for-writing handle → {status, handle, count}. */
export const write = (s, handle, bytes) => {
    const h = getHandle(s, handle);
    if (!writing(h)) return {status: LOADER.ILLEGAL_HANDLE, handle, count: 0};
    if (!bytes || !Number.isSafeInteger(bytes.length) || bytes.length < 0) {
        return {status: LOADER.OUT_OF_BOUNDARY, handle, count: 0};
    }
    const room = h.size - h.data.length;
    const count = Math.min(room, bytes.length);
    for (let k = 0; k < count; k++) h.data.push(bytes[k] & 0xff);
    if (bytes.length > room) h.overflow = true;
    return {status: h.overflow ? LOADER.EOF_EXPECTED : LOADER.SUCCESS, handle, count};
};

/** CLOSE: fixed downloads require completion; data files commit their current extent → {status, handle}. */
export const close = (s, handle) => {
    const h = getHandle(s, handle);
    if (!h) return {status: LOADER.HANDLE_ALREADY_CLOSED, handle};
    delete s.handles[handle];
    if (h.mode === 'data-write') {
        put(s.files, h.name, h.data);
        if (dataFile(s, h.name)) info(s, h.name).capacity = Math.max(info(s, h.name).capacity, h.data.length);
    } else if (h.mode === 'write') {
        if (!h.overflow && h.data.length === h.size) {
            directory(s).unshift(h.name);
            put(s.files, h.name, h.data);
        }
    }
    return {status: LOADER.SUCCESS, handle};
};

/** Program retirement crops its still-open data files; explicit CLOSE retains their capacity. */
export const cropClose = (s, handle) => {
    const name = getHandle(s, handle)?.name;
    const result = close(s, handle);
    if (result.status === LOADER.SUCCESS && dataFile(s, name) && contents(s, name)) {
        info(s, name).capacity = s.files[name].length;
    }
    return result;
};

/** DELETE → status. */
export const remove = (s, name, running = null) => {
    if (!contents(s, name)) return LOADER.FILE_NOT_FOUND;
    if (busy(s, name, running)) return LOADER.FILE_IS_BUSY;
    delete s.files[name];
    s.fileOrder = directory(s).filter(entry => entry !== name);
    if (s.fileInfo) delete s.fileInfo[name];
    return LOADER.SUCCESS;
};

/** Destination lookup precedes the source/busy checks (loader RENAMEFILE). */
export const rename = (s, oldName, newName, running = null) => {
    if (!validName(newName)) return LOADER.ILLEGAL_FILE_NAME;
    if (contents(s, newName)) return LOADER.FILE_EXISTS;
    if (typeof oldName !== 'string' || oldName.length > MAX_NAME) return LOADER.ILLEGAL_FILE_NAME;
    if (!contents(s, oldName)) return LOADER.FILE_NOT_FOUND;
    if (busy(s, oldName, running)) return LOADER.FILE_IS_BUSY;
    const order = directory(s);
    put(s.files, newName, s.files[oldName]);
    s.fileOrder = order.map(name => name === oldName ? newName : name);
    if (own(s.fileInfo, oldName)) put(s.fileInfo, newName, s.fileInfo[oldName]);
    delete s.files[oldName];
    if (s.fileInfo) delete s.fileInfo[oldName];
    return LOADER.SUCCESS;
};

/** OPEN READ → {status, handle, size}. */
export const openRead = (s, name) => {
    if (!contents(s, name) || (dataFile(s, name) && info(s, name).capacity === 0)) {
        return {status: LOADER.FILE_NOT_FOUND, handle: 0, size: 0};
    }
    const handle = freeHandle(s);
    if (handle < 0) return {status: LOADER.NO_MORE_HANDLES, handle: 0, size: 0};
    s.handles[handle] = {mode: 'read', name, at: 0, limit: s.files[name].length};
    return {status: LOADER.SUCCESS, handle, size: s.files[name].length};
};

/** READ up to `count` bytes → {status, handle, data} (END OF FILE when fewer were left). */
export const read = (s, handle, count) => {
    const h = getHandle(s, handle);
    if (!h || h.mode !== 'read') return {status: LOADER.ILLEGAL_HANDLE, handle, data: []};
    if (!Number.isSafeInteger(count) || count < 0) return {status: LOADER.OUT_OF_BOUNDARY, handle, data: []};
    const file = contents(s, h.name) || [];
    const data = file.slice(h.at, Math.min(h.at + count, h.limit ?? file.length));
    h.at += data.length;
    return {status: data.length < count ? LOADER.END_OF_FILE : LOADER.SUCCESS, handle, data};
};

/** Whether `name` matches a FIND pattern: name and extension each exact or `*`. */
export const matches = (pattern, name) => {
    const split = n => {
        const dot = n.lastIndexOf('.');
        return dot < 0 ? [n, ''] : [n.slice(0, dot), n.slice(dot + 1)];
    };
    const [pn, pe] = split(pattern);
    const [nn, ne] = split(name);
    const part = (p, v) => p === '*' || p.toLowerCase() === v.toLowerCase();
    return part(pn, nn) && part(pe, ne);
};

const found = (s, handle) => {
    const h = getHandle(s, handle);
    const names = Object.keys(s.files).sort().filter(n => matches(h.pattern, n));
    if (h.at >= names.length) {
        delete s.handles[handle];
        return {status: LOADER.FILE_NOT_FOUND, handle: 0, name: '', size: 0};
    }
    const name = names[h.at];
    h.at += 1;
    return {status: LOADER.SUCCESS, handle, name, size: s.files[name].length};
};

/** FIND FIRST → {status, handle, name, size}; the handle stays open for FIND NEXT until CLOSE or the end. */
export const findFirst = (s, pattern) => {
    const handle = freeHandle(s);
    if (handle < 0) return {status: LOADER.NO_MORE_HANDLES, handle: 0, name: '', size: 0};
    s.handles[handle] = {mode: 'find', pattern, at: 0};
    return found(s, handle);
};

export const findNext = (s, handle) => {
    const h = getHandle(s, handle);
    if (!h || h.mode !== 'find') return {status: LOADER.ILLEGAL_HANDLE, handle, name: '', size: 0};
    return found(s, handle);
};

/** ListFiles' finder errors yield an empty list; temporary search/read handles do not escape. */
export const listNames = (s, pattern) => freeHandle(s) < 0 ? [] :
    directory(s).filter(name => contents(s, name) && matches(pattern, name));

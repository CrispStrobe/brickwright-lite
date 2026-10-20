// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// EV3 system commands [CDK §3]: the file transfer a host uses to put a program on the brick (and
// to read files and folders back). The frame is the direct commands' (two length bytes, message
// counter, type 0x01 reply / 0x81 no reply), then the system command and its arguments; the reply
// is SYSTEM_REPLY (0x03) or SYSTEM_REPLY_ERROR (0x05), the command, a status [CDK §3.1], then the
// command's own fields. Layouts from the CDK's §3.3 examples, checked against LEGO's lms2012 c_com.c
// (read as a fact source; docs/EV3-RBF-VM.md §System commands), which also settles what the CDK
// leaves open: an error reply carries handle 0xFF; CLOSE_FILEHANDLE answers the handle after its
// status (the CDK's example omits it, the firmware's reply has it); a reply is at most the
// firmware's 1024-byte buffer, so an upload answers at most 1012 bytes at a time (ours: the
// firmware streams a longer one in several packets).

import * as files from './ev3-files.js';
import {SYSTEM_COMMAND_REPLY, SYSTEM_REPLY, SYSTEM_REPLY_ERROR, UNKNOWN_SYSTEM_COMMAND} from './ev3-direct-commands.js';

export const SYSTEM = Object.freeze({
    BEGIN_DOWNLOAD: 0x92, CONTINUE_DOWNLOAD: 0x93, BEGIN_UPLOAD: 0x94, CONTINUE_UPLOAD: 0x95, BEGIN_GETFILE: 0x96,
    CONTINUE_GETFILE: 0x97, CLOSE_FILEHANDLE: 0x98, LIST_FILES: 0x99, CONTINUE_LIST_FILES: 0x9a, CREATE_DIR: 0x9b,
    DELETE_FILE: 0x9c, LIST_OPEN_HANDLES: 0x9d, WRITEMAILBOX: 0x9e, BLUETOOTHPIN: 0x9f, ENTERFWUPDATE: 0xa0
});

/** The reply buffer the firmware answers from (bytes, the length field included). */
const REPLY_BUFFER = 1024;

const u16 = (b, i) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u32 = (b, i) => (u16(b, i) | (u16(b, i + 2) << 16)) >>> 0;
const le32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
/** A zero-terminated string at i: {text, end} (end: the byte after the zero). */
const cString = (b, i) => {
    let end = i;
    while (end < b.length && b[end] !== 0) end++;
    return {text: String.fromCharCode(...b.subarray(i, end)), end: end + 1};
};

const reply = (counter, command, r, fields = []) => {
    const body = [r.error ? SYSTEM_REPLY_ERROR : SYSTEM_REPLY, command, r.status, ...fields];
    const out = new Uint8Array(4 + body.length);
    const length = 2 + body.length;
    out[0] = length & 0xff;
    out[1] = length >> 8;
    out[2] = counter & 0xff;
    out[3] = counter >> 8;
    out.set(body, 4);
    return out;
};
const handleByte = h => (h < 0 ? 0xff : h);
/** How many bytes of data fit a reply with `header` bytes before them. */
const room = (count, header) => Math.min(count, REPLY_BUFFER - header);

/**
 * Serves one system command on the brick's file system and answers it (null: no reply asked).
 * @param {{counter: number, type: number, code: Uint8Array}} frame (ev3-direct-commands.js parseFrame)
 * @param {object} fs the brick's file system (hub.s.fs)
 */
export const serveSystemCommand = (frame, fs) => {
    const c = frame.code;
    const command = c[0];
    let r;
    let fields = [];
    switch (command) {
    case SYSTEM.BEGIN_DOWNLOAD: {
        const size = u32(c, 1);
        const name = cString(c, 5);
        r = files.beginDownload(fs, name.text, size, Array.from(c.subarray(name.end)));
        fields = [handleByte(r.handle)];
        break;
    }
    case SYSTEM.CONTINUE_DOWNLOAD:
        r = files.continueDownload(fs, c[1], Array.from(c.subarray(2)));
        fields = [handleByte(r.handle)];
        break;
    case SYSTEM.BEGIN_UPLOAD: case SYSTEM.BEGIN_GETFILE: {
        const count = u16(c, 1);
        const name = cString(c, 3);
        r = files.beginUpload(fs, name.text, room(count, 12), {keepOpen: command === SYSTEM.BEGIN_GETFILE});
        fields = [...le32(r.size), handleByte(r.handle), ...r.data];
        break;
    }
    case SYSTEM.CONTINUE_UPLOAD:
        r = files.continueUpload(fs, c[1], room(u16(c, 2), 8));
        fields = [handleByte(r.handle), ...r.data];
        break;
    case SYSTEM.CONTINUE_GETFILE:
        r = files.continueUpload(fs, c[1], room(u16(c, 2), 12), {getfile: true});
        fields = [...le32(r.size), handleByte(r.handle), ...r.data];
        break;
    case SYSTEM.CLOSE_FILEHANDLE:
        r = files.closeHandle(fs, c[1]);
        fields = [c[1] ?? 0];
        break;
    case SYSTEM.LIST_FILES: {
        const count = u16(c, 1);
        r = files.listFiles(fs, cString(c, 3).text, room(count, 12));
        fields = [...le32(r.size), handleByte(r.handle), ...r.data];
        break;
    }
    case SYSTEM.CONTINUE_LIST_FILES:
        r = files.continueList(fs, c[1], room(u16(c, 2), 8));
        fields = [handleByte(r.handle), ...r.data];
        break;
    case SYSTEM.CREATE_DIR:
        r = files.createDir(fs, cString(c, 1).text);
        break;
    case SYSTEM.DELETE_FILE:
        r = files.deleteFile(fs, cString(c, 1).text);
        break;
    case SYSTEM.LIST_OPEN_HANDLES:
        r = {status: files.STATUS.SUCCESS};
        fields = files.openHandleBits(fs);
        break;
    case SYSTEM.ENTERFWUPDATE:
        // "The command will not send any response back" [CDK §3.3.11]; the Virtual EV3 has no firmware to update.
        return null;
    default:
        // WRITEMAILBOX (no mailboxes), BLUETOOTHPIN (USB only), and anything else.
        r = {status: UNKNOWN_SYSTEM_COMMAND, error: true};
    }
    return frame.type === SYSTEM_COMMAND_REPLY ? reply(frame.counter, command, r, fields) : null;
};

// The Linux lesson's terminal, end to end, on the REAL guest: Linux 6.1 +
// busybox, booted on bw-board's RV32 machine from the lesson's own pinned,
// sha256-checked media, driven through the very feed the browser uses
// (lib/bw-debug/linux-console.js: key table → ready gate → FIFO-paced 16550A
// input; UART output → per-frame terminal stream).
//
// What the guest must do with the bytes a learner's keys produce:
//   - it RECEIVES the table's bytes verbatim (a raw-mode probe echoes them back
//     as hex: Enter must arrive as 0d, the arrows as ESC [ A …),
//   - Ctrl-C interrupts a sleeping `sleep 100` and a CPU-bound `yes`, exit 130,
//   - Up recalls ash's history, Backspace edits the line,
//   - a 4 KB paste arrives whole and in order (wc -c and md5sum), while the
//     host never has more than one 16550A FIFO (16 bytes) outstanding.
//
// MEDIA. The lesson's two slots, fetched through the app's own fetcher and
// checked against the lesson's sha256 pins (activate.js defaultImageFetcher).
// Set BW_LINUX_MEDIA_DIR to a directory holding Image + initramfs.cpio to skip
// the download; those bytes are checked against the same pins. No media → the
// test FAILS, it does not skip: a skipped guest is not a proved terminal.

import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {createDebugTarget, createDebugSession} from 'bw-board';
import {LINUX_RISCV_MEDIA} from '../overlay/scratch-gui/src/lib/bw-machines/lessons.js';
import {defaultImageFetcher} from '../overlay/scratch-gui/src/lib/bw-machines/activate.js';
import {createLinuxConsole} from '../overlay/scratch-gui/src/lib/bw-debug/linux-console.js';
import {keyToBytes, pasteToBytes} from '../overlay/scratch-gui/src/lib/bw-debug/terminal-keys.js';
import {UART_FIFO_DEPTH} from '../overlay/scratch-gui/src/lib/bw-debug/ready-gated-input.js';

const sha256 = b => createHash('sha256').update(b).digest('hex');

async function lessonMedia (slot, file) {
    const ref = LINUX_RISCV_MEDIA[slot];
    const dir = process.env.BW_LINUX_MEDIA_DIR;
    if (dir && existsSync(join(dir, file))) {
        const bytes = new Uint8Array(readFileSync(join(dir, file)));
        assert.equal(sha256(bytes), ref.sha256, `${join(dir, file)} is the lesson's pinned ${slot}`);
        return bytes;
    }
    return (await defaultImageFetcher(ref)).bytes;
}

let session, con, target, adapter;
let transcript = '';                  // everything the terminal was handed, decoded
let maxOutstanding = 0;               // most bytes pushed into the UART before the guest drained

/** One host frame: the machine runs, then the console refills and delivers. */
const frame = () => { session.pump(); con.frame(); };

/** Run frames until the transcript after `mark` matches, or fail saying what it showed. */
function until (re, mark, maxFrames, what) {
    for (let f = 0; f < maxFrames; f++) {
        if (re.test(transcript.slice(mark))) return f;
        frame();
    }
    assert.fail(`${what}: no ${re} within ${maxFrames} frames; the terminal showed ` +
        JSON.stringify(transcript.slice(mark).slice(-400)));
}

/** Type a string as keys (each character through the key table), not as a paste. */
function type (text) {
    for (const ch of text) con.send(keyToBytes({key: ch === '\r' ? 'Enter' : ch}));
}
const press = (key, mods = {}) => con.send(keyToBytes({key, ...mods}));
const PROMPT = /bwb# $/;

/** Run a command line (typed) and return what followed it up to the next prompt. */
function run (line, maxFrames = 600) {
    const mark = transcript.length;
    type(`${line}\r`);
    until(PROMPT, mark + line.length, maxFrames, line);
    return transcript.slice(mark);
}

before(async () => {
    const [kernel, initrd] = await Promise.all([lessonMedia('kernel', 'Image'), lessonMedia('initrd', 'initramfs.cpio')]);
    ({target, adapter} = await createDebugTarget('riscv32', {linux: {kernel, initrd}}));
    // Measure the pacing where it matters: at the UART, as the guest sees it.
    const sendSerial = target.sendSerial.bind(target);
    let outstanding = 0;
    target.sendSerial = b => {
        const lsr = adapter.machine.uart.load8(5);
        outstanding = (lsr & 1) ? outstanding + 1 : 1;
        maxOutstanding = Math.max(maxOutstanding, outstanding);
        return sendSerial(b);
    };
    con = createLinuxConsole({target, adapter});
    adapter.onSerial(b => con.output.push(b));          // what debug-runner's wireMachineBench does
    const decoder = new TextDecoder();
    con.output.subscribe(bytes => { transcript += decoder.decode(bytes, {stream: true}); });
    session = createDebugSession(target, {onChange () {}});
    session.start();
    // Type BEFORE the shell is up: the ready gate must hold it, not lose it.
    type('echo early-bird\r');
    until(/early-bird\r\n(?:.*\r\n)*?early-bird\r\n[\s\S]*bwb# $/, 0, 20000, 'boot to the prompt');
});

test('the guest receives the key table\'s bytes verbatim (raw-mode probe)', () => {
    // stty raw -echo: no ICRNL, no ISIG, no echo — the tty passes bytes as they
    // came off the line, and xxd shows them. The probe line itself is typed.
    const keys = [
        ['Enter'], ['Backspace'], ['Tab'], ['Escape'], ['c', {ctrlKey: true}], ['d', {ctrlKey: true}],
        ['ArrowUp'], ['ArrowDown'], ['ArrowRight'], ['ArrowLeft'], ['Home'], ['End'],
        ['PageUp'], ['PageDown'], ['Delete'], ['é']
    ];
    // Written out, not derived from the table: the guest is the judge here.
    const expected = '0d' + '7f' + '09' + '1b' + '03' + '04' +
        '1b5b41' + '1b5b42' + '1b5b43' + '1b5b44' + '1b5b48' + '1b5b46' +
        '1b5b357e' + '1b5b367e' + '1b5b337e' + 'c3a9';
    const count = expected.length / 2;
    const mark = transcript.length;
    // The keys go only once the guest SAYS the tty is raw: a frame count is a
    // guess about guest speed, and under load the keys reached ash's line
    // editor instead. Raw mode has no OPOST, hence the bare \n.
    type(`stty raw -echo; echo RAW-READY; head -c ${count} | xxd -p | tr -d '\\n'; echo; stty sane\r`);
    until(/\nRAW-READY\n/, mark, 2000, 'stty raw');
    for (const [key, mods] of keys) press(key, mods);
    until(PROMPT, mark + 20, 600, 'raw probe');
    const got = (transcript.slice(mark).match(/\b([0-9a-f]{20,})\b/) || [])[1];
    assert.equal(got, expected, 'Enter=0d, Backspace=7f, Tab=09, ESC, ^C=03, ^D=04, ' +
        'ESC[A ESC[B ESC[C ESC[D ESC[H ESC[F ESC[5~ ESC[6~ ESC[3~, é=c3a9');
});

test('Ctrl-C interrupts a sleeping `sleep 100`: ^C, a new prompt, exit status 130', () => {
    const mark = transcript.length;
    type('echo SLEEPING; sleep 100\r');
    until(/\r\nSLEEPING\r\n/, mark, 2000, 'sleep started');
    for (let f = 0; f < 120; f++) frame();          // two more seconds of guest time
    assert.doesNotMatch(transcript.slice(mark), /bwb# /, 'sleep is still running');
    press('c', {ctrlKey: true});
    const frames = until(/\^C\r\nbwb# $/, mark, 300, 'Ctrl-C during sleep');
    assert.ok(frames < 300);
    assert.match(run('echo rc=$?'), /rc=130\r\n/, 'killed by SIGINT (128 + 2)');
});

test('Ctrl-C interrupts a CPU-bound `yes`', () => {
    const mark = transcript.length;
    type('echo YESSING; yes > /dev/null\r');
    until(/\r\nYESSING\r\n/, mark, 2000, 'yes started');
    for (let f = 0; f < 60; f++) frame();
    assert.doesNotMatch(transcript.slice(mark), /bwb# /, 'yes is still running');
    press('c', {ctrlKey: true});
    until(/\^C\r\nbwb# $/, mark, 600, 'Ctrl-C during yes');
    assert.match(run('echo rc=$?'), /rc=130\r\n/);
});

test('Up recalls ash\'s history; Backspace edits the line', () => {
    assert.match(run('echo hist-$((6*7))'), /\r\nhist-42\r\n/);
    let mark = transcript.length;
    press('ArrowUp');
    press('Enter');
    // Not just "a prompt": ash REDRAWS `\rbwb# echo …` on Up, and a frame can
    // end right after that prompt. Wait for the answer the recall produces.
    until(/\r\nhist-42\r\nbwb# $/, mark, 600, 'history recall');
    assert.match(transcript.slice(mark), /echo hist-\$\(\(6\*7\)\)[\s\S]*\r\nhist-42\r\n/,
        'the recalled command ran again');
    mark = transcript.length;
    type('echo abX');
    press('Backspace');
    type('c\r');
    until(/\r\n(?:abc|abXc)\r\nbwb# $/, mark, 600, 'backspace');
    assert.match(transcript.slice(mark), /\r\nabc\r\n/, 'the X was erased by the guest before the line ran');
});

test('a 4 KB paste arrives whole and in order, one FIFO at a time', () => {
    const line = i => `${String(i).padStart(5, '0')}-the-quick-brown-fox-jumps-over-the-lazy-dog-0123456789ab`.padEnd(63, '.').slice(0, 63);
    const text = Array.from({length: 64}, (_, i) => `${line(i)}\n`).join('');
    assert.equal(text.length, 4096);
    const md5 = createHash('md5').update(text).digest('hex');
    maxOutstanding = 0;
    const mark = transcript.length;
    type('stty -echo; echo PASTE-NOW; tee /tmp/p | wc -c; md5sum /tmp/p; stty echo\r');
    until(/\r\nPASTE-NOW\r\n/, mark, 2000, 'ready for the paste');
    con.send(pasteToBytes(text));                   // what xterm hands over on paste
    press('d', {ctrlKey: true});
    until(/[0-9a-f]{32}\s+\/tmp\/p\r\n[\s\S]*bwb# $/, mark, 3000, 'paste');
    const after = transcript.slice(mark);
    assert.match(after, /\r\n4096\r\n/, 'wc -c counts every byte');
    assert.match(after, new RegExp(`${md5}\\s+/tmp/p`), 'and md5sum matches: nothing lost, nothing reordered');
    assert.ok(maxOutstanding <= UART_FIFO_DEPTH,
        `the host never had more than a FIFO outstanding at the UART (max ${maxOutstanding})`);
    assert.ok(maxOutstanding > 1, 'the paste really was sent in bursts');
});

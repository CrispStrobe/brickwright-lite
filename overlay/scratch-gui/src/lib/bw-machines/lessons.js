// Machine lessons — machines the app OFFERS, rather than ones a user imported.
//
// "Linux on RISC-V" is the first: a real Linux 6.1 kernel and a BusyBox shell
// on bw-board's RV32 machine. It is listed in the Machine Manager above the
// user's own machines and boots through the same path an imported media-lab
// manifest does (runMachineConfig → activateConfig → debug-runner).
//
// NOTHING GPL IS IN THIS APP. The kernel (GPL-2.0), BusyBox (GPL-2.0) and glibc
// (LGPL-2.1) live in CrispStrobe/brickwright-media-lab, a GPL repository, beside
// their complete corresponding source (release `riscv32-linux-v1`). So does the
// post-boot SNAPSHOT (the machine at the shell prompt — it holds kernel and
// BusyBox memory, so it is GPL like them). This file holds three URLs and three
// SHA-256s.
//
// RUN OPENS AT THE PROMPT. The default Run fetches the snapshot too and bw-board
// restores the machine from it (bw-board src/riscv32-snapshot.js; proven
// byte-for-byte equivalent to a cold boot by its test/linux-riscv/snapshot.mjs),
// so the shell is up in well under a second instead of after a 68-million-
// instruction boot. "Boot from scratch" is the same lesson without the snapshot
// slot: the whole kernel boot, log and all — the lesson is about the internals. The learner's Run fetches the bytes from
// that repository — the fetch is the distribution, made by the GPL repo — and
// activateConfig's fetcher refuses a byte that does not hash to the pin, BY
// SLOT NAME, before anything boots. The licence line and the source link are
// shown next to the Run button, so the offer travels with the binary.

import {remoteMachineImagesAllowed} from '../distribution-policy.js';
//
// WHY raw.githubusercontent.com AT A COMMIT, not the release download: a
// GitHub release asset redirects to a host that sends no CORS header, so a
// browser cannot read it. The raw CDN does send `Access-Control-Allow-Origin:
// *`, and a URL that names a commit cannot change under us. The sha256 is
// checked anyway (test/fetch-pinning.test.mjs classes the URL).
//
// Strings go through bw-i18n (EN + DE); the media-lab project's own words are
// in its README.

import {makeT} from '../bw-i18n.js';
import {newMachineConfig} from './machine-config.js';

const MEDIA_LAB = 'https://github.com/CrispStrobe/brickwright-media-lab';
// Media branch `media/riscv32-linux-v1` at the commit that added the snapshot;
// Image and initramfs.cpio are byte-identical to the ones at 5b257a33 (same pins).
const LINUX_MEDIA_COMMIT = '07132874ee064fa782f80ccae64af8d75cae65c8';
const LINUX_RAW = `https://raw.githubusercontent.com/CrispStrobe/brickwright-media-lab/${LINUX_MEDIA_COMMIT}/riscv32-linux`;

/** The pinned Linux media. Mirrors brickwright-media-lab
 *  projects/riscv32-linux/brickwright-media.json — same URLs, same hashes. */
export const LINUX_RISCV_MEDIA = Object.freeze({
    commit: LINUX_MEDIA_COMMIT,
    kernel: Object.freeze({
        url: `${LINUX_RAW}/Image`,
        sha256: '9130ceb4be18d10560cf49ac495d7f2d5dde23c33972d7a522c077cc523de1a9',
        bytes: 4876836
    }),
    initrd: Object.freeze({
        url: `${LINUX_RAW}/initramfs.cpio`,
        sha256: 'd71915baaae4f35e32679a338885697194e4ecd7f31cbc9c69b82cd86b8edcd5',
        bytes: 2663424
    }),
    /** The machine at the `bwb# ` prompt (bw-board format BWRV32S1, gzip), RAM
     *  stored as a delta against the boot image of the two files above — so it
     *  restores only on top of exactly them (bw-board refuses it otherwise).
     *  Built by bw-board's Linux workflow (run 36576659198), reproducible. */
    snapshot: Object.freeze({
        url: `${LINUX_RAW}/linux-shell.snap.gz`,
        sha256: '7b82fc38525d36e8a98fb9aa112e804813e7d3a456fcca2ace220129357a272c',
        bytes: 2006204
    }),
    /** Where the corresponding source is offered (GPL-2.0 §3 "same place"). */
    source: `${MEDIA_LAB}/releases/tag/riscv32-linux-v1`,
    project: `${MEDIA_LAB}/tree/main/projects/riscv32-linux`,
    licences: Object.freeze(['GPL-2.0-only', 'LGPL-2.1-or-later'])
});

// ELKS 0.9.2 (Embeddable Linux Kernel Subset) — a real 16-bit Unix-like OS on the
// i8086 machine. The official release floppy is GPL-2.0 and lives in brickwright-
// media-lab on the `media/elks-v0.9.2` branch (byte-identical to the upstream
// release asset; mirrored there because raw.githubusercontent sends CORS and the
// GitHub release download does not). Its corresponding source is ghaerr/elks @
// v0.9.2. Same pattern as the Linux lesson above.
const ELKS_MEDIA_COMMIT = '1ebf1392e2c31f58c90d0c849c20c57e16c02614';
const ELKS_RAW = `https://raw.githubusercontent.com/CrispStrobe/brickwright-media-lab/${ELKS_MEDIA_COMMIT}/projects/elks`;

/** The pinned ELKS media. Mirrors brickwright-media-lab projects/elks/
 *  brickwright-media.json — same floppy, same geometry/quirks. */
export const ELKS_MEDIA = Object.freeze({
    commit: ELKS_MEDIA_COMMIT,
    floppy: Object.freeze({
        url: `${ELKS_RAW}/fd1440-fat.img`,
        sha256: '637a1d07ac1b18c7e8fafbf64911ceaa5864a37c60e23878d498534ccaae366b',
        bytes: 1474560,
        geometry: Object.freeze({cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512})
    }),
    quirks: Object.freeze(['at-floppy-drive-type']),
    /** Corresponding source (GPL-2.0 §3): the upstream ELKS tag the floppy is built from. */
    source: 'https://github.com/ghaerr/elks/tree/v0.9.2',
    project: `${MEDIA_LAB}/tree/main/projects/elks`,
    licences: Object.freeze(['GPL-2.0-only'])
});
/** The ELKS display screen + keyboard (mirrors the media-lab manifest's widgets). */
const ELKS_WIDGETS = Object.freeze([
    {name: 'screen', type: 'simplevga', config: {width: 640, height: 200},
        layout: {x: 0, y: 0, w: 24, h: 14}, source: 'video'},
    {name: 'keyboard', type: 'keyboard', config: {},
        layout: {x: 0, y: 15, w: 24, h: 3}, source: 'keyIn'}
]);

const TABLE = {
    en: {
        'lessons.heading': 'Lessons',
        'lessons.run': 'Run',
        'linux.title': 'Linux on RISC-V',
        'linux.summary': 'A real Linux 6.1 kernel on the emulated RV32 machine with a BusyBox shell. ' +
            'Run opens at the shell prompt, restored from a snapshot taken after boot; ' +
            'Boot from scratch shows the whole kernel boot. ' +
            'Type commands such as uname -a or ls / into the serial console.',
        'linux.licence': 'Linux and BusyBox are GPL-2.0, glibc is LGPL-2.1. They are not part of this app: ' +
            'Run fetches them ({size}) from brickwright-media-lab and checks their SHA-256 first.',
        'lessons.cold': 'Boot from scratch',
        'linux.source': 'Source code',
        'elks.title': 'ELKS on 8086',
        'elks.summary': 'ELKS 0.9.2 — a real 16-bit Unix-like OS — boots on the emulated 8086 ' +
            'from its 1.44 MB floppy. Run opens the kernel boot on the machine screen: it sizes ' +
            'the disk, mounts the root filesystem and reaches a login. A free BIOS is built in.',
        'elks.licence': 'ELKS is GPL-2.0. It is not part of this app: ' +
            'Run fetches the floppy ({size}) from brickwright-media-lab and checks its SHA-256 first.',
        'elks.source': 'Source code',
        'lessons.fetching': 'Fetching {title} ({size}) and checking SHA-256…',
        'lessons.failed': 'Could not start {title}: {reason}'
    },
    de: {
        'lessons.heading': 'Lektionen',
        'lessons.run': 'Ausführen',
        'linux.title': 'Linux auf RISC-V',
        'linux.summary': 'Ein echter Linux-6.1-Kernel auf der emulierten RV32-Maschine mit einer BusyBox-Shell. ' +
            'Ausführen öffnet direkt am Shell-Prompt, wiederhergestellt aus einem Abbild nach dem Start; ' +
            'Von Grund auf booten zeigt den ganzen Kernel-Start. ' +
            'Tippe Befehle wie uname -a oder ls / in die serielle Konsole.',
        'linux.licence': 'Linux und BusyBox stehen unter GPL-2.0, glibc unter LGPL-2.1. Sie sind nicht Teil dieser App: ' +
            'Ausführen lädt sie ({size}) von brickwright-media-lab und prüft vorher ihre SHA-256.',
        'lessons.cold': 'Von Grund auf booten',
        'linux.source': 'Quellcode',
        'elks.title': 'ELKS auf 8086',
        'elks.summary': 'ELKS 0.9.2 — ein echtes 16-Bit-unixoides Betriebssystem — startet auf dem ' +
            'emulierten 8086 von seiner 1,44-MB-Diskette. Ausführen zeigt den Kernel-Start auf dem ' +
            'Maschinenbildschirm: Er erkennt die Diskettengeometrie, bindet das Wurzeldateisystem ein ' +
            'und erreicht einen Login. Ein freies BIOS ist eingebaut.',
        'elks.licence': 'ELKS steht unter GPL-2.0. Es ist nicht Teil dieser App: ' +
            'Ausführen lädt die Diskette ({size}) von brickwright-media-lab und prüft vorher ihre SHA-256.',
        'elks.source': 'Quellcode',
        'lessons.fetching': '{title} wird geladen ({size}) und per SHA-256 geprüft…',
        'lessons.failed': '{title} konnte nicht starten: {reason}'
    }
};

/** Lesson strings: `lessonT(locale, key, vars)`. */
export const lessonT = makeT(TABLE);
export const LESSON_STRINGS = TABLE;

/** "7.5 MB" — decimal megabytes, one place. */
export const mediaSize = bytes => `${(bytes / 1e6).toFixed(1)} MB`;

/** Total download of the Linux lesson's Run (kernel, initramfs, snapshot). */
export const LINUX_DOWNLOAD_BYTES = LINUX_RISCV_MEDIA.kernel.bytes + LINUX_RISCV_MEDIA.initrd.bytes +
    LINUX_RISCV_MEDIA.snapshot.bytes;
/** Download of "Boot from scratch" (no snapshot). */
export const LINUX_COLD_DOWNLOAD_BYTES = LINUX_RISCV_MEDIA.kernel.bytes + LINUX_RISCV_MEDIA.initrd.bytes;
/** Total download of the ELKS lesson's Run (one floppy). */
export const ELKS_DOWNLOAD_BYTES = ELKS_MEDIA.floppy.bytes;

/**
 * The lessons, as machine configs plus what the manager shows beside them.
 * A fixed id, so the row is stable across renders and never collides with a
 * stored machine's minted UUID. `coldConfig` is the same machine without the
 * snapshot slot — the "Boot from scratch" button.
 * @returns {{config: object, coldConfig: object, summary: string, licence: string, source: string,
 *            sourceLabel: string, size: string, coldSize: string, coldLabel: string}[]}
 */
export function lessonMachines (locale) {
    // A deliberately self-contained build omits separately hosted machine media. This is selected
    // by webpack, not inferred from Tauri; normal native builds offer the same lesson as the web app.
    if (!remoteMachineImagesAllowed()) return [];
    const t = (k, v) => lessonT(locale, k, v);
    const config = newMachineConfig({
        id: 'lesson-linux-riscv32',
        title: t('linux.title'),
        executionMode: 'functional',
        machine: 'riscv32',
        slots: {
            kernel: {url: LINUX_RISCV_MEDIA.kernel.url, sha256: LINUX_RISCV_MEDIA.kernel.sha256},
            initrd: {url: LINUX_RISCV_MEDIA.initrd.url, sha256: LINUX_RISCV_MEDIA.initrd.sha256},
            snapshot: {url: LINUX_RISCV_MEDIA.snapshot.url, sha256: LINUX_RISCV_MEDIA.snapshot.sha256}
        },
        bootOrder: ['kernel'],
        tags: ['lesson', 'linux', 'gpl-media'],
        provenance: {
            source: 'brickwright-media-lab/projects/riscv32-linux',
            license: LINUX_RISCV_MEDIA.licences.join(' + '),
            sourceCode: LINUX_RISCV_MEDIA.source
        }
    });
    const coldSlots = {...config.slots};
    delete coldSlots.snapshot;
    const coldConfig = newMachineConfig({...config, slots: coldSlots, bootOrder: ['kernel']});

    // ELKS 0.9.2 on the i8086 machine — the floppy is the boot medium (no cold
    // variant: it IS the whole boot). The floppy slot selects the floppy-OS boot
    // path; its geometry + the at-floppy-drive-type quirk are what ELKS needs to
    // find /bin/init. A `video` widget mirrors the machine screen into Widgets.
    const elksConfig = newMachineConfig({
        id: 'lesson-elks-i8086',
        title: t('elks.title'),
        executionMode: 'functional',
        machine: 'i8086',
        machineConfig: 'PCXT8086',
        slots: {
            floppy: {
                url: ELKS_MEDIA.floppy.url,
                sha256: ELKS_MEDIA.floppy.sha256,
                geometry: {...ELKS_MEDIA.floppy.geometry}
            }
        },
        quirks: [...ELKS_MEDIA.quirks],
        bootOrder: ['floppy'],
        widgets: ELKS_WIDGETS.map(w => ({...w})),
        tags: ['lesson', 'elks', 'gpl-media'],
        provenance: {
            source: 'brickwright-media-lab/projects/elks',
            license: ELKS_MEDIA.licences.join(' + '),
            sourceCode: ELKS_MEDIA.source
        }
    });

    return [{
        config,
        coldConfig,
        coldLabel: t('lessons.cold'),
        coldSize: mediaSize(LINUX_COLD_DOWNLOAD_BYTES),
        summary: t('linux.summary'),
        licence: t('linux.licence', {size: mediaSize(LINUX_DOWNLOAD_BYTES)}),
        source: LINUX_RISCV_MEDIA.source,
        sourceLabel: t('linux.source'),
        size: mediaSize(LINUX_DOWNLOAD_BYTES)
    }, {
        config: elksConfig,
        summary: t('elks.summary'),
        licence: t('elks.licence', {size: mediaSize(ELKS_DOWNLOAD_BYTES)}),
        source: ELKS_MEDIA.source,
        sourceLabel: t('elks.source'),
        size: mediaSize(ELKS_DOWNLOAD_BYTES)
    }];
}

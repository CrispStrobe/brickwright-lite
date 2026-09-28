// Machine lessons — machines the app OFFERS, rather than ones a user imported.
//
// "Linux on RISC-V" is the first: a real Linux 6.1 kernel and a BusyBox shell
// on bw-board's RV32 machine. It is listed in the Machine Manager above the
// user's own machines and boots through the same path an imported media-lab
// manifest does (runMachineConfig → activateConfig → debug-runner).
//
// NOTHING GPL IS IN THIS APP. The kernel (GPL-2.0), BusyBox (GPL-2.0) and glibc
// (LGPL-2.1) live in CrispStrobe/brickwright-media-lab, a GPL repository, beside
// their complete corresponding source (release `riscv32-linux-v1`). This file
// holds two URLs and two SHA-256s. The learner's Run fetches the bytes from
// that repository — the fetch is the distribution, made by the GPL repo — and
// activateConfig's fetcher refuses a byte that does not hash to the pin, BY
// SLOT NAME, before anything boots. The licence line and the source link are
// shown next to the Run button, so the offer travels with the binary.

import {remoteCodeRestricted} from '../distribution-policy.js';
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
const LINUX_MEDIA_COMMIT = '5b257a33fb748885bd952d8b8b281c76f0b36516';
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
    /** Where the corresponding source is offered (GPL-2.0 §3 "same place"). */
    source: `${MEDIA_LAB}/releases/tag/riscv32-linux-v1`,
    project: `${MEDIA_LAB}/tree/main/projects/riscv32-linux`,
    licences: Object.freeze(['GPL-2.0-only', 'LGPL-2.1-or-later'])
});

const TABLE = {
    en: {
        'lessons.heading': 'Lessons',
        'lessons.run': 'Run',
        'linux.title': 'Linux on RISC-V',
        'linux.summary': 'A real Linux 6.1 kernel boots on the emulated RV32 machine to a BusyBox shell. ' +
            'Type commands such as uname -a or ls / into the serial console.',
        'linux.licence': 'Linux and BusyBox are GPL-2.0, glibc is LGPL-2.1. They are not part of this app: ' +
            'Run fetches them ({size}) from brickwright-media-lab and checks their SHA-256 first.',
        'linux.source': 'Source code',
        'lessons.fetching': 'Fetching {title} ({size}) and checking SHA-256…',
        'lessons.failed': 'Could not start {title}: {reason}'
    },
    de: {
        'lessons.heading': 'Lektionen',
        'lessons.run': 'Ausführen',
        'linux.title': 'Linux auf RISC-V',
        'linux.summary': 'Ein echter Linux-6.1-Kernel startet auf der emulierten RV32-Maschine bis zu einer BusyBox-Shell. ' +
            'Tippe Befehle wie uname -a oder ls / in die serielle Konsole.',
        'linux.licence': 'Linux und BusyBox stehen unter GPL-2.0, glibc unter LGPL-2.1. Sie sind nicht Teil dieser App: ' +
            'Ausführen lädt sie ({size}) von brickwright-media-lab und prüft vorher ihre SHA-256.',
        'linux.source': 'Quellcode',
        'lessons.fetching': '{title} wird geladen ({size}) und per SHA-256 geprüft…',
        'lessons.failed': '{title} konnte nicht starten: {reason}'
    }
};

/** Lesson strings: `lessonT(locale, key, vars)`. */
export const lessonT = makeT(TABLE);
export const LESSON_STRINGS = TABLE;

/** "7.5 MB" — decimal megabytes, one place. */
export const mediaSize = bytes => `${(bytes / 1e6).toFixed(1)} MB`;

/** Total download of the Linux lesson. */
export const LINUX_DOWNLOAD_BYTES = LINUX_RISCV_MEDIA.kernel.bytes + LINUX_RISCV_MEDIA.initrd.bytes;

/**
 * The lessons, as machine configs plus what the manager shows beside them.
 * A fixed id, so the row is stable across renders and never collides with a
 * stored machine's minted UUID.
 * @returns {{config: object, summary: string, licence: string, source: string, sourceLabel: string}[]}
 */
export function lessonMachines (locale) {
    // A deliberately self-contained build omits separately hosted machine media. This is selected
    // by webpack, not inferred from Tauri; normal native builds offer the same lesson as the web app.
    if (remoteCodeRestricted()) return [];
    const t = (k, v) => lessonT(locale, k, v);
    const config = newMachineConfig({
        id: 'lesson-linux-riscv32',
        title: t('linux.title'),
        executionMode: 'functional',
        machine: 'riscv32',
        slots: {
            kernel: {url: LINUX_RISCV_MEDIA.kernel.url, sha256: LINUX_RISCV_MEDIA.kernel.sha256},
            initrd: {url: LINUX_RISCV_MEDIA.initrd.url, sha256: LINUX_RISCV_MEDIA.initrd.sha256}
        },
        bootOrder: ['kernel'],
        tags: ['lesson', 'linux', 'gpl-media'],
        provenance: {
            source: 'brickwright-media-lab/projects/riscv32-linux',
            license: LINUX_RISCV_MEDIA.licences.join(' + '),
            sourceCode: LINUX_RISCV_MEDIA.source
        }
    });
    return [{
        config,
        summary: t('linux.summary'),
        licence: t('linux.licence', {size: mediaSize(LINUX_DOWNLOAD_BYTES)}),
        source: LINUX_RISCV_MEDIA.source,
        sourceLabel: t('linux.source'),
        size: mediaSize(LINUX_DOWNLOAD_BYTES)
    }];
}

#!/usr/bin/env node
// Carry the LGPL licence and exact source coordinates beside the firmware.
// The binary payload comes from bw-board, so its pinned git object is the
// authority for the licence bytes too; a developer's working tree is not.
export const NOTICE = {"name":"Free 80386 AT firmware","licence":"LGPL-2.1","holder":"The Bochs Project"};
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIRS = ['overlay/scratch-gui/static/licenses', 'packages/scratch-gui/static/licenses'];
const LICENCE_NAME = 'free-386-firmware.LGPL-2.1.txt';
const SOURCES_NAME = 'free-386-firmware.sources.json';

export function syncFree386Notices({rootDir = ROOT, boardDir, check = false} = {}) {
    if (!boardDir) throw new Error('pass --bw-board-dir <git checkout>');
    const pin = JSON.parse(readFileSync(path.join(rootDir, 'vendor-pins.json'), 'utf8'))['bw-board'];
    if (!/^[0-9a-f]{40}$/.test(pin || '')) throw new Error('vendor-pins.json bw-board: expected full commit SHA');
    const licence = execFileSync('git', ['show', `${pin}:roms/free-at-bios/LICENSE`], {cwd: boardDir});
    const sources = Buffer.from(JSON.stringify({
        schemaVersion: 1,
        notice: 'Complete corresponding source for the unmodified LGPL firmware binaries shipped by Brickwright.',
        firmware: [
            {
                artifact: 'static/roms/free-386-bochs-bios.rom',
                artifactSha256: '6481181809b58a9f805346a7ecf9bebdaf5b322c32825fb49ee89da51552c4ac',
                source: 'Bochs 2.7 source release (bios/rombios.c and BIOS build files)',
                sourceArchive: 'https://sourceforge.net/projects/bochs/files/bochs/2.7/bochs-2.7.tar.gz/download',
                sourceArchiveSha256: 'a010ab1bfdc72ac5a08d2e2412cd471c0febd66af1d9349bc0d796879de5b17a'
            },
            {
                artifact: 'static/roms/free-386-vgabios-lgpl.bin',
                artifactSha256: '76af53f14955df3edd6365daa64393e91fafe55241c2c00384ff05b740431da1',
                source: 'VGABios 0.8a / revision 288 source release',
                sourceArchive: 'https://download-mirror.savannah.gnu.org/releases/vgabios/vgabios-0.8a.tgz',
                sourceArchiveSha256: '481042240ef0f1c918780c92a6bb42ad4d3f5d989b29502fa7ee7faf13a041b9'
            }
        ]
    }, null, 2) + '\n');
    const expected = new Map([[LICENCE_NAME, licence], [SOURCES_NAME, sources]]);
    const findings = [];
    for (const relative of OUTPUT_DIRS) {
        const directory = path.join(rootDir, relative);
        if (!check) mkdirSync(directory, {recursive: true});
        for (const [name, bytes] of expected) {
            const target = path.join(directory, name);
            if (!check) writeFileSync(target, bytes);
            else if (!existsSync(target) || !readFileSync(target).equals(bytes)) findings.push(`${relative}/${name}`);
        }
    }
    return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const at = args.indexOf('--bw-board-dir');
    try {
        const findings = syncFree386Notices({boardDir: at >= 0 ? path.resolve(args[at + 1]) : null, check: args.includes('--check')});
        if (findings.length) {
            console.error(`stale free-386 notice output:\n${findings.join('\n')}`);
            process.exitCode = 1;
        } else console.log('free-386 LGPL licence and corresponding-source manifest are current');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}

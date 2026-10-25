import {parseDosboxConfig} from 'bw-board/dosbox-config.js';
import {localDosboxMachine} from './local-dosbox.js';
import {DOS_PACKAGE_LIMITS, packagePath, packageBytes} from './dos-package-zip.js';
const need = (condition, reason) => {if (!condition) throw new Error(`DOS package: ${reason}`);};
/** GUI admission boundary only. No autoexec interpreter, host mounts or COM loader. */
export function localDosPackage (entries) {
    need(Array.isArray(entries) && entries.length > 0 && entries.length <= DOS_PACKAGE_LIMITS.entries, 'invalid member census');
    const files = new Map(); let total = 0;
    for (const entry of entries) {
        packagePath(entry.name); const key = entry.name.toLowerCase();
        need(!files.has(key) && entry.bytes instanceof Uint8Array, 'duplicate or invalid package member');
        const bytes = packageBytes(entry.bytes); total += bytes.length;
        need(total <= DOS_PACKAGE_LIMITS.decodedBytes, 'decoded member budget exceeded');
        files.set(key, {name:entry.name,bytes});
    }
    const configs = [...files.values()].filter(entry => /(?:^|\/)dosbox\.conf$/i.test(entry.name));
    need(configs.length === 1, 'select an archive with exactly one dosbox.conf; configuration selection is ambiguous');
    const config = configs[0];
    need(config.bytes.length > 0 && config.bytes.length <= DOS_PACKAGE_LIMITS.configBytes, 'config exceeds 16 KiB');
    const confText = new TextDecoder('utf-8', {fatal:true}).decode(config.bytes);
    need(!/[^\x09\x0a\x0d\x20-\x7e]/.test(confText), 'config must be plain ASCII text');
    let section = '', mountLine = null, boot = false;
    const sections = new Set(), settings = new Set();
    for (const raw of confText.split(/\r?\n/)) {
        const line = raw.trim(); if (!line || /^[;#]/.test(line)) continue;
        const header = line.match(/^\[(cpu|autoexec)\]$/i);
        if (header) {section = header[1].toLowerCase(); need(!sections.has(section), 'duplicate config section'); sections.add(section); continue;}
        if (section === 'cpu') {
            need(/^cputype\s*=\s*(386|auto)$/i.test(line) && !settings.has('cputype'), 'unsupported or duplicate CPU setting');
            settings.add('cputype'); continue;
        }
        need(section === 'autoexec', 'unsupported config section or command');
        if (!mountLine && /^imgmount\s+(?:c|2)\s+(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s"']+)\s+-t\s+hdd\s+-size\s+512,\d+,\d+,\d+$/i.test(line)) {mountLine = line; continue;}
        if (mountLine && !boot && /^boot\s+-l\s+c$/i.test(line)) {boot = true; continue;}
        throw new Error('DOS package: unsupported autoexec command; only one HDD imgmount and boot -l c are admitted');
    }
    need(mountLine && boot, 'one explicit HDD imgmount and boot -l c are required');
    const parsed = parseDosboxConfig(confText);
    need(parsed.mounts.length === 1 && parsed.mounts[0].drive === 'c' && parsed.mounts[0].type === 'hdd' &&
        parsed.boots.length === 1 && /^-l\s+c$/i.test(parsed.boots[0]), 'canonical DOSBox AST differs from the closed subset');
    const relative = parsed.mounts[0].source.replace(/\\/g, '/'); packagePath(relative);
    const parent = config.name.includes('/') ? config.name.slice(0, config.name.lastIndexOf('/') + 1) : '';
    const imageName = `${parent}${relative}`, image = files.get(imageName.toLowerCase());
    need(image && /\.img$/i.test(image.name), 'config-relative HDD image is missing or unsupported');
    for (const entry of files.values()) {
        need(entry === config || entry === image || /(?:^|\/)license\.txt$/i.test(entry.name),
            'unreferenced image, executable or unsupported archive member');
    }
    const bytes = new Uint8Array(image.bytes);
    const cfg = localDosboxMachine({confText, fileName:image.name.split('/').pop(), byteLength:bytes.length, nativeBlocks:false});
    return Object.freeze({config:cfg, selectedConfig:config.name, selectedImage:image.name, bytes});
}

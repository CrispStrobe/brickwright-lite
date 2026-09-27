import {fromDosboxConf} from './importers.js';
import {newMachineConfig} from './machine-config.js';

/** One-shot local HDD boot. Bytes stay in the browser tab and never enter the
 * saved Machine Manager store. A DOSBox conf may supply -size geometry. */
export function localDosboxMachine({confText = '', fileName, byteLength}) {
    if (!fileName || !Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength % 512) {
        throw new Error('select a non-empty raw disk image whose size is a multiple of 512 bytes');
    }
    const parsed = confText.trim() ? fromDosboxConf(confText, {title: fileName}) : null;
    // The local boot target is always our 386 AT. DOSBox's cputype=auto (or
    // even an explicit older CPU) describes its own emulator, not a limit on
    // what this AT can execute in real mode.
    const geometry = parsed?.slots?.hdd?.geometry || (() => {
        const cylinders = byteLength / (512 * 4 * 17);
        if (!Number.isInteger(cylinders) || cylinders < 1 || cylinders > 1024) {
            throw new Error('disk geometry is ambiguous; add imgmount c ... -size 512,sectors,heads,cylinders to the DOSBox config');
        }
        return {cylinders, heads: 4, sectors: 17};
    })();
    if (!Number.isInteger(geometry.cylinders) || geometry.cylinders < 1 || geometry.cylinders > 1024 ||
        !Number.isInteger(geometry.heads) || geometry.heads < 1 || geometry.heads > 16 ||
        !Number.isInteger(geometry.sectors) || geometry.sectors < 1 || geometry.sectors > 63) {
        throw new Error('AT BIOS disk geometry requires 1..1024 cylinders, 1..16 heads, and 1..63 sectors');
    }
    if (geometry.cylinders * geometry.heads * geometry.sectors * 512 !== byteLength) {
        throw new Error('DOSBox imgmount geometry does not match the selected image size');
    }
    return newMachineConfig({
        title: fileName, machine: 'i80386', executionMode: 'functional',
        bios: {kind: 'bochs-lgpl'}, video: {kind: 'vga', optionRom: 'seavgabios-lgpl'},
        slots: {hdd: {url: 'local-media:disk', geometry}}, bootOrder: ['hdd'],
        widgets: [{name: 'AT VGA', type: 'simplevga', source: 'video',
            config: {width: 640, height: 480}}],
        provenance: {source: 'local-dosbox', configProvided: !!confText.trim()},
    });
}

import {registerBusMemory} from './engine/devices/bus-memory.js';
import {createHarrisBootROM, createHarrisLoopROM} from './engine/experimental/harris-boot-rom.js';
import {createHarrisCircuitDocument, loadHarrisCircuitSession} from './engine/experimental/harris-circuit-session.js';
import {PATERSON_FAT12_BYTES} from './paterson-fat12.js';

// This registry belongs to the isolated engine copy, never the project's engine.
registerBusMemory();
export const demo = () => createHarrisCircuitDocument({enabled: true, rom: createHarrisLoopROM(), romLowAlias: true});
export const paterson = () => {
    const rom = createHarrisBootROM(); rom.fill(255, 0x100, 0xfff0); rom.set(PATERSON_FAT12_BYTES, 0x100);
    return createHarrisCircuitDocument({enabled: true, rom, romLowAlias: true});
};
export const load = document => loadHarrisCircuitSession(document, {enabled: true});

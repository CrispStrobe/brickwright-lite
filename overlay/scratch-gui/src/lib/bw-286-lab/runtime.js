import {registerBusMemory} from './engine/devices/bus-memory.js';
import {createHarrisLoopROM} from './engine/experimental/harris-boot-rom.js';
import {createHarrisCircuitDocument, loadHarrisCircuitSession} from './engine/experimental/harris-circuit-session.js';

// This registry belongs to the isolated engine copy, never the project's engine.
registerBusMemory();
export const demo = () => createHarrisCircuitDocument({enabled: true, rom: createHarrisLoopROM(), romLowAlias: true});
export const load = document => loadHarrisCircuitSession(document, {enabled: true});

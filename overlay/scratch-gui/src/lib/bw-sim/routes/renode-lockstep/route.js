// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's SPIKE firmware route over a lockstep transport
// (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.4, §2.6, §7.4). The order of operations:
//
//   session.start → state.read (lockstep/v1? instructions/v2?) → run   the driver (driver.js)
//   → compile(abi) when the caller passed `compile`              ABI 2 only if advertised
//   → program.packet BEGIN, CHUNK…, COMMIT                      upload, guest free-running
//   → lockstep.begin                                            the Lab's time 0
//   → [Run] program.control.submit START → lockstep.step …      the program runs in lockstep
//   → [Pause/Reset] program.control.submit STOP → lockstep.end → session.close
//
// No program (the VM's blocks did not compile) is allowed: the route still opens,
// the robot stands, and the pane says which block the firmware cannot run.

import {RenodeLockstepDriver} from './driver.js';
import {LockstepProgram, instructionAbi} from './program.js';
import {SpikeFirmwareVirtualHub} from '../../hubs/spike/spike-firmware-hub.js';
import {compileFirmwareProgram, FirmwareProgramError} from '../../../spike-arena/firmware-program.js';

/**
 * The VM's program for the firmware: {program} or {error} (a FirmwareProgramError naming
 * the block, or the compiler's other error). Never throws.
 */
export const compileRouteProgram = (vm, {topology = 'default', abi = 1} = {}) => {
    try {
        // abi 2 only once the package advertises firmware instruction ABI 2; nothing does yet.
        return {program: compileFirmwareProgram(vm, {topology, abi}), error: null};
    } catch (error) {
        return {program: null, error};
    }
};

export {FirmwareProgramError};

/**
 * Starts the emulated hub, uploads the program (if any) and enters lockstep; resolves to
 * {driver, createHub, program} — program a LockstepProgram (start()/stop()) or null. The
 * firmware route runs a model's (first) hub; a second hub waits for the multi-hub slice (R16).
 * @param {object} options
 * @param {{call: Function}} options.transport
 * @param {object} [options.hubState] the pane's VirtualSpikeHubState, to show the hub
 * @param {'nuttx'|'micropython'} [options.backend]
 * @param {'default'|'six-motors'|'dual-ultrasonic'} [options.topology]
 * @param {object} [options.program] compileFirmwareProgram's output, uploaded before lockstep
 * @param {Function} [options.compile] instead of program: abi => compileRouteProgram's {program, error},
 *        called once state.read showed the target's instruction ABI (2 with `nuttx-program-instructions/v2`,
 *        else 1); the result carries it as `abi` and the compile result as `compiled`
 * @param {boolean} [options.manageSession] false when the caller started (and runs) the emulator
 * @param {Function} [options.onProgramChange] the LockstepProgram's onChange
 */
export const openLockstepRoute = async ({transport, hubState = null, backend = 'nuttx', topology = 'default',
    program = null, pythonSource = null, compile = null, manageSession = true, onProgramChange = () => {}}) => {
    if (hubState?.configurationOwner) throw new Error('Hub configuration is owned by another session (the SPIKE arena?).');
    if ((program !== null || pythonSource !== null || compile !== null) && backend !== 'nuttx') throw new Error('Only the NuttX firmware runs compiled block programs.');
    if (compile !== null && (typeof compile !== 'function' || program !== null || pythonSource !== null)) {
        throw new TypeError('compile replaces program and pythonSource');
    }
    // Validates the program before anything starts: a program the ABI refuses starts no emulator.
    let control = program !== null || pythonSource !== null ?
        new LockstepProgram({transport, program, pythonSource, topology, onChange: onProgramChange}) : null;
    let abi = 1, compiled = null;
    // After state.read, before the upload: compile for the instruction ABI the target advertises.
    const prepare = () => {
        abi = instructionAbi(driver.targetFrame);
        compiled = compile(abi);
        control = compiled.program ?
            new LockstepProgram({transport, program: compiled.program, topology, onChange: onProgramChange}) : null;
        return control ? control.upload() : null;
    };
    const release = () => {
        if (hubState?.configurationOwner === driver) {
            hubState.configurationOwner = null;
            hubState.changed?.();
        }
    };
    const driver = new RenodeLockstepDriver({transport, backend, topology, manageSession, onEnd: release,
        beforeLockstep: compile ? prepare : control ? () => control.upload() : null,
        // Pause/Reset/close: the program stops before lockstep ends (when it runs, or a START is in line).
        beforeEnd: control || compile ? () => control?.stop() : null});
    if (control || compile) driver.observe(frame => control?.observe(frame));
    if (hubState) {
        hubState.configurationOwner = driver;
        hubState.changed?.();
    }
    try {
        await driver.begin();
    } catch (error) {
        await driver.end().catch(() => {});
        throw error;
    }
    const createHub = def => {
        if (def.index > 0) throw new Error('The SPIKE firmware route runs a model with one hub.');
        return new SpikeFirmwareVirtualHub({id: def.id, driver, hubState});
    };
    return {driver, createHub, program: control, abi, compiled};
};

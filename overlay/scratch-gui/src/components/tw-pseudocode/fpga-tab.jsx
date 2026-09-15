import React from 'react';

/**
 * The FPGA / HDL surface — TN2 of docs/TANG-NANO.md.
 *
 * SHIPPED HIDDEN. Reached only when a build sets BW_ENABLE_FPGA=1; gui.jsx gates
 * both the <Tab> and this <TabPanel> on a webpack-substituted literal, so an
 * off build does not carry this file at all. Enabling it by default is a
 * separate, later decision that MAY NEVER BE TAKEN, and that is an acceptable
 * outcome rather than a failure of the lane.
 *
 * WHY THIS IS ITS OWN SURFACE AND NOT A CODE-TAB LANGUAGE. The Code tab's
 * premise is blocks <-> pseudocode <-> Python/JS as representations of ONE
 * program. Verilog is not a representation of a Scratch script, and putting it
 * there would imply a conversion that will never exist. The project already
 * keeps conversion limits explicit rather than pretending everything
 * round-trips; this would be the loudest possible exception.
 *
 * WHAT IS DELIBERATELY NOT HERE YET, and must not be implied by the UI:
 *   - synthesis (TN3: hosted yosys/nextpnr/apicula)
 *   - the gate-level tier (TN2b + digitaljs over a Yosys netlist)
 *   - the pin bridge into the MNA circuit engine (TN2b)
 *   - flashing (TN4, Tauri only)
 *   - any SoC (TN5a LiteX/VexRiscv/Renode, TN5b a 6502/Z80 SBC)
 *
 * The plan, the phases and the decisions behind them: docs/TANG-NANO.md.
 *
 * The board part and its 3.3 V rule already shipped with TN0 and are usable in
 * the Circuit tab today; this surface is where the HDL half will live.
 */
const FpgaTab = () => (
    <div style={{padding: '1.5rem', maxWidth: '44rem', lineHeight: 1.5}}>
        <h2 style={{marginTop: 0}}>{'FPGA — Tang Nano 20K'}</h2>
        <p>
            {'This surface is where HDL will live. It is not built yet, and nothing '}
            {'here synthesises, simulates or flashes anything.'}
        </p>
        <p>
            {'The Tang Nano 20K board part IS available now, in the Circuit tab: '}
            {'its pinout, its banks, and the rule that matters — Gowin I/O is not '}
            {'5 V tolerant, so the board’s 5V pin is safe to power a part FROM '}
            {'and unsafe to feed back INTO any bank pin.'}
        </p>
        <p style={{opacity: 0.75}}>
            {'Planned, in order: the pin bridge into the circuit engine, then hosted '}
            {'synthesis, then flashing from the native app.'}
        </p>
    </div>
);

export default FpgaTab;

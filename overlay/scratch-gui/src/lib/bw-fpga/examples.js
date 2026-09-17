/**
 * Starter designs for the FPGA tab, so the Verilog box is never a blank page.
 *
 * A first-time user should be able to synthesise something and see the whole
 * flow in one click, rather than having to know Verilog and a Gowin pinout
 * cold. Each example is a complete, SYNTHESISABLE design plus the matching
 * `.cst`, using only pins the Tang Nano 20K actually brings out to a header
 * (verified against `bindPorts`; the pins here are the ones the pin checker
 * reports as reaching the board).
 *
 * `blink` and `counter` are the two the whole toolchain was proven on end to
 * end — their bitstreams are the recorded reference hashes — so "load blinky,
 * click Synthesise" reproduces a known-good build.
 *
 * @module
 */

export const EXAMPLES = Object.freeze([
    Object.freeze({
        id: 'blink',
        label: 'Blinky — LED on',
        blurb: 'The smallest thing that builds: one output tied high.',
        verilog: 'module blink(output led);\n  assign led = 1\'b1;\nendmodule\n',
        cst: 'IO_LOC "led" 73;\nIO_PORT "led" IO_TYPE=LVCMOS33;\n'
    }),
    Object.freeze({
        id: 'button',
        label: 'Button → LED',
        blurb: 'Combinational: the LED follows a header input. Good for wiring a switch.',
        verilog: 'module top(input btn, output led);\n  assign led = btn;\nendmodule\n',
        cst: 'IO_LOC "btn" 74;\nIO_PORT "btn" IO_TYPE=LVCMOS33;\n'
            + 'IO_LOC "led" 73;\nIO_PORT "led" IO_TYPE=LVCMOS33;\n'
    }),
    Object.freeze({
        id: 'counter',
        label: 'Counter — 6 LEDs',
        blurb: 'Sequential: a 26-bit counter drives six LEDs. Its clock and reset are on-board (not header pins), so the pin checker flags them — correct: you flash this, you do not breadboard it.',
        verilog: 'module counter(input clk, input rst_n, output [5:0] led);\n'
            + '  reg [25:0] cnt;\n'
            + '  always @(posedge clk or negedge rst_n)\n'
            + '    if (!rst_n) cnt <= 26\'d0;\n'
            + '    else        cnt <= cnt + 1\'b1;\n'
            + '  assign led = ~cnt[25:20];\n'
            + 'endmodule\n',
        cst: 'IO_LOC "clk" 4;\nIO_PORT "clk" IO_TYPE=LVCMOS33;\n'
            + 'IO_LOC "rst_n" 88;\nIO_PORT "rst_n" IO_TYPE=LVCMOS33;\n'
            + 'IO_LOC "led[0]" 15;\nIO_LOC "led[1]" 16;\nIO_LOC "led[2]" 17;\n'
            + 'IO_LOC "led[3]" 18;\nIO_LOC "led[4]" 19;\nIO_LOC "led[5]" 20;\n'
            + 'IO_PORT "led[0]" IO_TYPE=LVCMOS33;\nIO_PORT "led[1]" IO_TYPE=LVCMOS33;\n'
            + 'IO_PORT "led[2]" IO_TYPE=LVCMOS33;\nIO_PORT "led[3]" IO_TYPE=LVCMOS33;\n'
            + 'IO_PORT "led[4]" IO_TYPE=LVCMOS33;\nIO_PORT "led[5]" IO_TYPE=LVCMOS33;\n'
    }),
    Object.freeze({
        id: 'sequence',
        label: 'Counting sequence — 4 LEDs',
        blurb: 'The one to WATCH move: a 4-bit counter with no clock divider, so every '
            + 'clock changes an LED. Synthesise it, then use the Step clock button — the '
            + 'four LEDs count up in binary on the board. (`counter` divides by 2²⁰ so it '
            + 'blinks on real silicon but would need a million steps to move here; this one '
            + 'is built to step.)',
        // NO reset: the register is initialised instead. The tab rebuilds the
        // gate-level sim from scratch on every step, so an async reset could never
        // be asserted-then-released across steps — the counter would sit at x. An
        // initialised reg starts defined at 0 and counts on the clock alone, which
        // is exactly what the tab's step model can drive. (Yosys carries the `= 0`
        // as a netname init; yosys2digitaljs honours it as the flop's initial.)
        verilog: 'module sequence(input clk, output [3:0] led);\n'
            + '  reg [3:0] cnt = 4\'d0;\n'
            + '  always @(posedge clk) cnt <= cnt + 1\'b1;\n'
            + '  assign led = cnt;\n'
            + 'endmodule\n',
        cst: 'IO_LOC "clk" 4;\nIO_PORT "clk" IO_TYPE=LVCMOS33;\n'
            + 'IO_LOC "led[0]" 15;\nIO_LOC "led[1]" 16;\n'
            + 'IO_LOC "led[2]" 17;\nIO_LOC "led[3]" 18;\n'
            + 'IO_PORT "led[0]" IO_TYPE=LVCMOS33;\nIO_PORT "led[1]" IO_TYPE=LVCMOS33;\n'
            + 'IO_PORT "led[2]" IO_TYPE=LVCMOS33;\nIO_PORT "led[3]" IO_TYPE=LVCMOS33;\n'
    })
]);

import { modelToVerilog } from "./overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js";
import { verilogToModel } from "./overlay/scratch-gui/src/lib/bw-fpga/verilog-to-model.js";
import { EXAMPLES } from "./overlay/scratch-gui/src/lib/bw-fpga/examples.js";

const blink = EXAMPLES[0];
const { verilog } = modelToVerilog(blink.model);
console.log("Generated Verilog:");
console.log(verilog);

const { model, problems } = verilogToModel(verilog);
console.log("Reconstructed model:", JSON.stringify(model, null, 2));
console.log("Problems:", problems);

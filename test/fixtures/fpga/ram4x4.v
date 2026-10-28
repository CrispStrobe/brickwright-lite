module design(input clk, input [1:0] addr, input [3:0] din, input we, output [3:0] q);
  reg [3:0] mem_ram [0:3];
  reg [3:0] w_ram;
  always @(posedge clk) begin
    if (we) mem_ram[addr] <= din;
    w_ram <= mem_ram[addr];
  end
  assign q = w_ram;
endmodule

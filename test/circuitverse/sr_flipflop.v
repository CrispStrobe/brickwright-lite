module sr_flipflop(input s, input r, input clk, output reg q, output qn);
  always @(posedge clk) begin
    if (s) q <= 1;
    else if (r) q <= 0;
  end
  assign qn = ~q;
endmodule

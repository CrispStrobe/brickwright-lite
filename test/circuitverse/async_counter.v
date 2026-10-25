module t_ff(input clk, input rst, output reg q);
  always @(posedge clk or posedge rst) begin
    if (rst) q <= 0;
    else q <= ~q;
  end
endmodule

module async_counter(input clk, input rst, output [3:0] q);
  wire clk1 = ~q[0];
  wire clk2 = ~q[1];
  wire clk3 = ~q[2];
  
  t_ff t0(.clk(clk),  .rst(rst), .q(q[0]));
  t_ff t1(.clk(clk1), .rst(rst), .q(q[1]));
  t_ff t2(.clk(clk2), .rst(rst), .q(q[2]));
  t_ff t3(.clk(clk3), .rst(rst), .q(q[3]));
endmodule

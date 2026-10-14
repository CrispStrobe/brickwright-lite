module mux4(input [3:0] d, input [1:0] sel, output y);
  wire w0, w1;
  assign w0 = sel[0] ? d[1] : d[0];
  assign w1 = sel[0] ? d[3] : d[2];
  assign y  = sel[1] ? w1 : w0;
endmodule

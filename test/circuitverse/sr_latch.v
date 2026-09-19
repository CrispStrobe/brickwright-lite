module sr_latch(input s, input r, output q, output qn);
  // Cross-coupled NOR gates
  assign q = ~(r | qn);
  assign qn = ~(s | q);
endmodule

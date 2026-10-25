module ripple_carry_adder(input [3:0] a, input [3:0] b, input cin, output [3:0] sum, output cout);
  wire c1, c2, c3;
  
  // Full Adder 0
  wire s0_w1 = a[0] ^ b[0];
  assign sum[0] = s0_w1 ^ cin;
  assign c1 = (s0_w1 & cin) | (a[0] & b[0]);
  
  // Full Adder 1
  wire s1_w1 = a[1] ^ b[1];
  assign sum[1] = s1_w1 ^ c1;
  assign c2 = (s1_w1 & c1) | (a[1] & b[1]);
  
  // Full Adder 2
  wire s2_w1 = a[2] ^ b[2];
  assign sum[2] = s2_w1 ^ c2;
  assign c3 = (s2_w1 & c2) | (a[2] & b[2]);
  
  // Full Adder 3
  wire s3_w1 = a[3] ^ b[3];
  assign sum[3] = s3_w1 ^ c3;
  assign cout = (s3_w1 & c3) | (a[3] & b[3]);
endmodule

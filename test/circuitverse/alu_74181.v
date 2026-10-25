module alu_74181(
  input [3:0] A, B,
  input [3:0] S,
  input M, CN,
  output [3:0] F,
  output X, Y, CN4, A_eq_B
);
  // simplified behavioral 74181
  wire [3:0] logic_out;
  wire [4:0] arith_out;
  
  // Logic functions (M=1)
  assign logic_out[0] = S[0] ? ~(A[0] | B[0]) : (A[0] ^ B[0]);
  assign logic_out[1] = S[1] ? ~(A[1] | B[1]) : (A[1] ^ B[1]);
  assign logic_out[2] = S[2] ? ~(A[2] | B[2]) : (A[2] ^ B[2]);
  assign logic_out[3] = S[3] ? ~(A[3] | B[3]) : (A[3] ^ B[3]);
  
  // Arith functions (M=0)
  assign arith_out = A + (S[0] ? B : ~B) + CN;
  
  assign F = M ? logic_out : arith_out[3:0];
  assign CN4 = M ? 1'b0 : arith_out[4];
  assign X = 1'b0;
  assign Y = 1'b0;
  assign A_eq_B = (F == 4'b1111);
endmodule

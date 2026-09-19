module full_adder(input a, input b, input cin, output sum, output cout);
  wire w1, w2, w3;
  // Structural full adder
  assign w1 = a ^ b;
  assign sum = w1 ^ cin;
  assign w2 = w1 & cin;
  assign w3 = a & b;
  assign cout = w2 | w3;
endmodule

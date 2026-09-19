module keyboard_decoder(input [3:0] row, input [3:0] col, output reg [7:0] ascii, output reg valid);
  always @(*) begin
    valid = 1;
    case ({row, col})
      8'b0001_0001: ascii = 8'h31; // '1'
      8'b0001_0010: ascii = 8'h32; // '2'
      8'b0010_0001: ascii = 8'h34; // '4'
      default: begin ascii = 8'h00; valid = 0; end
    endcase
  end
endmodule

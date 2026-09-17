// SPDX-License-Identifier: MIT
module counter(input clk, input rst_n, output [5:0] led);
    reg [25:0] cnt;
    always @(posedge clk or negedge rst_n)
        if (!rst_n) cnt <= 26'd0;
        else        cnt <= cnt + 1'b1;
    assign led = ~cnt[25:20];
endmodule

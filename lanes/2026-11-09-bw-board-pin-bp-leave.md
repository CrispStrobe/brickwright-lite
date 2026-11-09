# bw-board pin 6efff7f4 -> c840653f: Run/Step leave a code breakpoint

Owner: x86 lane (Claude Code agent for the repository owner). Claim and
change in one PR.

bw-board #728 (merge `c840653f036805f5f96d0d523b908a6a0e021acd`) lets Run and
Step leave the code breakpoint the 8086/386 debug target is stopped on (once,
first instruction only; a loop's next pass still halts). Before it, Step after
the 386 drawer's 0x7C13 breakpoint stayed at 0x7C13. The move also carries
bw-board #727 (an ADC test reading change).

Paths: exact SHA swap across the current pin surfaces, regenerated census and
language-device matrix, and the x86 F10 reviewed bodies re-stamped (their only
change is the bw-board literal). No Lite source change.

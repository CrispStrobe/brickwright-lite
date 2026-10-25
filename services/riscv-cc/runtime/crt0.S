# Freestanding startup for the hosted RISC-V C route.
# Sets the stack, zeroes .bss, calls main(), then exits with main's return value
# through the machine's ECALL ABI (a7=93 exit). Matches the local assembler's
# world: a7=64 write(fd,buf,len), a7=93 exit(code).
    .section .text._start, "ax"
    .globl _start
_start:
    la   sp, __stack_top          # set up the stack
    # zero .bss
    la   t0, __bss_start
    la   t1, __bss_end
1:  bgeu t0, t1, 2f
    sw   zero, 0(t0)
    addi t0, t0, 4
    j    1b
2:
    li   a0, 0                     # argc = 0
    li   a1, 0                     # argv = NULL
    call main
    # exit(main())
    mv   a0, a0                    # main's return value is the exit code
    li   a7, 93
    ecall
3:  j    3b                        # never reached

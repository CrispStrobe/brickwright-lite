/* Linker script for the hosted RISC-V C route.
 *
 * Places a freestanding program at the layout RiscV32Machine's ECALL console
 * boots: .text at 0x1000 (where the assembler and the shipped clang "Hello"
 * fixture also start), read/write data at 0x8000. The debug-runner loads the
 * PT_LOAD segments and sets pc = e_entry (_start). No MMU, no relocation — a
 * flat image, exactly like the local assembler produces.
 */
OUTPUT_ARCH(riscv)
ENTRY(_start)

MEMORY {
  RAM (rwx) : ORIGIN = 0x00001000, LENGTH = 0x0007F000   /* 0x1000 .. 0x80000 */
}

SECTIONS {
  . = 0x00001000;
  .text : { *(.text._start) *(.text*) *(.rodata*) } > RAM

  . = 0x00008000;
  .data : { *(.data*) *(.sdata*) } > RAM
  .bss  : { __bss_start = .; *(.bss*) *(.sbss*) *(COMMON) __bss_end = .; } > RAM

  /* Stack grows down from the top of RAM; _start sets sp to it. */
  __stack_top = ORIGIN(RAM) + LENGTH(RAM);
  /DISCARD/ : { *(.riscv.attributes) *(.comment) *(.eh_frame*) }
}

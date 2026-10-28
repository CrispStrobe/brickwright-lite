# ATtiny85 build. Needs avr-gcc (homebrew: `brew install avr-gcc`).
#
#   make            -> irtower-attiny85.hex
#   make disasm     -> the gate loop, for counting cycles by hand
#   make flash      -> avrdude via USBasp; change PROGRAMMER for yours
#
# The fuse line is the one thing that is not optional: this board's numbers
# assume 8 MHz, i.e. CKDIV8 unprogrammed. A factory part runs at 1 MHz and its
# carrier would come out at 4.7 kHz, which no receiver will hear at all.
#
#   avrdude -c $(PROGRAMMER) -p t85 -U lfuse:w:0xe2:m

MCU        := attiny85
F_CPU      := 8000000
PROGRAMMER := usbasp
ROOT       := ../..

CC      := avr-gcc
CFLAGS  := -std=c11 -Os -flto -Wall -Wextra -Werror \
           -mmcu=$(MCU) -DF_CPU=$(F_CPU)UL \
           -ffunction-sections -fdata-sections \
           -I$(ROOT)/include -I.
LDFLAGS := -mmcu=$(MCU) -flto -Os -Wl,--gc-sections

SRC := $(ROOT)/src/irtower.c port.c

all: irtower-attiny85.hex

irtower-attiny85.elf: $(SRC) board.h $(ROOT)/include/irtower.h $(ROOT)/include/irtower_port.h
	$(CC) $(CFLAGS) $(SRC) $(LDFLAGS) -o $@
	avr-size $@

irtower-attiny85.hex: irtower-attiny85.elf
	avr-objcopy -O ihex -R .eeprom $< $@

# The poll rate recorded in board.h is read off this listing. See the README
# section "Counting the ATtiny85 gate loop".
disasm: irtower-attiny85.elf
	avr-objdump -d $<

flash: irtower-attiny85.hex
	avrdude -c $(PROGRAMMER) -p t85 -U flash:w:$<:i

clean:
	rm -f irtower-attiny85.elf irtower-attiny85.hex

.PHONY: all disasm flash clean

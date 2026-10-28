# firmware/ir-tower — host build and test.
#
#   make test     both gate paths, no hardware required
#
# The MCU builds live under boards/<board>/ and need their own toolchains;
# neither is needed here, and neither is privileged: this Makefile builds the
# third port, the one whose pins are variables.

CC     ?= cc
CFLAGS ?= -std=c11 -Os -Wall -Wextra -Werror -Wconversion -g
BUILD  := build

# The board directory comes first on the include path and there is only ever
# one of them: "board.h" is how a build says which board it is.
INC  := -Iinclude -Itest
HOST := $(INC) -Iboards/host-sim

COMMON := src/irtower.c boards/host-sim/port.c \
          test/test_tower.c test/sim_uart.c test/sim_receiver.c

# One facts object per board, each compiled with its own board directory on
# the include path. This is also a standing check that every board header
# still parses on a host compiler with no vendor SDK anywhere.
FACTS := $(BUILD)/facts_attiny85.o $(BUILD)/facts_host_sim.o $(BUILD)/facts_rp2040.o

$(BUILD)/facts_attiny85.o: test/facts_attiny85.c boards/attiny85/board.h test/facts.h | $(BUILD)
	$(CC) $(CFLAGS) $(INC) -Iboards/attiny85 -c $< -o $@

$(BUILD)/facts_host_sim.o: test/facts_host_sim.c boards/host-sim/board.h test/facts.h | $(BUILD)
	$(CC) $(CFLAGS) $(INC) -Iboards/host-sim -c $< -o $@

$(BUILD)/facts_rp2040.o: test/facts_rp2040.c boards/rp2040/board.h test/facts.h | $(BUILD)
	$(CC) $(CFLAGS) $(INC) -Iboards/rp2040 -c $< -o $@

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/test-software-gate: $(COMMON) $(FACTS) | $(BUILD)
	$(CC) $(CFLAGS) $(HOST) $(COMMON) $(FACTS) -o $@

$(BUILD)/test-hardware-gate: $(COMMON) $(FACTS) | $(BUILD)
	$(CC) $(CFLAGS) $(HOST) -DIRT_HOST_HARDWARE_GATE=1 $(COMMON) $(FACTS) -o $@

test: $(BUILD)/test-software-gate $(BUILD)/test-hardware-gate
	./$(BUILD)/test-software-gate
	./$(BUILD)/test-hardware-gate

clean:
	rm -rf $(BUILD)

.PHONY: test clean

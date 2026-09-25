# SPDX-License-Identifier: MIT
# Copyright (c) 2013, 2014 Damien P. George
# Copyright (c) 2019-2025 The Pybricks Authors
# Copyright (c) 2026 Brickwright contributors
#
# Builds Pybricks MicroPython for the browser: the "wasm hub".
#
# Driven by build-pybricks-wasm.sh at the repository root, which pins and
# verifies the Pybricks source tree and the emscripten toolchain. Borrows the
# structure of Pybricks' bricks/_common/common.mk, but only the parts a
# hardware-free build needs: no Bluetooth stack, no vendor HAL, no umm_malloc,
# no frozen modules.
#
#   make PBTOP=/path/to/pybricks-micropython BUILD=/path/to/build

ifeq ($(PBTOP),)
$(error PBTOP must point at a pybricks-micropython checkout)
endif

PBIO_PLATFORM = wasm_hub
WASM_DIR := $(abspath .)

include $(PBTOP)/micropython/py/mkenv.mk

CC = emcc
LD = emcc
CPP = emcc -E
SIZE = true

USER_C_MODULES = $(PBTOP)

QSTR_DEFS = $(PBTOP)/bricks/_common/qstrdefs.h
QSTR_GLOBAL_DEPENDENCIES = $(PBTOP)/bricks/_common/mpconfigport.h
MICROPY_ROM_TEXT_COMPRESSION = 1

include $(TOP)/py/py.mk
include $(TOP)/extmod/extmod.mk

# See bricks/_common/common.mk: VfsRom is referenced for in-place bytecode
# but never registered.
UNUSED_EXTMOD_SRC_C = extmod/vfs_rom.c extmod/vfs_rom_file.c
PY_O := $(filter-out $(addprefix $(BUILD)/,$(UNUSED_EXTMOD_SRC_C:.c=.o)), $(PY_O))
SRC_QSTR := $(filter-out $(UNUSED_EXTMOD_SRC_C), $(SRC_QSTR))

# This directory first, so its mpconfigport.h and platform headers win.
INC += -I.
INC += -I$(WASM_DIR)/platform
INC += -I$(WASM_DIR)/compat
INC += -I$(TOP)
INC += -I$(PBTOP)/lib/lego
INC += -I$(PBTOP)/lib/lwrb/src/include
INC += -I$(PBTOP)/lib/pbio/include
INC += -I$(PBTOP)/lib/pbio
INC += -I$(PBTOP)/bricks/virtualhub
INC += -I$(PBTOP)
INC += -I$(BUILD)

CFLAGS += $(INC) -Wall -Werror -Wno-default-const-init-var-unsafe -Wno-uninitialized-const-pointer -Wno-int-in-bool-context -Wno-gnu-variable-sized-type-not-at-end -std=gnu99 -D_GNU_SOURCE
CFLAGS += -Os -DNDEBUG -fdata-sections -ffunction-sections
# MicroPython's lib/libm is not used: emscripten's libc (musl) provides libm.

include $(PBTOP)/bricks/_common/sources.mk

# Every source that is not permissively licensed is dropped here rather than
# relied on to compile to nothing: the NXT/EV3-only drivers under GPL-2.0-only
# or MPL-1.0, and the EV3 battery temperature model (GPL-2.0-only, lms2012).
# build-pybricks-wasm.sh then re-checks the SPDX tag of every file the
# compiler actually read, from the dependency files.
NON_PERMISSIVE_SRC = $(addprefix lib/pbio/,\
	drv/clock/clock_ev3.c \
	drv/clock/clock_nxt.c \
	drv/counter/counter_ev3.c \
	drv/display/display_nxt.c \
	drv/motor_driver/motor_driver_ev3.c \
	drv/rproc/rproc_nxt.c \
	drv/rproc/rproc_nxt_twi.c \
	drv/sound/sound_nxt.c \
	drv/usb/usb_nxt.c \
	sys/battery_temp.c \
	)

# Hardware drivers: none of them apply, the wasm HAL replaces them. Keep only
# the hardware-independent driver cores that the HAL plugs into.
PBIO_DRV_KEEP = $(addprefix lib/pbio/drv/,\
	battery/battery_test.c \
	core.c \
	ioport/ioport.c \
	led/led_array.c \
	led/led_array_pwm.c \
	led/led_core.c \
	led/led_pwm.c \
	pwm/pwm_core.c \
	usb/usb.c \
	)
PBIO_SRC_C := $(filter-out $(NON_PERMISSIVE_SRC) lib/pbio/platform/%,$(PBIO_SRC_C))
PBIO_SRC_C := $(filter-out lib/pbio/drv/%,$(PBIO_SRC_C)) $(PBIO_DRV_KEEP)

WASM_SRC_C = \
	platform/platform.c \
	hal/block_device_wasm.c \
	hal/button_wasm.c \
	hal/clock_wasm.c \
	hal/imu_wasm.c \
	hal/motor_sim.c \
	hal/pwm_wasm.c \
	hal/sound_wasm.c \
	hal/uart_lump_sim.c \
	hal/usb_wasm.c \
	wasm_main.c \

PY_EXTRA_SRC_C = $(addprefix shared/,\
	runtime/interrupt_char.c \
	runtime/pyexec.c \
	runtime/stdout_helpers.c \
	runtime/sys_stdio_mphal.c \
	readline/readline.c \
	)
PY_EXTRA_SRC_C += $(addprefix bricks/_common/,\
	micropython.c \
	mphalport.c \
	)

OBJ = $(PY_O)
OBJ += $(addprefix $(BUILD)/, $(PY_EXTRA_SRC_C:.c=.o))
OBJ += $(addprefix $(BUILD)/, $(PYBRICKS_PYBRICKS_SRC_C:.c=.o))
OBJ += $(addprefix $(BUILD)/, $(LWRB_SRC_C:.c=.o))
OBJ += $(addprefix $(BUILD)/, $(PBIO_SRC_C:.c=.o))
OBJ += $(addprefix $(BUILD)/, $(LEGO_SPEC_SRC_C:.c=.o))
OBJ += $(addprefix $(BUILD)/, $(WASM_SRC_C:.c=.o))

SRC_QSTR += $(PY_EXTRA_SRC_C) $(PYBRICKS_PYBRICKS_SRC_C) $(WASM_SRC_C)
SRC_QSTR_AUTO_DEPS +=

# Firmware identity, as common.mk derives it.
PYBRICKS_GIT_HASH := $(shell cd $(PBTOP) && git rev-parse --short HEAD)
export MICROPY_GIT_TAG := $(shell cd $(PBTOP) && git describe --tags --always --exclude "@pybricks/*")
export MICROPY_GIT_HASH := $(PYBRICKS_GIT_HASH)

$(BUILD)/pbio_version_hash.h: FORCE
	$(Q)$(MKDIR) -p $(dir $@)
	$(Q)echo '#define PBIO_VERSION_HASH "$(PYBRICKS_GIT_HASH)"' > $@.tmp
	$(Q)if cmp -s $@.tmp $@ 2>/dev/null; then rm $@.tmp; else mv $@.tmp $@; fi

$(OBJ): | $(BUILD)/pbio_version_hash.h

# Emscripten link: Asyncify lets the simulated hub yield to the page from
# deep inside MicroPython (waits, busy loops) and lets the GC spill locals.
EXPORTED_FUNCTIONS := _malloc
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_free
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_boot
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_run
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_idle
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_request_stop
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_is_running
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_set_realtime
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_now_ms
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_port_set_device
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_port_device
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_motor_angle
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_motor_speed
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_motor_voltage
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_motor_set_angle
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_motor_load
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_device_is_synced_js
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_device_mode
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_device_light
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_sensor_set_rgb
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_sensor_set_ambient
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_sensor_set_distance
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_sensor_set_force
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_matrix_pixel
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_pwm_duty
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_output_generation
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_set_buttons
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_imu_set_orientation
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_beep_frequency
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_beep_count
EXPORTED_FUNCTIONS := $(EXPORTED_FUNCTIONS),_pbw_stdin_write

LDFLAGS += -Os --no-entry \
	-sMODULARIZE=1 -sEXPORT_NAME=createPybricksHub -sEXPORT_ES6=0 \
	-sENVIRONMENT=web,worker,node \
	-sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=65536 \
	-sSTACK_SIZE=262144 -sINITIAL_MEMORY=4194304 -sALLOW_MEMORY_GROWTH=0 \
	-sEXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) \
	-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPU8,UTF8ToString,stringToNewUTF8 \
	-sFILESYSTEM=0 -sSUPPORT_LONGJMP=emscripten

all: $(BUILD)/pybricks-hub.js

$(BUILD)/pybricks-hub.js: $(OBJ)
	$(ECHO) "LINK $@"
	$(Q)$(LD) $(CFLAGS) $(LDFLAGS) -o $@ $(OBJ) -lm

include $(TOP)/py/mkrules.mk

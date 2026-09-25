// SPDX-License-Identifier: MIT
// Copyright (c) 2019-2023 The Pybricks Authors
// Copyright (c) 2026 Brickwright contributors

// MicroPython/Pybricks configuration for the Brickwright wasm hub: the
// primehub module set, minus everything that needs a radio.

#include <stdint.h>
#include <pbdrv/config.h>

#define MICROPY_HW_BOARD_NAME                   "SPIKE Prime Hub (Brickwright wasm simulation)"
#define MICROPY_HW_MCU_NAME                     "WebAssembly"

#define PYBRICKS_HUB_NAME                       "primehub"
#define PYBRICKS_HUB_CLASS_NAME                 (MP_QSTR_PrimeHub)
#define PYBRICKS_HUB_CLASS_NAME_ALIAS           (MP_QSTR_InventorHub)

#define PYBRICKS_HUB_PRIMEHUB                   (1)

// Pybricks modules
#define PYBRICKS_PY_COMMON                      (1)
#define PYBRICKS_PY_COMMON_CHARGER              (1)
#define PYBRICKS_PY_COMMON_COLOR_LIGHT          (1)
#define PYBRICKS_PY_COMMON_CONTROL              (1)
#define PYBRICKS_PY_COMMON_IMU                  (1)
#define PYBRICKS_PY_COMMON_KEYPAD               (1)
#define PYBRICKS_PY_COMMON_KEYPAD_HUB_BUTTONS   (4)
#define PYBRICKS_PY_COMMON_LIGHT_ARRAY          (1)
#define PYBRICKS_PY_COMMON_LIGHT_MATRIX         (1)
#define PYBRICKS_PY_COMMON_LOGGER               (1)
#define PYBRICKS_PY_COMMON_MOTOR_MODEL          (1)
#define PYBRICKS_PY_COMMON_MOTORS               (1)
#define PYBRICKS_PY_COMMON_SPEAKER              (1)
#define PYBRICKS_PY_COMMON_SYSTEM               (1)
#define PYBRICKS_PY_EV3DEVICES                  (0)
#define PYBRICKS_PY_EXPERIMENTAL                (1)
#define PYBRICKS_PY_HUBS                        (1)
#define PYBRICKS_PY_IODEVICES                   (1)
#define PYBRICKS_PY_IODEVICES_ANALOG_SENSOR     (0)
#define PYBRICKS_PY_IODEVICES_DC_MOTOR          (0)
#define PYBRICKS_PY_IODEVICES_I2C_DEVICE        (0)
#define PYBRICKS_PY_IODEVICES_LUMP_DEVICE       (0)
#define PYBRICKS_PY_IODEVICES_LWP3_DEVICE       (0)
#define PYBRICKS_PY_IODEVICES_PUP_DEVICE        (1)
#define PYBRICKS_PY_IODEVICES_UART_DEVICE       (0)
#define PYBRICKS_PY_IODEVICES_XBOX_CONTROLLER   (0)
#define PYBRICKS_PY_MEDIA_IMAGE                 (0)
#define PYBRICKS_PY_MESSAGING                   (0)
#define PYBRICKS_PY_MESSAGING_APP_DATA          (0)
#define PYBRICKS_PY_MESSAGING_RFCOMM            (0)
#define PYBRICKS_PY_MESSAGING_BLE_RADIO         (0)
#define PYBRICKS_PY_MESSAGING_BLE_RADIO_OLD     (0)
#define PYBRICKS_PY_NXTDEVICES                  (0)
#define PYBRICKS_PY_PARAMETERS                  (1)
#define PYBRICKS_PY_PARAMETERS_BUTTON           (1)
#define PYBRICKS_PY_PARAMETERS_ICON             (1)
#define PYBRICKS_PY_DEVICES                     (1)
#define PYBRICKS_PY_PUPDEVICES                  (1)
#define PYBRICKS_PY_PUPDEVICES_DUPLO_TRAIN      (0)
#define PYBRICKS_PY_PUPDEVICES_MARIO            (0)
#define PYBRICKS_PY_PUPDEVICES_REMOTE           (0)
#define PYBRICKS_PY_PUPDEVICES_TECHNIC_MOVE_HUB (0)
#define PYBRICKS_PY_ROBOTICS                    (1)
#define PYBRICKS_PY_ROBOTICS_DRIVEBASE_GYRO     (1)
#define PYBRICKS_PY_ROBOTICS_DRIVEBASE_SPIKE    (1)
#define PYBRICKS_PY_TOOLS                       (1)
#define PYBRICKS_PY_TOOLS_HUB_MENU              (0)

// Pybricks options
#define PYBRICKS_OPT_COMPILER                   (1)
#define PYBRICKS_OPT_USE_STACK_END_AS_TOP       (0)
#define PYBRICKS_OPT_RAW_REPL                   (0)
#define PYBRICKS_OPT_FLOAT                      (1)
#define PYBRICKS_OPT_TERSE_ERR                  (0)
#define PYBRICKS_OPT_EXTRA_LEVEL1               (1)
#define PYBRICKS_OPT_EXTRA_LEVEL2               (1)
#define PYBRICKS_OPT_CUSTOM_IMPORT              (1)
#define PYBRICKS_OPT_NATIVE_MOD                 (0)

// The simulated hub has no 1 ms timer interrupt. Blocking user loops that
// never wait still have to let pbio processes run and let the page breathe,
// so the VM hook calls into the wasm clock (hal/clock_wasm.c).
#define PYBRICKS_VM_HOOK_LOOP_EXTRA \
    do { \
        extern void pbw_vm_hook(void); \
        pbw_vm_hook(); \
    } while (0);

#define MICROPY_USE_INTERNAL_PRINTF             (0)

#include <bricks/_common/mpconfigport.h>

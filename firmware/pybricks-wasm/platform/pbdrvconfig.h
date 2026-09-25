// SPDX-License-Identifier: MIT
// Copyright (c) 2022-2025 The Pybricks Authors
// Copyright (c) 2026 Brickwright contributors
//
// Driver configuration for the Brickwright browser build of the Pybricks
// MicroPython firmware ("wasm hub"). Modelled on Pybricks' own virtual_hub
// and prime_hub configurations. Every driver below is either a Pybricks
// hardware-independent driver or one of the wasm HAL drivers in ../hal/.
// There is no Bluetooth stack and no vendor HAL in this build.

#define PBDRV_CONFIG_BATTERY                                (1)
#define PBDRV_CONFIG_BATTERY_TEST                           (1)

#define PBDRV_CONFIG_BLOCK_DEVICE                           (1)
#define PBDRV_CONFIG_BLOCK_DEVICE_RAM_SIZE                  (50 * 1024)


#define PBDRV_CONFIG_BUTTON                                 (1)

#define PBDRV_CONFIG_CLOCK                                  (1)

#define PBDRV_CONFIG_HUB_KIND                               (PBIO_PYBRICKS_HUB_KIND_PRIME)

#define PBDRV_CONFIG_IMU                                    (1)

#define PBDRV_CONFIG_IOPORT                                 (1)
#define PBDRV_CONFIG_IOPORT_HAS_ADC                         (0)
#define PBDRV_CONFIG_IOPORT_HAS_UART                        (0)
#define PBDRV_CONFIG_IOPORT_NUM_DEV                         (6)

#define PBDRV_CONFIG_LED                                    (1)
#define PBDRV_CONFIG_LED_NUM_DEV                            (1)
#define PBDRV_CONFIG_LED_PWM                                (1)
#define PBDRV_CONFIG_LED_PWM_NUM_DEV                        (1)

#define PBDRV_CONFIG_LED_ARRAY                              (1)
#define PBDRV_CONFIG_LED_ARRAY_NUM_DEV                      (1)
#define PBDRV_CONFIG_LED_ARRAY_PWM                          (1)
#define PBDRV_CONFIG_LED_ARRAY_PWM_NUM_DEV                  (1)

#define PBDRV_CONFIG_MOTOR_DRIVER                           (1)
#define PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV                   (6)

// The PWM "test" init hook is the only extension point pwm_core.c offers; the
// wasm HAL's pwm driver (hal/pwm_wasm.c) implements it. Nothing from
// pwm_test.c is compiled.
#define PBDRV_CONFIG_PWM                                    (1)
#define PBDRV_CONFIG_PWM_NUM_DEV                            (2)
#define PBDRV_CONFIG_PWM_TEST                               (1)

#define PBDRV_CONFIG_SOUND                                  (1)
#define PBDRV_CONFIG_SOUND_DEFAULT_VOLUME                   (100)

#define PBDRV_CONFIG_UART                                   (1)

#define PBDRV_CONFIG_USB                                    (1)
#define PBDRV_CONFIG_USB_MAX_PACKET_SIZE                    (64)
#define PBDRV_CONFIG_USB_NUM_BUFFERED_PACKETS               (2)
#define PBDRV_CONFIG_USB_MFG_STR                            u"Pybricks"
#define PBDRV_CONFIG_USB_PROD_STR                           u"Brickwright wasm hub"

#define PBDRV_CONFIG_HAS_PORT_A (1)
#define PBDRV_CONFIG_HAS_PORT_B (1)
#define PBDRV_CONFIG_HAS_PORT_C (1)
#define PBDRV_CONFIG_HAS_PORT_D (1)
#define PBDRV_CONFIG_HAS_PORT_E (1)
#define PBDRV_CONFIG_HAS_PORT_F (1)

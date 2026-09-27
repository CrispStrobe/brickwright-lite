// SPDX-License-Identifier: MIT
// Copyright (c) 2019-2025 The Pybricks Authors
// Copyright (c) 2026 Brickwright contributors

// Platform data for the Brickwright wasm hub: six LEGO ports A-F, a 5x5 light
// matrix and one RGB status light, all backed by the wasm HAL in ../hal/.

#include <pbdrv/config.h>
#include <pbdrv/ioport.h>
#include <pbio/port.h>
#include <pbio/port_interface.h>

#include <pbdrv/../../drv/led/led_array_pwm.h>
#include <pbdrv/../../drv/led/led_pwm.h>

// Every port is a LEGO port whose device speaks the LEGO UART Messaging
// Protocol (LUMP). UART index N is port N's simulated device (hal/uart_lump_sim.c).
#define WASM_PORT(ID, INDEX) { \
        .port_id = ID, \
        .motor_driver_index = INDEX, \
        .counter_driver_index = PBDRV_IOPORT_INDEX_NOT_AVAILABLE, \
        .external_port_index = INDEX, \
        .i2c_driver_index = PBDRV_IOPORT_INDEX_NOT_AVAILABLE, \
        .uart_driver_index = INDEX, \
        .pins = NULL, \
        .supported_modes = PBIO_PORT_MODE_LEGO_DCM, \
}

const pbdrv_ioport_platform_data_t pbdrv_ioport_platform_data[PBDRV_CONFIG_IOPORT_NUM_DEV] = {
    WASM_PORT(PBIO_PORT_ID_A, 0),
    WASM_PORT(PBIO_PORT_ID_B, 1),
    WASM_PORT(PBIO_PORT_ID_C, 2),
    WASM_PORT(PBIO_PORT_ID_D, 3),
    WASM_PORT(PBIO_PORT_ID_E, 4),
    WASM_PORT(PBIO_PORT_ID_F, 5),
};

// PWM device 0: the light matrix, channel = row * 5 + column.
// PWM device 1: the RGB status light, channels 0/1/2 = red/green/blue.
const pbdrv_led_array_pwm_platform_data_t pbdrv_led_array_pwm_platform_data[PBDRV_CONFIG_LED_ARRAY_PWM_NUM_DEV] = {
    {
        .pwm_chs = (const uint8_t[]) {
            0, 1, 2, 3, 4,
            5, 6, 7, 8, 9,
            10, 11, 12, 13, 14,
            15, 16, 17, 18, 19,
            20, 21, 22, 23, 24,
        },
        .num_pwm_chs = 25,
        .pwm_id = 0,
        .id = 0,
    },
};

// Neutral colour correction so the page sees the requested colour.
static const pbdrv_led_pwm_platform_color_t pbdrv_led_pwm_color = {
    .r_factor = 1000,
    .g_factor = 1000,
    .b_factor = 1000,
    .r_brightness = 1000,
    .g_brightness = 1000,
    .b_brightness = 1000,
};

const pbdrv_led_pwm_platform_data_t pbdrv_led_pwm_platform_data[PBDRV_CONFIG_LED_PWM_NUM_DEV] = {
    {
        .color = &pbdrv_led_pwm_color,
        .id = 0,
        .r_id = 1,
        .r_ch = 0,
        .g_id = 1,
        .g_ch = 1,
        .b_id = 1,
        .b_ch = 2,
        .scale_factor = 1,
    },
};

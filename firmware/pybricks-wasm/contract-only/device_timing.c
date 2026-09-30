/* SPDX-License-Identifier: BSD-3-Clause
 * Copyright (c) 2026 Brickwright contributors
 */
#include <stdint.h>
#include <lego/device.h>

/* Required settling times in milliseconds after selecting a sensor mode. */
uint32_t lego_device_stale_data_delay(lego_device_type_id_t id, uint8_t mode) {
    switch (id) {
        case LEGO_DEVICE_TYPE_ID_COLOR_DIST_SENSOR:
            return mode == LEGO_DEVICE_MODE_PUP_COLOR_DISTANCE_SENSOR__IR_TX ? 0 : 30;
        case LEGO_DEVICE_TYPE_ID_SPIKE_COLOR_SENSOR:
            return mode == LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__LIGHT ? 0 : 30;
        case LEGO_DEVICE_TYPE_ID_SPIKE_ULTRASONIC_SENSOR:
            return mode == LEGO_DEVICE_MODE_PUP_ULTRASONIC_SENSOR__LIGHT ? 0 : 50;
        case LEGO_DEVICE_TYPE_ID_EV3_COLOR_SENSOR:
            return 30;
        case LEGO_DEVICE_TYPE_ID_EV3_IR_SENSOR:
            return 1100;
        case LEGO_DEVICE_TYPE_ID_NXT_LIGHT_SENSOR:
            return 20;
        case LEGO_DEVICE_TYPE_ID_NXT_SOUND_SENSOR:
            return 300;
        case LEGO_DEVICE_TYPE_ID_NXT_ENERGY_METER:
            return 200;
        default:
            return 0;
    }
}

/* Required delay in milliseconds after sending sensor data. */
uint32_t lego_device_data_set_delay(lego_device_type_id_t id, uint8_t mode) {
    return id == LEGO_DEVICE_TYPE_ID_COLOR_DIST_SENSOR &&
        mode == LEGO_DEVICE_MODE_PUP_COLOR_DISTANCE_SENSOR__IR_TX ? 250 : 10;
}

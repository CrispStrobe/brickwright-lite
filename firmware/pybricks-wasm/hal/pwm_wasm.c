// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// PWM outputs of the Brickwright wasm hub, read by the page.
// Device 0: 25 light matrix pixels. Device 1: RGB status light.
// Pybricks' own led_array_pwm / led_pwm drivers sit on top, unchanged.
//
// pwm_core.c initializes PWM drivers from a fixed list; the "test" entry
// (enabled by PBDRV_CONFIG_PWM_TEST) is implemented here.

#include <math.h>
#include <stdint.h>

#include <emscripten.h>

#include <pbdrv/config.h>
#include <pbdrv/pwm.h>
#include <pbio/error.h>

#include <pbdrv/../../drv/pwm/pwm.h>
#include <pbdrv/../../drv/pwm/pwm_test.h>

#define PBW_PWM_CHANNELS (25)

static uint32_t duty[PBDRV_CONFIG_PWM_NUM_DEV][PBW_PWM_CHANNELS];
static uint32_t generation;

typedef struct {
    int id;
} pbw_pwm_priv_t;

static pbw_pwm_priv_t priv[PBDRV_CONFIG_PWM_NUM_DEV];

static pbio_error_t pbw_pwm_set_duty(pbdrv_pwm_dev_t *dev, uint32_t ch, uint32_t value) {
    pbw_pwm_priv_t *p = dev->priv;
    if (ch >= PBW_PWM_CHANNELS) {
        return PBIO_ERROR_INVALID_ARG;
    }
    if (duty[p->id][ch] != value) {
        duty[p->id][ch] = value;
        generation++;
    }
    return PBIO_SUCCESS;
}

static const pbdrv_pwm_driver_funcs_t pbw_pwm_funcs = {
    .set_duty = pbw_pwm_set_duty,
};

void pbdrv_pwm_test_init(pbdrv_pwm_dev_t *devs) {
    for (int i = 0; i < PBDRV_CONFIG_PWM_NUM_DEV; i++) {
        priv[i].id = i;
        devs[i].priv = &priv[i];
        devs[i].funcs = &pbw_pwm_funcs;
    }
}

// Raw duty cycle (0..65535) of a channel.
EMSCRIPTEN_KEEPALIVE
uint32_t pbw_pwm_duty(int dev, int ch) {
    if (dev < 0 || dev >= PBDRV_CONFIG_PWM_NUM_DEV || ch < 0 || ch >= PBW_PWM_CHANNELS) {
        return 0;
    }
    return duty[dev][ch];
}

// Light matrix pixel brightness 0..100, row-major. led_array_pwm squares the
// brightness for gamma correction; this undoes it.
EMSCRIPTEN_KEEPALIVE
int pbw_matrix_pixel(int index) {
    if (index < 0 || index >= 25) {
        return 0;
    }
    float val = duty[0][index] * 10000.0f / UINT16_MAX;
    return (int)(sqrtf(val) + 0.5f);
}

// Increments whenever any output changes, so the page can skip redraws.
EMSCRIPTEN_KEEPALIVE
uint32_t pbw_output_generation(void) {
    return generation;
}

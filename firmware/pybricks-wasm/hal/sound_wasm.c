// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Hub speaker of the Brickwright wasm hub: beeps are forwarded to the page.

#include <stdint.h>

#include <emscripten.h>

#include <pbdrv/config.h>
#include <pbdrv/sound.h>

static uint32_t beep_frequency;
static uint32_t beep_count;

EM_JS(void, pbw_js_beep, (uint32_t frequency, uint32_t attenuator), {
    if (Module.pbwOnBeep) {
        Module.pbwOnBeep(frequency, attenuator);
    }
});

void pbdrv_beep_start(uint32_t frequency, uint16_t sample_attenuator) {
    beep_frequency = frequency;
    beep_count++;
    pbw_js_beep(frequency, sample_attenuator);
}

void pbdrv_sound_stop(void) {
    beep_frequency = 0;
    pbw_js_beep(0, 0);
}

void pbdrv_sound_init(void) {
}

EMSCRIPTEN_KEEPALIVE
uint32_t pbw_beep_frequency(void) {
    return beep_frequency;
}

EMSCRIPTEN_KEEPALIVE
uint32_t pbw_beep_count(void) {
    return beep_count;
}

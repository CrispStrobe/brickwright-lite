// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Hub buttons of the Brickwright wasm hub, pressed from the page.

#include <emscripten.h>

#include <pbdrv/config.h>
#include <pbio/button.h>

static pbio_button_flags_t pressed;

pbio_button_flags_t pbdrv_button_get_pressed(void) {
    return pressed;
}

void pbdrv_button_init(void) {
}

// Bit flags as pbio_button_flags_t: LEFT 1<<4, CENTER 1<<5, RIGHT 1<<6,
// RIGHT_UP (Bluetooth button) 1<<9.
EMSCRIPTEN_KEEPALIVE
void pbw_set_buttons(int flags) {
    pressed = (pbio_button_flags_t)flags;
}

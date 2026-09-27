// SPDX-License-Identifier: MIT
// Copyright (c) 2025 The Pybricks Authors
// Copyright (c) 2026 Brickwright contributors

// The "USB" link of the Brickwright wasm hub: the page is the connected host.
// Follows Pybricks' drv/usb/usb_simulation.c (MIT): stdout events go to the
// page instead of the process's stdout, and stdin comes from the page.

#include <stdint.h>
#include <string.h>

#include <emscripten.h>

#include <pbdrv/config.h>
#include <pbdrv/usb.h>
#include <pbdrv/../../drv/usb/usb.h>

#include <pbio/error.h>
#include <pbio/os.h>
#include <pbio/protocol.h>

EM_JS(void, pbw_js_stdout, (const uint8_t *data, uint32_t size), {
    if (Module.pbwOnStdout) {
        Module.pbwOnStdout(HEAPU8.slice(data, data + size));
    }
});

pbio_error_t pbdrv_usb_wait_until_configured(pbio_os_state_t *state) {
    return PBIO_ERROR_NOT_SUPPORTED;
}

bool pbdrv_usb_is_ready(void) {
    return true;
}

pbdrv_usb_bcd_t pbdrv_usb_get_bcd(void) {
    return PBDRV_USB_BCD_NONE;
}

pbio_error_t pbdrv_usb_tx_event(pbio_os_state_t *state, const uint8_t *data, uint32_t size) {
    if (size > 2 && data[0] == PBIO_PYBRICKS_IN_EP_MSG_EVENT && data[1] == PBIO_PYBRICKS_EVENT_WRITE_STDOUT) {
        pbw_js_stdout(data + 2, size - 2);
    }
    return PBIO_SUCCESS;
}

pbio_error_t pbdrv_usb_tx_response(pbio_os_state_t *state, pbio_pybricks_error_t code) {
    return PBIO_SUCCESS;
}

pbio_error_t pbdrv_usb_tx_reset(pbio_os_state_t *state) {
    return PBIO_SUCCESS;
}

static uint8_t usb_in_buf[PBDRV_CONFIG_USB_MAX_PACKET_SIZE];
static uint32_t usb_in_size;

uint32_t pbdrv_usb_get_data_and_start_receive(uint8_t *data) {
    if (usb_in_size == 0 || usb_in_size > PBDRV_CONFIG_USB_MAX_PACKET_SIZE) {
        usb_in_size = 0;
        return 0;
    }
    uint32_t size = usb_in_size;
    memcpy(data, usb_in_buf, size);
    usb_in_size = 0;
    return size;
}

void pbdrv_usb_init_device(void) {
    // The page subscribes to events (stdout) as soon as the hub starts.
    usb_in_buf[0] = PBIO_PYBRICKS_OUT_EP_MSG_SUBSCRIBE;
    usb_in_buf[1] = 1;
    usb_in_size = 2;
}

void pbdrv_usb_deinit_device(void) {
}

// Queues stdin bytes from the page. Returns how many were accepted; the page
// retries the rest later.
EMSCRIPTEN_KEEPALIVE
int pbw_stdin_write(const uint8_t *data, int size) {
    if (usb_in_size) {
        return 0;
    }
    int n = size < PBDRV_CONFIG_USB_MAX_PACKET_SIZE - 2 ? size : PBDRV_CONFIG_USB_MAX_PACKET_SIZE - 2;
    usb_in_buf[0] = PBIO_PYBRICKS_OUT_EP_MSG_COMMAND;
    usb_in_buf[1] = PBIO_PYBRICKS_COMMAND_WRITE_STDIN;
    memcpy(&usb_in_buf[2], data, n);
    usb_in_size = 2 + n;
    pbio_os_request_poll();
    return n;
}

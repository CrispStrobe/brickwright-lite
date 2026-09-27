// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Simulated LEGO devices on the six ports of the Brickwright wasm hub.
//
// Each port's UART is connected to a small simulated device that speaks the
// LEGO UART Messaging Protocol (LUMP) from the *device* side: it answers the
// hub's SPEED probe, sends TYPE / MODES / SPEED / per-mode INFO and ACK, then
// streams DATA messages for the selected mode and obeys SELECT and data
// writes. Pybricks' own, unmodified LUMP driver (lib/pbio/src/port_lump.c)
// parses all of it, exactly as it would parse a real sensor. Nothing below
// the UART is faked.
//
// Device values (colour, distance, force) are set by the page through the
// exported pbw_sensor_* functions. Motor angles come from motor_sim.c.

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include <emscripten.h>

#include <pbdrv/config.h>
#include <pbdrv/uart.h>
#include <pbio/os.h>
#include <pbio/util.h>

#include <lego/device.h>
#include <lego/lump.h>

#include "wasm_hub.h"

#define RB_SIZE (1024)

// How long the simulated device takes to answer the hub's SPEED probe.
#define DEVICE_ANSWER_DELAY_MS  (2)
#define MOTOR_DATA_INTERVAL_MS  (2)
#define SENSOR_DATA_INTERVAL_MS (10)

typedef struct {
    const char *name;
    uint8_t num_values;
    uint8_t data_type;
    bool writable;
} mode_desc_t;

typedef struct {
    uint8_t type_id;
    uint8_t flags0;
    uint8_t num_modes;
    const mode_desc_t *modes;
    uint32_t interval;
} device_desc_t;

static const mode_desc_t motor_modes[] = {
    { "POWER", 1, LUMP_DATA_TYPE_DATA8, true },
    { "SPEED", 1, LUMP_DATA_TYPE_DATA8, false },
    { "POS", 1, LUMP_DATA_TYPE_DATA32, false },
    { "APOS", 1, LUMP_DATA_TYPE_DATA16, false },
    { "CALIB", 2, LUMP_DATA_TYPE_DATA16, false },
    { "STATS", 5, LUMP_DATA_TYPE_DATA16, false },
};

static const mode_desc_t color_modes[] = {
    { "COLOR", 1, LUMP_DATA_TYPE_DATA8, false },
    { "REFLT", 1, LUMP_DATA_TYPE_DATA8, false },
    { "AMBI", 1, LUMP_DATA_TYPE_DATA8, false },
    { "LIGHT", 3, LUMP_DATA_TYPE_DATA8, true },
    { "RREFL", 2, LUMP_DATA_TYPE_DATA16, false },
    { "RGB I", 4, LUMP_DATA_TYPE_DATA16, false },
    { "HSV", 3, LUMP_DATA_TYPE_DATA16, false },
    { "SHSV", 4, LUMP_DATA_TYPE_DATA16, false },
};

static const mode_desc_t ultrasonic_modes[] = {
    { "DISTL", 1, LUMP_DATA_TYPE_DATA16, false },
    { "DISTS", 1, LUMP_DATA_TYPE_DATA16, false },
    { "SINGL", 1, LUMP_DATA_TYPE_DATA16, false },
    { "LISTN", 1, LUMP_DATA_TYPE_DATA8, false },
    { "TRAW", 1, LUMP_DATA_TYPE_DATA32, false },
    { "LIGHT", 4, LUMP_DATA_TYPE_DATA8, true },
    { "PING", 1, LUMP_DATA_TYPE_DATA8, false },
    { "ADRAW", 1, LUMP_DATA_TYPE_DATA16, false },
};

static const mode_desc_t force_modes[] = {
    { "FORCE", 1, LUMP_DATA_TYPE_DATA8, false },
    { "TOUCH", 1, LUMP_DATA_TYPE_DATA8, false },
    { "TAP", 1, LUMP_DATA_TYPE_DATA8, false },
    { "FPEAK", 1, LUMP_DATA_TYPE_DATA8, false },
    { "FRAW", 1, LUMP_DATA_TYPE_DATA16, false },
    { "FPRAW", 1, LUMP_DATA_TYPE_DATA16, false },
    { "CALIB", 8, LUMP_DATA_TYPE_DATA16, false },
};

#define MOTOR_FLAGS0 (LUMP_MODE_FLAGS0_MOTOR_SPEED | LUMP_MODE_FLAGS0_MOTOR_ABS_POS | \
    LUMP_MODE_FLAGS0_MOTOR_REL_POS | LUMP_MODE_FLAGS0_MOTOR_POWER | LUMP_MODE_FLAGS0_MOTOR)

#define DEVICE(ID, FLAGS, MODES, INTERVAL) \
    { ID, FLAGS, PBIO_ARRAY_SIZE(MODES), MODES, INTERVAL }

static const device_desc_t devices[] = {
    DEVICE(LEGO_DEVICE_TYPE_ID_SPIKE_S_MOTOR, MOTOR_FLAGS0, motor_modes, MOTOR_DATA_INTERVAL_MS),
    DEVICE(LEGO_DEVICE_TYPE_ID_SPIKE_M_MOTOR, MOTOR_FLAGS0, motor_modes, MOTOR_DATA_INTERVAL_MS),
    DEVICE(LEGO_DEVICE_TYPE_ID_SPIKE_L_MOTOR, MOTOR_FLAGS0, motor_modes, MOTOR_DATA_INTERVAL_MS),
    DEVICE(LEGO_DEVICE_TYPE_ID_TECHNIC_M_ANGULAR_MOTOR, MOTOR_FLAGS0, motor_modes, MOTOR_DATA_INTERVAL_MS),
    DEVICE(LEGO_DEVICE_TYPE_ID_TECHNIC_L_ANGULAR_MOTOR, MOTOR_FLAGS0, motor_modes, MOTOR_DATA_INTERVAL_MS),
    DEVICE(LEGO_DEVICE_TYPE_ID_SPIKE_COLOR_SENSOR, 0, color_modes, SENSOR_DATA_INTERVAL_MS),
    DEVICE(LEGO_DEVICE_TYPE_ID_SPIKE_ULTRASONIC_SENSOR, 0, ultrasonic_modes, SENSOR_DATA_INTERVAL_MS),
    DEVICE(LEGO_DEVICE_TYPE_ID_SPIKE_FORCE_SENSOR, 0, force_modes, SENSOR_DATA_INTERVAL_MS),
};

// Force sensor calibration the simulated sensor reports (CALIB mode). Only
// the ratios matter: Pybricks converts raw readings with these very numbers.
#define FORCE_RAW_OFFSET    (0)
#define FORCE_RAW_RELEASED  (384)
#define FORCE_RAW_END       (1664)

typedef enum {
    DEV_SILENT,       // No device, or waiting for the hub's SPEED probe.
    DEV_ANSWER_DUE,   // Probe seen; will answer at answer_time.
    DEV_WAIT_ACK,     // Sent INFO and ACK, waiting for the hub's ACK.
    DEV_DATA,         // Streaming data.
} dev_state_t;

struct _pbdrv_uart_dev_t {
    // Device-to-hub byte stream (what the hub reads).
    uint8_t rb[RB_SIZE];
    uint32_t rb_head;
    uint32_t rb_tail;
    // Hub-to-device parser.
    uint8_t rx[LUMP_MAX_MSG_SIZE + 8];
    uint8_t rx_len;
    uint8_t rx_need;
    uint8_t ext_mode;
    // Timer of the protothread currently reading.
    pbio_os_timer_t read_timer;
    // Simulated device.
    const device_desc_t *desc;
    uint8_t pending_type;
    dev_state_t state;
    uint32_t answer_time;
    uint32_t next_data;
    uint8_t mode;
    uint8_t lights[4];
    uint32_t baud;
    // Page-controlled sensor values.
    uint8_t rgb[3];
    uint8_t ambient;
    int16_t distance_mm;
    int32_t force_mn;
};

static pbdrv_uart_dev_t uarts[PBW_NUM_PORTS];

// ---------------------------------------------------------------------------
// Ring buffer helpers

static uint32_t rb_count(pbdrv_uart_dev_t *u) {
    return u->rb_head - u->rb_tail;
}

static void rb_put(pbdrv_uart_dev_t *u, const uint8_t *data, uint32_t len) {
    for (uint32_t i = 0; i < len && rb_count(u) < RB_SIZE; i++) {
        u->rb[u->rb_head++ % RB_SIZE] = data[i];
    }
    pbio_os_request_poll();
}

static void rb_clear(pbdrv_uart_dev_t *u) {
    u->rb_tail = u->rb_head;
}

// ---------------------------------------------------------------------------
// LUMP message encoding (device side)

static uint8_t size_code(uint8_t len, uint8_t *padded) {
    if (len <= 1) {
        *padded = 1;
        return LUMP_MSG_SIZE_1;
    }
    if (len <= 2) {
        *padded = 2;
        return LUMP_MSG_SIZE_2;
    }
    if (len <= 4) {
        *padded = 4;
        return LUMP_MSG_SIZE_4;
    }
    if (len <= 8) {
        *padded = 8;
        return LUMP_MSG_SIZE_8;
    }
    if (len <= 16) {
        *padded = 16;
        return LUMP_MSG_SIZE_16;
    }
    *padded = 32;
    return LUMP_MSG_SIZE_32;
}

// Sends one message: header, [info command], payload padded to a power of
// two, checksum.
static void send_msg(pbdrv_uart_dev_t *u, uint8_t type, uint8_t cmd, int info_cmd, const uint8_t *payload, uint8_t len) {
    uint8_t msg[3 + LUMP_MAX_MSG_SIZE];
    uint8_t padded;
    uint8_t n = 0;
    msg[n++] = type | size_code(len, &padded) | (cmd & LUMP_MSG_CMD_MASK);
    if (info_cmd >= 0) {
        msg[n++] = (uint8_t)info_cmd;
    }
    memset(&msg[n], 0, padded);
    memcpy(&msg[n], payload, len);
    n += padded;
    uint8_t checksum = 0xff;
    for (uint8_t i = 0; i < n; i++) {
        checksum ^= msg[i];
    }
    msg[n++] = checksum;
    rb_put(u, msg, n);
}

static void send_sys(pbdrv_uart_dev_t *u, uint8_t sys) {
    rb_put(u, &sys, 1);
}

static void send_handshake(pbdrv_uart_dev_t *u) {
    const device_desc_t *d = u->desc;

    // TYPE (three bytes, no size field).
    uint8_t type_msg[3] = { LUMP_MSG_TYPE_CMD | LUMP_CMD_TYPE, d->type_id, 0 };
    type_msg[2] = 0xff ^ type_msg[0] ^ type_msg[1];
    rb_put(u, type_msg, 3);

    // MODES: highest mode index and highest view index.
    uint8_t modes[2] = { d->num_modes - 1, d->num_modes - 1 };
    send_msg(u, LUMP_MSG_TYPE_CMD, LUMP_CMD_MODES, -1, modes, 2);

    // SPEED: 115200 baud.
    uint8_t speed[4];
    pbio_set_uint32_le(speed, 115200);
    send_msg(u, LUMP_MSG_TYPE_CMD, LUMP_CMD_SPEED, -1, speed, 4);

    // Mode info, highest mode first, each ending with FORMAT.
    for (int m = d->num_modes - 1; m >= 0; m--) {
        const mode_desc_t *md = &d->modes[m];

        // NAME: five characters, a terminator and six capability flag bytes.
        uint8_t name[12] = { 0 };
        strncpy((char *)name, md->name, LUMP_MAX_SHORT_NAME_SIZE);
        name[6] = d->flags0;
        send_msg(u, LUMP_MSG_TYPE_INFO, m, LUMP_INFO_NAME, name, sizeof(name));

        // MAPPING: input and output flags; a non-zero output flag marks the
        // mode as writable.
        uint8_t mapping[2] = { 0x10, md->writable ? 0x10 : 0x00 };
        send_msg(u, LUMP_MSG_TYPE_INFO, m, LUMP_INFO_MAPPING, mapping, 2);

        // FORMAT: number of values, data type, figures, decimals.
        uint8_t format[4] = { md->num_values, md->data_type, 4, 0 };
        send_msg(u, LUMP_MSG_TYPE_INFO, m, LUMP_INFO_FORMAT, format, 4);
    }

    send_sys(u, LUMP_SYS_ACK);
}

// ---------------------------------------------------------------------------
// Device data

static void put16(uint8_t *buf, int idx, int32_t value) {
    pbio_set_uint16_le(buf + 2 * idx, (uint16_t)(int16_t)value);
}

static int32_t clamp(int32_t v, int32_t lo, int32_t hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

// Nearest LEGO colour index for the COLOR mode (the value itself is not used
// by Pybricks, which classifies RGB_I/SHSV itself).
static int8_t lego_color_index(const uint8_t *rgb) {
    int r = rgb[0], g = rgb[1], b = rgb[2];
    if (r + g + b < 60) {
        return 0; // black
    }
    if (r > 200 && g > 200 && b > 200) {
        return 10; // white
    }
    if (r >= g && r >= b) {
        return g > b * 2 && g > r / 2 ? 7 : 9; // yellow : red
    }
    if (g >= r && g >= b) {
        return 5; // green
    }
    return 3; // blue
}

static void rgb_to_hsv10(const uint8_t *rgb, int32_t *h, int32_t *s, int32_t *v) {
    int32_t r = rgb[0], g = rgb[1], b = rgb[2];
    int32_t max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    int32_t min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    int32_t delta = max - min;
    *v = max * 1000 / 255;
    *s = max ? delta * 1000 / max : 0;
    if (!delta) {
        *h = 0;
    } else if (max == r) {
        *h = (60 * (g - b) / delta + 360) % 360;
    } else if (max == g) {
        *h = 60 * (b - r) / delta + 120;
    } else {
        *h = 60 * (r - g) / delta + 240;
    }
}

static uint8_t build_data(pbdrv_uart_dev_t *u, uint8_t port, uint8_t *buf) {
    const device_desc_t *d = u->desc;
    const mode_desc_t *md = &d->modes[u->mode];
    uint8_t size = md->num_values * (md->data_type == LUMP_DATA_TYPE_DATA8 ? 1 : md->data_type == LUMP_DATA_TYPE_DATA16 ? 2 : 4);
    memset(buf, 0, size);

    if (d->modes == motor_modes) {
        double mdeg = pbw_motor_angle_mdeg(port);
        int32_t deg = (int32_t)(mdeg / 1000);
        int32_t abs_ddeg = ((int32_t)(mdeg / 100)) % 3600;
        if (abs_ddeg < 0) {
            abs_ddeg += 3600;
        }
        int32_t speed_pct = (int32_t)(pbw_motor_speed_mdeg_s(port) / 10000);
        switch (u->mode) {
            case LEGO_DEVICE_MODE_PUP_ABS_MOTOR__SPEED:
                buf[0] = (uint8_t)(int8_t)clamp(speed_pct, -100, 100);
                break;
            case LEGO_DEVICE_MODE_PUP_ABS_MOTOR__POS:
                pbio_set_uint32_le(buf, (uint32_t)deg);
                break;
            case LEGO_DEVICE_MODE_PUP_ABS_MOTOR__APOS: {
                int32_t apos = abs_ddeg / 10;
                put16(buf, 0, apos >= 180 ? apos - 360 : apos);
                break;
            }
            case LEGO_DEVICE_MODE_PUP_ABS_MOTOR__CALIB:
                put16(buf, 1, abs_ddeg);
                break;
            default:
                break;
        }
    } else if (d->modes == color_modes) {
        int32_t r = u->rgb[0] * 4, g = u->rgb[1] * 4, b = u->rgb[2] * 4;
        int32_t h, s, v;
        rgb_to_hsv10(u->rgb, &h, &s, &v);
        switch (u->mode) {
            case LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__COLOR:
                buf[0] = (uint8_t)lego_color_index(u->rgb);
                break;
            case LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__REFLT:
                buf[0] = (uint8_t)((r + g + b) * 100 / 3072);
                break;
            case LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__AMBI:
                buf[0] = u->ambient;
                break;
            case LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__RREFL:
                put16(buf, 0, (r + g + b) / 3);
                put16(buf, 1, (r + g + b) / 3);
                break;
            case LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__RGB_I:
                put16(buf, 0, r);
                put16(buf, 1, g);
                put16(buf, 2, b);
                put16(buf, 3, (r + g + b) / 3);
                break;
            case LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__HSV:
                put16(buf, 0, h);
                put16(buf, 1, s);
                put16(buf, 2, v);
                break;
            case LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__SHSV:
                // Light off: value is the ambient light level (0-10000 raw).
                put16(buf, 0, h);
                put16(buf, 1, s);
                put16(buf, 2, u->ambient * 100);
                break;
            default:
                break;
        }
    } else if (d->modes == ultrasonic_modes) {
        switch (u->mode) {
            case LEGO_DEVICE_MODE_PUP_ULTRASONIC_SENSOR__DISTL:
            case LEGO_DEVICE_MODE_PUP_ULTRASONIC_SENSOR__DISTS:
            case LEGO_DEVICE_MODE_PUP_ULTRASONIC_SENSOR__SINGL:
                put16(buf, 0, u->distance_mm);
                break;
            default:
                break;
        }
    } else if (d->modes == force_modes) {
        int32_t raw = FORCE_RAW_RELEASED + FORCE_RAW_OFFSET +
            u->force_mn * (FORCE_RAW_END - FORCE_RAW_RELEASED) / 10000;
        switch (u->mode) {
            case LEGO_DEVICE_MODE_PUP_FORCE_SENSOR__FRAW:
                put16(buf, 0, raw);
                break;
            case LEGO_DEVICE_MODE_PUP_FORCE_SENSOR__CALIB:
                put16(buf, 1, FORCE_RAW_OFFSET);
                put16(buf, 2, FORCE_RAW_RELEASED);
                put16(buf, 6, FORCE_RAW_END);
                break;
            case 0: // FORCE, in whole newtons
                buf[0] = (uint8_t)clamp(u->force_mn / 1000, 0, 10);
                break;
            case 1: // TOUCH
                buf[0] = u->force_mn > 30;
                break;
            default:
                break;
        }
    }
    return size;
}

static void send_data(pbdrv_uart_dev_t *u, uint8_t port) {
    uint8_t data[LUMP_MAX_MSG_SIZE];
    uint8_t size = build_data(u, port, data);
    // Powered Up devices prefix data with the extended-mode offset.
    uint8_t ext = u->mode > LUMP_MAX_MODE ? 8 : 0;
    send_msg(u, LUMP_MSG_TYPE_CMD, LUMP_CMD_EXT_MODE, -1, &ext, 1);
    send_msg(u, LUMP_MSG_TYPE_DATA, u->mode - ext, -1, data, size);
}

// ---------------------------------------------------------------------------
// Hub-to-device messages

static uint8_t hub_msg_size(uint8_t header) {
    if ((header & LUMP_MSG_TYPE_MASK) == LUMP_MSG_TYPE_SYS) {
        return 1;
    }
    return LUMP_MSG_SIZE(header) + 2;
}

static void handle_hub_msg(pbdrv_uart_dev_t *u, uint8_t port) {
    uint8_t header = u->rx[0];
    uint8_t type = header & LUMP_MSG_TYPE_MASK;
    uint8_t cmd = header & LUMP_MSG_CMD_MASK;

    if (type == LUMP_MSG_TYPE_SYS) {
        if (header == LUMP_SYS_ACK && u->state == DEV_WAIT_ACK) {
            u->state = DEV_DATA;
            u->mode = 0;
            u->next_data = pbw_now_ms() + 10;
        }
        // NACK is the hub's keep-alive; nothing to do.
        return;
    }

    if (type == LUMP_MSG_TYPE_CMD) {
        if (cmd == LUMP_CMD_SPEED) {
            // The hub probes for a device at the start of every sync. A
            // plugged-in device answers; a new device type takes effect here.
            u->desc = NULL;
            for (uint32_t i = 0; i < PBIO_ARRAY_SIZE(devices); i++) {
                if (devices[i].type_id == u->pending_type) {
                    u->desc = &devices[i];
                }
            }
            if (u->desc) {
                u->state = DEV_ANSWER_DUE;
                u->answer_time = pbw_now_ms() + DEVICE_ANSWER_DELAY_MS;
            } else {
                u->state = DEV_SILENT;
            }
        } else if (cmd == LUMP_CMD_SELECT && u->state == DEV_DATA) {
            uint8_t mode = u->rx[1] + u->ext_mode;
            if (u->desc && mode < u->desc->num_modes) {
                u->mode = mode;
                u->next_data = pbw_now_ms();
            }
        } else if (cmd == LUMP_CMD_EXT_MODE) {
            u->ext_mode = u->rx[1];
        }
        return;
    }

    if (type == LUMP_MSG_TYPE_DATA && u->state == DEV_DATA && u->desc) {
        uint8_t mode = cmd + u->ext_mode;
        if (mode < u->desc->num_modes && u->desc->modes[mode].writable) {
            uint8_t n = LUMP_MSG_SIZE(header);
            memcpy(u->lights, &u->rx[1], n < sizeof(u->lights) ? n : sizeof(u->lights));
        }
    }
}

static void hub_to_device(pbdrv_uart_dev_t *u, uint8_t port, const uint8_t *data, uint32_t len) {
    for (uint32_t i = 0; i < len; i++) {
        if (u->rx_len == 0) {
            u->rx_need = hub_msg_size(data[i]);
        }
        u->rx[u->rx_len++] = data[i];
        if (u->rx_len >= u->rx_need || u->rx_len >= sizeof(u->rx)) {
            handle_hub_msg(u, port);
            u->rx_len = 0;
        }
    }
}

// ---------------------------------------------------------------------------
// Device process: answers probes and streams data.

static pbio_error_t device_process_thread(pbio_os_state_t *state, void *context) {
    static pbio_os_timer_t timer;

    PBIO_OS_ASYNC_BEGIN(state);

    for (;;) {
        PBIO_OS_AWAIT_MS(state, &timer, 1);
        uint32_t now = pbw_now_ms();
        for (uint8_t p = 0; p < PBW_NUM_PORTS; p++) {
            pbdrv_uart_dev_t *u = &uarts[p];
            if (u->state == DEV_ANSWER_DUE && (int32_t)(now - u->answer_time) >= 0) {
                send_sys(u, LUMP_SYS_ACK);
                send_handshake(u);
                u->state = DEV_WAIT_ACK;
            } else if (u->state == DEV_DATA && (int32_t)(now - u->next_data) >= 0) {
                u->next_data = now + u->desc->interval;
                // Don't flood a hub that is not reading.
                if (rb_count(u) < RB_SIZE / 4) {
                    send_data(u, p);
                }
            }
        }
    }

    PBIO_OS_ASYNC_END(PBIO_ERROR_FAILED);
}

// ---------------------------------------------------------------------------
// pbdrv_uart API

pbio_error_t pbdrv_uart_get_instance(uint8_t id, pbdrv_uart_dev_t **uart_dev) {
    if (id >= PBW_NUM_PORTS) {
        return PBIO_ERROR_NO_DEV;
    }
    *uart_dev = &uarts[id];
    return PBIO_SUCCESS;
}

void pbdrv_uart_set_baud_rate(pbdrv_uart_dev_t *uart_dev, uint32_t baud) {
    uart_dev->baud = baud;
}

void pbdrv_uart_stop(pbdrv_uart_dev_t *uart_dev) {
}

void pbdrv_uart_flush(pbdrv_uart_dev_t *uart_dev) {
    rb_clear(uart_dev);
}

uint32_t pbdrv_uart_in_waiting(pbdrv_uart_dev_t *uart_dev) {
    return rb_count(uart_dev);
}

pbio_error_t pbdrv_uart_read(pbio_os_state_t *state, pbdrv_uart_dev_t *uart_dev, uint8_t *msg, uint32_t length, uint32_t timeout) {
    PBIO_OS_ASYNC_BEGIN(state);

    pbio_os_timer_set(&uart_dev->read_timer, timeout);
    PBIO_OS_AWAIT_UNTIL(state, rb_count(uart_dev) >= length || pbio_os_timer_is_expired(&uart_dev->read_timer));
    if (rb_count(uart_dev) < length) {
        return PBIO_ERROR_TIMEDOUT;
    }
    for (uint32_t i = 0; i < length; i++) {
        msg[i] = uart_dev->rb[uart_dev->rb_tail++ % RB_SIZE];
    }

    PBIO_OS_ASYNC_END(PBIO_SUCCESS);
}

pbio_error_t pbdrv_uart_write(pbio_os_state_t *state, pbdrv_uart_dev_t *uart_dev, const uint8_t *msg, uint32_t length, uint32_t timeout) {
    hub_to_device(uart_dev, (uint8_t)(uart_dev - uarts), msg, length);
    return PBIO_SUCCESS;
}

void pbdrv_uart_init(void) {
    static pbio_os_process_t process;
    pbio_os_process_start(&process, device_process_thread, NULL);
}

// ---------------------------------------------------------------------------
// Page API

void pbw_device_set_type(uint8_t port, uint8_t type_id) {
    if (port >= PBW_NUM_PORTS) {
        return;
    }
    pbdrv_uart_dev_t *u = &uarts[port];
    if (u->pending_type == type_id) {
        return;
    }
    u->pending_type = type_id;
    // Unplug: the device goes silent until the hub probes again, which the
    // hub does once its keep-alive notices the silence.
    u->state = DEV_SILENT;
    u->desc = NULL;
    rb_clear(u);
    pbw_motor_attach(port, type_id);
}

uint8_t pbw_device_get_type(uint8_t port) {
    return port < PBW_NUM_PORTS ? uarts[port].pending_type : 0;
}

EMSCRIPTEN_KEEPALIVE
int pbw_device_is_synced_js(int port) {
    return port >= 0 && port < PBW_NUM_PORTS && uarts[port].state == DEV_DATA;
}

bool pbw_device_is_synced(uint8_t port) {
    return pbw_device_is_synced_js(port);
}

EMSCRIPTEN_KEEPALIVE
int pbw_device_mode(int port) {
    return port >= 0 && port < PBW_NUM_PORTS ? uarts[port].mode : -1;
}

EMSCRIPTEN_KEEPALIVE
int pbw_device_light(int port, int index) {
    if (port < 0 || port >= PBW_NUM_PORTS || index < 0 || index >= 4) {
        return 0;
    }
    return uarts[port].lights[index];
}

EMSCRIPTEN_KEEPALIVE
void pbw_sensor_set_rgb(int port, int r, int g, int b) {
    if (port < 0 || port >= PBW_NUM_PORTS) {
        return;
    }
    uarts[port].rgb[0] = (uint8_t)clamp(r, 0, 255);
    uarts[port].rgb[1] = (uint8_t)clamp(g, 0, 255);
    uarts[port].rgb[2] = (uint8_t)clamp(b, 0, 255);
}

EMSCRIPTEN_KEEPALIVE
void pbw_sensor_set_ambient(int port, int pct) {
    if (port >= 0 && port < PBW_NUM_PORTS) {
        uarts[port].ambient = (uint8_t)clamp(pct, 0, 100);
    }
}

EMSCRIPTEN_KEEPALIVE
void pbw_sensor_set_distance(int port, int mm) {
    if (port >= 0 && port < PBW_NUM_PORTS) {
        uarts[port].distance_mm = (int16_t)clamp(mm, -1, 2000);
    }
}

EMSCRIPTEN_KEEPALIVE
void pbw_sensor_set_force(int port, int millinewton) {
    if (port >= 0 && port < PBW_NUM_PORTS) {
        uarts[port].force_mn = clamp(millinewton, 0, 10000);
    }
}

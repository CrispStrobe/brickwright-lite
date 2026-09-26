// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Shared declarations of the Brickwright wasm HAL for Pybricks.

#ifndef BRICKWRIGHT_WASM_HUB_H
#define BRICKWRIGHT_WASM_HUB_H

#include <stdbool.h>
#include <stdint.h>

#define PBW_NUM_PORTS (6)

// Advances the simulated clock by one millisecond and paces it (clock_wasm.c).
void pbw_tick(void);
uint32_t pbw_now_ms(void);

// Motor physics (motor_sim.c).
void pbw_motor_attach(uint8_t port, uint8_t type_id);
double pbw_motor_angle_mdeg(uint8_t port);
double pbw_motor_speed_mdeg_s(uint8_t port);
int32_t pbw_motor_voltage_mv(uint8_t port);
void pbw_motor_set_angle_mdeg(uint8_t port, double mdeg);
void pbw_motor_set_load(uint8_t port, double load);

// Simulated LUMP devices (uart_lump_sim.c).
void pbw_device_set_type(uint8_t port, uint8_t type_id);
uint8_t pbw_device_get_type(uint8_t port);
bool pbw_device_is_synced(uint8_t port);

// Program stop request from the page (wasm_main.c).
void pbw_check_stop_request(void);

#endif // BRICKWRIGHT_WASM_HUB_H

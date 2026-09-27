// SPDX-License-Identifier: MIT
// Copyright (c) 2022-2025 The Pybricks Authors
// Copyright (c) 2026 Brickwright contributors

// Motor driver (H-bridge) + motor physics for the Brickwright wasm hub.
//
// The physics is Pybricks' own discrete-time linear model of a Technic M
// angular motor, copied from lib/pbio/drv/motor_driver/motor_driver_virtual_simulation.c
// (MIT). What differs from upstream: the attached motor type is chosen at
// runtime by the page, the port's angle is reported to pbio by the port's
// simulated LUMP device (uart_lump_sim.c) as a real SPIKE motor does, and an
// optional extra load lets the page hold a motor back.

#include <stdint.h>

#include <pbdrv/config.h>
#include <pbdrv/motor_driver.h>

#include <pbio/battery.h>
#include <pbio/os.h>

#include <lego/device.h>

#include <emscripten.h>

#include "wasm_hub.h"

typedef struct {
    double d_angle_d_speed;
    double d_speed_d_speed;
    double d_current_d_speed;
    double d_angle_d_current;
    double d_speed_d_current;
    double d_current_d_current;
    double d_angle_d_voltage;
    double d_speed_d_voltage;
    double d_current_d_voltage;
    double d_angle_d_torque;
    double d_speed_d_torque;
    double d_current_d_torque;
    double torque_friction;
} pbw_motor_model_t;

// Upstream uses this one model for the S, M and L motors alike (marked TODO
// there), and so does this simulation.
static const pbw_motor_model_t model_technic_m_angular = {
    .d_angle_d_speed = 0.0009981527613056019,
    .d_speed_d_speed = 0.994653578576391,
    .d_current_d_speed = -0.0021977502690683696,
    .d_angle_d_current = 0.001957577848006867,
    .d_speed_d_current = 3.640640918794361,
    .d_current_d_current = 0.6348769647439378,
    .d_angle_d_voltage = 0.0002818172865566039,
    .d_speed_d_voltage = 0.815657436669528,
    .d_current_d_voltage = 0.335291816502189,
    .d_angle_d_torque = -9.498678309037282e-05,
    .d_speed_d_torque = -0.18980175337809,
    .d_current_d_torque = 0.0002247101788128779,
    .torque_friction = 21413.268,
};

struct _pbdrv_motor_driver_dev_t {
    const pbw_motor_model_t *model;
    double angle;   // millidegrees
    double speed;   // millidegrees per second
    double current;
    double voltage; // millivolts
    double load;    // extra opposing torque factor, 0 = free running
};

static pbdrv_motor_driver_dev_t motors[PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV];

void pbw_motor_attach(uint8_t port, uint8_t type_id) {
    if (port >= PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV) {
        return;
    }
    pbdrv_motor_driver_dev_t *m = &motors[port];
    switch (type_id) {
        case LEGO_DEVICE_TYPE_ID_SPIKE_S_MOTOR:
        case LEGO_DEVICE_TYPE_ID_SPIKE_M_MOTOR:
        case LEGO_DEVICE_TYPE_ID_SPIKE_L_MOTOR:
        case LEGO_DEVICE_TYPE_ID_TECHNIC_M_ANGULAR_MOTOR:
        case LEGO_DEVICE_TYPE_ID_TECHNIC_L_ANGULAR_MOTOR:
            m->model = &model_technic_m_angular;
            break;
        default:
            m->model = NULL;
            break;
    }
    m->speed = 0;
    m->current = 0;
    m->voltage = 0;
}

double pbw_motor_angle_mdeg(uint8_t port) {
    return port < PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV ? motors[port].angle : 0;
}

double pbw_motor_speed_mdeg_s(uint8_t port) {
    return port < PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV ? motors[port].speed : 0;
}

int32_t pbw_motor_voltage_mv(uint8_t port) {
    return port < PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV ? (int32_t)motors[port].voltage : 0;
}

void pbw_motor_set_angle_mdeg(uint8_t port, double mdeg) {
    if (port < PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV) {
        motors[port].angle = mdeg;
    }
}

void pbw_motor_set_load(uint8_t port, double load) {
    if (port < PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV) {
        motors[port].load = load < 0 ? 0 : load;
    }
}

pbio_error_t pbdrv_motor_driver_get_dev(uint8_t id, pbdrv_motor_driver_dev_t **driver) {
    if (id >= PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV) {
        return PBIO_ERROR_INVALID_ARG;
    }
    *driver = &motors[id];
    return PBIO_SUCCESS;
}

pbio_error_t pbdrv_motor_driver_coast(pbdrv_motor_driver_dev_t *driver) {
    driver->voltage = 0.0;
    return PBIO_SUCCESS;
}

pbio_error_t pbdrv_motor_driver_set_duty_cycle(pbdrv_motor_driver_dev_t *driver, int16_t duty_cycle) {
    driver->voltage = pbio_battery_get_voltage_from_duty(duty_cycle);
    return PBIO_SUCCESS;
}

static void motor_step(pbdrv_motor_driver_dev_t *m) {
    const pbw_motor_model_t *mod = m->model;

    // Modified coulomb friction with transition linear in speed through origin.
    const double limit = 2000;
    double friction;
    if (m->speed > limit) {
        friction = mod->torque_friction;
    } else if (m->speed < -limit) {
        friction = -mod->torque_friction;
    } else {
        friction = mod->torque_friction * m->speed / limit;
    }
    // Page-controlled load: viscous drag proportional to speed.
    double torque = friction * (1.0 + m->load);

    double angle_next = m->angle +
        m->speed * mod->d_angle_d_speed +
        m->current * mod->d_angle_d_current +
        m->voltage * mod->d_angle_d_voltage +
        torque * mod->d_angle_d_torque;
    double speed_next =
        m->speed * mod->d_speed_d_speed +
        m->current * mod->d_speed_d_current +
        m->voltage * mod->d_speed_d_voltage +
        torque * mod->d_speed_d_torque;
    double current_next =
        m->speed * mod->d_current_d_speed +
        m->current * mod->d_current_d_current +
        m->voltage * mod->d_current_d_voltage +
        torque * mod->d_current_d_torque;

    m->angle = angle_next;
    m->speed = speed_next;
    m->current = current_next;
}

static pbio_error_t motor_sim_process_thread(pbio_os_state_t *state, void *context) {
    static pbio_os_timer_t timer;

    PBIO_OS_ASYNC_BEGIN(state);

    // Matches the model's 1 ms discretization step.
    pbio_os_timer_set(&timer, 1);

    for (;;) {
        PBIO_OS_AWAIT_UNTIL(state, pbio_os_timer_is_expired(&timer));
        pbio_os_timer_extend(&timer);
        for (int i = 0; i < PBDRV_CONFIG_MOTOR_DRIVER_NUM_DEV; i++) {
            if (motors[i].model) {
                motor_step(&motors[i]);
            }
        }
    }

    PBIO_OS_ASYNC_END(PBIO_ERROR_FAILED);
}

void pbdrv_motor_driver_init(void) {
    static pbio_os_process_t process;
    pbio_os_process_start(&process, motor_sim_process_thread, NULL);
}

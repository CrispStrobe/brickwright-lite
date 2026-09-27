// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Inertial measurement unit of the Brickwright wasm hub.
//
// The page sets a target orientation (pitch, roll, yaw in degrees). This
// driver turns it into what an accelerometer and gyroscope would measure:
// gravity rotated into the hub frame, and the angular rate at which the hub
// turns towards the target (at most MAX_RATE_DPS). Pybricks' own sensor
// fusion (lib/pbio/src/imu.c) consumes those raw frames unchanged, so tilt(),
// heading() and friends are computed by Pybricks, not here.
//
// Raw scales match the SPIKE Prime hub's LSM6DS3TR-C at +-8 g / 2000 dps.

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include <emscripten.h>

#include <pbdrv/config.h>
#include <pbdrv/imu.h>
#include <pbio/os.h>

#define SAMPLE_MS           (1)
#define STATIONARY_SAMPLES  (500)
#define MAX_RATE_DPS        (720.0f)
#define GYRO_SCALE          (0.07f)             // deg/s per LSB
#define ACCEL_SCALE         (0.244f * 9.81f)    // mm/s^2 per LSB
#define DEG2RAD             (0.017453292519943295f)

struct _pbdrv_imu_dev_t {
    pbdrv_imu_config_t config;
    pbdrv_imu_handle_frame_data_func_t frame_func;
    pbdrv_imu_handle_stationary_data_func_t stationary_func;
    // Current simulated orientation, degrees.
    float pitch, roll, yaw;
    // Target set by the page.
    float target_pitch, target_roll, target_yaw;
    // Stationary detection.
    bool stationary;
    uint32_t still_count;
    int32_t gyro_sum[3];
    int32_t accel_sum[3];
};

static pbdrv_imu_dev_t imu;

static void step_towards(float *value, float target, float max_step) {
    float delta = target - *value;
    if (delta > max_step) {
        delta = max_step;
    } else if (delta < -max_step) {
        delta = -max_step;
    }
    *value += delta;
}

typedef struct {
    float w, x, y, z;
} quat_t;

static quat_t quat_mul(quat_t a, quat_t b) {
    return (quat_t) {
        .w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        .x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        .y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        .z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
}

// Hub-to-world rotation R = Rz(-yaw) Ry(pitch) Rx(roll), so that the gravity
// seen in the hub frame, R^T (0, 0, 1), is (-sin p, sin r cos p, cos r cos p)
// and a positive (clockwise) yaw turns the hub about -z.
static quat_t orientation(float pitch, float roll, float yaw) {
    float hr = roll * DEG2RAD / 2, hp = pitch * DEG2RAD / 2, hy = -yaw * DEG2RAD / 2;
    quat_t qx = { cosf(hr), sinf(hr), 0, 0 };
    quat_t qy = { cosf(hp), 0, sinf(hp), 0 };
    quat_t qz = { cosf(hy), 0, 0, sinf(hy) };
    return quat_mul(qz, quat_mul(qy, qx));
}

static void imu_sample(void) {
    const float dt = SAMPLE_MS / 1000.0f;
    const float max_step = MAX_RATE_DPS * dt;

    quat_t before = orientation(imu.pitch, imu.roll, imu.yaw);
    step_towards(&imu.roll, imu.target_roll, max_step);
    step_towards(&imu.pitch, imu.target_pitch, max_step);
    step_towards(&imu.yaw, imu.target_yaw, max_step);
    quat_t after = orientation(imu.pitch, imu.roll, imu.yaw);

    // Body-frame angular velocity: the gyro and the accelerometer describe
    // the same motion by construction.
    quat_t conj = { before.w, -before.x, -before.y, -before.z };
    quat_t delta = quat_mul(conj, after);
    if (delta.w < 0) {
        delta.w = -delta.w;
        delta.x = -delta.x;
        delta.y = -delta.y;
        delta.z = -delta.z;
    }
    const float rad2deg = 1.0f / DEG2RAD;
    int16_t data[6];
    data[0] = (int16_t)lroundf(2 * delta.x / dt * rad2deg / GYRO_SCALE);
    data[1] = (int16_t)lroundf(2 * delta.y / dt * rad2deg / GYRO_SCALE);
    data[2] = (int16_t)lroundf(2 * delta.z / dt * rad2deg / GYRO_SCALE);

    // Gravity as the accelerometer sees it (reads +1 g upwards when flat).
    float p = imu.pitch * DEG2RAD;
    float r = imu.roll * DEG2RAD;
    const float g = 9806.65f / ACCEL_SCALE;
    data[3] = (int16_t)lroundf(-sinf(p) * g);
    data[4] = (int16_t)lroundf(sinf(r) * cosf(p) * g);
    data[5] = (int16_t)lroundf(cosf(r) * cosf(p) * g);

    if (imu.frame_func) {
        imu.frame_func(data);
    }

    // Stationary when the page is not turning the hub.
    bool moving = data[0] || data[1] || data[2];
    if (moving) {
        imu.stationary = false;
        imu.still_count = 0;
        memset(imu.gyro_sum, 0, sizeof(imu.gyro_sum));
        memset(imu.accel_sum, 0, sizeof(imu.accel_sum));
        return;
    }
    for (int i = 0; i < 3; i++) {
        imu.gyro_sum[i] += data[i];
        imu.accel_sum[i] += data[i + 3];
    }
    if (++imu.still_count >= STATIONARY_SAMPLES) {
        imu.stationary = true;
        if (imu.stationary_func) {
            imu.stationary_func(imu.gyro_sum, imu.accel_sum, imu.still_count);
        }
        imu.still_count = 0;
        memset(imu.gyro_sum, 0, sizeof(imu.gyro_sum));
        memset(imu.accel_sum, 0, sizeof(imu.accel_sum));
    }
}

static pbio_error_t imu_process_thread(pbio_os_state_t *state, void *context) {
    static pbio_os_timer_t timer;

    PBIO_OS_ASYNC_BEGIN(state);

    pbio_os_timer_set(&timer, SAMPLE_MS);
    for (;;) {
        PBIO_OS_AWAIT_UNTIL(state, pbio_os_timer_is_expired(&timer));
        pbio_os_timer_extend(&timer);
        imu_sample();
    }

    PBIO_OS_ASYNC_END(PBIO_ERROR_FAILED);
}

void pbdrv_imu_init(void) {
    imu.config.sample_time = SAMPLE_MS / 1000.0f;
    imu.config.gyro_scale = GYRO_SCALE;
    imu.config.accel_scale = ACCEL_SCALE;
    imu.config.gyro_stationary_threshold = 1;
    imu.config.accel_stationary_threshold = 1;
    static pbio_os_process_t process;
    pbio_os_process_start(&process, imu_process_thread, NULL);
}

void pbdrv_imu_deinit(void) {
}

pbio_error_t pbdrv_imu_get_imu(pbdrv_imu_dev_t **imu_dev, pbdrv_imu_config_t **config) {
    *imu_dev = &imu;
    *config = &imu.config;
    return PBIO_SUCCESS;
}

bool pbdrv_imu_is_stationary(pbdrv_imu_dev_t *imu_dev) {
    return imu_dev->stationary;
}

void pbdrv_imu_set_data_handlers(pbdrv_imu_dev_t *imu_dev, pbdrv_imu_handle_frame_data_func_t frame_data_func, pbdrv_imu_handle_stationary_data_func_t stationary_data_func) {
    imu_dev->frame_func = frame_data_func;
    imu_dev->stationary_func = stationary_data_func;
}

EMSCRIPTEN_KEEPALIVE
void pbw_imu_set_orientation(float pitch, float roll, float yaw) {
    imu.target_pitch = pitch;
    imu.target_roll = roll;
    imu.target_yaw = yaw;
}

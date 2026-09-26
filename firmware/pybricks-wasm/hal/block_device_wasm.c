// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Storage of the Brickwright wasm hub: a RAM disk that starts blank.
//
// A blank store carries no firmware hash, so pbsys resets it to factory
// defaults on boot (IMU calibration defaults, empty program slots), as a real
// hub does after a firmware update. Pybricks' block_device_test driver is not
// used because it pre-marks its RAM as valid, leaving zeroed IMU settings.

#include <stdint.h>

#include <pbdrv/block_device.h>
#include <pbdrv/config.h>
#include <pbio/os.h>

#include <pbdrv/../../sys/storage_data.h>

static struct {
    // Keeps pbsys_storage_data_map_t properly aligned.
    pbsys_storage_data_map_t data_map;
    uint8_t data[PBDRV_CONFIG_BLOCK_DEVICE_RAM_SIZE];
} ramdisk;

uint32_t pbdrv_block_device_get_writable_size(void) {
    return PBDRV_CONFIG_BLOCK_DEVICE_RAM_SIZE;
}

pbio_error_t pbdrv_block_device_get_data(pbsys_storage_data_map_t **data) {
    *data = &ramdisk.data_map;
    return PBIO_SUCCESS;
}

void pbdrv_block_device_init(void) {
}

// Nothing persists between page loads; "saving" always succeeds.
pbio_error_t pbdrv_block_device_write_all(pbio_os_state_t *state, uint32_t used_data_size) {
    return PBIO_SUCCESS;
}

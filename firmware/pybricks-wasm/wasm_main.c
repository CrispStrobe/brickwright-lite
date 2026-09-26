// SPDX-License-Identifier: MIT
// Copyright (c) 2013, 2014 Damien P. George
// Copyright (c) 2018-2025 The Pybricks Authors
// Copyright (c) 2026 Brickwright contributors

// Entry points of the Brickwright wasm hub.
//
// On a real hub, pbsys_main() waits for a compiled .mpy program to arrive
// over Bluetooth/USB and then runs it. Here the page hands over Python
// source, which the firmware's own MicroPython compiler (enabled on every
// Pybricks hub for the REPL) compiles and runs. Around that, the sequence
// is the one pbsys_main() performs for each program: set the running status,
// start application resources, run, stop resources, clear status, clean up.

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include <emscripten.h>

#include <pbdrv/clock.h>
#include <pbdrv/config.h>
#include <pbdrv/core.h>
#include <pbio/light_matrix.h>
#include <pbio/os.h>
#include <pbio/protocol.h>
#include <pbsys/config.h>
#include <pbsys/core.h>
#include <pbsys/host.h>
#include <pbsys/light.h>
#include <pbsys/main.h>
#include <pbsys/program_stop.h>
#include <pbsys/status.h>

#include "py/compile.h"
#include "py/gc.h"
#include "py/lexer.h"
#include "py/mperrno.h"
#include "py/mphal.h"
#include "py/nlr.h"
#include "py/parse.h"
#include "py/runtime.h"
#include "py/stackctrl.h"
#include "shared/readline/readline.h"
#include "shared/runtime/interrupt_char.h"
#include "shared/runtime/pyexec.h"

#include <pybricks/common.h>

#include "hal/wasm_hub.h"

// Declared here rather than taken from <pbio/main.h>: at the pinned Pybricks
// commit that header says pbio_main_start_application_resources() returns
// pbio_error_t while lib/pbio/src/main.c defines it as void. Harmless on Arm;
// under wasm a call through the mismatched type traps, so call the function
// with the type it is defined with.
void pbio_init(void);
void pbio_main_start_application_resources(void);
pbio_error_t pbio_main_stop_application_resources(void);

#define PBW_HEAP_SIZE           (256 * 1024)
#define PBW_STACK_LIMIT         (192 * 1024)
#define PBW_BOOT_SETTLE_MS      (500)

// Results of pbw_run(), mirrored in the JS host.
#define PBW_RESULT_OK           (0)
#define PBW_RESULT_EXCEPTION    (1)
#define PBW_RESULT_STOPPED      (2)
#define PBW_RESULT_NOT_BOOTED   (3)
#define PBW_RESULT_BUSY         (4)

// The hub's light matrix as pbsys knows it. On a real Prime hub the PUP HMI
// defines this; the wasm hub has no on-hub menu, so it is defined here.
pbio_light_matrix_t *pbsys_hub_light_matrix;

static bool booted;
static bool running;
static int stop_requests;

// ---------------------------------------------------------------------------
// Garbage collector roots: wasm keeps locals outside linear memory, so scan
// the shadow stack and spill the "registers" (Asyncify), as MicroPython's own
// webassembly port does.

static void gc_scan_func(void *begin, void *end) {
    gc_collect_root((void **)begin, (void **)end - (void **)begin + 1);
}

void gc_helper_collect_regs_and_stack(void) {
    emscripten_scan_stack(gc_scan_func);
    emscripten_scan_registers(gc_scan_func);
}

// ---------------------------------------------------------------------------
// Stop requests from the page.

void pbw_check_stop_request(void) {
    if (!stop_requests || !running) {
        return;
    }
    // First request: graceful SystemExit, as the hub's stop button does.
    // Any further request: abort the VM.
    pbsys_main_stop_program(stop_requests > 1);
    stop_requests = stop_requests > 1 ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE
void pbw_request_stop(void) {
    if (running) {
        stop_requests = stop_requests < 0 ? 2 : 1;
    }
}

// ---------------------------------------------------------------------------
// Program execution.

static void run_until(uint32_t until_ms) {
    while ((int32_t)(pbdrv_clock_get_ms() - until_ms) < 0) {
        pbio_os_run_processes_and_wait_for_event();
    }
}

static void print_final_exception(mp_obj_t exc) {
    pb_stdout_flush_to_new_line();
    nlr_buf_t nlr;
    if (nlr_push(&nlr) == 0) {
        if (mp_obj_exception_match(exc, MP_OBJ_FROM_PTR(&mp_type_SystemExit))) {
            mp_printf(&mp_plat_print, "The program was stopped (%q).\n",
                ((mp_obj_exception_t *)MP_OBJ_TO_PTR(exc))->base.type->name);
        } else {
            mp_obj_print_exception(&mp_plat_print, exc);
        }
        nlr_pop();
    }
}

static int run_source(const char *src, size_t len) {
    static uint8_t heap[PBW_HEAP_SIZE] __attribute__((aligned(16)));
    int result = PBW_RESULT_OK;

    mp_cstack_init_with_sp_here(PBW_STACK_LIMIT);
    gc_init(heap, heap + sizeof(heap));
    mp_init();

    // Init Pybricks package without auto-import, as for a downloaded program.
    pb_package_pybricks_init(false);

    nlr_buf_t nlr;
    nlr.ret_val = NULL;
    if (nlr_push(&nlr) == 0) {
        nlr_set_abort(&nlr);
        mp_hal_set_interrupt_char(CHAR_CTRL_C);

        mp_lexer_t *lex = mp_lexer_new_from_str_len(MP_QSTR___main__, src, len, 0);
        qstr source_name = lex->source_name;
        mp_parse_tree_t parse_tree = mp_parse(lex, MP_PARSE_FILE_INPUT);
        mp_obj_t module_fun = mp_compile(&parse_tree, source_name, false);
        mp_call_function_0(module_fun);

        mp_hal_set_interrupt_char(-1);
        mp_handle_pending(true);
        nlr_pop();
    } else {
        mp_hal_set_interrupt_char(-1);
        if (nlr.ret_val == NULL) {
            // VM aborted (forced stop).
            result = PBW_RESULT_STOPPED;
        } else {
            mp_handle_pending(false);
            mp_obj_t exc = MP_OBJ_FROM_PTR(nlr.ret_val);
            bool stopped = mp_obj_is_subclass_fast(MP_OBJ_FROM_PTR(((mp_obj_base_t *)nlr.ret_val)->type), MP_OBJ_FROM_PTR(&mp_type_SystemExit)) ||
                mp_obj_exception_match(exc, MP_OBJ_FROM_PTR(&mp_type_KeyboardInterrupt));
            print_final_exception(exc);
            result = stopped ? PBW_RESULT_STOPPED : PBW_RESULT_EXCEPTION;
        }
    }
    nlr_set_abort(NULL);

    pb_stdout_flush_to_new_line();
    return result;
}

// Boots the hub: drivers, pbio, pbsys, then lets attached devices sync.
EMSCRIPTEN_KEEPALIVE
int pbw_boot(void) {
    if (booted) {
        return 0;
    }
    pbdrv_init();
    pbio_init();
    pbsys_init();
    pbio_light_matrix_get_dev(0, 5, &pbsys_hub_light_matrix);
    booted = true;
    run_until(pbdrv_clock_get_ms() + PBW_BOOT_SETTLE_MS);
    return 0;
}

// Lets simulated time pass without a program (devices sync, motors coast).
EMSCRIPTEN_KEEPALIVE
void pbw_idle(uint32_t ms) {
    if (booted && !running) {
        run_until(pbdrv_clock_get_ms() + ms);
    }
}

// Compiles and runs one program. Same bracket as pbsys_main() uses.
EMSCRIPTEN_KEEPALIVE
int pbw_run(const char *src, uint32_t settle_ms) {
    if (!booted) {
        return PBW_RESULT_NOT_BOOTED;
    }
    if (running) {
        return PBW_RESULT_BUSY;
    }
    run_until(pbdrv_clock_get_ms() + settle_ms);

    running = true;
    stop_requests = 0;
    pbsys_status_set(PBIO_PYBRICKS_STATUS_USER_PROGRAM_RUNNING);
    pbsys_host_stdin_set_callback(pbsys_main_stdin_event);
    while (pbio_os_run_processes_once()) {
    }
    pbsys_host_stdin_flush();

    pbio_main_start_application_resources();
    int result = run_source(src, strlen(src));
    pbio_main_stop_application_resources();

    pbsys_status_clear(PBIO_PYBRICKS_STATUS_USER_PROGRAM_RUNNING);
    pbsys_host_stdin_set_callback(NULL);
    pbsys_program_stop_set_buttons(PBSYS_CONFIG_HMI_STOP_BUTTON);
    while (pbio_os_run_processes_once()) {
    }
    pbsys_main_run_program_cleanup();
    running = false;
    stop_requests = 0;
    return result;
}

EMSCRIPTEN_KEEPALIVE
int pbw_is_running(void) {
    return running;
}

// ---------------------------------------------------------------------------
// Ports.

EMSCRIPTEN_KEEPALIVE
void pbw_port_set_device(int port, int type_id) {
    if (port >= 0 && port < PBW_NUM_PORTS) {
        pbw_device_set_type((uint8_t)port, (uint8_t)type_id);
    }
}

EMSCRIPTEN_KEEPALIVE
int pbw_port_device(int port) {
    return port >= 0 && port < PBW_NUM_PORTS ? pbw_device_get_type((uint8_t)port) : 0;
}

EMSCRIPTEN_KEEPALIVE
double pbw_motor_angle(int port) {
    return port >= 0 && port < PBW_NUM_PORTS ? pbw_motor_angle_mdeg((uint8_t)port) / 1000.0 : 0;
}

EMSCRIPTEN_KEEPALIVE
double pbw_motor_speed(int port) {
    return port >= 0 && port < PBW_NUM_PORTS ? pbw_motor_speed_mdeg_s((uint8_t)port) / 1000.0 : 0;
}

EMSCRIPTEN_KEEPALIVE
int pbw_motor_voltage(int port) {
    return port >= 0 && port < PBW_NUM_PORTS ? pbw_motor_voltage_mv((uint8_t)port) : 0;
}

EMSCRIPTEN_KEEPALIVE
void pbw_motor_set_angle(int port, double degrees) {
    if (port >= 0 && port < PBW_NUM_PORTS) {
        pbw_motor_set_angle_mdeg((uint8_t)port, degrees * 1000.0);
    }
}

EMSCRIPTEN_KEEPALIVE
void pbw_motor_load(int port, double load) {
    if (port >= 0 && port < PBW_NUM_PORTS) {
        pbw_motor_set_load((uint8_t)port, load);
    }
}

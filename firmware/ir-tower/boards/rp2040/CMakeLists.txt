# RP2040 build. Needs the pico-sdk (PICO_SDK_PATH) and arm-none-eabi-gcc.
#
#   cmake -B build -S . && cmake --build build
#   -> build/irtower-rp2040.uf2, drag onto RPI-RP2
#
# Nothing here is specific to a Pico board beyond the pin numbers in board.h;
# any RP2040 with three free GPIOs will do.

cmake_minimum_required(VERSION 3.13)

include($ENV{PICO_SDK_PATH}/external/pico_sdk_import.cmake)
project(irtower_rp2040 C CXX ASM)
set(CMAKE_C_STANDARD 11)
pico_sdk_init()

add_executable(irtower-rp2040
    port.c
    ../../src/irtower.c
)

pico_generate_pio_header(irtower-rp2040 ${CMAKE_CURRENT_LIST_DIR}/tower.pio)

target_include_directories(irtower-rp2040 PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}
    ${CMAKE_CURRENT_LIST_DIR}/../../include
)

target_compile_options(irtower-rp2040 PRIVATE -Wall -Wextra -Werror)
target_link_libraries(irtower-rp2040 pico_stdlib hardware_pio)

# The bring-up printf only. The IR path does not go through USB; see port.c on
# why this device does not pretend to be LEGO's 0694:0001.
pico_enable_stdio_usb(irtower-rp2040 1)
pico_enable_stdio_uart(irtower-rp2040 0)

pico_add_extra_outputs(irtower-rp2040)

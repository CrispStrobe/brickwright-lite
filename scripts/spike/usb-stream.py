#!/usr/bin/env python3
"""Stream a small, explicit Brickwright SPIKE pseudocode subset over USB.

The hub must run LEGO MINDSTORMS MicroPython (tested with 3.2.36). This uses
the same hub.port motor calls as the legacy Brickwright extension, one REPL
command at a time. It does not upload a program or alter firmware.
"""

import argparse
import re
import sys
import time

import serial
from serial.tools import list_ports


MOTOR_TYPES = {38, 65, 75, 76}
DEVICE_NAMES = {
    37: "BOOST color/distance sensor",
    38: "BOOST interactive motor",
    61: "SPIKE color sensor",
    63: "SPIKE force sensor",
    64: "SPIKE 3x3 color matrix",
    65: "SPIKE Essential small motor",
    75: "SPIKE medium angular motor",
    76: "SPIKE large angular motor",
}


def compile_line(line, speeds, types):
    """Return (hub command, expected delay) for one supported pseudocode line."""
    line = line.strip()
    if not line or line.startswith("#") or re.fullmatch(r"when flag clicked:?|device spike", line, re.I):
        return None
    if m := re.fullmatch(r'display text "([^"\\]*)"', line, re.I):
        return f"hub.display.show({m[1]!r})", 0
    if re.fullmatch(r"display clear", line, re.I):
        return "hub.display.clear()", 0
    if m := re.fullmatch(r"set motor speed ([A-F]) ([0-9]{1,3})", line, re.I):
        port, speed = m[1].upper(), int(m[2])
        if speed > 100:
            raise ValueError("motor speed must be 0..100")
        require_motor(port, types)
        speeds[port] = speed
        return f"print('SPEED {port} {speed}')", 0
    if m := re.fullmatch(r"(?:start|stop) motor ([A-F])(?: (forward|backward|clockwise|counterclockwise))?", line, re.I):
        port = m[1].upper()
        require_motor(port, types)
        if line.lower().startswith("stop"):
            return f"hub.port.{port}.motor.float(); print('STOP {port}')", 0
        if not m[2]:
            raise ValueError("start motor needs a direction")
        sign = -1 if m[2].lower() in ("backward", "counterclockwise") else 1
        return f"hub.port.{port}.motor.pwm({sign * speeds[port]}); print('START {port}')", 0
    if m := re.fullmatch(r"run motor ([A-F]) (forward|backward|clockwise|counterclockwise) ([0-9]+(?:\.[0-9]+)?) seconds?", line, re.I):
        port, seconds = m[1].upper(), float(m[3])
        require_motor(port, types)
        if seconds > 10:
            raise ValueError("one motor run may last at most 10 seconds")
        sign = -1 if m[2].lower() in ("backward", "counterclockwise") else 1
        return (f"import time; hub.port.{port}.motor.pwm({sign * speeds[port]}); "
                f"time.sleep_ms({round(seconds * 1000)}); hub.port.{port}.motor.float(); print('RAN {port}')"), seconds
    if m := re.fullmatch(r"wait ([0-9]+(?:\.[0-9]+)?) seconds?", line, re.I):
        seconds = float(m[1])
        if seconds > 10:
            raise ValueError("one wait may last at most 10 seconds")
        return f"import time; time.sleep_ms({round(seconds * 1000)})", seconds
    raise ValueError(f"unsupported SPIKE pseudocode: {line}")


def require_motor(port, types):
    if types.get(port) not in MOTOR_TYPES:
        raise ValueError(f"port {port} is {DEVICE_NAMES.get(types.get(port), 'empty/unknown')}, not a motor")


class Repl:
    def __init__(self, port):
        self.serial = serial.Serial(port, 115200, timeout=0.1)
        self.serial.write(b"\x03\x02\r\n")
        self._until_prompt(3)

    def _until_prompt(self, timeout):
        deadline = time.monotonic() + timeout
        data = bytearray()
        while time.monotonic() < deadline:
            data.extend(self.serial.read(4096))
            if data.endswith(b">>> "):
                return data.decode("utf-8", "replace")
        raise TimeoutError(f"hub REPL did not answer: {data[-200:]!r}")

    def command(self, code, delay=0):
        self.serial.write(code.encode() + b"\r\n")
        answer = self._until_prompt(max(3, delay + 2))
        if "Traceback (most recent call last)" in answer:
            raise RuntimeError(answer)
        return answer

    def close(self):
        self.serial.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("program", nargs="?", help="Brickwright SPIKE pseudocode file")
    parser.add_argument("--port", help="USB serial port; autodetected when omitted")
    parser.add_argument("--probe", action="store_true", help="show attached devices and sensor readings")
    args = parser.parse_args()
    if not args.program and not args.probe:
        parser.error("provide a program or --probe")
    ports = [p.device for p in list_ports.comports() if "0694:0010" in p.hwid.upper()]
    port = args.port or (ports[0] if len(ports) == 1 else None)
    if not port:
        parser.error(f"choose --port (matching hubs: {ports})")
    repl = Repl(port)
    types = {}
    try:
        print(repl.command("import hub; print('FIRMWARE', hub.__version__)").split("\r\n", 1)[-1].removesuffix(">>> ").strip())
        for p in "ABCDEF":
            output = repl.command(f"print('PORT {p}', hub.port.{p}.info().get('type'))")
            match = re.search(rf"PORT {p} (\d+|None)", output)
            types[p] = int(match[1]) if match and match[1] != "None" else None
            print(f"{p}: {types[p]} {DEVICE_NAMES.get(types[p], 'empty/unknown')}")
        if args.probe:
            sensor_modes = {63: 0, 37: 1, 61: 0}
            for p in "ABCDEF":
                if types[p] in sensor_modes:
                    mode = sensor_modes[types[p]]
                    output = repl.command(f"hub.port.{p}.device.mode({mode}); print('SENSOR {p}', hub.port.{p}.device.get())")
                    print(output.split("\r\n", 1)[-1].removesuffix(">>> ").strip())
        if args.program:
            speeds = dict.fromkeys("ABCDEF", 30)
            commands = []
            for number, line in enumerate(open(args.program, encoding="utf-8"), 1):
                try:
                    compiled = compile_line(line, speeds, types)
                    if compiled:
                        commands.append((number, line, compiled))
                except Exception as exc:
                    raise RuntimeError(f"line {number}: {exc}") from exc
            if len(commands) > 100 or sum(item[2][1] for item in commands) > 60:
                raise ValueError("SPIKE USB runs are limited to 100 commands and 60 seconds")
            for number, line, (command, delay) in commands:
                output = repl.command(command, delay).split("\r\n", 1)[-1].removesuffix(">>> ").strip()
                print(f"{number}: {line.strip()}" + (f" -> {output}" if output else ""))
    finally:
        for p in "ABCDEF":
            if types.get(p) in MOTOR_TYPES:
                try:
                    repl.command(f"hub.port.{p}.motor.float()")
                except Exception as exc:
                    print(f"could not stop motor {p}: {exc}", file=sys.stderr)
        repl.close()


if __name__ == "__main__":
    main()

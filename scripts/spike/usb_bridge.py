#!/usr/bin/env python3
"""Serve the USB-connected MINDSTORMS hub to Brickwright on the local network."""

import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import json
import secrets
import socket
from pathlib import Path


spec = importlib.util.spec_from_file_location("usb_stream", Path(__file__).with_name("usb-stream.py"))
usb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(usb)


def execute(port, source):
    repl = usb.Repl(port)
    types = {}
    lines = []
    try:
        version = repl.command("import hub; print('FIRMWARE', hub.__version__)")
        if "FIRMWARE" not in version:
            raise RuntimeError("This USB device did not identify as a LEGO MicroPython hub")
        for p in "ABCDEF":
            output = repl.command(f"print('PORT {p}', hub.port.{p}.info().get('type'))")
            import re
            match = re.search(rf"PORT {p} (\d+|None)", output)
            types[p] = int(match[1]) if match and match[1] != "None" else None
        if source:
            speeds = dict.fromkeys("ABCDEF", 30)
            commands = []
            for number, line in enumerate(source.splitlines(), 1):
                try:
                    compiled = usb.compile_line(line, speeds, types)
                    if compiled:
                        commands.append((number, line, compiled))
                except Exception as exc:
                    raise RuntimeError(f"line {number}: {exc}") from exc
            if len(commands) > 100 or sum(item[2][1] for item in commands) > 60:
                raise ValueError("SPIKE USB runs are limited to 100 commands and 60 seconds")
            for number, line, (command, delay) in commands:
                repl.command(command, delay)
                lines.append(f"{number}: {line.strip()}")
        return {"firmware": version.split("FIRMWARE ", 1)[-1].split("\r\n", 1)[0],
                "ports": types, "lines": lines}
    finally:
        for p in "ABCDEF":
            if types.get(p) in usb.MOTOR_TYPES:
                try:
                    repl.command(f"hub.port.{p}.motor.float()")
                except Exception:
                    pass
        repl.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="USB callout device, e.g. /dev/cu.usbmodem...")
    parser.add_argument("--listen", default="0.0.0.0")
    parser.add_argument("--tcp-port", type=int, default=8765)
    args = parser.parse_args()
    token = secrets.token_urlsafe(24)

    class Handler(BaseHTTPRequestHandler):
        def _headers(self, status):
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "content-type, x-brickwright-token")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_OPTIONS(self):
            self._headers(204)

        def do_POST(self):
            if self.path not in ("/probe", "/run") or self.headers.get("X-Brickwright-Token") != token:
                self._headers(403)
                self.wfile.write(b'{"error":"Invalid bridge token or path"}')
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size > 65536 or size < 0:
                    raise ValueError("Program exceeds 64 KiB")
                body = json.loads(self.rfile.read(size)) if size else {}
                source = body.get("source", "") if self.path == "/run" else ""
                if not isinstance(source, str):
                    raise ValueError("source must be text")
                result = execute(args.port, source)
                self._headers(200)
                self.wfile.write(json.dumps(result).encode())
            except Exception as exc:
                self._headers(400)
                self.wfile.write(json.dumps({"error": str(exc)}).encode())

    print(f"Brickwright SPIKE USB bridge listening on {args.listen}:{args.tcp_port}", flush=True)
    hostname = socket.gethostname()
    if "." not in hostname:
        hostname += ".local"
    print(f"Mac bridge URL: http://{hostname}:{args.tcp_port}", flush=True)
    print(f"Enter this token in Brickwright: {token}", flush=True)
    try:
        HTTPServer((args.listen, args.tcp_port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("Brickwright SPIKE USB bridge stopped", flush=True)


if __name__ == "__main__":
    main()

// LEGO MINDSTORMS MicroPython over USB, using the same hub.port calls as the
// Brickwright SPIKE extension. The Code tab owns the user gesture and display.
const MOTOR_TYPES = new Set([38, 65, 75, 76]);
export const SPIKE_USB_NAMES = {
    37: 'BOOST color/distance sensor', 38: 'BOOST interactive motor',
    61: 'SPIKE color sensor', 63: 'SPIKE force sensor',
    64: 'SPIKE 3×3 color matrix', 65: 'SPIKE Essential small motor',
    75: 'SPIKE medium angular motor', 76: 'SPIKE large angular motor'
};

const motor = (port, types) => {
    if (!MOTOR_TYPES.has(types[port])) {
        throw new Error(`Port ${port} is ${SPIKE_USB_NAMES[types[port]] || 'empty/unknown'}, not a motor`);
    }
};

export function compileSpikeUsbLine (source, speeds, types) {
    const line = source.trim();
    if (!line || line.startsWith('#') || /^when flag clicked:?$/i.test(line) || /^device spike$/i.test(line)) return null;
    let match;
    if ((match = /^display text "([^"\\]*)"$/i.exec(line))) return [`hub.display.show(${JSON.stringify(match[1])})`, 0];
    if (/^display clear$/i.test(line)) return ['hub.display.clear()', 0];
    if ((match = /^set motor speed ([A-F]) (\d{1,3})$/i.exec(line))) {
        const port = match[1].toUpperCase();
        const speed = Number(match[2]);
        motor(port, types);
        if (speed > 100) throw new Error('Motor speed must be 0–100');
        speeds[port] = speed;
        return [`print('SPEED ${port} ${speed}')`, 0];
    }
    if ((match = /^stop motor ([A-F])$/i.exec(line))) {
        const port = match[1].toUpperCase(); motor(port, types);
        return [`hub.port.${port}.motor.float()`, 0];
    }
    if ((match = /^start motor ([A-F]) (forward|backward|clockwise|counterclockwise)$/i.exec(line))) {
        const port = match[1].toUpperCase(); motor(port, types);
        const sign = /^(backward|counterclockwise)$/i.test(match[2]) ? -1 : 1;
        return [`hub.port.${port}.motor.pwm(${sign * speeds[port]})`, 0];
    }
    if ((match = /^run motor ([A-F]) (forward|backward|clockwise|counterclockwise) (\d+(?:\.\d+)?) seconds?$/i.exec(line))) {
        const port = match[1].toUpperCase(); motor(port, types);
        const seconds = Number(match[3]);
        if (seconds > 10) throw new Error('One motor run may last at most 10 seconds');
        const sign = /^(backward|counterclockwise)$/i.test(match[2]) ? -1 : 1;
        return [`import time; hub.port.${port}.motor.pwm(${sign * speeds[port]}); ` +
            `time.sleep_ms(${Math.round(seconds * 1000)}); hub.port.${port}.motor.float()`, seconds];
    }
    if ((match = /^wait (\d+(?:\.\d+)?) seconds?$/i.exec(line))) {
        const seconds = Number(match[1]);
        if (seconds > 10) throw new Error('One wait may last at most 10 seconds');
        return [`import time; time.sleep_ms(${Math.round(seconds * 1000)})`, seconds];
    }
    throw new Error(`Unsupported SPIKE USB pseudocode: ${line}`);
}

const clean = output => output.split('\r\n').slice(1).join('\r\n').replace(/>>> $/, '').trim();

class FriendlyRepl {
    constructor (transport) {
        this.transport = transport;
        this.buffer = '';
    }

    async untilPrompt (timeoutMs = 3000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const index = this.buffer.indexOf('>>> ');
            if (index >= 0) {
                const result = this.buffer.slice(0, index + 4);
                this.buffer = this.buffer.slice(index + 4);
                return result;
            }
            this.buffer += await this.transport.read();
        }
        throw new Error(`SPIKE USB REPL timed out: ${this.buffer.slice(-120)}`);
    }

    async start () {
        await this.transport.write('\x03\x02\r\n');
        await this.untilPrompt();
        // The hub can emit two friendly prompts after Ctrl-B. Synchronize
        // against a response marker before the first real probe.
        for (let attempt = 0; attempt < 3; attempt++) {
            if ((await this.command("print('BW_USB_READY')")).includes('BW_USB_READY')) return;
        }
        throw new Error('SPIKE USB REPL did not synchronize');
    }

    async command (code, delay = 0) {
        await this.transport.write(`${code}\r\n`);
        const output = await this.untilPrompt(Math.max(3000, delay * 1000 + 2000));
        if (output.includes('Traceback (most recent call last)')) throw new Error(clean(output));
        return clean(output);
    }
}

async function openDirect () {
    const tauri = await import('./pico-tauri-transport.js');
    if (tauri.available()) {
        const ports = await tauri.listPorts();
        const path = ports.find(p => /(?:cu\.usbmodem|ttyACM|ttyUSB|COM\d+)/i.test(p));
        if (!path) throw new Error('No USB serial hub found on this computer');
        return tauri.openTransport(path);
    }
    if (typeof navigator !== 'undefined' && navigator.serial) {
        const port = await navigator.serial.requestPort({filters: [{usbVendorId: 0x0694}]});
        await port.open({baudRate: 115200});
        const {webSerialTransport} = await import('./pico-repl.js');
        return webSerialTransport(port);
    }
    throw new Error('Direct USB needs the desktop app or a browser with Web Serial');
}

export async function runSpikeUsbDirect (source, {onLine = () => {}} = {}) {
    const transport = await openDirect();
    const repl = new FriendlyRepl(transport);
    const types = {};
    try {
        await repl.start();
        const version = await repl.command("import hub; print('FIRMWARE', hub.__version__)");
        if (!version.includes('FIRMWARE ')) throw new Error('This USB port is not a LEGO MicroPython hub');
        for (const port of 'ABCDEF') {
            const answer = await repl.command(`print('PORT ${port}', hub.port.${port}.info().get('type'))`);
            const match = new RegExp(`PORT ${port} (\\d+|None)`).exec(answer);
            types[port] = match && match[1] !== 'None' ? Number(match[1]) : null;
        }
        const speeds = Object.fromEntries([... 'ABCDEF'].map(p => [p, 30]));
        const commands = source.split(/\r?\n/).map((line, index) => {
            try { return {line, index: index + 1, command: compileSpikeUsbLine(line, speeds, types)}; }
            catch (error) { throw new Error(`Line ${index + 1}: ${error.message}`); }
        }).filter(item => item.command);
        if (commands.length > 100 || commands.reduce((total, item) => total + item.command[1], 0) > 60) {
            throw new Error('SPIKE USB runs are limited to 100 commands and 60 seconds');
        }
        for (const {line, index, command} of commands) {
            await repl.command(...command);
            onLine(`${index}: ${line.trim()}`);
        }
        return {firmware: version.split('FIRMWARE ')[1], ports: types, lines: commands.map(c => c.line.trim())};
    } finally {
        for (const port of 'ABCDEF') {
            if (MOTOR_TYPES.has(types[port])) await repl.command(`hub.port.${port}.motor.float()`).catch(() => {});
        }
        await transport.close().catch(() => {});
    }
}

export async function runSpikeUsbBridge (source, url, token) {
    if (!/^https?:\/\//i.test(url)) throw new Error('Enter a full bridge URL, for example http://mac.local:8765');
    if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core) {
        return window.__TAURI__.core.invoke('spike_usb_bridge_run', {url, token, source});
    }
    const endpoint = new URL('/run', url).href;
    const response = await fetch(endpoint, {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-Brickwright-Token': token},
        body: JSON.stringify({source})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `USB bridge returned ${response.status}`);
    return result;
}

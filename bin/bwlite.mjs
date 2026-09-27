#!/usr/bin/env node
// Brickwright terminal entry point. The SPIKE commands use the same USB runner
// as the Code tab's Mac bridge; compile uses the app's SB3Creator engine.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const help = `Brickwright Lite CLI

  bwlite spike probe [--port USB_DEVICE]
  bwlite spike run PROGRAM.bw [--port USB_DEVICE]
  bwlite spike bridge --port USB_DEVICE [--listen IP] [--tcp-port N]
  bwlite compile PROGRAM.bw --to sb3|python|javascript [--out FILE]
  bwlite mindstorms import PROJECT.lms --out PROJECT.sb3
  bwlite mindstorms export PROJECT.sb3 --template ORIGINAL.lms --out NEW.lms

  npm run cli -- spike probe
  npm run cli -- spike run scripts/spike/example-usb-stream.bw

The SPIKE USB commands require LEGO MINDSTORMS MicroPython firmware and
Python with pyserial (pip install pyserial). Set BWLITE_PYTHON to select a venv.
`;

const die = message => { console.error(message); process.exitCode = 2; };
const value = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
};

if (!args.length || args.includes('--help') || args[0] === 'help') {
    console.log(help);
} else if (args[0] === 'spike' && ['probe', 'run', 'bridge'].includes(args[1])) {
    const mode = args[1];
    const script = resolve(root, 'scripts/spike', mode === 'bridge' ? 'usb_bridge.py' : 'usb-stream.py');
    const venvPython = join(homedir(), '.brickwright', 'venv',
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.BWLITE_PYTHON || (existsSync(venvPython) ? venvPython : 'python3');
    const pass = args.slice(2);
    if (mode === 'run' && (!pass[0] || pass[0].startsWith('--'))) {
        die('spike run needs a .bw program file');
    } else if (mode === 'bridge' && !value('--port')) {
        die('spike bridge needs --port USB_DEVICE');
    } else {
        const command = mode === 'probe' ? ['--probe', ...pass] : pass;
        const result = spawnSync(python, [script, ...command], {stdio: 'inherit'});
        if (result.error) die(`${python}: ${result.error.message}`);
        else process.exitCode = result.status ?? 1;
    }
} else if (args[0] === 'mindstorms' && ['import', 'export'].includes(args[1])) {
    const command = args[1];
    const input = args[2];
    const output = value('--out');
    if (!input || input.startsWith('--') || !output || (command === 'export' && !value('--template'))) {
        die('mindstorms import needs PROJECT.lms --out PROJECT.sb3; export needs PROJECT.sb3 --template ORIGINAL.lms --out NEW.lms');
    } else {
        try {
            const lms = await import('../packages/scratch-gui/src/lib/mindstorms-lms.js');
            if (command === 'import') {
                const project = await lms.unpackLms(await readFile(input));
                await writeFile(output, project.scratch);
                console.log(`Extracted ${output}; keep ${input} as the export template for manifest and icon.`);
            } else {
                lms.setActiveLms(await lms.unpackLms(await readFile(value('--template'))));
                const name = output.replace(/^.*[/\\]/, '').replace(/\.lms$/i, '');
                const blob = await lms.packActiveLms(await readFile(input), name);
                await writeFile(output, Buffer.from(await blob.arrayBuffer()));
                console.log(`Wrote ${output}`);
            }
        } catch (error) {
            die(error.message);
        }
    }
} else if (args[0] === 'compile') {
    const sourceFile = args[1];
    const to = value('--to');
    if (!sourceFile || sourceFile.startsWith('--') || !['sb3', 'python', 'javascript'].includes(to)) {
        die('compile needs PROGRAM.bw and --to sb3|python|javascript');
    } else {
        try {
            const {default: SB3Creator} = await import('../packages/scratch-gui/src/lib/sb3-creator.js');
            const creator = new SB3Creator();
            creator.parse(await readFile(sourceFile, 'utf8'));
            const result = to === 'sb3' ? Buffer.from(await (await creator.generateSB3()).arrayBuffer()) :
                to === 'python' ? creator.generatePython() : creator.generateJavaScript();
            const target = value('--out');
            if (target) await writeFile(target, result);
            else if (to === 'sb3') die('Binary .sb3 output needs --out FILE');
            else process.stdout.write(result);
        } catch (error) {
            die(error.message);
        }
    }
} else {
    die(`Unknown command. Run bwlite --help.\n${help}`);
}

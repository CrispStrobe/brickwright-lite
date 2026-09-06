// SPDX-License-Identifier: Apache-2.0
import {SPIKE_FIRMWARE_TARGETS, spikeFirmwareTarget} from './spike-hub-state.js';
let panel = null;

const element = (tag, attributes = {}, text = '') => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'style') node.style.cssText = value;
        else node.setAttribute(key, value);
    }
    node.textContent = text;
    return node;
};

export const applyVirtualPortInput = (hubState, port, kind, value) => {
    const number = Number(value);
    if (kind === 'motor') hubState.setPort(port, kind, {speed: number, position: 0});
    else if (kind === 'distance') hubState.setPort(port, kind, {distance: number});
    else if (kind === 'color') hubState.setPort(port, kind, {color: number, red: 0, green: 0, blue: 0});
    else if (kind === 'force') hubState.setPort(port, kind, {force: number, pressed: number > 0});
    else if (kind === 'matrix3') hubState.setPort(port, kind, {pixels: Array(9).fill(number)});
    else hubState.setPort(port, 'none');
};

export const closeVirtualSpikePanel = () => {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
};

export const openVirtualSpikePanel = hubState => {
    closeVirtualSpikePanel();
    const shade = element('div', {style: 'position:fixed;inset:0;z-index:2147483500;background:rgba(12,16,22,.72);' +
        'display:flex;align-items:center;justify-content:center;padding:16px;font:14px system-ui'});
    const card = element('div', {style: 'background:#fff;color:#18212b;border-radius:14px;width:min(680px,100%);' +
        'max-height:90vh;overflow:auto;padding:18px;box-shadow:0 18px 48px #0008'});
    card.appendChild(element('h2', {style: 'margin:0 0 6px'}, 'Virtual SPIKE Prime'));
    card.appendChild(element('p', {style: 'margin:0 0 14px;color:#596675'},
        'One simulated hub shared by modern BLE and Classic Scratch Link. Disconnect always stops its motors.'));

    const profile = element('select', {style: 'width:100%;padding:8px;margin-bottom:12px'});
    for (const [value, target] of Object.entries(SPIKE_FIRMWARE_TARGETS)) {
        profile.appendChild(element('option', {value}, `${target.label} — ${target.summary}`));
    }
    profile.value = hubState.data.firmwareTarget;
    const profileStatus = element('p', {style: 'margin:-6px 0 12px;color:#596675'});
    const updateProfileControls = () => {
        const target = spikeFirmwareTarget(profile.value);
        classic.checked = target.classic;
        classic.disabled = !target.classic;
        profileStatus.textContent = target.summary;
    };
    profile.addEventListener('change', () => {
        hubState.setFirmwareTarget(profile.value);
        updateProfileControls();
    });
    card.appendChild(profile);

    const classic = element('input', {type: 'checkbox'});
    classic.checked = globalThis.__brickwrightUseVirtualSpike === true;
    classic.addEventListener('change', () => { globalThis.__brickwrightUseVirtualSpike = classic.checked; });
    const classicLabel = element('label', {style: 'display:flex;gap:8px;margin-bottom:12px'});
    classicLabel.append(classic, document.createTextNode('Enable virtual Classic Scratch Link'));
    card.appendChild(classicLabel);
    card.appendChild(profileStatus);
    updateProfileControls();

    const battery = element('input', {type: 'range', min: '0', max: '100', value: String(hubState.data.battery)});
    const batteryLabel = element('label', {style: 'display:grid;grid-template-columns:110px 1fr 42px;gap:8px'});
    const batteryValue = element('span', {}, `${hubState.data.battery}%`);
    battery.addEventListener('input', () => { hubState.setBattery(battery.value); batteryValue.textContent = `${battery.value}%`; });
    batteryLabel.append(element('span', {}, 'Battery'), battery, batteryValue);
    card.appendChild(batteryLabel);

    const brick = element('div', {style: 'margin-top:14px;padding:14px;border-radius:18px;background:#7654c6;' +
        'box-shadow:inset 0 -5px 0 #54379d;color:white'});
    brick.appendChild(element('div', {style: 'text-align:center;font-weight:700;margin-bottom:10px'},
        'BRICKWRIGHT · SPIKE PRIME'));
    const portView = element('div', {style: 'display:grid;grid-template-columns:repeat(6,1fr);gap:7px'});
    const portLabels = [];
    for (const port of 'ABCDEF') {
        const socket = element('div', {style: 'background:#241d36;border:3px solid #b9adcf;border-radius:8px;' +
            'padding:7px 3px;text-align:center;min-width:0'});
        socket.appendChild(element('strong', {}, port));
        const status = element('div', {style: 'font-size:10px;overflow:hidden;text-overflow:ellipsis'}, 'empty');
        socket.appendChild(status);
        portLabels.push(status);
        portView.appendChild(socket);
    }
    brick.appendChild(portView);
    card.appendChild(brick);
    const refreshBrick = () => hubState.data.sensors.forEach((sensor, index) => {
        if (!sensor) portLabels[index].textContent = 'empty';
        else if (sensor.kind === 'motor') portLabels[index].textContent = `motor ${hubState.data.motors[index].speed}%`;
        else if (sensor.kind === 'distance') portLabels[index].textContent = `${sensor.distance ?? -1} mm`;
        else if (sensor.kind === 'force') portLabels[index].textContent = `force ${sensor.force ?? 0}%`;
        else portLabels[index].textContent = sensor.kind;
    });
    refreshBrick();
    const unsubscribe = hubState.subscribe(refreshBrick);

    const grid = element('div', {style: 'display:grid;grid-template-columns:40px 140px 1fr;gap:8px;margin-top:14px'});
    for (const port of 'ABCDEF') {
        const kind = element('select');
        for (const name of ['none', 'motor', 'distance', 'color', 'force', 'matrix3']) {
            kind.appendChild(element('option', {value: name}, name));
        }
        const value = element('input', {type: 'number', value: '0', min: '-1000', max: '1000'});
        const apply = () => applyVirtualPortInput(hubState, port, kind.value, value.value);
        kind.addEventListener('change', apply);
        value.addEventListener('input', apply);
        grid.append(element('strong', {}, port), kind, value);
    }
    card.appendChild(grid);

    const imu = element('div', {style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px'});
    for (const axis of ['yaw', 'pitch', 'roll']) {
        const input = element('input', {type: 'number', value: String(hubState.data.imu[axis])});
        input.addEventListener('input', () => hubState.setImu({[axis]: Number(input.value)}));
        const label = element('label', {style: 'display:flex;flex-direction:column;gap:4px'}, axis);
        label.appendChild(input);
        imu.appendChild(label);
    }
    card.appendChild(imu);
    const close = element('button', {style: 'margin-top:16px;padding:9px 18px'}, 'Done');
    close.addEventListener('click', () => { unsubscribe(); closeVirtualSpikePanel(); });
    card.appendChild(close);
    shade.appendChild(card);
    document.body.appendChild(shade);
    panel = shade;
    return shade;
};

export default function initVirtualSpikePanel (hubState) {
    if (typeof window === 'undefined') return 'no window';
    window.addEventListener('bw-open-virtual-spike', () => openVirtualSpikePanel(hubState));
    return 'installed';
}

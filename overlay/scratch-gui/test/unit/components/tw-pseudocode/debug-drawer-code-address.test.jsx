import React from 'react';
import {DebugDrawer} from '../../../../src/components/tw-pseudocode/debug-drawer.jsx';

const stringsIn = value => {
    const out = [];
    const visit = node => {
        if (typeof node === 'string' || typeof node === 'number') out.push(String(node));
        else if (Array.isArray(node)) node.forEach(visit);
        else if (React.isValidElement(node)) visit(node.props.children);
    };
    visit(value);
    return out;
};

const elementsIn = value => {
    const out = [];
    const visit = node => {
        if (Array.isArray(node)) node.forEach(visit);
        else if (React.isValidElement(node)) {
            out.push(node);
            visit(node.props.children);
        }
    };
    visit(value);
    return out;
};

const drawer = runner => {
    const component = new DebugDrawer({runner, ui: null, locale: 'en'});
    component.forceUpdate = jest.fn();
    return component;
};

test('the real code row renders and clicks the same high physical address', () => {
    const runner = {
        inspect: () => ({flavor: 'generic', regs: {pc: 0x1f000}}),
        listing: () => [{addr: 0x1f000, bytes: [0x90], text: 'nop'}],
        addressBreakpoints: () => [],
        toggleAddressBreakpoint: jest.fn()
    };
    const component = drawer(runner);
    const tree = component.renderCode();
    const row = elementsIn(tree).find(element =>
        element.props.role === 'button' && stringsIn(element).includes('1F000'));
    expect(row).toBeDefined();
    row.props.onClick();
    expect(runner.toggleAddressBreakpoint).toHaveBeenCalledWith(0x1f000);
    expect(component.forceUpdate).toHaveBeenCalledTimes(1);
});

test('generic PC is lossless and the 8051 PC deliberately stays four digits', () => {
    const generic = drawer({inspect: () => ({flavor: 'generic', regs: {pc: 0x1f000}})});
    expect(stringsIn(generic.renderNow())).toContain('1F000');

    const classic = drawer({inspect: () => ({
        flavor: '8051',
        regs: {pc: 0x10002, a: 0, b: 0, dptr: 0, sp: 7, psw: 0, bank: 0, r: Array(8).fill(0)}
    })});
    const rendered = stringsIn(classic.renderNow());
    expect(rendered).toContain('0002');
    expect(rendered).not.toContain('10002');
});

test('a target with no listing renders the explicit unsupported state', () => {
    const component = drawer({inspect: () => ({flavor: 'generic', regs: {pc: 0x08000000}}), listing: () => []});
    expect(stringsIn(component.renderCode())).toContain('no disassembly on this target');
});

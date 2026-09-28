// SPDX-License-Identifier: BSD-3-Clause
// Draws an arena snapshot on a 2D canvas context. It reads only the world and
// ArenaSim.snapshot(), so any other view (three.js later) can draw the same
// state; nothing here feeds back into the simulation.

import {MAT_COLORS} from './arena-sim.js';
import {convexPieces, toWorld} from './geometry.js';

const ZONE_STYLE = {
    goal: {fill: 'rgba(56, 132, 255, 0.22)', stroke: '#1c64d8', dash: [6, 4]},
    checkpoint: {fill: 'rgba(56, 200, 120, 0.20)', stroke: '#1f8f4e', dash: [3, 3]},
    hazard: {fill: 'rgba(210, 40, 40, 0.28)', stroke: '#b42318', dash: []},
    area: {fill: 'rgba(255, 255, 255, 0.10)', stroke: 'rgba(40, 40, 40, 0.45)', dash: [2, 5]}
};

const pathShape = (ctx, shape) => {
    ctx.beginPath();
    if (shape.type === 'circle') { ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2); return; }
    if (shape.type === 'line') {
        shape.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        return;
    }
    const poly = convexPieces(shape)[0].poly;
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
};

const fillShape = (ctx, shape, fill, stroke, lineWidth = 0.4) => {
    if (shape.type === 'line') {
        pathShape(ctx, shape);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = shape.width || 1;
        ctx.strokeStyle = fill;
        ctx.stroke();
        return;
    }
    pathShape(ctx, shape);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
};

const polygon = (ctx, points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} world the challenge
 * @param {object} snapshot ArenaSim.snapshot() (+ verdict)
 * @param {object} robot the driving base (bridge.robot)
 * @param {number} scale canvas pixels per cm
 */
export const drawArena = (ctx, world, snapshot, robot, scale) => {
    const {mat} = world;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = mat.paint || (MAT_COLORS[mat.background] || MAT_COLORS.white).draw;
    ctx.fillRect(0, 0, mat.width, mat.height);
    for (const entry of mat.shapes || []) {
        fillShape(ctx, entry.shape, entry.paint || (MAT_COLORS[entry.color] || MAT_COLORS.white).draw);
    }
    for (const zone of world.zones || []) {
        const style = ZONE_STYLE[zone.role] || ZONE_STYLE.area;
        ctx.setLineDash(style.dash);
        if (zone.shape.type === 'line') {
            pathShape(ctx, zone.shape);
            ctx.lineWidth = zone.shape.width;
            ctx.strokeStyle = style.fill;
            ctx.lineCap = 'round';
            ctx.stroke();
        } else fillShape(ctx, zone.shape, style.fill, style.stroke, 0.5);
        ctx.setLineDash([]);
    }
    for (const wall of world.walls || []) fillShape(ctx, wall.shape, '#4a3f3a', '#2b2421', 0.4);
    for (const object of snapshot.objects || []) {
        const source = (world.objects || []).find(o => o.id === object.id) || {};
        fillShape(ctx, object.shape, source.color || '#7a5a48', '#3b2a20', 0.4);
    }
    // The trail.
    if (snapshot.trail && snapshot.trail.length > 1) {
        ctx.beginPath();
        snapshot.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineTo(snapshot.pose.x, snapshot.pose.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([1.5, 1]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    // The rover: body, wheels, a heading notch, sensors.
    const pose = snapshot.pose;
    polygon(ctx, snapshot.footprint);
    ctx.fillStyle = snapshot.blocked ? '#ffd8a8' : '#f8f9fa';
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#212529';
    ctx.stroke();
    const half = robot.axleTrack / 2;
    const radius = robot.wheelDiameter / 2;
    const width = robot.wheel.width;
    for (const side of [-1, 1]) {
        const y = side * half;
        polygon(ctx, [[-radius, y - width / 2], [radius, y - width / 2], [radius, y + width / 2], [-radius, y + width / 2]]
            .map(p => toWorld(pose, p)));
        ctx.fillStyle = '#343a40';
        ctx.fill();
    }
    polygon(ctx, [[robot.body.front - 0.5, 0], [robot.body.front - 3.5, -2], [robot.body.front - 3.5, 2]].map(p => toWorld(pose, p)));
    ctx.fillStyle = '#f59f00';
    ctx.fill();
    for (const sensor of snapshot.sensorPoses || []) {
        const reading = snapshot.sensors[sensor.port] || {};
        if (sensor.kind === 'color') {
            ctx.beginPath();
            ctx.arc(sensor.x, sensor.y, 1.1, 0, Math.PI * 2);
            ctx.fillStyle = (MAT_COLORS[reading.colorName] || MAT_COLORS.white).draw;
            ctx.fill();
            ctx.lineWidth = 0.35;
            ctx.strokeStyle = '#212529';
            ctx.stroke();
        } else if (sensor.kind === 'distance') {
            const length = reading.distance > 0 ? reading.distance / 10 : 0;
            if (length) {
                const angle = sensor.heading * Math.PI / 180;
                ctx.beginPath();
                ctx.moveTo(sensor.x, sensor.y);
                ctx.lineTo(sensor.x + length * Math.cos(angle), sensor.y + length * Math.sin(angle));
                ctx.strokeStyle = 'rgba(28, 126, 214, 0.8)';
                ctx.lineWidth = 0.35;
                ctx.setLineDash([1, 1]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.arc(sensor.x, sensor.y, 0.9, 0, Math.PI * 2);
            ctx.fillStyle = '#1c7ed6';
            ctx.fill();
        } else if (sensor.kind === 'force') {
            ctx.beginPath();
            ctx.arc(sensor.x, sensor.y, 0.8, 0, Math.PI * 2);
            ctx.fillStyle = reading.pressed ? '#e03131' : '#868e96';
            ctx.fill();
        }
    }
    ctx.restore();
};

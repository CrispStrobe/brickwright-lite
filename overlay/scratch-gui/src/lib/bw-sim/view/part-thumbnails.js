// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Small pictures of parts for the Build palette (Tinkercad's shape panel): each
// part drawn from its real LDraw geometry, in the colour it is placed in, with
// its LDraw edge lines, from the front-right above (editor/palette.js
// `thumbnailCamera` frames it). ONE offscreen WebGL renderer draws them all, a
// part at a time, when the pane asks for it (an item scrolled into view or a
// category opened); a picture is kept as a PNG data URL per part, so it is drawn
// once per page however often the palette is re-rendered or Build is reopened.
// Without WebGL `createPartThumbnails` returns null and the palette shows names.

import {Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer} from 'three';
import {partGeometry, partVisual} from './part-geometry.js';
import {PART_SURFACE, addEdgeLines, addPartLights, edgeMaterials} from './part-style.js';
import {webglAvailable} from './sim-view3d.js';
import {thumbnailCamera} from '../editor/palette.js';

/** Marks the thumbnail renderer's canvas (and, for scripts/verify-boot-payload.mjs, this module's chunk). */
export const THUMBNAIL_TESTID = 'bw-sim-part-thumbnails';
/** Pixels per side of a thumbnail (shown at about half that, so it stays sharp on a 2x screen). */
export const THUMBNAIL_PX = 128;

/** Pictures already drawn, by part and colour: survive the renderer (a Build session) for the page's life. */
const drawn = new Map();

/**
 * @param {object} options
 * @param {Function} options.read LDraw file reader
 * @param {Map} options.colors LDraw colours (parseLDConfig)
 * @param {number} options.color LDraw colour code the parts are drawn in
 * @param {number} [options.size] pixels per side
 * @returns {{get: (part: string) => string|null, render: (part: string) => string|null, dispose: () => void}|null}
 *          null when this browser has no WebGL 2
 */
export const createPartThumbnails = ({read, colors, color, size = THUMBNAIL_PX}) => {
    if (!webglAvailable()) return null;
    let renderer;
    try {
        renderer = new WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
    } catch {
        return null;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0); // transparent: the tile's own background shows
    renderer.domElement.dataset.testid = THUMBNAIL_TESTID;
    const scene = new Scene();
    addPartLights(scene);
    const camera = new PerspectiveCamera(30, 1, 0.001, 10);
    const info = colors.get(color) || colors.get(16);
    const faces = [
        new MeshStandardMaterial({color: info ? info.value : '#cccccc', ...PART_SURFACE}),
        new MeshStandardMaterial({color: '#ffffff', ...PART_SURFACE, vertexColors: true})
    ];
    const lines = edgeMaterials(color, colors);
    const key = part => `${part}@${color}`;

    const render = part => {
        if (drawn.has(key(part))) return drawn.get(key(part));
        let url = null;
        try {
            const geometry = partGeometry(part, read, colors);
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const mesh = new Mesh(geometry, faces);
            addEdgeLines(mesh, partVisual(part, read, colors), lines);
            scene.add(mesh);
            const view = thumbnailCamera({min: box.min.toArray(), max: box.max.toArray()}, {fov: camera.fov, aspect: 1});
            camera.position.fromArray(view.position);
            camera.up.fromArray(view.up);
            camera.lookAt(...view.target);
            camera.near = view.near;
            camera.far = view.far;
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
            url = renderer.domElement.toDataURL('image/png');
            scene.remove(mesh); // the geometry is part-geometry.js's cache: not disposed here
        } catch {
            url = null; // a part whose files are missing keeps its name only
        }
        drawn.set(key(part), url);
        return url;
    };

    return {
        get: part => drawn.get(key(part)) ?? null,
        has: part => drawn.has(key(part)),
        render,
        dispose () {
            for (const m of [...faces, ...lines.edges, ...lines.conditional]) m.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
        }
    };
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// How LEGO parts look in both Robot Lab views (Simulate and Build), in one
// place so they match: the face material's surface, the LDraw edge-line
// materials (including the conditional-line shader) and the studio light.
// Geometry comes from part-geometry.js; this module only styles it.

import {Color, DirectionalLight, HemisphereLight, LineBasicMaterial, LineSegments, ShaderMaterial} from 'three';

/**
 * Faces sit a little behind their edge lines, so a line drawn exactly on a
 * face's border is never hidden by depth fighting. Spread into the face
 * materials' parameters.
 */
export const FACE_POLYGON_OFFSET = Object.freeze({polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});

/**
 * Face material parameters for a part: LEGO ABS is a dielectric with a satin
 * sheen (no metalness, moderate roughness), behind its edge lines.
 */
export const PART_SURFACE = Object.freeze({roughness: 0.45, metalness: 0, ...FACE_POLYGON_OFFSET});

/**
 * LDraw's conditional-line rule, on the GPU: a type-5 line from p1 to p2 with
 * control points c1, c2 is drawn only when c1 and c2 project to the SAME side
 * of the projected line, i.e. where the line is on the curved surface's
 * silhouette from the current view. Otherwise the vertex shader flags it and
 * the fragment shader discards it. (The rule as in three's LDrawLoader.)
 * @param {string|number|Color} color sRGB colour, multiplied by the vertex colour
 * @returns {ShaderMaterial}
 */
export const conditionalEdgeMaterial = color => new ShaderMaterial({
    uniforms: {diffuse: {value: new Color(color)}},
    vertexShader: /* glsl */`
        attribute vec3 control0;
        attribute vec3 control1;
        attribute vec3 direction;
        attribute vec3 color;
        varying float vDiscard;
        varying vec3 vColor;
        void main () {
            vColor = color;
            mat4 mvp = projectionMatrix * modelViewMatrix;
            vec4 c0 = mvp * vec4(control0, 1.0);
            vec4 c1 = mvp * vec4(control1, 1.0);
            vec4 p0 = mvp * vec4(position, 1.0);
            vec4 p1 = mvp * vec4(position + direction, 1.0);
            vec2 a = p0.xy / p0.w;
            vec2 b = p1.xy / p1.w;
            vec2 normal = vec2(a.y - b.y, b.x - a.x);
            float d0 = dot(normal, c0.xy / c0.w - a);
            float d1 = dot(normal, c1.xy / c1.w - a);
            vDiscard = d0 * d1 < 0.0 ? 1.0 : 0.0;
            gl_Position = p0;
        }`,
    fragmentShader: /* glsl */`
        uniform vec3 diffuse;
        varying float vDiscard;
        varying vec3 vColor;
        void main () {
            if (vDiscard > 0.5) discard;
            gl_FragColor = vec4(diffuse * vColor, 1.0);
            #include <colorspace_fragment>
        }`
});

/**
 * The line materials for parts placed in LDraw colour `code`: group 0 in the
 * colour's LDConfig EDGE value, group 1 (fixed colours) from vertex colours.
 * Share one set per colour; the caller disposes them.
 * @returns {{edges: LineBasicMaterial[], conditional: ShaderMaterial[]}}
 */
export const edgeMaterials = (code, colors) => {
    const info = colors.get(code) || colors.get(16);
    const edge = info ? info.edge : '#333333';
    return {
        edges: [new LineBasicMaterial({color: edge}), new LineBasicMaterial({color: '#ffffff', vertexColors: true})],
        conditional: [conditionalEdgeMaterial(edge), conditionalEdgeMaterial('#ffffff')]
    };
};

/**
 * Add a part's edge and conditional-edge lines to its face mesh as children,
 * so they follow every move of the mesh (a physics body, an editor drag).
 * They are not raycast targets: the views pick meshes non-recursively.
 * @param {Mesh} mesh
 * @param {{edges: BufferGeometry, conditional: BufferGeometry}} visual from partVisual
 * @param {{edges: LineBasicMaterial[], conditional: ShaderMaterial[]}} materials from edgeMaterials
 */
export const addEdgeLines = (mesh, visual, materials) => {
    for (const kind of ['edges', 'conditional']) {
        if (!visual[kind].attributes.position.count) continue;
        const lines = new LineSegments(visual[kind], materials[kind]);
        lines.name = `${mesh.name}:${kind}`;
        lines.userData.edgeLines = kind;
        lines.raycast = () => {};
        mesh.add(lines);
    }
};

/**
 * Studio light for LEGO parts: a sky/floor hemisphere instead of a flat
 * ambient term (tops read lighter than undersides, so shapes read even in
 * shadow), a key light from the front-right above and a weak fill from the
 * back-left so no side goes flat black. A face lit by key and sky gets about
 * what the former ambient 0.6 + sun 1.2 gave, so LDraw colours keep their
 * brightness.
 * @param {import('three').Object3D} scene
 */
export const addPartLights = scene => {
    scene.add(new HemisphereLight(0xffffff, 0x9aa3ad, 1.1));
    const key = new DirectionalLight(0xffffff, 1.3);
    key.position.set(0.5, 1, 0.8);
    const fill = new DirectionalLight(0xffffff, 0.35);
    fill.position.set(-0.7, 0.4, -0.6);
    scene.add(key, fill);
};

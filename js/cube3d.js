/**
 * @fileoverview 3D Rubik's Cube visualization using Three.js.
 * Renders a premium-looking 3×3×3 cube with animated face rotations,
 * facelet-level color state management, and smooth eased transitions.
 * @module cube3d
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Sticker color palette keyed by standard Rubik's face letters. */
const STICKER_COLORS = {
    'U': 0xFFFFFF,  // white
    'R': 0xFF3B30,  // red
    'F': 0x34C759,  // green
    'D': 0xFFD60A,  // yellow
    'L': 0xFF9500,  // orange
    'B': 0x007AFF,  // blue
};

/** Dark color used for internal (non-sticker) cubie faces. */
const INTERNAL_COLOR = 0x1a1a1a;

/**
 * Material face indices for BoxGeometry / RoundedBoxGeometry.
 * Order: +x, -x, +y, -y, +z, -z  →  indices 0–5.
 */
const FACE_INDEX = {
    '+x': 0,
    '-x': 1,
    '+y': 2,
    '-y': 3,
    '+z': 4,
    '-z': 5,
};

/**
 * Cubic ease-in-out for silky smooth animation.
 * @param {number} t - Progress in [0, 1].
 * @returns {number} Eased value in [0, 1].
 */
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Build the complete facelet → (cubie position, face direction) mapping.
 * Returns an array of 54 entries: `{ pos: {x,y,z}, face: string }`.
 *
 * Facelet string order: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53).
 * Each face is a 3×3 grid:
 * ```
 * [0] [1] [2]
 * [3] [4] [5]
 * [6] [7] [8]
 * ```
 * @returns {Array<{pos: {x:number,y:number,z:number}, face: string}>}
 */
function buildFaceletMap() {
    const map = new Array(54);

    // ── U face  (y = 1, +y sticker) ──────────────────────────────
    const U = [
        { x: -1, y: 1, z: -1 }, { x: 0, y: 1, z: -1 }, { x: 1, y: 1, z: -1 },
        { x: -1, y: 1, z:  0 }, { x: 0, y: 1, z:  0 }, { x: 1, y: 1, z:  0 },
        { x: -1, y: 1, z:  1 }, { x: 0, y: 1, z:  1 }, { x: 1, y: 1, z:  1 },
    ];
    for (let i = 0; i < 9; i++) map[i] = { pos: U[i], face: '+y' };

    // ── R face  (x = 1, +x sticker) - Kociemba: Left=F, Right=B -> Front to Back ──
    const R = [
        { x: 1, y:  1, z:  1 }, { x: 1, y:  1, z:  0 }, { x: 1, y:  1, z: -1 },
        { x: 1, y:  0, z:  1 }, { x: 1, y:  0, z:  0 }, { x: 1, y:  0, z: -1 },
        { x: 1, y: -1, z:  1 }, { x: 1, y: -1, z:  0 }, { x: 1, y: -1, z: -1 },
    ];
    for (let i = 0; i < 9; i++) map[9 + i] = { pos: R[i], face: '+x' };

    // ── F face  (z = 1, +z sticker) ─────────────────────────────
    const F = [
        { x: -1, y:  1, z: 1 }, { x: 0, y:  1, z: 1 }, { x: 1, y:  1, z: 1 },
        { x: -1, y:  0, z: 1 }, { x: 0, y:  0, z: 1 }, { x: 1, y:  0, z: 1 },
        { x: -1, y: -1, z: 1 }, { x: 0, y: -1, z: 1 }, { x: 1, y: -1, z: 1 },
    ];
    for (let i = 0; i < 9; i++) map[18 + i] = { pos: F[i], face: '+z' };

    // ── D face  (y = -1, -y sticker) ────────────────────────────
    const D = [
        { x: -1, y: -1, z:  1 }, { x: 0, y: -1, z:  1 }, { x: 1, y: -1, z:  1 },
        { x: -1, y: -1, z:  0 }, { x: 0, y: -1, z:  0 }, { x: 1, y: -1, z:  0 },
        { x: -1, y: -1, z: -1 }, { x: 0, y: -1, z: -1 }, { x: 1, y: -1, z: -1 },
    ];
    for (let i = 0; i < 9; i++) map[27 + i] = { pos: D[i], face: '-y' };

    // ── L face  (x = -1, -x sticker) - Kociemba: Left=B, Right=F -> Back to Front ──
    const L = [
        { x: -1, y:  1, z: -1 }, { x: -1, y:  1, z:  0 }, { x: -1, y:  1, z:  1 },
        { x: -1, y:  0, z: -1 }, { x: -1, y:  0, z:  0 }, { x: -1, y:  0, z:  1 },
        { x: -1, y: -1, z: -1 }, { x: -1, y: -1, z:  0 }, { x: -1, y: -1, z:  1 },
    ];
    for (let i = 0; i < 9; i++) map[36 + i] = { pos: L[i], face: '-x' };

    // ── B face  (z = -1, -z sticker) ────────────────────────────
    const B = [
        { x:  1, y:  1, z: -1 }, { x: 0, y:  1, z: -1 }, { x: -1, y:  1, z: -1 },
        { x:  1, y:  0, z: -1 }, { x: 0, y:  0, z: -1 }, { x: -1, y:  0, z: -1 },
        { x:  1, y: -1, z: -1 }, { x: 0, y: -1, z: -1 }, { x: -1, y: -1, z: -1 },
    ];
    for (let i = 0; i < 9; i++) map[45 + i] = { pos: B[i], face: '-z' };

    return map;
}

/**
 * Move definitions: which axis to rotate around, which slice value to select,
 * and the base rotation angle (before prime / double modifiers).
 * Positive angle = counter-clockwise when looking from the positive end of the axis.
 * We follow the Singmaster convention where a "clockwise" turn of a face
 * means clockwise when looking directly AT that face.
 */
const MOVE_DEFS = {
    'R': { axis: 'x', slice:  1, angle: -Math.PI / 2 },
    'L': { axis: 'x', slice: -1, angle:  Math.PI / 2 },
    'U': { axis: 'y', slice:  1, angle: -Math.PI / 2 },
    'D': { axis: 'y', slice: -1, angle:  Math.PI / 2 },
    'F': { axis: 'z', slice:  1, angle: -Math.PI / 2 },
    'B': { axis: 'z', slice: -1, angle:  Math.PI / 2 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Cube3D class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interactive 3D Rubik's Cube rendered in a DOM container.
 *
 * @example
 * const cube = new Cube3D(document.getElementById('viewer'));
 * cube.setState('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
 * await cube.animateMove("R'", 400);
 */
export class Cube3D {
    /**
     * @param {HTMLElement} container - DOM element to render into.
     */
    constructor(container) {
        /** @type {HTMLElement} */
        this.container = container;

        // ── Scene ────────────────────────────────────────────────
        /** @type {THREE.Scene} */
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);

        // ── Camera ───────────────────────────────────────────────
        const aspect = container.clientWidth / container.clientHeight || 1;
        /** @type {THREE.PerspectiveCamera} */
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.camera.position.set(5, 4, 5);
        this.camera.lookAt(0, 0, 0);

        // ── Renderer ─────────────────────────────────────────────
        /** @type {THREE.WebGLRenderer} */
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        container.appendChild(this.renderer.domElement);

        // ── Lighting ─────────────────────────────────────────────
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        // Extra fill light from the opposite side for a premium look
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-4, -2, -4);
        this.scene.add(fillLight);

        // ── Controls ─────────────────────────────────────────────
        /** @type {OrbitControls} */
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.autoRotate = false;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 15;
        this.controls.enablePan = false;

        // ── Cubies ───────────────────────────────────────────────
        /**
         * All 26 visible cubies.
         * Each entry: `{ mesh, materials, position: {x,y,z} }`
         * `materials` is the 6-element array assigned to the mesh.
         * @type {Array<{mesh: THREE.Mesh, materials: THREE.MeshStandardMaterial[], position: {x:number,y:number,z:number}, edges: THREE.LineSegments}>}
         */
        this.cubies = [];

        /** @type {Array<{pos:{x:number,y:number,z:number}, face:string}>} */
        this._faceletMap = buildFaceletMap();

        /** Whether an animation is currently in-flight. */
        this._animating = false;

        this._buildCube();

        // ── Animation loop ───────────────────────────────────────
        /** @type {number|null} */
        this._rafId = null;
        this._animate = this._animate.bind(this);
        this._animate();

        // ── Resize observer ──────────────────────────────────────
        /** @type {ResizeObserver} */
        this._resizeObserver = new ResizeObserver(() => this.resize());
        this._resizeObserver.observe(container);
    }

    // ─────────────────────────────────────────────────────────────
    // Cube construction
    // ─────────────────────────────────────────────────────────────

    /**
     * Build the 26 cubies and add them to the scene.
     * @private
     */
    _buildCube() {
        const geometry = new RoundedBoxGeometry(0.93, 0.93, 0.93, 4, 0.06);

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    // Skip the invisible center cubie
                    if (x === 0 && y === 0 && z === 0) continue;

                    const materials = this._buildCubieMaterials(x, y, z);
                    const mesh = new THREE.Mesh(geometry, materials);
                    mesh.position.set(x, y, z);

                    // Thin black edge lines for a premium frame look
                    const edgeGeometry = new THREE.EdgesGeometry(geometry, 15);
                    const edgeMaterial = new THREE.LineBasicMaterial({
                        color: 0x000000,
                        linewidth: 1,
                        transparent: true,
                        opacity: 0.6,
                    });
                    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
                    mesh.add(edges);

                    this.scene.add(mesh);
                    this.cubies.push({ mesh, materials, edges, position: { x, y, z } });
                }
            }
        }
    }

    /**
     * Create the 6 materials for a cubie at the given grid position.
     * Outer faces get a colored sticker material; inner faces get dark plastic.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {THREE.MeshStandardMaterial[]} Array of 6 materials.
     * @private
     */
    _buildCubieMaterials(x, y, z) {
        /**
         * Helper: if the face is exposed on the outside, return a sticker
         * material with a default solved-state color; otherwise dark plastic.
         */
        const mat = (exposed, defaultColor) => {
            if (exposed) {
                return new THREE.MeshStandardMaterial({
                    color: defaultColor,
                    roughness: 0.3,
                    metalness: 0.05,
                    flatShading: false,
                });
            }
            return new THREE.MeshStandardMaterial({
                color: INTERNAL_COLOR,
                roughness: 0.9,
                metalness: 0.0,
            });
        };

        // Material order: +x, -x, +y, -y, +z, -z
        return [
            mat(x ===  1, STICKER_COLORS['R']),  // +x  → R
            mat(x === -1, STICKER_COLORS['L']),  // -x  → L
            mat(y ===  1, STICKER_COLORS['U']),  // +y  → U
            mat(y === -1, STICKER_COLORS['D']),  // -y  → D
            mat(z ===  1, STICKER_COLORS['F']),  // +z  → F
            mat(z === -1, STICKER_COLORS['B']),  // -z  → B
        ];
    }

    // ─────────────────────────────────────────────────────────────
    // State management
    // ─────────────────────────────────────────────────────────────

    /**
     * Set the cube's visual state from a 54-character facelet string.
     *
     * The string uses face letters (U R F D L B) to indicate colors.
     * Order: U0-U8, R0-R8, F0-F8, D0-D8, L0-L8, B0-B8.
     *
     * **Important:** This resets cubie positions to their solved-state grid
     * locations so the facelet map is valid again.
     *
     * @param {string} faceletString - 54-char cube state.
     */
    setState(faceletString) {
        if (faceletString.length !== 54) {
            console.error(`setState: expected 54 chars, got ${faceletString.length}`);
            return;
        }

        // Reset every cubie back to its home position so the facelet map
        // (which is defined relative to solved positions) works correctly.
        this._resetCubiePositions();

        for (let i = 0; i < 54; i++) {
            const letter = faceletString[i];
            const color = STICKER_COLORS[letter];
            if (color === undefined) {
                console.warn(`setState: unknown facelet letter '${letter}' at index ${i}`);
                continue;
            }
            const { pos, face } = this._faceletMap[i];
            const cubie = this._findCubieAt(pos.x, pos.y, pos.z);
            if (!cubie) continue;
            const matIdx = FACE_INDEX[face];
            cubie.materials[matIdx].color.setHex(color);
            cubie.materials[matIdx].needsUpdate = true;
        }
    }

    /**
     * Reset all cubies to their original grid positions and clear rotations.
     * @private
     */
    _resetCubiePositions() {
        let idx = 0;
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    if (x === 0 && y === 0 && z === 0) continue;
                    const cubie = this.cubies[idx];
                    cubie.mesh.position.set(x, y, z);
                    cubie.mesh.rotation.set(0, 0, 0);
                    cubie.mesh.updateMatrix();
                    cubie.position = { x, y, z };
                    idx++;
                }
            }
        }
    }

    /**
     * Find a cubie whose tracked position matches (x, y, z).
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {{mesh: THREE.Mesh, materials: THREE.MeshStandardMaterial[], position: {x:number,y:number,z:number}}|undefined}
     * @private
     */
    _findCubieAt(x, y, z) {
        return this.cubies.find(c =>
            Math.round(c.position.x) === x &&
            Math.round(c.position.y) === y &&
            Math.round(c.position.z) === z
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Move animation
    // ─────────────────────────────────────────────────────────────

    /**
     * Animate a single move on the cube.
     *
     * @param {string} move - Singmaster notation (e.g. "R", "U'", "F2").
     * @param {number} [duration=400] - Animation duration in milliseconds.
     * @returns {Promise<void>} Resolves when the animation completes.
     */
    animateMove(move, duration = 400) {
        return new Promise((resolve, reject) => {
            // Parse move string
            const face = move[0];
            const modifier = move.substring(1); // '', "'", or '2'

            const def = MOVE_DEFS[face];
            if (!def) {
                console.error(`animateMove: unknown face '${face}'`);
                resolve();
                return;
            }

            let angle = def.angle;
            if (modifier === "'") angle = -angle;
            else if (modifier === '2') angle *= 2;

            const { axis, slice } = def;

            // Select affected cubies (those in the rotating slice)
            const affected = this.cubies.filter(c => {
                const val = Math.round(c.position[axis]);
                return val === slice;
            });

            if (affected.length === 0) {
                resolve();
                return;
            }

            // Create a temporary pivot group
            const pivot = new THREE.Group();
            this.scene.add(pivot);

            // Reparent affected cubie meshes into the pivot
            for (const cubie of affected) {
                pivot.attach(cubie.mesh);
            }

            // Animate
            const startTime = performance.now();
            const axisVec = new THREE.Vector3(
                axis === 'x' ? 1 : 0,
                axis === 'y' ? 1 : 0,
                axis === 'z' ? 1 : 0,
            );

            const step = (now) => {
                const elapsed = now - startTime;
                const rawT = Math.min(elapsed / duration, 1);
                const t = easeInOutCubic(rawT);

                // Set pivot rotation
                pivot.setRotationFromAxisAngle(axisVec, angle * t);

                if (rawT < 1) {
                    requestAnimationFrame(step);
                } else {
                    // Snap to exact final rotation
                    pivot.setRotationFromAxisAngle(axisVec, angle);
                    pivot.updateMatrixWorld(true);

                    // Re-parent cubies back to the scene with world transforms baked in
                    for (const cubie of affected) {
                        this.scene.attach(cubie.mesh);

                        // Update tracked position (round to prevent drift)
                        cubie.position.x = Math.round(cubie.mesh.position.x);
                        cubie.position.y = Math.round(cubie.mesh.position.y);
                        cubie.position.z = Math.round(cubie.mesh.position.z);

                        // Snap mesh position to the rounded integer grid
                        cubie.mesh.position.set(
                            cubie.position.x,
                            cubie.position.y,
                            cubie.position.z,
                        );
                    }

                    // Cleanup pivot
                    this.scene.remove(pivot);

                    resolve();
                }
            };

            requestAnimationFrame(step);
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Render loop & resize
    // ─────────────────────────────────────────────────────────────

    /**
     * Main render loop (called via requestAnimationFrame).
     * @private
     */
    _animate() {
        this._rafId = requestAnimationFrame(this._animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Resize the renderer and camera to match the container's current dimensions.
     */
    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    // ─────────────────────────────────────────────────────────────
    // Cleanup
    // ─────────────────────────────────────────────────────────────

    /**
     * Dispose of all Three.js resources and observers.
     * Call this when removing the cube from the DOM.
     */
    dispose() {
        // Stop animation loop
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        // Remove resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        // Dispose controls
        this.controls.dispose();

        // Dispose cubies
        for (const cubie of this.cubies) {
            // Dispose each material
            for (const mat of cubie.materials) {
                mat.dispose();
            }
            // Dispose edge geometry / material
            if (cubie.mesh.children.length > 0) {
                for (const child of cubie.mesh.children) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                }
            }
            cubie.mesh.geometry.dispose();
            this.scene.remove(cubie.mesh);
        }
        this.cubies.length = 0;

        // Dispose renderer
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}

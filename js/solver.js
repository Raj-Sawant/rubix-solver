/**
 * @fileoverview Rubik's Cube solver wrapper around the `cubejs` library.
 * Expects `Cube` to be available on `window` (loaded via a `<script>` tag).
 * Provides async initialization (pruning table generation) and a solve method
 * that returns structured results.
 * @module solver
 */

/**
 * Wrapper around the cubejs `Cube` solver.
 *
 * Usage:
 * ```js
 * const solver = new CubeSolver();
 * await solver.initialize((pct) => console.log(`${pct}%`));
 * const result = solver.solve(faceletString);
 * if (result.success) {
 *     console.log('Solution:', result.moves.join(' '));
 * }
 * ```
 */
export class CubeSolver {
    constructor() {
        /** @type {boolean} Whether the pruning tables have been built */
        this.initialized = false;
        // Use a relative path from the html file
        this.worker = new Worker('js/solver.worker.js');
    }

    /**
     * Initializes the cubejs solver by building its internal pruning tables.
     * Runs asynchronously in a Web Worker.
     *
     * @param {function(number): void} [onProgress] - Optional callback receiving progress percentage
     * @returns {Promise<void>}
     */
    initialize(onProgress) {
        return new Promise((resolve, reject) => {
            if (this.initialized) return resolve();
            
            const handler = (e) => {
                if (e.data.action === 'init_done') {
                    this.initialized = true;
                    this.worker.removeEventListener('message', handler);
                    if (this.progressInterval) {
                        clearInterval(this.progressInterval);
                    }
                    if (onProgress) onProgress(100);
                    resolve();
                } else if (e.data.action === 'init_error') {
                    this.worker.removeEventListener('message', handler);
                    if (this.progressInterval) {
                        clearInterval(this.progressInterval);
                    }
                    reject(new Error(e.data.error));
                }
            };
            this.worker.addEventListener('message', handler);
            this.worker.postMessage({ action: 'init' });
            
            if (onProgress) onProgress(10);
            
            // Fake progress since we can't track inside the worker
            let p = 10;
            this.progressInterval = setInterval(() => {
                if (this.initialized) { clearInterval(this.progressInterval); return; }
                p = Math.min(p + 5, 90);
                if (onProgress) onProgress(p);
            }, 250);
        });
    }

    /**
     * Solves the cube described by the given facelet string.
     *
     * @param {string} faceletString - 54-character string in URFDLB order.
     * @returns {Promise<{success: boolean, moves: string[], moveCount: number, error: string|null}>}
     */
    async solve(faceletString) {
        if (!this.initialized) {
            return {
                success: false,
                moves: [],
                moveCount: 0,
                error: 'Solver has not been initialized. Call initialize() first.',
            };
        }

        return new Promise((resolve, reject) => {
            const handler = (e) => {
                if (e.data.action === 'solve_done') {
                    this.worker.removeEventListener('message', handler);
                    if (e.data.success) {
                        resolve({ success: true, moves: e.data.moves, moveCount: e.data.moves.length, error: null });
                    } else {
                        resolve({ success: false, moves: [], moveCount: 0, error: e.data.error });
                    }
                }
            };
            this.worker.addEventListener('message', handler);
            this.worker.postMessage({ action: 'solve', payload: { faceletString } });
        });
    }

    /**
     * Returns a human-readable description of a standard Rubik's Cube move.
     *
     * @param {string} move - Standard Rubik's Cube notation (e.g. "R", "U'", "F2").
     * @returns {string} Human-readable description, or the move itself if unknown.
     */
    static getMoveDescription(move) {
        /** @type {Object<string, string>} */
        const descriptions = {
            'R':  'Right face clockwise',
            "R'": 'Right face counter-clockwise',
            'R2': 'Right face 180°',
            'L':  'Left face clockwise',
            "L'": 'Left face counter-clockwise',
            'L2': 'Left face 180°',
            'U':  'Top face clockwise',
            "U'": 'Top face counter-clockwise',
            'U2': 'Top face 180°',
            'D':  'Bottom face clockwise',
            "D'": 'Bottom face counter-clockwise',
            'D2': 'Bottom face 180°',
            'F':  'Front face clockwise',
            "F'": 'Front face counter-clockwise',
            'F2': 'Front face 180°',
            'B':  'Back face clockwise',
            "B'": 'Back face counter-clockwise',
            'B2': 'Back face 180°',
        };

        return descriptions[move] || move;
    }
}

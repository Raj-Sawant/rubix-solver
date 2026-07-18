/**
 * @fileoverview Solution playback animator for the 3D Rubik's Cube.
 * Provides play / pause / step-forward / step-back / jump-to-start / jump-to-end
 * controls with adjustable speed, all driven by the {@link Cube3D} animation API.
 * @module animator
 */

import { Cube3D } from './cube3d.js';

/**
 * Orchestrates step-by-step or continuous playback of a move sequence
 * on a {@link Cube3D} instance.
 *
 * @example
 * const cube = new Cube3D(container);
 * const animator = new SolutionAnimator(cube);
 * animator.setMoves(["R", "U", "R'", "U'"], initialState);
 * animator.onUpdate((idx, total, move, playing) => {
 *     console.log(`Move ${idx + 1}/${total}: ${move}  playing=${playing}`);
 * });
 * await animator.play();
 */
export class SolutionAnimator {
    /**
     * @param {Cube3D} cube3d - The 3D cube instance to animate.
     */
    constructor(cube3d) {
        /** @type {Cube3D} */
        this.cube3d = cube3d;

        /**
         * Ordered list of moves (Singmaster notation strings).
         * @type {string[]}
         */
        this.moves = [];

        /**
         * The 54-char facelet string representing the state before any moves.
         * @type {string}
         */
        this.initialState = '';

        /**
         * Index of the most recently *completed* move.
         * `-1` means the cube is at the initial state (before the first move).
         * @type {number}
         * @private
         */
        this._currentIndex = -1;

        /** @private */
        this._isPlaying = false;

        /**
         * Playback speed multiplier (clamped to [0.25, 3]).
         * @type {number}
         * @private
         */
        this._speed = 1.0;

        /**
         * External callback notified on every state change.
         * @type {((currentIndex: number, totalMoves: number, currentMove: string|null, isPlaying: boolean) => void)|null}
         * @private
         */
        this._updateCallback = null;

        /** @private */
        this._cancelPlay = false;
    }

    // ─────────────────────────────────────────────────────────────
    // Public getters
    // ─────────────────────────────────────────────────────────────

    /** Index of the last completed move (-1 = initial state). */
    get currentIndex() {
        return this._currentIndex;
    }

    /** Total number of moves in the current sequence. */
    get totalMoves() {
        return this.moves.length;
    }

    /** Whether continuous playback is active. */
    get isPlaying() {
        return this._isPlaying;
    }

    // ─────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────

    /**
     * Load a move sequence and reset the cube to the initial state.
     *
     * @param {string[]} moves - Array of move strings (e.g. `["R", "U'", "F2"]`).
     * @param {string} initialState - 54-char facelet string for the starting position.
     */
    setMoves(moves, initialState) {
        this.pause();
        this.moves = moves;
        this.initialState = initialState;
        this._currentIndex = -1;
        this.cube3d.setState(initialState);
        this._notify();
    }

    /**
     * Register a callback that fires on every state change.
     *
     * @param {(currentIndex: number, totalMoves: number, currentMove: string|null, isPlaying: boolean) => void} callback
     */
    onUpdate(callback) {
        this._updateCallback = callback;
    }

    /**
     * Set the playback speed multiplier.
     * Clamped to the range [0.25, 3].
     *
     * @param {number} multiplier
     */
    setSpeed(multiplier) {
        this._speed = Math.max(0.25, Math.min(3, multiplier));
    }

    // ─────────────────────────────────────────────────────────────
    // Navigation
    // ─────────────────────────────────────────────────────────────

    /**
     * Advance one move forward with animation.
     * No-op if already at the last move.
     *
     * @returns {Promise<void>}
     */
    async next() {
        if (this._currentIndex >= this.moves.length - 1) return;
        this._currentIndex++;
        const move = this.moves[this._currentIndex];
        const duration = 400 / this._speed;
        await this.cube3d.animateMove(move, duration);
        this._notify();
    }

    /**
     * Go back one move by animating the inverse of the current move.
     * No-op if already at the initial state.
     *
     * @returns {Promise<void>}
     */
    async prev() {
        if (this._currentIndex < 0) return;
        const move = this.moves[this._currentIndex];
        const inverseMove = this._invertMove(move);
        this._currentIndex--;
        const duration = 400 / this._speed;
        await this.cube3d.animateMove(inverseMove, duration);
        this._notify();
    }

    /**
     * Jump to the initial state (before the first move) without animation.
     *
     * @returns {Promise<void>}
     */
    async goToStart() {
        this.pause();
        this._currentIndex = -1;
        this.cube3d.setState(this.initialState);
        this._notify();
    }

    /**
     * Jump to the end state by rapidly replaying all moves.
     * Uses a very short animation duration per move for visual feedback.
     *
     * @returns {Promise<void>}
     */
    async goToEnd() {
        this.pause();
        // Reset to initial state then replay all moves quickly
        this.cube3d.setState(this.initialState);
        for (let i = 0; i < this.moves.length; i++) {
            await this.cube3d.animateMove(this.moves[i], 50);
        }
        this._currentIndex = this.moves.length - 1;
        this._notify();
    }

    // ─────────────────────────────────────────────────────────────
    // Continuous playback
    // ─────────────────────────────────────────────────────────────

    /**
     * Begin continuous forward playback from the current position.
     * Resolves when playback finishes or is paused.
     *
     * @returns {Promise<void>}
     */
    async play() {
        if (this._isPlaying) return;
        this._isPlaying = true;
        this._cancelPlay = false;
        this._notify();

        while (this._currentIndex < this.moves.length - 1 && !this._cancelPlay) {
            await this.next();
            // Brief inter-move pause, scaled by speed
            if (!this._cancelPlay) {
                await new Promise(r => setTimeout(r, 100 / this._speed));
            }
        }

        this._isPlaying = false;
        this._cancelPlay = false;
        this._notify();
    }

    /**
     * Pause continuous playback.
     */
    pause() {
        this._cancelPlay = true;
        this._isPlaying = false;
        this._notify();
    }

    // ─────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────

    /**
     * Fire the update callback with the current state.
     * @private
     */
    _notify() {
        if (this._updateCallback) {
            const move = this._currentIndex >= 0 && this._currentIndex < this.moves.length
                ? this.moves[this._currentIndex]
                : null;
            this._updateCallback(this._currentIndex, this.moves.length, move, this._isPlaying);
        }
    }

    /**
     * Compute the inverse of a Singmaster move.
     *
     * - `R`  → `R'`
     * - `R'` → `R`
     * - `R2` → `R2` (self-inverse)
     *
     * @param {string} move
     * @returns {string} The inverse move.
     * @private
     */
    _invertMove(move) {
        if (move.endsWith('2')) return move;
        if (move.endsWith("'")) return move[0];
        return move + "'";
    }
}

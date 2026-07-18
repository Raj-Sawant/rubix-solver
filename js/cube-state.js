/**
 * @fileoverview Rubik's Cube state representation and validation.
 * Manages the 54 stickers (6 faces × 9 stickers) of a standard 3×3 Rubik's Cube.
 * @module cube-state
 */

/** @type {Object<string, string>} Maps face identifiers to their display hex colors */
export const FACE_COLORS = { U: '#FFFFFF', R: '#FF3B30', F: '#34C759', D: '#FFD60A', L: '#FF9500', B: '#007AFF' };

/** @type {Object<string, string>} Maps face identifiers to human-readable names */
export const FACE_NAMES = { U: 'Up (White)', R: 'Right (Red)', F: 'Front (Green)', D: 'Down (Yellow)', L: 'Left (Orange)', B: 'Back (Blue)' };

/** @type {string[]} Order in which faces are scanned by the camera */
export const SCAN_ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];

/** @type {string[]} Standard face ordering used for the facelet string */
export const ALL_FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

/**
 * Represents the full state of a 3×3 Rubik's Cube.
 *
 * Each face is stored as a 9-element array indexed left-to-right, top-to-bottom:
 * ```
 *  0 | 1 | 2
 * ---+---+---
 *  3 | 4 | 5
 * ---+---+---
 *  6 | 7 | 8
 * ```
 * Sticker values are single-character strings: 'U','R','F','D','L','B'
 * (representing the color of the face they belong to in the solved state).
 */
export class CubeState {
    /**
     * Creates a new CubeState with all stickers set to null (unscanned).
     */
    constructor() {
        /** @type {Object<string, (string|null)[]>} */
        this.faces = {
            U: Array(9).fill(null),
            R: Array(9).fill(null),
            F: Array(9).fill(null),
            D: Array(9).fill(null),
            L: Array(9).fill(null),
            B: Array(9).fill(null),
        };
    }

    /**
     * Sets all 9 stickers of a face at once.
     * @param {'U'|'R'|'F'|'D'|'L'|'B'} face - The face to set.
     * @param {string[]} colors - Array of 9 single-char color strings.
     * @throws {Error} If the face identifier is invalid or colors length is not 9.
     */
    setFace(face, colors) {
        if (!this.faces.hasOwnProperty(face)) {
            throw new Error(`Invalid face identifier: "${face}". Must be one of U, R, F, D, L, B.`);
        }
        if (!Array.isArray(colors) || colors.length !== 9) {
            throw new Error(`Colors must be an array of exactly 9 elements, got ${colors?.length ?? 'non-array'}.`);
        }
        this.faces[face] = [...colors];
    }

    /**
     * Returns the 9-element sticker array for the given face.
     * @param {'U'|'R'|'F'|'D'|'L'|'B'} face - The face to retrieve.
     * @returns {(string|null)[]} Copy of the 9-element sticker array.
     */
    getFace(face) {
        if (!this.faces.hasOwnProperty(face)) {
            throw new Error(`Invalid face identifier: "${face}".`);
        }
        return [...this.faces[face]];
    }

    /**
     * Returns the sticker color at a specific position on a face.
     * @param {'U'|'R'|'F'|'D'|'L'|'B'} face
     * @param {number} index - Position 0–8.
     * @returns {string|null}
     */
    getSticker(face, index) {
        if (!this.faces.hasOwnProperty(face)) {
            throw new Error(`Invalid face identifier: "${face}".`);
        }
        if (index < 0 || index > 8) {
            throw new Error(`Sticker index must be 0–8, got ${index}.`);
        }
        return this.faces[face][index];
    }

    /**
     * Reverses the left and right columns of every face.
     * This exactly undoes a 2D horizontal flip applied to each face independently
     * (which happens when scanning with a mirrored webcam).
     */
    flipHorizontally() {
        for (const face of ALL_FACES) {
            const arr = this.faces[face];
            // Swap col 0 and 2 for each row
            for (let row = 0; row < 3; row++) {
                const leftIdx = row * 3;
                const rightIdx = row * 3 + 2;
                const temp = arr[leftIdx];
                arr[leftIdx] = arr[rightIdx];
                arr[rightIdx] = temp;
            }
        }
    }

    /**
     * Sets a single sticker on a face.
     * @param {'U'|'R'|'F'|'D'|'L'|'B'} face
     * @param {number} index - Position 0–8.
     * @param {string} color - Single-char color identifier.
     */
    setSticker(face, index, color) {
        if (!this.faces.hasOwnProperty(face)) {
            throw new Error(`Invalid face identifier: "${face}".`);
        }
        if (index < 0 || index > 8) {
            throw new Error(`Sticker index must be 0–8, got ${index}.`);
        }
        this.faces[face][index] = color;
    }

    /**
     * Serializes the cube state into a 54-character facelet string.
     * Faces are concatenated in order: U, R, F, D, L, B.
     * Null stickers are represented as '-'.
     * @returns {string} 54-character string.
     */
    toFaceletString() {
        let result = '';
        for (const face of ALL_FACES) {
            for (let i = 0; i < 9; i++) {
                result += this.faces[face][i] ?? '-';
            }
        }
        return result;
    }

    /**
     * Parses a 54-character facelet string and sets all faces.
     * @param {string} str - 54-character string with chars from {U,R,F,D,L,B}.
     * @throws {Error} If the string is not exactly 54 characters.
     */
    fromFaceletString(str) {
        if (typeof str !== 'string' || str.length !== 54) {
            throw new Error(`Facelet string must be exactly 54 characters, got ${str?.length ?? 'non-string'}.`);
        }
        let offset = 0;
        for (const face of ALL_FACES) {
            const faceColors = [];
            for (let i = 0; i < 9; i++) {
                faceColors.push(str[offset++]);
            }
            this.faces[face] = faceColors;
        }
    }

    /**
     * Checks whether every sticker has been assigned a color (no nulls remain).
     * @returns {boolean}
     */
    isComplete() {
        for (const face of ALL_FACES) {
            for (let i = 0; i < 9; i++) {
                if (this.faces[face][i] === null) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Validates the cube state for solvability prerequisites.
     *
     * Checks performed:
     * 1. All 54 stickers are assigned (no nulls).
     * 2. Exactly 9 stickers of each color exist.
     * 3. Center stickers (index 4) match their face identity.
     *
     * @returns {{ valid: boolean, error: string|null }}
     */
    validate() {
        // Check 1: All stickers set
        for (const face of ALL_FACES) {
            for (let i = 0; i < 9; i++) {
                if (this.faces[face][i] === null) {
                    return { valid: false, error: `Face ${face} has unset sticker at position ${i}.` };
                }
            }
        }

        // Check 2: Exactly 9 of each color
        const colorCounts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
        for (const face of ALL_FACES) {
            for (let i = 0; i < 9; i++) {
                const c = this.faces[face][i];
                if (!(c in colorCounts)) {
                    return { valid: false, error: `Invalid sticker color "${c}" on face ${face} at position ${i}.` };
                }
                colorCounts[c]++;
            }
        }
        for (const color of ALL_FACES) {
            if (colorCounts[color] !== 9) {
                return {
                    valid: false,
                    error: `Expected 9 stickers of color ${color}, found ${colorCounts[color]}.`,
                };
            }
        }

        // Check 3: Center stickers match face identity
        for (const face of ALL_FACES) {
            if (this.faces[face][4] !== face) {
                return {
                    valid: false,
                    error: `Center of face ${face} should be "${face}" but found "${this.faces[face][4]}".`,
                };
            }
        }

        // Check 4: Valid edges and corners
        const edgeIndices = [
            { faces: ['U', 'R'], indices: [5, 1] }, { faces: ['U', 'F'], indices: [7, 1] },
            { faces: ['U', 'L'], indices: [3, 1] }, { faces: ['U', 'B'], indices: [1, 1] },
            { faces: ['D', 'R'], indices: [5, 7] }, { faces: ['D', 'F'], indices: [1, 7] },
            { faces: ['D', 'L'], indices: [3, 7] }, { faces: ['D', 'B'], indices: [7, 7] },
            { faces: ['F', 'R'], indices: [5, 3] }, { faces: ['F', 'L'], indices: [3, 5] },
            { faces: ['B', 'L'], indices: [5, 3] }, { faces: ['B', 'R'], indices: [3, 5] }
        ];

        const validEdges = [
            ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'], 
            ['D', 'R'], ['D', 'F'], ['D', 'L'], ['D', 'B'], 
            ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R']
        ];

        for (const edge of edgeIndices) {
            const c1 = this.faces[edge.faces[0]][edge.indices[0]];
            const c2 = this.faces[edge.faces[1]][edge.indices[1]];
            
            let found = false;
            for (const valid of validEdges) {
                if ((c1 === valid[0] && c2 === valid[1]) || (c1 === valid[1] && c2 === valid[0])) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return {
                    valid: false,
                    error: `Invalid edge piece detected with colors ${FACE_NAMES[c1] || c1} and ${FACE_NAMES[c2] || c2}. This edge is physically impossible on a standard cube. Please double-check these stickers.`
                };
            }
        }

        const cornerIndices = [
            { faces: ['U', 'R', 'F'], indices: [8, 0, 2] }, { faces: ['U', 'F', 'L'], indices: [6, 0, 2] },
            { faces: ['U', 'L', 'B'], indices: [0, 0, 2] }, { faces: ['U', 'B', 'R'], indices: [2, 0, 2] },
            { faces: ['D', 'F', 'R'], indices: [2, 8, 6] }, { faces: ['D', 'L', 'F'], indices: [0, 8, 6] },
            { faces: ['D', 'B', 'L'], indices: [6, 8, 6] }, { faces: ['D', 'R', 'B'], indices: [8, 8, 6] }
        ];

        const validCorners = [
            ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'], 
            ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B']
        ];

        for (const corner of cornerIndices) {
            const c1 = this.faces[corner.faces[0]][corner.indices[0]];
            const c2 = this.faces[corner.faces[1]][corner.indices[1]];
            const c3 = this.faces[corner.faces[2]][corner.indices[2]];
            
            const pieceColors = [c1, c2, c3].sort().join('');
            
            let found = false;
            for (const valid of validCorners) {
                const validStr = [...valid].sort().join('');
                if (pieceColors === validStr) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return {
                    valid: false,
                    error: `Invalid corner piece detected with colors ${FACE_NAMES[c1] || c1}, ${FACE_NAMES[c2] || c2}, and ${FACE_NAMES[c3] || c3}. This corner is physically impossible. Please double-check these stickers.`
                };
            }
        }

        return { valid: true, error: null };
    }

    /**
     * Creates an independent deep copy of this CubeState.
     * @returns {CubeState}
     */
    clone() {
        const copy = new CubeState();
        for (const face of ALL_FACES) {
            copy.faces[face] = [...this.faces[face]];
        }
        return copy;
    }

    /**
     * Returns a CubeState representing the solved Rubik's Cube.
     * Every sticker on a face matches that face's color identifier.
     * @returns {CubeState}
     */
    static solved() {
        const state = new CubeState();
        for (const face of ALL_FACES) {
            state.faces[face] = Array(9).fill(face);
        }
        return state;
    }
}

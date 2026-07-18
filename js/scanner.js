/**
 * @fileoverview Webcam-based Rubik's Cube face scanner.
 * Captures video frames, samples colors from a 3×3 grid, and classifies
 * each cell into one of the six standard cube face colors using HSV analysis.
 * @module scanner
 */

/**
 * Converts RGB color values to HSV color space.
 * @param {number} r - Red channel (0–255).
 * @param {number} g - Green channel (0–255).
 * @param {number} b - Blue channel (0–255).
 * @returns {{ h: number, s: number, v: number }} HSV with h∈[0,360), s∈[0,100], v∈[0,100].
 */
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h;
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;

    if (d === 0) {
        h = 0;
    } else if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return { h: h * 360, s, v };
}

/**
 * Classifies an HSV color into a Rubik's Cube face identifier.
 *
 * Classification priority (checked in order):
 * - White  (U): low saturation, high value
 * - Yellow (D): warm hue band, moderate+ saturation
 * - Red    (R): hue near 0°/360°
 * - Orange (L): hue between red and yellow
 * - Green  (F): hue in green band
 * - Blue   (B): hue in blue band
 *
 * Falls back to closest hue match if no rule fires.
 *
 * @param {number} h - Hue (0–360).
 * @param {number} s - Saturation (0–100).
 * @param {number} v - Value / brightness (0–100).
 * @returns {'U'|'R'|'F'|'D'|'L'|'B'}
 */
function classifyColor(h, s, v) {
    // White: low saturation + bright
    if (s < 20 && v > 65) {
        return 'U';
    }

    // Yellow: warm hue band
    if (h >= 35 && h <= 65 && s > 30 && v > 50) {
        return 'D';
    }

    // Red: wraps around 0°/360°
    if ((h <= 10 || h >= 340) && s > 40 && v > 30) {
        return 'R';
    }

    // Orange: between red and yellow
    if (h > 10 && h < 35 && s > 40 && v > 40) {
        return 'L';
    }

    // Green
    if (h >= 80 && h <= 165 && s > 25 && v > 20) {
        return 'F';
    }

    // Blue
    if (h >= 180 && h <= 260 && s > 25 && v > 20) {
        return 'B';
    }

    // Fallback: closest hue match
    const hueTargets = [
        { face: 'R', hue: 0 },
        { face: 'L', hue: 22 },
        { face: 'D', hue: 50 },
        { face: 'F', hue: 120 },
        { face: 'B', hue: 220 },
    ];

    let bestFace = 'U';
    let bestDist = Infinity;

    for (const { face, hue } of hueTargets) {
        // Circular hue distance
        let dist = Math.abs(h - hue);
        if (dist > 180) dist = 360 - dist;

        if (dist < bestDist) {
            bestDist = dist;
            bestFace = face;
        }
    }

    return bestFace;
}

/**
 * Webcam-based scanner for reading Rubik's Cube face colors.
 *
 * Usage:
 * ```js
 * const scanner = new CubeScanner();
 * await scanner.startCamera(videoEl);
 * const colors = scanner.detectColors(videoEl, canvasEl);
 * scanner.drawOverlay(ctx, width, height, colors);
 * scanner.stopCamera();
 * ```
 */
export class CubeScanner {
    constructor() {
        /** @type {MediaStream|null} */
        this.stream = null;
        /** @type {boolean} */
        this.isMirrored = true;
        /** @type {boolean} */
        this.isActive = false;
    }

    /**
     * Starts the webcam and pipes the feed into the given video element.
     * @param {HTMLVideoElement} videoElement - Target video element.
     * @returns {Promise<boolean>} `true` if the camera started successfully.
     */
    async startCamera(videoElement) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user',
                },
            });

            videoElement.srcObject = stream;

            await new Promise((resolve) => {
                videoElement.addEventListener('loadedmetadata', resolve, { once: true });
            });

            this.stream = stream;
            this.isActive = true;
            return true;
        } catch (err) {
            console.error('CubeScanner: Failed to start camera —', err);
            this.isActive = false;
            return false;
        }
    }

    /**
     * Stops the webcam stream and releases all tracks.
     */
    stopCamera() {
        if (this.stream) {
            for (const track of this.stream.getTracks()) {
                track.stop();
            }
            this.stream = null;
        }
        this.isActive = false;
    }

    /**
     * Captures the current video frame and classifies a 3×3 grid of colors.
     *
     * The video feed is displayed mirrored via CSS (`scaleX(-1)`), but
     * `drawImage` captures the raw (un-mirrored) frame. Since the user sees
     * a mirror image, positions in the raw frame are horizontally flipped
     * relative to what the user sees. We compensate by reading column `(2 - j)`
     * instead of `j` so the returned array matches the user's visual layout.
     *
     * @param {HTMLVideoElement} videoElement - Source video.
     * @param {HTMLCanvasElement} canvasElement - Scratch canvas for pixel sampling.
     * @returns {string[]} Array of 9 color chars, left-to-right top-to-bottom
     *                     as seen by the user (mirrored view).
     */
    detectColors(videoElement, canvasElement) {
        const ctx = canvasElement.getContext('2d');
        const width = canvasElement.width;
        const height = canvasElement.height;

        // Draw the raw (un-mirrored) video frame onto the canvas
        ctx.drawImage(videoElement, 0, 0, width, height);

        // Grid geometry with 10% padding on each side
        const padX = width * 0.1;
        const padY = height * 0.1;
        const gridW = width - 2 * padX;
        const gridH = height - 2 * padY;
        const cellW = gridW / 3;
        const cellH = gridH / 3;

        /** @type {string[]} */
        const colors = [];

        // Sample size (pixels around center of each cell)
        const sampleSize = 20;
        const halfSample = sampleSize / 2;

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                // Mirror the column if the video feed is mirrored via CSS
                const rawCol = this.isMirrored ? 2 - col : col;

                const centerX = padX + rawCol * cellW + cellW / 2;
                const centerY = padY + row * cellH + cellH / 2;

                // Clamp sample region within canvas bounds
                const sx = Math.max(0, Math.round(centerX - halfSample));
                const sy = Math.max(0, Math.round(centerY - halfSample));
                const sw = Math.min(sampleSize, width - sx);
                const sh = Math.min(sampleSize, height - sy);

                const imageData = ctx.getImageData(sx, sy, sw, sh);
                const pixels = imageData.data;
                const pixelCount = sw * sh;

                let totalR = 0;
                let totalG = 0;
                let totalB = 0;

                for (let p = 0; p < pixelCount; p++) {
                    totalR += pixels[p * 4];
                    totalG += pixels[p * 4 + 1];
                    totalB += pixels[p * 4 + 2];
                }

                const avgR = totalR / pixelCount;
                const avgG = totalG / pixelCount;
                const avgB = totalB / pixelCount;

                const hsv = rgbToHsv(avgR, avgG, avgB);
                colors.push(classifyColor(hsv.h, hsv.s, hsv.v));
            }
        }

        return colors;
    }

    /**
     * Draws a semi-transparent 3×3 grid overlay with detected color indicators.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D context.
     * @param {number} width  - Canvas width in pixels.
     * @param {number} height - Canvas height in pixels.
     * @param {string[]} detectedColors - Array of up to 9 face color chars.
     */
    drawOverlay(ctx, width, height, detectedColors) {
        ctx.clearRect(0, 0, width, height);

        // Grid geometry with 10% padding
        const padX = width * 0.1;
        const padY = height * 0.1;
        const gridW = width - 2 * padX;
        const gridH = height - 2 * padY;
        const cellW = gridW / 3;
        const cellH = gridH / 3;

        // --- Draw grid lines ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;

        // Outer rectangle
        ctx.strokeRect(padX, padY, gridW, gridH);

        // Vertical lines
        for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(padX + i * cellW, padY);
            ctx.lineTo(padX + i * cellW, padY + gridH);
            ctx.stroke();
        }

        // Horizontal lines
        for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(padX, padY + i * cellH);
            ctx.lineTo(padX + gridW, padY + i * cellH);
            ctx.stroke();
        }

        // --- Draw detected color indicators ---
        /** @type {Object<string, string>} Maps face chars to display hex colors */
        const colorMap = {
            U: '#FFFFFF',
            R: '#FF3B30',
            F: '#34C759',
            D: '#FFD60A',
            L: '#FF9500',
            B: '#007AFF',
        };

        const indicatorW = cellW * 0.4;
        const indicatorH = cellH * 0.4;
        const cornerRadius = 4;

        for (let i = 0; i < 9 && i < detectedColors.length; i++) {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const color = detectedColors[i];

            if (!color || !(color in colorMap)) continue;

            const cx = padX + col * cellW + cellW / 2;
            const cy = padY + row * cellH + cellH / 2;
            const rx = cx - indicatorW / 2;
            const ry = cy - indicatorH / 2;

            // Filled rounded rectangle
            ctx.fillStyle = colorMap[color];
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.roundRect(rx, ry, indicatorW, indicatorH, cornerRadius);
            ctx.fill();

            // Subtle border for white/yellow visibility
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.globalAlpha = 1.0;
        }
    }
}

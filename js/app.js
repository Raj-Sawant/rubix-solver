/**
 * Rubik's Cube Solver — Main Application Controller
 * Orchestrates the 4-phase workflow: Scan → Verify → Solve → Animate
 */

import { CubeState, FACE_COLORS, FACE_NAMES, SCAN_ORDER, ALL_FACES } from './cube-state.js';
import { CubeScanner } from './scanner.js';
import { CubeSolver } from './solver.js';
import { Cube3D } from './cube3d.js';
import { SolutionAnimator } from './animator.js';

class App {
    constructor() {
        // State
        this.currentPhase = 1;
        this.cubeState = new CubeState();
        this.scanner = new CubeScanner();
        this.solver = new CubeSolver();
        this.cube3d = null;
        this.animator = null;
        this.scanIndex = 0; // which face we're scanning (index into SCAN_ORDER)
        this.selectedPaletteColor = null;
        this.scanAnimationId = null;

        // DOM refs (populated in init)
        this.dom = {};

        this.init();
    }

    init() {
        this.cacheDom();
        this.bindEvents();
        this.setPhase(1);
        this.updateFaceIndicator();
        this.renderFacePreviews();
    }

    cacheDom() {
        const $ = (sel) => document.querySelector(sel);
        const $$ = (sel) => document.querySelectorAll(sel);

        this.dom = {
            // Steps
            steps: $$('.step'),
            stepConnectors: $$('.step-connector'),

            // Phases
            phases: $$('.phase'),
            phaseScan: $('#phase-scan'),
            phaseVerify: $('#phase-verify'),
            phaseSolve: $('#phase-solve'),
            phaseAnimate: $('#phase-animate'),

            // Scan
            webcamVideo: $('#webcam-video'),
            scanOverlay: $('#scan-overlay'),
            faceLabel: $('#face-label'),
            faceColorDot: document.getElementById('face-color-dot'),
            scanCube3d: document.querySelector('#scan-cube-icon .cube-3d'),
            btnCapture: document.getElementById('btn-capture'),
            facePreviewGrid: $('#face-preview-grid'),
            btnSkipScan: $('#btn-skip-scan'),
            btnGotoVerify: $('#btn-goto-verify'),

            // Verify
            cubeNetContainer: $('#cube-net-container'),
            colorPalette: $('#color-palette'),
            paletteColors: $$('.palette-color'),
            btnValidate: $('#btn-validate'),
            validationMessage: $('#validation-message'),
            btnSolve: $('#btn-solve'),
            btnBackScan: $('#btn-back-scan'),
            btnSolveBack: $('#btn-solve-back'),

            // Solve
            solveStatus: $('#solve-status'),
            solveProgressBar: $('#solve-progress-bar'),
            solveResult: $('#solve-result'),

            // Animate
            cube3dContainer: $('#cube-3d-container'),
            moveCounter: $('#move-counter'),
            moveList: $('#move-list'),
            moveDescription: $('#move-description'),
            btnFirst: $('#btn-first'),
            btnPrev: $('#btn-prev'),
            btnPlay: $('#btn-play'),
            btnNext: $('#btn-next'),
            btnLast: $('#btn-last'),
            speedSlider: $('#speed-slider'),
            speedLabel: $('#speed-label'),
            btnNewSolve: $('#btn-new-solve'),
        };
    }

    bindEvents() {
        // Scan phase
        this.dom.btnCapture?.addEventListener('click', () => this.captureCurrentFace());
        this.dom.btnSkipScan?.addEventListener('click', () => this.skipToManualEntry());
        this.dom.btnGotoVerify?.addEventListener('click', () => this.goToVerifyPhase());

        // Verify phase
        this.dom.paletteColors?.forEach(pc => {
            pc.addEventListener('click', () => this.selectPaletteColor(pc.dataset.color));
        });
        this.dom.btnValidate?.addEventListener('click', () => this.validateCubeState());
        this.dom.btnSolve?.addEventListener('click', () => this.startSolving());
        this.dom.btnBackScan?.addEventListener('click', () => this.backToScan());
        this.dom.btnSolveBack?.addEventListener('click', () => this.goToVerifyPhase());

        const btnClearAll = document.getElementById('btn-clear-all');
        if (btnClearAll) {
            btnClearAll.addEventListener('click', () => {
                this.cubeState = new CubeState();
                ALL_FACES.forEach(f => this.cubeState.setSticker(f, 4, f));
                this.renderCubeNet();
                this.validateCubeState();
            });
        }

        const btnFlipFaces = document.getElementById('btn-flip-faces');
        if (btnFlipFaces) {
            btnFlipFaces.addEventListener('click', () => {
                this.cubeState.flipHorizontally();
                this.renderCubeNet();
                this.validateCubeState();
            });
        }

        const mirrorCb = document.getElementById('mirror-camera-cb');
        if (mirrorCb) {
            mirrorCb.addEventListener('change', (e) => {
                if (this.dom.webcamVideo) {
                    this.dom.webcamVideo.style.transform = e.target.checked ? 'scaleX(-1)' : 'scaleX(1)';
                }
                if (this.scanner) {
                    this.scanner.isMirrored = e.target.checked;
                }
            });
        }

        // Animate phase
        this.dom.btnFirst?.addEventListener('click', () => this.animator?.goToStart());
        this.dom.btnPrev?.addEventListener('click', () => this.animator?.prev());
        this.dom.btnPlay?.addEventListener('click', () => this.togglePlayPause());
        this.dom.btnNext?.addEventListener('click', () => this.animator?.next());
        this.dom.btnLast?.addEventListener('click', () => this.animator?.goToEnd());
        this.dom.speedSlider?.addEventListener('input', (e) => this.updateSpeed(e.target.value));
        this.dom.btnNewSolve?.addEventListener('click', () => this.resetApp());
    }

    // ─────────────────────────────────────────
    //  Phase Management
    // ─────────────────────────────────────────

    setPhase(phase) {
        this.currentPhase = phase;

        // Update step indicators
        this.dom.steps?.forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            if (stepNum === phase) step.classList.add('active');
            else if (stepNum < phase) step.classList.add('completed');
        });

        // Update connectors
        this.dom.stepConnectors?.forEach((conn, i) => {
            conn.classList.toggle('completed', i < phase - 1);
        });

        // Show/hide phases
        this.dom.phases?.forEach(p => p.classList.remove('active'));

        switch (phase) {
            case 1:
                this.dom.phaseScan?.classList.add('active');
                this.startScanning();
                break;
            case 2:
                this.dom.phaseVerify?.classList.add('active');
                this.stopScanning();
                this.renderCubeNet();
                break;
            case 3:
                this.dom.phaseSolve?.classList.add('active');
                break;
            case 4:
                this.dom.phaseAnimate?.classList.add('active');
                break;
        }
    }

    // ─────────────────────────────────────────
    //  Phase 1: Scanning
    // ─────────────────────────────────────────

    async startScanning() {
        const video = this.dom.webcamVideo;
        const canvas = this.dom.scanOverlay;
        if (!video || !canvas) return;

        const success = await this.scanner.startCamera(video);
        if (!success) {
            this.showScanError('Could not access webcam. Please grant camera permission and try again.');
            return;
        }

        // Wait for video to have dimensions
        await new Promise(resolve => {
            if (video.videoWidth > 0) return resolve();
            video.addEventListener('loadeddata', resolve, { once: true });
        });

        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Start live detection loop
        this.runScanLoop();
    }

    runScanLoop() {
        if (this.currentPhase !== 1) return;

        const video = this.dom.webcamVideo;
        const canvas = this.dom.scanOverlay;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d');

        const loop = () => {
            if (this.currentPhase !== 1 || !this.scanner.isActive) return;

            // Detect colors from current frame
            const colors = this.scanner.detectColors(video, canvas);

            // Draw overlay with detected colors
            this.scanner.drawOverlay(ctx, canvas.width, canvas.height, colors);

            // Store temporarily for capture
            this._lastDetectedColors = colors;

            this.scanAnimationId = requestAnimationFrame(loop);
        };
        loop();
    }

    stopScanning() {
        if (this.scanAnimationId) {
            cancelAnimationFrame(this.scanAnimationId);
            this.scanAnimationId = null;
        }
        this.scanner.stopCamera();
    }

    showScanError(msg) {
        // Show error on the scan overlay
        const canvas = this.dom.scanOverlay;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff4444';
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
    }

    captureCurrentFace() {
        const colors = this._lastDetectedColors;
        if (!colors || colors.length !== 9) return;

        const face = SCAN_ORDER[this.scanIndex];

        // Override center to match face identity
        colors[4] = face;

        // If the scanner was mirrored during capture, the 'colors' array represents a mirrored 2D face.
        // We must horizontally flip it back to its true physical representation before saving.
        let finalColors = [...colors];
        if (this.scanner && this.scanner.isMirrored) {
            for (let row = 0; row < 3; row++) {
                const temp = finalColors[row * 3];
                finalColors[row * 3] = finalColors[row * 3 + 2];
                finalColors[row * 3 + 2] = temp;
            }
        }

        this.cubeState.setFace(face, finalColors);
        this.updateFacePreview(face);

        // Move to next face
        this.scanIndex++;
        if (this.scanIndex >= SCAN_ORDER.length) {
            // All faces scanned
            this.updateBtnGotoVerify();
            // Auto transition to Verify
            setTimeout(() => this.goToVerifyPhase(), 800);
        }

        this.updateFaceIndicator();
    }

    updateFaceIndicator() {
        const instructionEl = document.getElementById('scan-instruction');

        if (this.scanIndex >= SCAN_ORDER.length) {
            if (this.dom.faceLabel) this.dom.faceLabel.textContent = 'All faces scanned!';
            if (this.dom.faceColorDot) this.dom.faceColorDot.style.background = '#34C759';
            if (this.dom.btnCapture) this.dom.btnCapture.disabled = true;
            if (instructionEl) instructionEl.innerHTML = 'Ready to verify.';
            return;
        }

        const face = SCAN_ORDER[this.scanIndex];
        if (this.dom.faceLabel) this.dom.faceLabel.textContent = FACE_NAMES[face];
        if (this.dom.faceColorDot) this.dom.faceColorDot.style.background = FACE_COLORS[face];
        if (this.dom.btnCapture) this.dom.btnCapture.disabled = false;

        if (instructionEl) {
            let instruction = '';
            let cubeTransform = '';
            switch(this.scanIndex) {
                case 0: 
                    instruction = 'Show the Front (Green) face. Make sure White is pointing UP.'; 
                    cubeTransform = 'rotateX(-15deg) rotateY(15deg)'; // F
                    break;
                case 1: 
                    instruction = 'Rotate cube LEFT to show Right (Red) face. <span class="anim-arrow">⬅️</span>'; 
                    cubeTransform = 'rotateX(-15deg) rotateY(-75deg)'; // R
                    break;
                case 2: 
                    instruction = 'Rotate cube LEFT to show Back (Blue) face. <span class="anim-arrow">⬅️</span>'; 
                    cubeTransform = 'rotateX(-15deg) rotateY(-165deg)'; // B
                    break;
                case 3: 
                    instruction = 'Rotate cube LEFT to show Left (Orange) face. <span class="anim-arrow">⬅️</span>'; 
                    cubeTransform = 'rotateX(-15deg) rotateY(-255deg)'; // L
                    break;
                case 4: 
                    instruction = 'Show the Top (White) face. Make sure Blue is pointing UP. <span class="anim-arrow-down">⬇️</span>'; 
                    cubeTransform = 'rotateX(-105deg) rotateY(0deg)'; // U
                    break;
                case 5: 
                    instruction = 'Show the Bottom (Yellow) face. Make sure Green is pointing UP. <span class="anim-arrow-down">⬇️</span>'; 
                    cubeTransform = 'rotateX(75deg) rotateY(0deg)'; // D
                    break;
            }
            instructionEl.innerHTML = instruction;
            if (this.dom.scanCube3d) {
                this.dom.scanCube3d.style.transform = cubeTransform;
            }
        }
    }

    renderFacePreviews() {
        SCAN_ORDER.forEach(face => this.updateFacePreview(face));
    }

    updateFacePreview(face) {
        const preview = document.querySelector(`.face-preview[data-face="${face}"]`);
        if (!preview) return;

        const stickers = preview.querySelectorAll('.mini-sticker');
        const faceColors = this.cubeState.getFace(face);

        stickers.forEach((sticker, i) => {
            const color = faceColors[i];
            if (color) {
                sticker.style.background = FACE_COLORS[color] || 'rgba(255,255,255,0.1)';
                sticker.classList.add('filled');
            } else {
                sticker.style.background = 'rgba(255,255,255,0.1)';
                sticker.classList.remove('filled');
            }
        });

        // Mark as scanned
        const hasColors = faceColors.some(c => c !== null);
        preview.classList.toggle('scanned', hasColors);
    }

    updateBtnGotoVerify() {
        if (this.dom.btnGotoVerify) {
            this.dom.btnGotoVerify.style.display = 'inline-flex';
            this.dom.btnGotoVerify.disabled = false;
        }
    }

    skipToManualEntry() {
        this.stopScanning();
        // Initialize with empty state for manual entry
        this.cubeState = new CubeState();
        // Set centers to their identity colors
        ALL_FACES.forEach(f => this.cubeState.setSticker(f, 4, f));
        this.setPhase(2);
    }

    goToVerifyPhase() {
        this.setPhase(2);
    }

    backToScan() {
        this.scanIndex = 0;
        this.cubeState = new CubeState();
        this.renderFacePreviews();
        this.setPhase(1);
    }

    // ─────────────────────────────────────────
    //  Phase 2: Verify & Correct
    // ─────────────────────────────────────────

    renderCubeNet() {
        const container = this.dom.cubeNetContainer;
        if (!container) return;

        // Clear existing sticker event listeners by re-rendering
        const existingStickers = container.querySelectorAll('.net-sticker');
        existingStickers.forEach(sticker => {
            const face = sticker.dataset.face;
            const index = parseInt(sticker.dataset.index);
            const color = this.cubeState.getSticker(face, index);
            sticker.style.background = color ? (FACE_COLORS[color] || 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.1)';

            // Remove old listeners by cloning
            const newSticker = sticker.cloneNode(true);
            sticker.parentNode.replaceChild(newSticker, sticker);

            newSticker.addEventListener('click', () => this.onStickerClick(face, index, newSticker));
        });

        // Auto-validate state when rendering the net
        this.validateCubeState();
    }

    onStickerClick(face, index, element) {
        // If center sticker (index 4), don't allow changing
        if (index === 4) return;

        if (this.selectedPaletteColor) {
            // Paint with selected color
            this.cubeState.setSticker(face, index, this.selectedPaletteColor);
            element.style.background = FACE_COLORS[this.selectedPaletteColor];
        } else {
            // Cycle through colors
            const currentColor = this.cubeState.getSticker(face, index);
            const colorOrder = ['U', 'R', 'F', 'D', 'L', 'B'];
            const currentIdx = colorOrder.indexOf(currentColor);
            const nextColor = colorOrder[(currentIdx + 1) % colorOrder.length];
            this.cubeState.setSticker(face, index, nextColor);
            element.style.background = FACE_COLORS[nextColor];
        }

        this.clearValidation();
    }

    selectPaletteColor(color) {
        if (this.selectedPaletteColor === color) {
            // Deselect
            this.selectedPaletteColor = null;
            this.dom.paletteColors?.forEach(pc => pc.classList.remove('active'));
        } else {
            this.selectedPaletteColor = color;
            this.dom.paletteColors?.forEach(pc => {
                pc.classList.toggle('active', pc.dataset.color === color);
            });
        }
    }

    clearValidation() {
        if (this.dom.validationMessage) {
            this.dom.validationMessage.textContent = '';
            this.dom.validationMessage.className = '';
        }
        if (this.dom.btnSolve) this.dom.btnSolve.disabled = true;
    }

    validateCubeState() {
        const result = this.cubeState.validate();

        if (result.valid) {
            if (this.dom.validationMessage) {
                this.dom.validationMessage.textContent = '✓ Cube state is valid! Ready to solve.';
                this.dom.validationMessage.className = 'success';
            }
            if (this.dom.btnSolve) this.dom.btnSolve.disabled = false;
        } else {
            if (this.dom.validationMessage) {
                this.dom.validationMessage.textContent = '✗ ' + result.error;
                this.dom.validationMessage.className = 'error';
            }
            if (this.dom.btnSolve) this.dom.btnSolve.disabled = true;
        }
    }

    // ─────────────────────────────────────────
    //  Phase 3: Solve
    // ─────────────────────────────────────────

    async startSolving() {
        this.setPhase(3);

        const statusEl = this.dom.solveStatus;
        const progressBar = this.dom.solveProgressBar;
        const resultEl = this.dom.solveResult;

        if (this.dom.btnSolveBack) this.dom.btnSolveBack.style.display = 'none';

        // Step 1: Initialize solver
        if (statusEl) statusEl.textContent = 'Initializing solver engine...';

        try {
            await this.solver.initialize((progress) => {
                if (progressBar) progressBar.style.width = `${progress * 0.7}%`; // 0-70% for init
            });
        } catch (err) {
            if (statusEl) statusEl.textContent = 'Error initializing solver: ' + err.message;
            return;
        }

        // Step 2: Solve
        if (statusEl) statusEl.textContent = 'Solving cube...';
        if (progressBar) progressBar.style.width = '80%';

        await new Promise(r => setTimeout(r, 100)); // yield to UI

        const faceletString = this.cubeState.toFaceletString();
        const result = await this.solver.solve(faceletString);

        if (!result.success) {
            if (statusEl) statusEl.textContent = 'Could not solve: ' + result.error;
            if (progressBar) progressBar.style.width = '0%';
            if (this.dom.btnSolveBack) this.dom.btnSolveBack.style.display = 'inline-block';
            return;
        }

        if (progressBar) progressBar.style.width = '100%';
        if (statusEl) statusEl.textContent = `Solved in ${result.moveCount} moves!`;
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.textContent = result.moves.join('  ');
        }

        // Brief pause to show result
        await new Promise(r => setTimeout(r, 1200));

        // Move to animation phase
        this.showSolution(result.moves, faceletString);
    }

    // ─────────────────────────────────────────
    //  Phase 4: Animate Solution
    // ─────────────────────────────────────────

    showSolution(moves, initialState) {
        this.setPhase(4);

        // Initialize 3D cube
        if (!this.cube3d && this.dom.cube3dContainer) {
            this.cube3d = new Cube3D(this.dom.cube3dContainer);
        }

        // Set initial state
        this.cube3d.setState(initialState);

        // Create animator
        this.animator = new SolutionAnimator(this.cube3d);
        this.animator.setMoves(moves, initialState);

        // Render move list
        this.renderMoveList(moves);

        // Listen for updates
        this.animator.onUpdate((idx, total, move, isPlaying) => {
            this.updateMoveUI(idx, total, move, isPlaying);
        });

        // Trigger initial UI update
        this.updateMoveUI(-1, moves.length, null, false);
    }

    renderMoveList(moves) {
        const list = this.dom.moveList;
        if (!list) return;

        list.innerHTML = '';
        moves.forEach((move, i) => {
            const item = document.createElement('div');
            item.className = 'move-item';
            item.dataset.index = i;

            const num = document.createElement('span');
            num.className = 'move-num';
            num.textContent = `${i + 1}.`;

            const notation = document.createElement('span');
            notation.className = 'move-notation';
            notation.textContent = move;

            const desc = document.createElement('span');
            desc.className = 'move-desc';
            desc.textContent = CubeSolver.getMoveDescription(move);

            item.appendChild(num);
            item.appendChild(notation);
            item.appendChild(desc);

            // Click to jump to this move
            item.addEventListener('click', () => this.jumpToMove(i));

            list.appendChild(item);
        });
    }

    async jumpToMove(targetIndex) {
        if (!this.animator || this.animator.isPlaying) return;

        const current = this.animator.currentIndex;
        if (targetIndex === current) return;

        if (targetIndex < current) {
            // Go back to start and replay
            await this.animator.goToStart();
            for (let i = 0; i <= targetIndex; i++) {
                await this.animator.next();
            }
        } else {
            // Go forward
            for (let i = current; i < targetIndex; i++) {
                await this.animator.next();
            }
        }
    }

    updateMoveUI(idx, total, move, isPlaying) {
        // Update counter
        if (this.dom.moveCounter) {
            this.dom.moveCounter.textContent = `Move ${idx + 1} of ${total}`;
        }

        // Update description
        if (this.dom.moveDescription) {
            this.dom.moveDescription.textContent = move
                ? CubeSolver.getMoveDescription(move)
                : 'Ready to begin';
        }

        // Update play button icon
        if (this.dom.btnPlay) {
            this.dom.btnPlay.textContent = isPlaying ? '⏸' : '▶';
        }

        // Update move list active state
        const moveItems = this.dom.moveList?.querySelectorAll('.move-item');
        moveItems?.forEach((item, i) => {
            item.classList.remove('active', 'completed');
            if (i === idx) item.classList.add('active');
            else if (i < idx) item.classList.add('completed');
        });

        // Scroll active move into view
        const activeItem = this.dom.moveList?.querySelector('.move-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Disable/enable buttons
        if (this.dom.btnFirst) this.dom.btnFirst.disabled = idx <= -1;
        if (this.dom.btnPrev) this.dom.btnPrev.disabled = idx <= -1;
        if (this.dom.btnNext) this.dom.btnNext.disabled = idx >= total - 1;
        if (this.dom.btnLast) this.dom.btnLast.disabled = idx >= total - 1;
    }

    togglePlayPause() {
        if (!this.animator) return;
        if (this.animator.isPlaying) {
            this.animator.pause();
        } else {
            this.animator.play();
        }
    }

    updateSpeed(value) {
        const speed = parseFloat(value);
        if (this.animator) this.animator.setSpeed(speed);
        if (this.dom.speedLabel) this.dom.speedLabel.textContent = `${speed.toFixed(2)}x`;
    }

    // ─────────────────────────────────────────
    //  Reset
    // ─────────────────────────────────────────

    resetApp() {
        // Cleanup
        if (this.cube3d) {
            this.cube3d.dispose();
            this.cube3d = null;
        }
        this.animator = null;
        this.cubeState = new CubeState();
        this.scanIndex = 0;
        this.selectedPaletteColor = null;
        this._lastDetectedColors = null;

        // Reset UI
        this.renderFacePreviews();
        this.updateFaceIndicator();
        if (this.dom.btnGotoVerify) {
            this.dom.btnGotoVerify.style.display = 'none';
        }
        if (this.dom.solveProgressBar) this.dom.solveProgressBar.style.width = '0%';
        if (this.dom.solveResult) this.dom.solveResult.style.display = 'none';
        if (this.dom.moveList) this.dom.moveList.innerHTML = '';

        this.setPhase(1);
    }
}

// ─────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

# Rubik's Cube Solver 🧊

An interactive, 3D Rubik's Cube Solver built with HTML, CSS, and JavaScript. 

You can access the live version of this solver here: **[Live Demo](https://rubix-solver-pi.vercel.app/)**

## Features

- **Webcam Scanner:** Scan your physical Rubik's Cube using your laptop camera.
- **Auto-Mirror Correction:** Aim comfortably using the mirror view. The app automatically corrects the mirror effect when capturing colors.
- **Interactive 2D Editor:** Tweak scanned colors manually or color the net from scratch on the verification screen.
- **Piece Validation:** Instantly checks for physically impossible configurations (like duplicate edges or invalid corners) before solving.
- **Kociemba Solver:** Runs the solver algorithm inside a Web Worker so the browser never freezes.
- **3D Animation:** View the step-by-step solution on a 3D cube with speed controls.

*(Note: The webcam scanner requires a secure connection (`https://` or `localhost`) to access the camera).*

## Technologies Used

- HTML5 & CSS3
- JavaScript (ES6 Modules)
- **Three.js** (for 3D rendering)
- **cubejs** (for Kociemba solver)
- **Boxicons** (for interface icons)

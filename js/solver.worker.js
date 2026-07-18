importScripts('https://cdn.jsdelivr.net/npm/cubejs/lib/cube.js');
importScripts('https://cdn.jsdelivr.net/npm/cubejs/lib/solve.js');

function validateCube(cube) {
    let cTwist = 0;
    let eFlip = 0;
    
    // 1. Check for duplicate corners or edges
    const cPerm = new Set(cube.cp);
    if (cPerm.size !== 8) return "Error: Invalid corners (duplicate or missing). Check the scanned colors on the Verify screen.";
    
    const ePerm = new Set(cube.ep);
    if (ePerm.size !== 12) return "Error: Invalid edges (duplicate or missing). Check the scanned colors on the Verify screen.";
    
    // 2. Corner twist
    for (let i = 0; i < 8; i++) {
        cTwist += cube.co[i];
    }
    if (cTwist % 3 !== 0) return "Error: Invalid corner twist. A corner piece is rotated incorrectly. Check your colors.";
    
    // 3. Edge flip
    for (let i = 0; i < 12; i++) {
        eFlip += cube.eo[i];
    }
    if (eFlip % 2 !== 0) return "Error: Invalid edge flip. An edge piece is flipped incorrectly. Check your colors.";
    
    // 4. Permutation parity
    let cInv = 0;
    for (let i = 0; i < 7; i++) {
        for (let j = i + 1; j < 8; j++) {
            if (cube.cp[i] > cube.cp[j]) cInv++;
        }
    }
    
    let eInv = 0;
    for (let i = 0; i < 11; i++) {
        for (let j = i + 1; j < 12; j++) {
            if (cube.ep[i] > cube.ep[j]) eInv++;
        }
    }
    
    if (cInv % 2 !== eInv % 2) return "Error: Invalid piece permutation (parity error). Check the scanned colors.";
    
    return "valid";
}

self.addEventListener('message', function(e) {
    const { action, payload } = e.data;

    if (action === 'init') {
        try {
            Cube.initSolver();
            self.postMessage({ action: 'init_done' });
        } catch (err) {
            self.postMessage({ action: 'init_error', error: err.message });
        }
    } else if (action === 'solve') {
        try {
            const cube = Cube.fromString(payload.faceletString);
            
            // Validate the cube mathematically before passing to solver
            // to prevent infinite IDA* search loops on impossible cubes.
            const validationResult = validateCube(cube);
            if (validationResult !== "valid") {
                self.postMessage({ action: 'solve_done', success: false, error: validationResult });
                return;
            }

            const solution = cube.solve();
            
            if (typeof solution === 'string' && solution.startsWith('Error')) {
                self.postMessage({ action: 'solve_done', success: false, error: solution });
            } else {
                const movesArray = solution.split(' ').filter(m => m.length > 0);
                self.postMessage({ action: 'solve_done', success: true, moves: movesArray });
            }
        } catch (err) {
            self.postMessage({ action: 'solve_done', success: false, error: err.message });
        }
    }
});

/**
 * Main 4WD Rover App Orchestrator
 * Connects UI inputs, 4 Independent Wheel Controllers (2x L298 Motor Drivers),
 * 3D WebGL Renderer, Autonomous Obstacle Avoidance, and Gemini AI Agent.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Instantiate Core 3D Renderer
    const renderer = new Hexapod3DRenderer('viewport3d');

    // Rover Wheel Hardware State (4 Independent Wheels)
    const wheelState = {
        fl: { dir: "stop", speed: 100 },
        fr: { dir: "stop", speed: 100 },
        rl: { dir: "stop", speed: 100 },
        rr: { dir: "stop", speed: 100 }
    };

    const activeKeys = {};
    let obstacleAvoidanceActive = false;

    // Setup Event Listeners
    setupTopNavTabs();
    setupWheelControlUI();
    setupObstacleAvoidanceSwitches();
    setupPresetButtons();
    setupDPadControls();
    setupKeyboardListeners();

    // Expose API to Gemini AI Agent Controller
    const appAPI = {
        setRoverCommand: (cmd, speed=100) => {
            sendRoverCommand(cmd, speed);
        },
        setWheelState: (fl, fr, rl, rr, speed=100) => {
            if (fl) wheelState.fl = { dir: fl, speed };
            if (fr) wheelState.fr = { dir: fr, speed };
            if (rl) wheelState.rl = { dir: rl, speed };
            if (rr) wheelState.rr = { dir: rr, speed };
            updateWheelUI();
            sendWheelStateToBackend();
        },
        setMouthEnergized: (energized) => {
            renderer.mouthEnergized = energized;
            const el = document.getElementById('motorMouthStatus');
            if (el) {
                el.textContent = energized ? 'ENERGIZED (TALKING)' : 'OFF';
                el.style.color = energized ? 'var(--accent-green)' : 'var(--text-muted)';
            }
        },
        setNeckPulsating: (pulsating) => {
            renderer.neckPulsating = pulsating;
            const el = document.getElementById('motorNeckStatus');
            if (el) {
                el.textContent = pulsating ? 'ENERGIZED (PULSING)' : 'OFF';
                el.style.color = pulsating ? 'var(--accent-purple)' : 'var(--text-muted)';
            }
        }
    };

    const geminiController = new GeminiAIController(appAPI);
    const danceEngine = new RoverDanceEngine(appAPI);

    // Poll 4x HC-SR04 Ultrasonic Sensors & Autonomous Obstacle Avoidance
    setInterval(() => {
        fetch('/api/sensors/distances')
            .then(res => res.json())
            .then(data => {
                renderer.sensorDistances = data;

                const elF = document.getElementById('distFront');
                const elR = document.getElementById('distRear');
                const elL = document.getElementById('distLeft');
                const elRight = document.getElementById('distRight');

                if (elF) elF.textContent = `${data.front} cm`;
                if (elR) elR.textContent = `${data.rear} cm`;
                if (elL) elL.textContent = `${data.left} cm`;
                if (elRight) elRight.textContent = `${data.right} cm`;

                // Autonomous Obstacle Avoidance
                if (obstacleAvoidanceActive) {
                    const isMovingForward = (wheelState.fl.dir === 'forward' && wheelState.fr.dir === 'forward');
                    if (data.front < 35 && isMovingForward) {
                        console.log('Obstacle detected ahead (<35cm)! Steering away...');
                        sendRoverCommand('spin_left', 90);
                    }
                }
            })
            .catch(err => {});
    }, 400);

    // Camera Source Switching
    const selectCamera = document.getElementById('selectCamera');
    const btnSwitchCamera = document.getElementById('btnSwitchCamera');

    if (btnSwitchCamera && selectCamera) {
        btnSwitchCamera.addEventListener('click', () => {
            const source = selectCamera.value;
            fetch('/api/camera/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source })
            })
            .then(res => res.json())
            .then(() => {
                const camFeed = document.getElementById('camFeed');
                if (camFeed) camFeed.src = `/api/camera/frame?t=${Date.now()}`;
            })
            .catch(err => console.error('Camera switch error:', err));
        });
    }

    // Export Python Hardware Code Button
    const btnExportScript = document.getElementById('btnExportScript');
    if (btnExportScript) {
        btnExportScript.addEventListener('click', () => {
            fetch('/api/export-python', { method: 'POST', body: JSON.stringify({}) })
                .then(res => res.blob())
                .then(blob => {
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'rover_4wd_robotic_head_control.py';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                });
        });
    }

    const btnResetCam = document.getElementById('btnResetCam');
    if (btnResetCam) {
        btnResetCam.addEventListener('click', () => {
            renderer.camera.position.set(320, 260, 380);
            renderer.controls.target.set(0, 50, 0);
        });
    }

    // Start 3D Render Loop
    requestAnimationFrame(animate);

    function animate(now) {
        requestAnimationFrame(animate);
        renderer.updatePose(null, wheelState);
        renderer.render();
    }

    // --- UI Control Handlers ---

    function setupObstacleAvoidanceSwitches() {
        const switches = document.querySelectorAll('.switch-obstacle');
        const statusMain = document.getElementById('obstacleStatusTextMain');
        const statusSettings = document.getElementById('obstacleStatusTextSettings');

        switches.forEach(sw => {
            sw.addEventListener('change', (e) => {
                obstacleAvoidanceActive = e.target.checked;

                // Sync all obstacle avoidance switches
                switches.forEach(otherSw => {
                    otherSw.checked = obstacleAvoidanceActive;
                });

                if (statusMain) {
                    statusMain.textContent = obstacleAvoidanceActive ? 'Status: ENABLED (Auto-Steer Active)' : 'Status: OFF (Manual Control)';
                    statusMain.style.color = obstacleAvoidanceActive ? 'var(--accent-green)' : 'var(--text-muted)';
                }

                if (statusSettings) {
                    statusSettings.textContent = obstacleAvoidanceActive ? 'Obstacle Avoidance ENABLED' : 'Obstacle Avoidance DISABLED';
                    statusSettings.style.color = obstacleAvoidanceActive ? 'var(--accent-green)' : 'var(--text-muted)';
                }
            });
        });
    }

    function setupWheelControlUI() {
        // Master Quick Actions
        const btnMasterFwd = document.getElementById('btnMasterFwd');
        if (btnMasterFwd) {
            btnMasterFwd.addEventListener('click', () => sendRoverCommand('forward'));
        }

        const btnMasterStop = document.getElementById('btnMasterStop');
        if (btnMasterStop) {
            btnMasterStop.addEventListener('click', () => sendRoverCommand('stop'));
        }

        const btnMasterRev = document.getElementById('btnMasterRev');
        if (btnMasterRev) {
            btnMasterRev.addEventListener('click', () => sendRoverCommand('reverse'));
        }

        // Individual Wheel Direction Buttons
        document.querySelectorAll('.btn-wheel-dir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const wheel = btn.dataset.wheel;
                const dir = btn.dataset.dir;
                if (wheel && wheelState[wheel]) {
                    wheelState[wheel].dir = dir;
                    updateWheelUI();
                    sendWheelStateToBackend();
                }
            });
        });

        // Individual Wheel Speed Sliders
        document.querySelectorAll('.slide-wheel-speed').forEach(slide => {
            slide.addEventListener('input', (e) => {
                const wheel = slide.dataset.wheel;
                const val = parseInt(slide.value);
                if (wheel && wheelState[wheel]) {
                    wheelState[wheel].speed = val;
                    const label = document.getElementById(`valSpeed${wheel.toUpperCase()}`);
                    if (label) label.textContent = `${val}%`;
                    sendWheelStateToBackend();
                }
            });
        });

        updateWheelUI();
    }

    function updateWheelUI() {
        ['fl', 'fr', 'rl', 'rr'].forEach(w => {
            const st = wheelState[w];
            const statusEl = document.getElementById(`status${w.toUpperCase()}`);
            if (statusEl) {
                statusEl.textContent = st.dir.toUpperCase();
                if (st.dir === 'forward') statusEl.style.color = 'var(--accent-cyan)';
                else if (st.dir === 'reverse') statusEl.style.color = 'var(--accent-orange)';
                else statusEl.style.color = 'var(--accent-green)';
            }

            // Update Direction Buttons Active Class
            document.querySelectorAll(`.btn-wheel-dir[data-wheel="${w}"]`).forEach(btn => {
                if (btn.dataset.dir === st.dir) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        });
    }

    function sendWheelStateToBackend() {
        fetch('/api/motor/wheels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(wheelState)
        }).catch(err => {});
    }

    function sendRoverCommand(cmd, speed=100) {
        cmd = cmd.toLowerCase();
        if (cmd === 'forward') {
            wheelState.fl.dir = 'forward'; wheelState.fr.dir = 'forward';
            wheelState.rl.dir = 'forward'; wheelState.rr.dir = 'forward';
        } else if (cmd === 'reverse' || cmd === 'backward') {
            wheelState.fl.dir = 'reverse'; wheelState.fr.dir = 'reverse';
            wheelState.rl.dir = 'reverse'; wheelState.rr.dir = 'reverse';
        } else if (cmd === 'spin_left') {
            wheelState.fl.dir = 'reverse'; wheelState.fr.dir = 'forward';
            wheelState.rl.dir = 'reverse'; wheelState.rr.dir = 'forward';
        } else if (cmd === 'spin_right') {
            wheelState.fl.dir = 'forward'; wheelState.fr.dir = 'reverse';
            wheelState.rl.dir = 'forward'; wheelState.rr.dir = 'reverse';
        } else if (cmd === 'turn_left') {
            wheelState.fl.dir = 'stop'; wheelState.fr.dir = 'forward';
            wheelState.rl.dir = 'stop'; wheelState.rr.dir = 'forward';
        } else if (cmd === 'turn_right') {
            wheelState.fl.dir = 'forward'; wheelState.fr.dir = 'stop';
            wheelState.rl.dir = 'forward'; wheelState.rr.dir = 'stop';
        } else if (cmd === 'stop') {
            wheelState.fl.dir = 'stop'; wheelState.fr.dir = 'stop';
            wheelState.rl.dir = 'stop'; wheelState.rr.dir = 'stop';
        }

        updateWheelUI();

        fetch('/api/motor/rover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, speed })
        }).catch(err => {});
    }

    function setupPresetButtons() {
        document.querySelectorAll('#presetButtons button').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                if (cmd) sendRoverCommand(cmd, 100);
            });
        });
    }

    function setupDPadControls() {
        const bindBtn = (id, cmd) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('mousedown', () => sendRoverCommand(cmd));
            el.addEventListener('mouseup', () => sendRoverCommand('stop'));
            el.addEventListener('touchstart', (e) => { e.preventDefault(); sendRoverCommand(cmd); });
            el.addEventListener('touchend', (e) => { e.preventDefault(); sendRoverCommand('stop'); });
        };

        bindBtn('btnFwd', 'forward');
        bindBtn('btnBwd', 'reverse');
        bindBtn('btnTurnL', 'turn_left');
        bindBtn('btnTurnR', 'turn_right');
        bindBtn('btnSpinL', 'spin_left');
        bindBtn('btnSpinR', 'spin_right');

        const btnStop = document.getElementById('btnStop');
        if (btnStop) btnStop.addEventListener('click', () => sendRoverCommand('stop'));
    }

    function setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            const key = e.key.toLowerCase();
            if (activeKeys[key]) return;
            activeKeys[key] = true;

            if (key === 'w' || key === 'arrowup') sendRoverCommand('forward');
            else if (key === 's' || key === 'arrowdown') sendRoverCommand('reverse');
            else if (key === 'a' || key === 'arrowleft') sendRoverCommand('turn_left');
            else if (key === 'd' || key === 'arrowright') sendRoverCommand('turn_right');
            else if (key === 'q') sendRoverCommand('spin_left');
            else if (key === 'e') sendRoverCommand('spin_right');
            else if (key === ' ') sendRoverCommand('stop');
        });

        window.addEventListener('keyup', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            const key = e.key.toLowerCase();
            activeKeys[key] = false;

            if (['w', 's', 'a', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
                sendRoverCommand('stop');
            }
        });
    }

    function setupTopNavTabs() {
        const navBtns = document.querySelectorAll('.nav-tab-btn');
        const viewScreens = document.querySelectorAll('.view-screen');

        const moveCanvasToView = (viewName) => {
            if (typeof renderer === 'undefined' || !renderer || !renderer.renderer) return;
            const dom = renderer.renderer.domElement;
            if (!dom) return;
            
            if (viewName === 'viewCalibration') {
                const calibContainer = document.getElementById('calibViewport3d');
                if (calibContainer && dom.parentElement !== calibContainer) {
                    calibContainer.appendChild(dom);
                }
            } else if (viewName === 'viewAnimation') {
                const animContainer = document.getElementById('viewport3d');
                if (animContainer && dom.parentElement !== animContainer) {
                    animContainer.appendChild(dom);
                }
            }
            if (renderer.onWindowResize) {
                renderer.onWindowResize();
                setTimeout(() => renderer.onWindowResize(), 50);
                setTimeout(() => renderer.onWindowResize(), 200);
            }
        };

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetViewId = btn.dataset.view;

                navBtns.forEach(b => b.classList.remove('active'));
                viewScreens.forEach(s => s.classList.remove('active'));

                btn.classList.add('active');
                const targetScreen = document.getElementById(targetViewId);
                if (targetScreen) {
                    targetScreen.classList.add('active');
                }

                moveCanvasToView(targetViewId);
            });
        });

        const btnExportWiringPDF = document.getElementById('btnExportWiringPDF');
        if (btnExportWiringPDF) {
            btnExportWiringPDF.addEventListener('click', async () => {
                const element = document.querySelector('#viewWiring .wiring-container') || document.getElementById('viewWiring');
                if (!element) return;

                const origText = btnExportWiringPDF.innerHTML;
                btnExportWiringPDF.innerHTML = '⏳ Exporting PDF...';
                btnExportWiringPDF.disabled = true;

                document.body.classList.add('exporting-pdf');

                const opt = {
                    margin: [8, 8, 8, 8],
                    filename: '4WD_Rover_Hardware_Wiring_Schematic.pdf',
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#0f172a'
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                };

                try {
                    if (window.html2pdf) {
                        await html2pdf().set(opt).from(element).save();
                    } else {
                        window.print();
                    }
                } catch (err) {
                    console.error("PDF generation error, falling back to print:", err);
                    window.print();
                } finally {
                    document.body.classList.remove('exporting-pdf');
                    btnExportWiringPDF.innerHTML = origText;
                    btnExportWiringPDF.disabled = false;
                }
            });
        }

        const btnPrintWiringPDF = document.getElementById('btnPrintWiringPDF');
        if (btnPrintWiringPDF) {
            btnPrintWiringPDF.addEventListener('click', () => {
                window.print();
            });
        }

        const btnExportInstructionsPDF = document.getElementById('btnExportInstructionsPDF');
        if (btnExportInstructionsPDF) {
            btnExportInstructionsPDF.addEventListener('click', async () => {
                const element = document.querySelector('#viewInstructions .wiring-container') || document.getElementById('viewInstructions');
                if (!element) return;

                const origText = btnExportInstructionsPDF.innerHTML;
                btnExportInstructionsPDF.innerHTML = '⏳ Exporting PDF...';
                btnExportInstructionsPDF.disabled = true;

                document.body.classList.add('exporting-pdf');

                const opt = {
                    margin: [8, 8, 8, 8],
                    filename: '4WD_Rover_Operating_Instructions_Guide.pdf',
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#0f172a'
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                };

                try {
                    if (window.html2pdf) {
                        await html2pdf().set(opt).from(element).save();
                    } else {
                        window.print();
                    }
                } catch (err) {
                    console.error("PDF generation error, falling back to print:", err);
                    window.print();
                } finally {
                    document.body.classList.remove('exporting-pdf');
                    btnExportInstructionsPDF.innerHTML = origText;
                    btnExportInstructionsPDF.disabled = false;
                }
            });
        }

        const btnPrintInstructionsPDF = document.getElementById('btnPrintInstructionsPDF');
        if (btnPrintInstructionsPDF) {
            btnPrintInstructionsPDF.addEventListener('click', () => {
                window.print();
            });
        }

        const checkHashView = () => {
            const hash = window.location.hash.replace('#', '').toLowerCase();
            if (hash) {
                let targetBtn = null;
                navBtns.forEach(btn => {
                    const v = btn.dataset.view.toLowerCase();
                    if (v === hash || v === 'view' + hash || (hash.includes('wiring') || hash.includes('schematic')) && v === 'viewwiring' || (hash.includes('instruction') || hash.includes('guide') || hash.includes('manual')) && v === 'viewinstructions') {
                        targetBtn = btn;
                    }
                });
                if (targetBtn) {
                    targetBtn.click();
                }
            }
        };

        window.addEventListener('hashchange', checkHashView);
        checkHashView();
    }
});

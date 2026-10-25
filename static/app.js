/**
 * Main Wall-Mounted Animatronic Deerhead Orchestrator
 * Connects UI inputs, L298 Motor Driver Channels (Mouth & Bowing),
 * 3D WebGL Renderer, Gemini AI Voice Assistant, and Music Sync Engine.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Instantiate 3D WebGL Renderer
    const renderer = new Hexapod3DRenderer('viewport3d');

    // Deerhead Local Hardware State
    const deerheadState = {
        mouth_channel1: false,
        bow_channel2: false,
        auto_bow: true,
        dome_lights: { light1: 0, light2: 0, light3: 0, light4: 0, mode: "off" }
    };

    let isMusicPerformanceActive = false;

    // Expose API object to Gemini AI & Performance Engine
    const appAPI = {
        setMusicPerformanceActive: (active) => {
            isMusicPerformanceActive = active;
            if (active) {
                appAPI.setDomeLightsMode('chase');
            } else {
                appAPI.setDomeLightsMode('off');
            }
        },
        setDomeLightsMode: (mode) => {
            deerheadState.dome_lights.mode = mode;
            fetch('/api/deerhead/lights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            }).catch(e => {});
            const el = document.getElementById('statusLightsMode');
            if (el) el.textContent = mode.toUpperCase();
        },
        setMouthEnergized: (energized) => {
            deerheadState.mouth_channel1 = energized;
            renderer.mouthEnergized = energized;
            const el = document.getElementById('statusMouth');
            if (el) {
                el.textContent = energized ? 'ENERGIZED (TALKING)' : 'CLOSED';
                el.style.color = energized ? 'var(--accent-green)' : 'var(--text-muted)';
            }
            if (!isMusicPerformanceActive) {
                if (energized && deerheadState.dome_lights.mode !== 'breathe') {
                    appAPI.setDomeLightsMode('breathe');
                } else if (!energized && deerheadState.dome_lights.mode === 'breathe') {
                    appAPI.setDomeLightsMode('off');
                }
            }
        },
        setBowEnergized: (energized) => {
            deerheadState.bow_channel2 = energized;
            renderer.bowEnergized = energized;
            const el = document.getElementById('statusBow');
            if (el) {
                el.textContent = energized ? 'BOWED FORWARD' : 'UPRIGHT';
                el.style.color = energized ? 'var(--accent-orange)' : 'var(--text-muted)';
            }
        },
        triggerBow: (duration=1.8) => {
            appAPI.setBowEnergized(true);
            fetch('/api/deerhead/bow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration })
            }).catch(e => {});

            setTimeout(() => {
                appAPI.setBowEnergized(false);
            }, duration * 1000);
        }
    };

    const geminiController = new GeminiAIController(appAPI);
    const performanceEngine = new DeerheadPerformanceEngine(appAPI);

    // Setup UI Event Handlers
    setupTopNavTabs();
    setupRightPanelTabs();
    setupDeerheadMotorControls(appAPI);
    setupPresetButtons(appAPI, performanceEngine);
    setupHardwareSettings();

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
                    a.download = 'deerhead_animatronic_control.py';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                });
        });
    }

    const btnResetCam = document.getElementById('btnResetCam');
    if (btnResetCam) {
        btnResetCam.addEventListener('click', () => {
            renderer.camera.position.set(0, 40, 320);
            renderer.controls.target.set(0, 20, 0);
        });
    }

    // Poll Deerhead Hardware State from Server
    setInterval(() => {
        fetch('/api/deerhead/state')
            .then(res => res.json())
            .then(data => {
                if ('mouth_channel1' in data) {
                    renderer.mouthEnergized = data.mouth_channel1;
                    appAPI.setMouthEnergized(data.mouth_channel1);
                }
                if ('bow_channel2' in data) {
                    renderer.bowEnergized = data.bow_channel2;
                    appAPI.setBowEnergized(data.bow_channel2);
                }
            })
            .catch(err => {});

        fetch('/api/deerhead/lights')
            .then(res => res.json())
            .then(data => {
                deerheadState.dome_lights = data;
                const modeEl = document.getElementById('statusLightsMode');
                if (modeEl && data.mode) modeEl.textContent = data.mode.toUpperCase();

                ['light1', 'light2', 'light3', 'light4'].forEach(id => {
                    const valEl = document.getElementById(`valLight${id.slice(-1)}`);
                    if (valEl && data[id] !== undefined) valEl.textContent = `${data[id]}%`;
                });
            })
            .catch(err => {});
    }, 400);

    // Start 3D Render Loop
    requestAnimationFrame(animate);

    function animate(now) {
        requestAnimationFrame(animate);
        renderer.updatePose(null, deerheadState);
        renderer.render();
    }
});

function setupTopNavTabs() {
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    const viewScreens = document.querySelectorAll('.view-screen');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetViewId = btn.dataset.view;

            navButtons.forEach(b => b.classList.remove('active'));
            viewScreens.forEach(s => s.classList.remove('active'));

            btn.classList.add('active');
            const targetScreen = document.getElementById(targetViewId);
            if (targetScreen) targetScreen.classList.add('active');
        });
    });
}

function setupRightPanelTabs() {
    const tabGemini = document.getElementById('tabGeminiAI');
    const tabMusic = document.getElementById('tabMusicPlayer');
    const sectionGemini = document.getElementById('sectionGeminiAI');
    const sectionMusic = document.getElementById('sectionMusicPlayer');

    if (tabGemini && tabMusic && sectionGemini && sectionMusic) {
        tabGemini.addEventListener('click', () => {
            tabGemini.classList.add('active');
            tabMusic.classList.remove('active');
            sectionGemini.style.display = 'block';
            sectionMusic.style.display = 'none';
        });

        tabMusic.addEventListener('click', () => {
            tabMusic.classList.add('active');
            tabGemini.classList.remove('active');
            sectionMusic.style.display = 'block';
            sectionGemini.style.display = 'none';
        });
    }
}

function setupDeerheadMotorControls(appAPI) {
    const btnMouthOpen = document.getElementById('btnMouthOpen');
    const btnMouthClose = document.getElementById('btnMouthClose');
    const btnTriggerBow = document.getElementById('btnTriggerBow');
    const toggleAutoBow = document.getElementById('toggleAutoBow');

    if (btnMouthOpen) {
        btnMouthOpen.addEventListener('click', () => {
            appAPI.setMouthEnergized(true);
            fetch('/api/deerhead/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mouth: true })
            }).catch(e => {});
        });
    }

    if (btnMouthClose) {
        btnMouthClose.addEventListener('click', () => {
            appAPI.setMouthEnergized(false);
            fetch('/api/deerhead/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mouth: false })
            }).catch(e => {});
        });
    }

    if (btnTriggerBow) {
        btnTriggerBow.addEventListener('click', () => {
            appAPI.triggerBow(1.8);
        });
    }

    if (toggleAutoBow) {
        toggleAutoBow.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            fetch('/api/deerhead/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auto_bow: enabled })
            }).catch(e => {});
        });
    }

    // Dome Light Mode Buttons
    const btnStrobe = document.getElementById('btnLightsStrobe');
    const btnChase = document.getElementById('btnLightsChase');
    const btnSolid = document.getElementById('btnLightsSolid');
    const btnOff = document.getElementById('btnLightsOff');

    if (btnStrobe) btnStrobe.addEventListener('click', () => appAPI.setDomeLightsMode('strobe'));
    if (btnChase) btnChase.addEventListener('click', () => appAPI.setDomeLightsMode('chase'));
    if (btnSolid) btnSolid.addEventListener('click', () => appAPI.setDomeLightsMode('solid'));
    if (btnOff) btnOff.addEventListener('click', () => appAPI.setDomeLightsMode('off'));

    // Dome Light Sliders
    document.querySelectorAll('.slide-dome-light').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const lightKey = e.target.dataset.light;
            const val = parseInt(e.target.value);
            const valEl = document.getElementById(`valLight${lightKey.slice(-1)}`);
            if (valEl) valEl.textContent = `${val}%`;

            const payload = {};
            payload[lightKey] = val;
            fetch('/api/deerhead/lights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(e => {});
        });
    });
}

function setupPresetButtons(appAPI, performanceEngine) {
    const btnWelcome = document.getElementById('btnPresetWelcome');
    const btnSing = document.getElementById('btnPresetSing');
    const btnTest = document.getElementById('btnPresetTest');
    const btnSentinel = document.getElementById('btnPresetSentinel');

    if (btnWelcome) {
        btnWelcome.addEventListener('click', () => {
            appAPI.triggerBow(2.0);
        });
    }

    if (btnSing) {
        btnSing.addEventListener('click', () => {
            const tabMusic = document.getElementById('tabMusicPlayer');
            if (tabMusic) tabMusic.click();
            if (performanceEngine.playlist.length > 0) {
                performanceEngine.selectAndPlayTrack(performanceEngine.playlist[0].name);
            }
        });
    }

    if (btnTest) {
        btnTest.addEventListener('click', () => {
            appAPI.setMouthEnergized(true);
            setTimeout(() => appAPI.setMouthEnergized(false), 800);
            setTimeout(() => appAPI.setMouthEnergized(true), 1200);
            setTimeout(() => appAPI.setMouthEnergized(false), 2000);
        });
    }

    if (btnSentinel) {
        btnSentinel.addEventListener('click', () => {
            appAPI.setMouthEnergized(false);
            appAPI.setBowEnergized(false);
        });
    }
}

function setupHardwareSettings() {
    const selectCam = document.getElementById('selectCameraSettings');
    const selectMic = document.getElementById('selectMicSettings');
    const selectSpk = document.getElementById('selectSpeakerSettings');
    const slideMicGain = document.getElementById('slideMicGainSettings');
    const slideSpkVol = document.getElementById('slideSpeakerVolSettings');
    const statusEl = document.getElementById('statusHardwareSettings');

    // Load active hardware config from server
    fetch('/api/hardware/config')
        .then(res => res.json())
        .then(data => {
            if (selectCam && data.camera_source) selectCam.value = data.camera_source;
            if (selectMic && data.mic_source) selectMic.value = data.mic_source;
            if (selectSpk && data.speaker_source) selectSpk.value = data.speaker_source;
            if (slideMicGain && data.mic_gain !== undefined) {
                slideMicGain.value = data.mic_gain;
                const valEl = document.getElementById('valMicGainSettings');
                if (valEl) valEl.textContent = `${data.mic_gain}%`;
            }
            if (slideSpkVol && data.speaker_volume !== undefined) {
                slideSpkVol.value = data.speaker_volume;
                const valEl = document.getElementById('valSpeakerVolSettings');
                if (valEl) valEl.textContent = `${data.speaker_volume}%`;
            }
        })
        .catch(err => {});

    // Save Handlers
    const saveHW = (payload, label) => {
        fetch('/api/hardware/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (statusEl) {
                statusEl.textContent = `✅ Saved ${label}`;
                statusEl.style.color = 'var(--accent-green)';
            }
            const camFeed = document.getElementById('camFeed');
            if (camFeed) camFeed.src = `/api/camera/frame?t=${Date.now()}`;
        })
        .catch(err => {});
    };

    const btnSaveCam = document.getElementById('btnSaveCameraSettings');
    if (btnSaveCam && selectCam) btnSaveCam.addEventListener('click', () => saveHW({ camera_source: selectCam.value }, 'Camera Device'));

    const btnSaveMic = document.getElementById('btnSaveMicSettings');
    if (btnSaveMic && selectMic && slideMicGain) btnSaveMic.addEventListener('click', () => saveHW({ mic_source: selectMic.value, mic_gain: parseInt(slideMicGain.value) }, 'Microphone Settings'));

    const btnSaveSpk = document.getElementById('btnSaveSpeakerSettings');
    if (btnSaveSpk && selectSpk && slideSpkVol) btnSaveSpk.addEventListener('click', () => saveHW({ speaker_source: selectSpk.value, speaker_volume: parseInt(slideSpkVol.value) }, 'Speaker Settings'));

    if (slideMicGain) {
        slideMicGain.addEventListener('input', (e) => {
            const valEl = document.getElementById('valMicGainSettings');
            if (valEl) valEl.textContent = `${e.target.value}%`;
        });
    }

    if (slideSpkVol) {
        slideSpkVol.addEventListener('input', (e) => {
            const valEl = document.getElementById('valSpeakerVolSettings');
            if (valEl) valEl.textContent = `${e.target.value}%`;
        });
    }
}

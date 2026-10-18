/**
 * Rover MP3 Music Import & Audio-Driven Dance Synchronizer Engine
 * Features:
 * - Automatic MP3 file import directly to Rover/audio subfolder
 * - MP3 Picker dropdown selector & track list
 * - Full audio playback navigation controls (Play/Pause, Stop, Prev, Next, Loop, Seek, Volume)
 * - Web Audio API real-time beat analysis for Mouth Lipsync, Neck Bobbing, and Wheel Dancing
 */

class RoverDanceEngine {
    constructor(appOrchestrator) {
        this.app = appOrchestrator;
        this.danceEnabled = true; // Default dance mode enabled
        this.currentTrack = null;
        this.playlist = [];
        this.sensitivity = 1.0; // 50% to 200%
        this.danceStyle = 'freestyle';
        this.isLooping = false;

        // Web Audio API State
        this.audioCtx = null;
        this.analyser = null;
        this.sourceNode = null;
        this.audioPlayer = document.getElementById('danceAudioPlayer');

        // Beat Detection State
        this.bassEnergyHistory = [];
        this.historySize = 30;
        this.lastBeatTime = 0;
        this.beatCooldown = 280; // ms
        this.danceStepIndex = 0;
        this.currentMoveName = "STOPPED";

        // Motor State Cache
        this.lastMouthState = false;
        this.lastNeckState = false;

        // Dance Routines Catalogue
        this.movesCatalogue = {
            "spin_left": { fl: "reverse", fr: "forward", rl: "reverse", rr: "forward", label: "↺ Spin Left" },
            "spin_right": { fl: "forward", fr: "reverse", rl: "forward", rr: "reverse", label: "↻ Spin Right" },
            "wiggle_a": { fl: "forward", fr: "reverse", rl: "reverse", rr: "forward", label: "🔀 Crab Wiggle A" },
            "wiggle_b": { fl: "reverse", fr: "forward", rl: "forward", rr: "reverse", label: "🔀 Crab Wiggle B" },
            "pivot_left": { fl: "stop", fr: "forward", rl: "stop", rr: "forward", label: "↪️ Pivot Left" },
            "pivot_right": { fl: "forward", fr: "stop", rl: "forward", rr: "stop", label: "↩️ Pivot Right" },
            "pulse_fwd": { fl: "forward", fr: "forward", rl: "forward", rr: "forward", label: "▲ Step Forward" },
            "pulse_rev": { fl: "reverse", fr: "reverse", rl: "reverse", rr: "reverse", label: "▼ Step Reverse" }
        };

        this.initUI();
        this.loadPlaylist();
    }

    initUI() {
        // Automatic MP3 Import Button
        const btnAutoImport = document.getElementById('btnAutoImportMp3');
        const fileInput = document.getElementById('mp3FileInput');
        const dropZone = document.getElementById('dropZone');

        if (btnAutoImport && fileInput) {
            btnAutoImport.addEventListener('click', () => {
                fileInput.click();
            });
        }

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.handleFileImportList(e.dataTransfer.files);
                }
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this.handleFileImportList(e.target.files);
                }
            });
        }

        // MP3 Picker Dropdown Select
        const selectMp3Track = document.getElementById('selectMp3Track');
        if (selectMp3Track) {
            selectMp3Track.addEventListener('change', (e) => {
                const track = e.target.value;
                if (track) {
                    this.selectAndPlayTrack(track);
                }
            });
        }

        // Playback Navigation Controls
        const btnPlayPause = document.getElementById('btnPlayPauseNav');
        const btnStopNav = document.getElementById('btnStopNav');
        const btnPrevTrack = document.getElementById('btnPrevTrack');
        const btnNextTrack = document.getElementById('btnNextTrack');
        const btnLoopToggle = document.getElementById('btnLoopToggle');
        const btnToggleDance = document.getElementById('btnToggleDance');

        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', () => {
                if (!this.currentTrack && this.playlist.length > 0) {
                    this.selectAndPlayTrack(this.playlist[0].name);
                    return;
                }
                if (this.audioPlayer) {
                    if (this.audioPlayer.paused) {
                        this.audioPlayer.play().catch(e => {});
                    } else {
                        this.audioPlayer.pause();
                    }
                }
            });
        }

        if (btnStopNav) {
            btnStopNav.addEventListener('click', () => {
                if (this.audioPlayer) {
                    this.audioPlayer.pause();
                    this.audioPlayer.currentTime = 0;
                }
                this.stopDanceMotors();
                this.updatePlayPauseUI(false);
            });
        }

        if (btnPrevTrack) {
            btnPrevTrack.addEventListener('click', () => this.playPrevTrack());
        }

        if (btnNextTrack) {
            btnNextTrack.addEventListener('click', () => this.playNextTrack());
        }

        if (btnLoopToggle) {
            btnLoopToggle.addEventListener('click', () => {
                this.isLooping = !this.isLooping;
                if (this.audioPlayer) this.audioPlayer.loop = this.isLooping;
                btnLoopToggle.textContent = this.isLooping ? '🔁 Loop: On' : '🔁 Loop: Off';
                btnLoopToggle.style.color = this.isLooping ? 'var(--accent-cyan)' : 'var(--text-primary)';
            });
        }

        if (btnToggleDance) {
            btnToggleDance.addEventListener('click', () => {
                this.danceEnabled = !this.danceEnabled;
                btnToggleDance.textContent = this.danceEnabled ? '🕺 Beat Dance: ON' : '🕺 Beat Dance: OFF';
                btnToggleDance.style.background = this.danceEnabled 
                    ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))' 
                    : 'var(--panel-bg)';

                if (!this.danceEnabled) {
                    this.stopDanceMotors();
                } else if (this.audioPlayer && !this.audioPlayer.paused) {
                    this.initWebAudioAnalyser();
                }
            });
        }

        // Seek Slider & Volume Slider
        const seekSlider = document.getElementById('seekAudioSlider');
        const volumeSlider = document.getElementById('volumeAudioSlider');
        const valVolumeText = document.getElementById('valVolumeText');

        if (seekSlider && this.audioPlayer) {
            seekSlider.addEventListener('input', (e) => {
                if (this.audioPlayer.duration) {
                    const seekTime = (parseFloat(e.target.value) / 100.0) * this.audioPlayer.duration;
                    this.audioPlayer.currentTime = seekTime;
                }
            });
        }

        if (volumeSlider && this.audioPlayer) {
            volumeSlider.addEventListener('input', (e) => {
                const vol = parseInt(e.target.value);
                this.audioPlayer.volume = vol / 100.0;
                if (valVolumeText) valVolumeText.textContent = `${vol}%`;
            });
        }

        // Dance Sensitivity Slider
        const slideSens = document.getElementById('slideDanceSensitivity');
        const valSens = document.getElementById('valDanceSensitivity');
        if (slideSens) {
            slideSens.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.sensitivity = val / 100.0;
                if (valSens) valSens.textContent = `${val}%`;
            });
        }

        // Dance Style Selector
        const selectStyle = document.getElementById('selectDanceStyle');
        if (selectStyle) {
            selectStyle.addEventListener('change', (e) => {
                this.danceStyle = e.target.value;
            });
        }

        // Audio Player Progress & Time Events
        if (this.audioPlayer) {
            this.audioPlayer.addEventListener('play', () => {
                this.updatePlayPauseUI(true);
                this.initWebAudioAnalyser();
            });

            this.audioPlayer.addEventListener('pause', () => {
                this.updatePlayPauseUI(false);
                this.stopDanceMotors();
            });

            this.audioPlayer.addEventListener('ended', () => {
                this.updatePlayPauseUI(false);
                this.stopDanceMotors();
                if (!this.isLooping) {
                    this.playNextTrack();
                }
            });

            this.audioPlayer.addEventListener('timeupdate', () => {
                this.updateTimeAndProgress();
            });

            this.audioPlayer.addEventListener('loadedmetadata', () => {
                this.updateTimeAndProgress();
            });
        }
    }

    handleFileImportList(files) {
        let filesArr = Array.from(files);
        if (filesArr.length === 0) return;

        let completed = 0;
        let lastUploadedName = null;

        filesArr.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64Data = e.target.result;

                fetch('/api/audio/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file.name,
                        data: base64Data
                    })
                })
                .then(res => res.json())
                .then(data => {
                    completed++;
                    if (data.success) {
                        lastUploadedName = data.filename;
                    }
                    if (completed === filesArr.length) {
                        this.loadPlaylist(() => {
                            if (lastUploadedName) {
                                this.selectAndPlayTrack(lastUploadedName);
                            }
                        });
                    }
                })
                .catch(err => {
                    console.error('Import error:', err);
                    completed++;
                });
            };
            reader.readAsDataURL(file);
        });
    }

    loadPlaylist(callback) {
        fetch('/api/audio/list')
        .then(res => res.json())
        .then(data => {
            this.playlist = data.files || [];

            // Update MP3 Picker Dropdown (`#selectMp3Track`)
            const selectMp3 = document.getElementById('selectMp3Track');
            if (selectMp3) {
                selectMp3.innerHTML = '<option value="">-- Select an MP3 Track --</option>';
                this.playlist.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.name;
                    opt.textContent = f.name;
                    if (f.name === this.currentTrack) opt.selected = true;
                    selectMp3.appendChild(opt);
                });
            }

            // Update Playlist Container Table/List
            const container = document.getElementById('playlistContainer');
            if (container) {
                container.innerHTML = '';
                if (this.playlist.length === 0) {
                    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 12px;">No MP3 tracks imported yet. Click "Import MP3 Track" above!</div>';
                } else {
                    this.playlist.forEach(file => {
                        const item = document.createElement('div');
                        item.className = 'track-item' + (this.currentTrack === file.name ? ' active' : '');

                        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

                        item.innerHTML = `
                            <div class="track-info">
                                <div class="track-name">${file.name}</div>
                                <div class="track-meta">${sizeMb} MB</div>
                            </div>
                            <div class="track-actions">
                                <button class="btn-preset primary btn-play-track" style="padding: 4px 8px; font-size: 0.75rem;">▶ Play & Dance</button>
                                <button class="btn-preset btn-delete-track" style="background: var(--accent-red); color: #fff; padding: 4px 8px; font-size: 0.75rem;">🗑️</button>
                            </div>
                        `;

                        item.querySelector('.btn-play-track').addEventListener('click', () => {
                            this.selectAndPlayTrack(file.name);
                        });

                        item.querySelector('.btn-delete-track').addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.deleteTrack(file.name);
                        });

                        container.appendChild(item);
                    });
                }
            }

            if (callback) callback();
        })
        .catch(err => console.error('Audio list load error:', err));
    }

    selectAndPlayTrack(filename) {
        this.currentTrack = filename;

        const titleEl = document.getElementById('nowPlayingTitle');
        if (titleEl) titleEl.textContent = `🎵 Playing: ${filename}`;

        const selectMp3 = document.getElementById('selectMp3Track');
        if (selectMp3) selectMp3.value = filename;

        if (this.audioPlayer) {
            this.audioPlayer.src = `/audio/${encodeURIComponent(filename)}`;
            this.audioPlayer.play().catch(err => console.warn('Audio play error:', err));
        }

        this.updatePlayPauseUI(true);
        this.loadPlaylist(); // Refresh active highlight
    }

    playNextTrack() {
        if (this.playlist.length === 0) return;
        let idx = this.playlist.findIndex(f => f.name === this.currentTrack);
        idx = (idx + 1) % this.playlist.length;
        this.selectAndPlayTrack(this.playlist[idx].name);
    }

    playPrevTrack() {
        if (this.playlist.length === 0) return;
        let idx = this.playlist.findIndex(f => f.name === this.currentTrack);
        idx = (idx - 1 + this.playlist.length) % this.playlist.length;
        this.selectAndPlayTrack(this.playlist[idx].name);
    }

    deleteTrack(filename) {
        if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

        fetch('/api/audio/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (this.currentTrack === filename) {
                    this.currentTrack = null;
                    if (this.audioPlayer) {
                        this.audioPlayer.pause();
                        this.audioPlayer.src = '';
                    }
                    this.stopDanceMotors();
                    const titleEl = document.getElementById('nowPlayingTitle');
                    if (titleEl) titleEl.textContent = 'No Track Selected';
                }
                this.loadPlaylist();
            }
        })
        .catch(err => console.error('Delete track error:', err));
    }

    updatePlayPauseUI(isPlaying) {
        const btn = document.getElementById('btnPlayPauseNav');
        if (btn) {
            btn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
            btn.style.background = isPlaying 
                ? 'linear-gradient(135deg, var(--accent-orange), var(--accent-purple))' 
                : 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))';
        }
    }

    updateTimeAndProgress() {
        if (!this.audioPlayer) return;

        const curTime = this.audioPlayer.currentTime || 0;
        const duration = this.audioPlayer.duration || 0;

        const curEl = document.getElementById('audioCurrentTime');
        const durEl = document.getElementById('audioTotalDuration');
        const seekSlider = document.getElementById('seekAudioSlider');

        if (curEl) curEl.textContent = this.formatTime(curTime);
        if (durEl) durEl.textContent = this.formatTime(duration);

        if (seekSlider && duration > 0) {
            seekSlider.value = (curTime / duration) * 100;
        }
    }

    formatTime(sec) {
        if (isNaN(sec) || sec < 0) return "00:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    initWebAudioAnalyser() {
        if (!this.audioPlayer) return;

        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (!this.sourceNode) {
            try {
                this.sourceNode = this.audioCtx.createMediaElementSource(this.audioPlayer);
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 256;
                this.analyser.smoothingTimeConstant = 0.8;

                this.sourceNode.connect(this.analyser);
                this.analyser.connect(this.audioCtx.destination);
            } catch (e) {
                console.warn('WebAudio source node error:', e);
            }
        }

        this.startAnalysisLoop();
    }

    startAnalysisLoop() {
        if (this.loopRunning) return;
        this.loopRunning = true;

        const freqData = new Uint8Array(128);

        const updateFrame = () => {
            if (!this.analyser || !this.audioPlayer || this.audioPlayer.paused) {
                this.loopRunning = false;
                this.stopDanceMotors();
                return;
            }

            this.analyser.getByteFrequencyData(freqData);

            if (this.danceEnabled) {
                this.processAudioFrame(freqData);
            } else {
                this.stopDanceMotors();
            }

            requestAnimationFrame(updateFrame);
        };

        requestAnimationFrame(updateFrame);
    }

    processAudioFrame(freqData) {
        // 1. Overall Volume / Vocal Range (Bins 10-60 ~ 300Hz-2500Hz)
        let vocalSum = 0;
        for (let i = 10; i < 60; i++) vocalSum += freqData[i];
        const vocalAvg = vocalSum / 50.0;
        const mouthActive = vocalAvg > (18 / this.sensitivity);

        // 2. Mid-Frequency Rhythm (Bins 8-25 ~ 200Hz-800Hz)
        let midSum = 0;
        for (let i = 8; i < 25; i++) midSum += freqData[i];
        const midAvg = midSum / 17.0;
        const neckActive = midAvg > (25 / this.sensitivity);

        // 3. Low Bass Energy (Bins 1-6 ~ 20Hz-150Hz)
        let bassSum = 0;
        for (let i = 1; i <= 6; i++) bassSum += freqData[i];
        const bassAvg = bassSum / 6.0;

        // Maintain Rolling Bass Energy History
        this.bassEnergyHistory.push(bassAvg);
        if (this.bassEnergyHistory.length > this.historySize) {
            this.bassEnergyHistory.shift();
        }

        const histAvg = this.bassEnergyHistory.reduce((a, b) => a + b, 0) / (this.bassEnergyHistory.length || 1);
        const beatThreshold = (histAvg * 1.25) / this.sensitivity;

        const now = performance.now();
        const isBeat = (bassAvg > 20) && (bassAvg > beatThreshold) && (now - this.lastBeatTime > (this.beatCooldown / this.sensitivity));

        if (isBeat) {
            this.lastBeatTime = now;
            this.triggerNextDanceMove();
        }

        // Update UI Telemetry
        const barEl = document.getElementById('danceBeatEnergyBar');
        const valEl = document.getElementById('danceBeatEnergyVal');
        const bassPct = Math.min(100, Math.round((bassAvg / 255.0) * 100));

        if (barEl) barEl.style.width = `${bassPct}%`;
        if (valEl) valEl.textContent = `${bassPct}%`;

        // Synchronize Mouth & Neck Hardware States
        if (mouthActive !== this.lastMouthState) {
            this.lastMouthState = mouthActive;
            if (this.app.setMouthEnergized) this.app.setMouthEnergized(mouthActive);
            const statusMouth = document.getElementById('statusDanceMouth');
            if (statusMouth) {
                statusMouth.textContent = mouthActive ? 'TALKING / LIPSYNC' : 'IDLE';
                statusMouth.style.color = mouthActive ? 'var(--accent-green)' : 'var(--text-muted)';
            }
        }

        if (neckActive !== this.lastNeckState) {
            this.lastNeckState = neckActive;
            if (this.app.setNeckPulsating) this.app.setNeckPulsating(neckActive);
            const statusNeck = document.getElementById('statusDanceNeck');
            if (statusNeck) {
                statusNeck.textContent = neckActive ? 'BOBBING' : 'IDLE';
                statusNeck.style.color = neckActive ? 'var(--accent-purple)' : 'var(--text-muted)';
            }
        }

        // Send head/neck L298 motor hardware commands if changed
        fetch('/api/motor/head_neck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mouth: mouthActive, neck: neckActive })
        }).catch(e => {});
    }

    triggerNextDanceMove() {
        this.danceStepIndex++;

        let moveKey = "spin_left";

        if (this.danceStyle === 'spin_frenzy') {
            moveKey = (this.danceStepIndex % 2 === 0) ? "spin_left" : "spin_right";
        } else if (this.danceStyle === 'wiggle_crab') {
            const seq = ["wiggle_a", "wiggle_b", "spin_left", "spin_right"];
            moveKey = seq[this.danceStepIndex % seq.length];
        } else if (this.danceStyle === 'pivot_bounce') {
            const seq = ["pivot_left", "pivot_right", "pulse_fwd", "pulse_rev"];
            moveKey = seq[this.danceStepIndex % seq.length];
        } else {
            // Freestyle Routine Sequence
            const freestyleSeq = [
                "spin_left", "spin_right", "wiggle_a", "wiggle_b",
                "pivot_left", "pivot_right", "pulse_fwd", "pulse_rev"
            ];
            moveKey = freestyleSeq[this.danceStepIndex % freestyleSeq.length];
        }

        const moveConfig = this.movesCatalogue[moveKey] || this.movesCatalogue["spin_left"];
        this.currentMoveName = moveConfig.label;

        // Apply 4-Wheel Motor State to 3D Renderer & Hardware Motors
        if (this.app && this.app.setWheelState) {
            this.app.setWheelState(moveConfig.fl, moveConfig.fr, moveConfig.rl, moveConfig.rr, 100);
        }

        const statusWheel = document.getElementById('statusDanceWheel');
        if (statusWheel) {
            statusWheel.textContent = moveConfig.label;
            statusWheel.style.color = 'var(--accent-cyan)';
        }
    }

    stopDanceMotors() {
        if (this.app) {
            if (this.app.setRoverCommand) this.app.setRoverCommand('stop');
            if (this.app.setMouthEnergized) this.app.setMouthEnergized(false);
            if (this.app.setNeckPulsating) this.app.setNeckPulsating(false);
        }

        this.lastMouthState = false;
        this.lastNeckState = false;

        const statusMouth = document.getElementById('statusDanceMouth');
        const statusNeck = document.getElementById('statusDanceNeck');
        const statusWheel = document.getElementById('statusDanceWheel');

        if (statusMouth) { statusMouth.textContent = 'IDLE'; statusMouth.style.color = 'var(--text-muted)'; }
        if (statusNeck) { statusNeck.textContent = 'IDLE'; statusNeck.style.color = 'var(--text-muted)'; }
        if (statusWheel) { statusWheel.textContent = 'STOPPED'; statusWheel.style.color = 'var(--text-muted)'; }

        const barEl = document.getElementById('danceBeatEnergyBar');
        const valEl = document.getElementById('danceBeatEnergyVal');
        if (barEl) barEl.style.width = '0%';
        if (valEl) valEl.textContent = '0%';

        fetch('/api/motor/head_neck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mouth: false, neck: false })
        }).catch(e => {});
    }
}

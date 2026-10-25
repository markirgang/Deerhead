/**
 * Deerhead MP3 Music Import & Performance Synchronizer Engine
 * Features:
 * - Automatic MP3 file import & playlist management
 * - Web Audio API real-time beat & vocal frequency analysis for Mouth Lipsync (L298 Ch1) and Rhythmic Head Bowing (L298 Ch2)
 * - Navigation & playback controls (Play/Pause, Stop, Prev, Next, Loop, Seek, Volume)
 */

class DeerheadPerformanceEngine {
    constructor(appOrchestrator) {
        this.app = appOrchestrator;
        this.syncEnabled = true;
        this.currentTrack = null;
        this.playlist = [];
        this.sensitivity = 1.0;
        this.isLooping = false;

        // Web Audio API State
        this.audioCtx = null;
        this.analyser = null;
        this.sourceNode = null;
        this.audioPlayer = document.getElementById('danceAudioPlayer');

        // Beat & Vocal Detection State
        this.bassEnergyHistory = [];
        this.historySize = 30;
        this.lastBowTime = 0;
        this.bowCooldown = 1500; // Minimum ms between auto-bows on beats

        // Motor State Cache
        this.lastMouthState = false;
        this.lastBowState = false;

        this.initUI();
        this.loadPlaylist();
    }

    initUI() {
        const btnAutoImport = document.getElementById('btnAutoImportMp3');
        const fileInput = document.getElementById('mp3FileInput');
        const dropZone = document.getElementById('dropZone');

        if (btnAutoImport && fileInput) {
            btnAutoImport.addEventListener('click', () => fileInput.click());
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

        // URL Download Handler
        const btnDownloadUrl = document.getElementById('btnDownloadMp3Url');
        const inputUrl = document.getElementById('inputMp3Url');
        const statusUrl = document.getElementById('statusDownloadMp3Url');

        if (btnDownloadUrl && inputUrl) {
            btnDownloadUrl.addEventListener('click', () => {
                const urlVal = inputUrl.value.trim();
                if (!urlVal) return;

                if (statusUrl) {
                    statusUrl.style.display = 'block';
                    statusUrl.style.color = 'var(--accent-cyan)';
                    statusUrl.textContent = '⏳ Downloading MP3 from URL...';
                }

                fetch('/api/audio/download_url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: urlVal })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        inputUrl.value = '';
                        if (statusUrl) {
                            statusUrl.style.color = 'var(--accent-green)';
                            statusUrl.textContent = `✅ Downloaded ${data.filename} (${(data.size / (1024*1024)).toFixed(2)} MB)`;
                        }
                        this.loadPlaylist(() => {
                            this.selectAndPlayTrack(data.filename);
                        });
                    } else {
                        if (statusUrl) {
                            statusUrl.style.color = 'var(--accent-red)';
                            statusUrl.textContent = `❌ ${data.error || 'Download failed'}`;
                        }
                    }
                })
                .catch(err => {
                    if (statusUrl) {
                        statusUrl.style.color = 'var(--accent-red)';
                        statusUrl.textContent = `❌ Error: ${err.message}`;
                    }
                });
            });
        }

        const selectMp3Track = document.getElementById('selectMp3Track');
        if (selectMp3Track) {
            selectMp3Track.addEventListener('change', (e) => {
                const track = e.target.value;
                if (track) this.selectAndPlayTrack(track);
            });
        }

        const btnPlayPause = document.getElementById('btnPlayPauseNav');
        const btnStopNav = document.getElementById('btnStopNav');
        const btnPrevTrack = document.getElementById('btnPrevTrack');
        const btnNextTrack = document.getElementById('btnNextTrack');
        const btnLoopToggle = document.getElementById('btnLoopToggle');
        const btnToggleSync = document.getElementById('btnToggleDance');

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
                this.stopPerformance();
                this.updatePlayPauseUI(false);
            });
        }

        if (btnPrevTrack) btnPrevTrack.addEventListener('click', () => this.playPrevTrack());
        if (btnNextTrack) btnNextTrack.addEventListener('click', () => this.playNextTrack());

        if (btnLoopToggle) {
            btnLoopToggle.addEventListener('click', () => {
                this.isLooping = !this.isLooping;
                if (this.audioPlayer) this.audioPlayer.loop = this.isLooping;
                btnLoopToggle.textContent = this.isLooping ? '🔁 Loop: On' : '🔁 Loop: Off';
                btnLoopToggle.style.color = this.isLooping ? 'var(--accent-cyan)' : 'var(--text-primary)';
            });
        }

        if (btnToggleSync) {
            btnToggleSync.addEventListener('click', () => {
                this.syncEnabled = !this.syncEnabled;
                btnToggleSync.textContent = this.syncEnabled ? '🎵 Audio Sync: ON' : '🎵 Audio Sync: OFF';
                btnToggleSync.style.background = this.syncEnabled 
                    ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))' 
                    : 'var(--panel-bg)';

                if (!this.syncEnabled) {
                    this.stopPerformance();
                } else if (this.audioPlayer && !this.audioPlayer.paused) {
                    this.initWebAudioAnalyser();
                }
            });
        }

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

        const slideSens = document.getElementById('slideDanceSensitivity');
        const valSens = document.getElementById('valDanceSensitivity');
        if (slideSens) {
            slideSens.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.sensitivity = val / 100.0;
                if (valSens) valSens.textContent = `${val}%`;
            });
        }

        if (this.audioPlayer) {
            this.audioPlayer.addEventListener('play', () => {
                this.updatePlayPauseUI(true);
                this.initWebAudioAnalyser();
            });

            this.audioPlayer.addEventListener('pause', () => {
                this.updatePlayPauseUI(false);
                this.stopPerformance();
            });

            this.audioPlayer.addEventListener('ended', () => {
                this.updatePlayPauseUI(false);
                this.stopPerformance();
                if (!this.isLooping) this.playNextTrack();
            });

            this.audioPlayer.addEventListener('timeupdate', () => this.updateTimeAndProgress());
            this.audioPlayer.addEventListener('loadedmetadata', () => this.updateTimeAndProgress());
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
                    body: JSON.stringify({ filename: file.name, data: base64Data })
                })
                .then(res => res.json())
                .then(data => {
                    completed++;
                    if (data.success) lastUploadedName = data.filename;
                    if (completed === filesArr.length) {
                        this.loadPlaylist(() => {
                            if (lastUploadedName) this.selectAndPlayTrack(lastUploadedName);
                        });
                    }
                })
                .catch(err => completed++);
            };
            reader.readAsDataURL(file);
        });
    }

    loadPlaylist(callback) {
        fetch('/api/audio/list')
        .then(res => res.json())
        .then(data => {
            this.playlist = data.files || [];

            const selectMp3 = document.getElementById('selectMp3Track');
            if (selectMp3) {
                selectMp3.innerHTML = '<option value="">-- Select Song Track --</option>';
                this.playlist.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.name;
                    opt.textContent = f.name;
                    if (f.name === this.currentTrack) opt.selected = true;
                    selectMp3.appendChild(opt);
                });
            }

            const container = document.getElementById('playlistContainer');
            if (container) {
                container.innerHTML = '';
                if (this.playlist.length === 0) {
                    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 12px;">No song tracks imported yet. Click "Import MP3 Track" above!</div>';
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
                            <div class="track-actions" style="display:flex; gap:4px;">
                                <button class="btn-preset primary btn-play-track" style="padding: 4px 8px; font-size: 0.75rem;" title="Play track and sync mouth/bowing">🎤 Play & Sing</button>
                                <a href="/audio/${encodeURIComponent(file.name)}" download="${file.name}" class="btn-preset" style="padding: 4px 8px; font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center;" title="Download MP3 file to your device">⬇️</a>
                                <button class="btn-preset btn-delete-track" style="background: var(--accent-red); color: #fff; padding: 4px 8px; font-size: 0.75rem;" title="Delete MP3 track">🗑️</button>
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
        .catch(err => console.error('Audio list error:', err));
    }

    selectAndPlayTrack(filename) {
        this.currentTrack = filename;
        const titleEl = document.getElementById('nowPlayingTitle');
        if (titleEl) titleEl.textContent = `🎤 Singing: ${filename}`;

        const selectMp3 = document.getElementById('selectMp3Track');
        if (selectMp3) selectMp3.value = filename;

        if (this.audioPlayer) {
            this.audioPlayer.src = `/audio/${encodeURIComponent(filename)}`;
            this.audioPlayer.play().catch(err => console.warn('Play error:', err));
        }

        this.updatePlayPauseUI(true);
        this.loadPlaylist();
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
        if (!confirm(`Delete track ${filename}?`)) return;

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
                    this.stopPerformance();
                    const titleEl = document.getElementById('nowPlayingTitle');
                    if (titleEl) titleEl.textContent = 'No Track Selected';
                }
                this.loadPlaylist();
            }
        });
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
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        if (!this.sourceNode) {
            try {
                this.sourceNode = this.audioCtx.createMediaElementSource(this.audioPlayer);
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 256;
                this.analyser.smoothingTimeConstant = 0.8;

                this.sourceNode.connect(this.analyser);
                this.analyser.connect(this.audioCtx.destination);
            } catch (e) {
                console.warn('Audio node error:', e);
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
                this.stopPerformance();
                return;
            }

            this.analyser.getByteFrequencyData(freqData);
            if (this.syncEnabled) {
                this.processAudioFrame(freqData);
            } else {
                this.stopPerformance();
            }

            requestAnimationFrame(updateFrame);
        };

        requestAnimationFrame(updateFrame);
    }

    processAudioFrame(freqData) {
        // Vocal Range Frequency Analysis for Mouth Lipsync (L298 Ch1)
        let vocalSum = 0;
        for (let i = 10; i < 60; i++) vocalSum += freqData[i];
        const vocalAvg = vocalSum / 50.0;
        const mouthActive = vocalAvg > (16 / this.sensitivity);

        // Low Bass Energy Analysis for Rhythmic Head Bowing (L298 Ch2)
        let bassSum = 0;
        for (let i = 1; i <= 6; i++) bassSum += freqData[i];
        const bassAvg = bassSum / 6.0;

        this.bassEnergyHistory.push(bassAvg);
        if (this.bassEnergyHistory.length > this.historySize) this.bassEnergyHistory.shift();

        const histAvg = this.bassEnergyHistory.reduce((a, b) => a + b, 0) / (this.bassEnergyHistory.length || 1);
        const beatThreshold = (histAvg * 1.35) / this.sensitivity;

        const now = performance.now();
        const isBeatDrop = (bassAvg > 35) && (bassAvg > beatThreshold) && (now - this.lastBowTime > this.bowCooldown);

        if (isBeatDrop) {
            this.lastBowTime = now;
            if (this.app.triggerBow) this.app.triggerBow(1.2);
        }

        // Update Energy UI Bar
        const barEl = document.getElementById('danceBeatEnergyBar');
        const valEl = document.getElementById('danceBeatEnergyVal');
        const bassPct = Math.min(100, Math.round((bassAvg / 255.0) * 100));

        if (barEl) barEl.style.width = `${bassPct}%`;
        if (valEl) valEl.textContent = `${bassPct}%`;

        // Update Mouth State
        if (mouthActive !== this.lastMouthState) {
            this.lastMouthState = mouthActive;
            if (this.app.setMouthEnergized) this.app.setMouthEnergized(mouthActive);
            const statusMouth = document.getElementById('statusDanceMouth');
            if (statusMouth) {
                statusMouth.textContent = mouthActive ? 'SINGING / TALKING' : 'CLOSED';
                statusMouth.style.color = mouthActive ? 'var(--accent-green)' : 'var(--text-muted)';
            }
            fetch('/api/deerhead/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mouth: mouthActive })
            }).catch(e => {});
        }
    }

    stopPerformance() {
        if (this.app) {
            if (this.app.setMouthEnergized) this.app.setMouthEnergized(false);
            if (this.app.setBowEnergized) this.app.setBowEnergized(false);
        }

        this.lastMouthState = false;
        this.lastBowState = false;

        const statusMouth = document.getElementById('statusDanceMouth');
        const statusBow = document.getElementById('statusDanceNeck');

        if (statusMouth) { statusMouth.textContent = 'CLOSED'; statusMouth.style.color = 'var(--text-muted)'; }
        if (statusBow) { statusBow.textContent = 'UPRIGHT'; statusBow.style.color = 'var(--text-muted)'; }

        const barEl = document.getElementById('danceBeatEnergyBar');
        const valEl = document.getElementById('danceBeatEnergyVal');
        if (barEl) barEl.style.width = '0%';
        if (valEl) valEl.textContent = '0%';

        fetch('/api/deerhead/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mouth: false, bow: false })
        }).catch(e => {});
    }
}

/**
 * Gemini AI Multimodal Hands-Free Voice, Vision, Mic VU Meter & Gesture Control System
 * Continuous Full-Duplex Voice Conversation Engine with Automatic Voice Activity Detection (VAD)
 * & Synchronized Robotic Head Movement.
 */

const DEFAULT_GEMINI_KEY = atob('QVEuQWI4Uk42SU9GSDQ4UXNyWWNLLWEzUnp0OFc5RVZiZG0yTHJWRmlnQlE1Y0RySTBjaHc=');

class GeminiAIController {
    constructor(appOrchestrator) {
        this.app = appOrchestrator;
        this.apiKey = localStorage.getItem('GEMINI_API_KEY') || DEFAULT_GEMINI_KEY;
        this.micSensitivity = parseFloat(localStorage.getItem('MIC_SENSITIVITY')) || 100;
        this.isListening = false;
        this.aiSpeaking = false;
        this.gestureActive = true;
        
        this.audioContext = null;
        this.analyser = null;
        this.micStream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        // Voice Activity Detection (VAD) state
        this.isRecordingAudio = false;
        this.silenceStart = 0;
        this.speechDetected = false;

        this.initDOM();
        this.initSpeechSynthesis();
        this.startGestureLoop();
        this.startCameraStream();

        this.autoStartMicAnalyser();
    }

    initDOM() {
        const inputSettings = document.getElementById('inputApiKeySettings');
        if (inputSettings) {
            inputSettings.value = this.apiKey;
        }

        const btnSaveSettings = document.getElementById('btnSaveApiKeySettings');
        if (btnSaveSettings) {
            btnSaveSettings.addEventListener('click', () => {
                const key = document.getElementById('inputApiKeySettings').value.trim();
                if (key) {
                    this.apiKey = key;
                    localStorage.setItem('GEMINI_API_KEY', key);
                    const statusEl = document.getElementById('statusApiKeySettings');
                    if (statusEl) {
                        statusEl.textContent = '✅ API Key Saved & Active';
                        statusEl.style.color = 'var(--accent-green)';
                    }
                    this.addMessage('System', 'Gemini API Key updated successfully from Settings!');
                }
            });
        }

        const btnResetSettings = document.getElementById('btnResetApiKeySettings');
        if (btnResetSettings) {
            btnResetSettings.addEventListener('click', () => {
                this.apiKey = DEFAULT_GEMINI_KEY;
                localStorage.removeItem('GEMINI_API_KEY');
                if (inputSettings) inputSettings.value = DEFAULT_GEMINI_KEY;
                const statusEl = document.getElementById('statusApiKeySettings');
                if (statusEl) {
                    statusEl.textContent = '✅ Restored Default Gemini API Key';
                    statusEl.style.color = 'var(--accent-cyan)';
                }
                this.addMessage('System', 'Restored default Gemini API Key.');
            });
        }

        const btnSaveKey = document.getElementById('btnSaveApiKey');
        if (btnSaveKey) {
            btnSaveKey.addEventListener('click', () => {
                const key = document.getElementById('inputApiKey').value.trim();
                if (key) {
                    this.apiKey = key;
                    localStorage.setItem('GEMINI_API_KEY', key);
                    if (inputSettings) inputSettings.value = key;
                    document.getElementById('apiKeyBox').style.display = 'none';
                    this.addMessage('System', 'Gemini API Key saved successfully!');
                }
            });
        }

        const btnKeySettings = document.getElementById('btnApiKeySettings');
        if (btnKeySettings) {
            btnKeySettings.addEventListener('click', () => {
                const box = document.getElementById('apiKeyBox');
                if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
            });
        }

        const btnSend = document.getElementById('btnSendChat');
        if (btnSend) {
            btnSend.addEventListener('click', () => {
                const input = document.getElementById('chatInput');
                if (!input) return;
                const text = input.value.trim();
                if (text) {
                    input.value = '';
                    this.sendPromptToGemini(text);
                }
            });
        }

        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const text = e.target.value.trim();
                    if (text) {
                        e.target.value = '';
                        this.sendPromptToGemini(text);
                    }
                }
            });
        }

        const btnVision = document.getElementById('btnAskVision');
        if (btnVision) {
            btnVision.addEventListener('click', () => {
                this.sendPromptToGemini('Describe what you see in front of you through your camera!');
            });
        }

        const btnMic = document.getElementById('btnMic');
        if (btnMic) {
            btnMic.addEventListener('click', () => {
                if (this.isListening) {
                    this.stopListening();
                } else {
                    this.startListening();
                }
            });
        }

        const slideSens = document.getElementById('slideMicSensitivity');
        const valSens = document.getElementById('valMicSensitivity');
        if (slideSens) {
            slideSens.value = this.micSensitivity;
            if (valSens) valSens.textContent = `${Math.round(this.micSensitivity)}%`;
            slideSens.addEventListener('input', (e) => {
                this.micSensitivity = parseFloat(e.target.value);
                if (valSens) valSens.textContent = `${Math.round(this.micSensitivity)}%`;
                localStorage.setItem('MIC_SENSITIVITY', this.micSensitivity);
            });
        }
    }

    startCameraStream() {
        const img = document.getElementById('camFeed');
        if (!img) return;

        setInterval(() => {
            img.src = `/api/camera/frame?t=${Date.now()}`;
        }, 500);
    }

    autoStartMicAnalyser() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            this.startMicAudioAnalyser(false);
        }
    }

    startListening() {
        this.isListening = true;
        this.updateMicUI(true);
        this.startMicAudioAnalyser(true);
    }

    stopListening() {
        this.isListening = false;
        this.isRecordingAudio = false;
        this.updateMicUI(false);

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try { this.mediaRecorder.stop(); } catch (e) {}
        }
    }

    updateMicUI(active) {
        const btnMic = document.getElementById('btnMic');
        const statusText = document.getElementById('micStatusText');

        if (btnMic) {
            btnMic.textContent = active ? '🔴 Stop Listening' : '🎙️ Activate Mic';
            btnMic.style.borderColor = active ? 'var(--accent-red)' : 'var(--accent-green)';
        }

        if (statusText) {
            statusText.textContent = active ? 'Status: Listening for speech input...' : 'Status: Click "Activate Mic" button to start listening.';
        }
    }

    startMicAudioAnalyser(enableRecording = true) {
        navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            this.micStream = stream;
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;

            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);

            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            const vuBar = document.getElementById('micVuBar');
            const vuVal = document.getElementById('micVuLevelVal') || document.getElementById('vuVal');

            const updateVU = () => {
                if (!this.analyser) return;

                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                const scaledVol = Math.min(100, Math.round((average / 128.0) * (this.micSensitivity / 100.0) * 100));

                if (vuBar) vuBar.style.width = `${scaledVol}%`;
                if (vuVal) vuVal.textContent = `${scaledVol}%`;

                // VAD Logic
                if (enableRecording && this.isListening && !this.aiSpeaking) {
                    if (scaledVol > 18) {
                        if (!this.isRecordingAudio) {
                            this.startAudioChunkRecording(stream);
                        }
                        this.speechDetected = true;
                        this.silenceStart = 0;
                    } else if (this.isRecordingAudio) {
                        if (!this.silenceStart) this.silenceStart = performance.now();
                        if (performance.now() - this.silenceStart > 1200) {
                            this.stopAndSendAudioChunk();
                        }
                    }
                }

                requestAnimationFrame(updateVU);
            };

            updateVU();
        })
        .catch(err => {
            console.warn('Microphone access unavailable:', err);
            const statusText = document.getElementById('micStatusText');
            if (statusText) statusText.textContent = 'Status: Microphone input not accessible.';
        });
    }

    startAudioChunkRecording(stream) {
        this.isRecordingAudio = true;
        this.audioChunks = [];

        try {
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        } catch (e) {
            this.mediaRecorder = new MediaRecorder(stream);
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.start(100);

        const statusText = document.getElementById('micStatusText');
        if (statusText) statusText.textContent = 'Status: 🎙️ Listening...';
    }

    stopAndSendAudioChunk() {
        this.isRecordingAudio = false;

        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
            if (blob.size > 2000) {
                this.sendVoiceBlobToGemini(blob, this.mediaRecorder.mimeType || 'audio/webm');
            }
        };

        this.mediaRecorder.stop();
    }

    sendVoiceBlobToGemini(audioBlob, mimeType) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            
            fetch('/api/gemini/voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio_b64: base64Audio,
                    mime_type: mimeType,
                    api_key: this.apiKey,
                    include_vision: true
                })
            })
            .then(res => res.json())
            .then(data => {
                const transcribed = data.transcription || 'Spoken Voice Input';
                const reply = data.text || 'No response from Gemini Voice Engine.';

                const chatInput = document.getElementById('chatInput');
                if (chatInput) {
                    chatInput.value = transcribed;
                    chatInput.style.color = 'var(--accent-cyan)';
                }

                this.addMessage('User (Voice)', `🎤 "${transcribed}"`);
                this.addMessage('Gemini AI', reply);
                this.speak(reply);

                if (data.action) {
                    this.executeAIAction(data.action);
                }

                const statusText = document.getElementById('micStatusText');
                if (statusText && this.isListening) {
                    statusText.textContent = 'Status: Voice processed! Listening for next command...';
                }
            })
            .catch(err => {
                this.addMessage('Error', 'Failed to transcribe voice audio with Gemini.');
                console.error(err);
            });
        };
        reader.readAsDataURL(audioBlob);
    }

    initSpeechSynthesis() {
        this.synth = window.speechSynthesis;
        this.loadVoiceList();
        if (this.synth && this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.loadVoiceList();
        }

        this.audioPlayer = new Audio();
        this.audioPlayer.crossOrigin = "anonymous";

        let speakerAudioCtx = null;
        let speakerAnalyser = null;

        const setupSpeakerAnalyser = () => {
            if (speakerAudioCtx) return;
            try {
                speakerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const speakerSource = speakerAudioCtx.createMediaElementSource(this.audioPlayer);
                speakerAnalyser = speakerAudioCtx.createAnalyser();
                speakerAnalyser.fftSize = 128;
                speakerSource.connect(speakerAnalyser);
                speakerAnalyser.connect(speakerAudioCtx.destination);
            } catch (e) {
                console.warn('Speaker audio analyser:', e);
            }
        };

        const speakerDataArray = new Uint8Array(64);
        let lastL298Audible = null;

        const monitorSpeakerOutput = () => {
            if (this.aiSpeaking) {
                let isAudible = true;
                if (speakerAnalyser) {
                    speakerAnalyser.getByteFrequencyData(speakerDataArray);
                    let sum = 0;
                    for (let i = 0; i < speakerDataArray.length; i++) sum += speakerDataArray[i];
                    const avgVol = sum / speakerDataArray.length;
                    isAudible = avgVol > 3;
                }

                if (this.app && this.app.setMouthEnergized) this.app.setMouthEnergized(isAudible);
                if (this.app && this.app.setNeckPulsating) this.app.setNeckPulsating(isAudible);

                if (isAudible !== lastL298Audible) {
                    lastL298Audible = isAudible;
                    fetch('/api/motor/head_neck', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mouth: isAudible, neck: isAudible })
                    }).catch(e => {});
                }
            } else {
                if (this.app && this.app.setMouthEnergized) this.app.setMouthEnergized(false);
                if (this.app && this.app.setNeckPulsating) this.app.setNeckPulsating(false);

                if (lastL298Audible !== false) {
                    lastL298Audible = false;
                    fetch('/api/motor/head_neck', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mouth: false, neck: false })
                    }).catch(e => {});
                }
            }
            requestAnimationFrame(monitorSpeakerOutput);
        };

        this.audioPlayer.onplay = () => {
            this.aiSpeaking = true;
            if (speakerAudioCtx && speakerAudioCtx.state === 'suspended') {
                speakerAudioCtx.resume();
            }
            setupSpeakerAnalyser();
        };

        this.audioPlayer.onpause = () => {
            this.aiSpeaking = false;
        };

        this.audioPlayer.onended = () => {
            this.aiSpeaking = false;
        };

        this.audioPlayer.onerror = () => {
            this.aiSpeaking = false;
        };

        monitorSpeakerOutput();
    }

    loadVoiceList() {
        const voiceSelect = document.getElementById('selectVoice');
        if (!voiceSelect) return;

        voiceSelect.innerHTML = '';

        const aiVoices = [
            { id: 'ai_female_us', label: '♀️ AI Voice - Female (US Accent)' },
            { id: 'ai_male_us', label: '♂️ AI Voice - Male (US Accent)' },
            { id: 'ai_male_uk', label: '♂️ AI Voice - Male (British Accent)' },
            { id: 'ai_female_uk', label: '♀️ AI Voice - Female (British Accent)' }
        ];

        aiVoices.forEach((v, idx) => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.label;
            if (idx === 0) opt.selected = true;
            voiceSelect.appendChild(opt);
        });
    }

    speak(text) {
        if (!text) return;

        const cleanText = text.replace(/\*[^*]*\*/g, '').trim();
        if (!cleanText) return;

        const voiceSelect = document.getElementById('selectVoice');
        const selectedVoiceVal = voiceSelect ? voiceSelect.value : 'ai_female_us';

        if (selectedVoiceVal.startsWith('sys_') && this.synth) {
            const sysIndex = parseInt(selectedVoiceVal.replace('sys_', ''), 10);
            const voices = this.synth.getVoices();
            const selectedVoice = voices[sysIndex];

            if (selectedVoice) {
                this.synth.cancel();
                if (this.synth.paused) this.synth.resume();

                const utterance = new SpeechSynthesisUtterance(cleanText);
                utterance.voice = selectedVoice;
                utterance.rate = 1.0;
                utterance.pitch = 1.0;

                utterance.onstart = () => { this.aiSpeaking = true; };
                utterance.onend = () => { this.aiSpeaking = false; };
                utterance.onerror = () => { this.aiSpeaking = false; };

                this.synth.speak(utterance);
                return;
            }
        }

        const encodedText = encodeURIComponent(cleanText);
        const encodedVoice = encodeURIComponent(selectedVoiceVal);
        this.audioPlayer.src = `/api/tts/speak?text=${encodedText}&voice=${encodedVoice}`;
        
        this.aiSpeaking = true;
        this.audioPlayer.play().catch(err => {
            if (this.synth) {
                this.synth.cancel();
                if (this.synth.paused) this.synth.resume();
                const utterance = new SpeechSynthesisUtterance(cleanText);
                utterance.onstart = () => { this.aiSpeaking = true; };
                utterance.onend = () => { this.aiSpeaking = false; };
                utterance.onerror = () => { this.aiSpeaking = false; };
                this.synth.speak(utterance);
            } else {
                this.aiSpeaking = false;
            }
        });
    }

    addMessage(sender, text) {
        const history = document.getElementById('chatHistory');
        if (!history) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${sender.toLowerCase()}`;
        msgDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
        history.appendChild(msgDiv);
        history.scrollTop = history.scrollHeight;
    }

    sendPromptToGemini(promptText) {
        this.addMessage('User', promptText);

        fetch('/api/gemini/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: promptText,
                api_key: this.apiKey,
                include_vision: true
            })
        })
        .then(res => res.json())
        .then(data => {
            const reply = data.text || 'No response from Gemini.';
            this.addMessage('Gemini AI', reply);
            this.speak(reply);

            if (data.action) {
                this.executeAIAction(data.action);
            }
        })
        .catch(err => {
            this.addMessage('Error', 'Failed to reach Gemini AI backend.');
            console.error(err);
        });
    }

    startGestureLoop() {
        setInterval(() => {
            if (!this.gestureActive) return;

            fetch('/api/gemini/gesture', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                const badge = document.getElementById('gestureBadge');
                if (!badge) return;

                if (data.gesture === '5_FINGERS_BOW') {
                    badge.textContent = '🖐️ 5 Fingers: Bowing Deerhead!';
                    badge.style.color = 'var(--accent-orange)';
                    if (this.app.triggerBow) this.app.triggerBow(2.0);
                } else if (data.gesture === '2_FINGERS_TALK') {
                    badge.textContent = '✌️ 2 Fingers: Mouth Open';
                    badge.style.color = 'var(--accent-green)';
                    if (this.app.setMouthEnergized) this.app.setMouthEnergized(true);
                } else if (data.gesture === '1_FINGER_SING') {
                    badge.textContent = '☝️ 1 Finger: Sing Song';
                    badge.style.color = 'var(--accent-cyan)';
                    if (this.app.triggerBow) this.app.triggerBow(1.5);
                } else {
                    badge.textContent = 'Gesture: Monitoring Camera...';
                    badge.style.color = 'var(--accent-cyan)';
                }

                if (data.action) {
                    this.executeAIAction(data.action);
                }
            })
            .catch(err => {});
        }, 800);
    }

    executeAIAction(action) {
        if (!action || !action.name) return;

        if (action.name === 'deerhead_bow' || action.name === 'bow') {
            const duration = action.args ? (action.args.duration_seconds || 1.8) : 1.8;
            if (this.app.triggerBow) this.app.triggerBow(duration);
        } else if (action.name === 'deerhead_mouth') {
            const state = action.args ? action.args.state : 'open';
            const energized = (state === 'open' || state === 'pulse');
            if (this.app.setMouthEnergized) this.app.setMouthEnergized(energized);
        } else if (action.name === 'deerhead_sing') {
            if (this.app.triggerBow) this.app.triggerBow(1.5);
        }
    }
}

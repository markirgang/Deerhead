#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import sys
import cv2
import base64
import threading
import time
import random
import urllib.parse
import re
from gemini_bridge import GeminiHexapodBridge
import numpy as np

PORT = int(os.environ.get("PORT", 9090))
HOST = os.environ.get("HOST", os.environ.get("IP", "127.0.0.1"))
DIRECTORY = os.environ.get("DIRECTORY", os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"))
AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio")
MUSIC_DIR = AUDIO_DIR
os.makedirs(AUDIO_DIR, exist_ok=True)

def generate_synthetic_camera_frame():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:, :] = (30, 25, 20)
    cv2.putText(frame, "4WD ROVER CAMERA FEED", (150, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 240, 255), 2)
    cv2.putText(frame, "STATUS: Virtual Camera Active", (160, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160, 255, 160), 1)
    t_str = time.strftime("%H:%M:%S")
    cv2.putText(frame, f"LIVE TIME: {t_str}", (220, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    return frame

# Thread-safe Background Camera Stream (Supports USB Webcams & Picamera2 Raspberry Pi CSI Camera)
class CameraStream:
    def __init__(self, source="usb"):
        self.source = str(source).lower()
        self.cap = None
        self.picam2 = None
        self.frame = None
        self.lock = threading.Lock()
        self.running = True
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def set_source(self, source):
        with self.lock:
            self.source = str(source).lower()
            self._close_cameras()

    def _close_cameras(self):
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None
        if self.picam2:
            try:
                self.picam2.stop()
                self.picam2.close()
            except Exception:
                pass
            self.picam2 = None

    def _update(self):
        while self.running:
            with self.lock:
                cur_source = self.source

            # Option A: Raspberry Pi CSI Camera via Picamera2
            if cur_source in ["csi", "picamera", "raspberry_pi", "ov5647"]:
                if self.picam2 is None:
                    self._close_cameras()
                    try:
                        from picamera2 import Picamera2
                        p = Picamera2()
                        config = p.create_preview_configuration(main={'size': (640, 480)})
                        p.configure(config)
                        p.start()
                        time.sleep(0.3)
                        self.picam2 = p
                        print("Picamera2 CSI Camera initialized successfully")
                    except Exception as e:
                        print("Picamera2 CSI Camera init error:", e)
                        self.picam2 = None
                        time.sleep(1.0)
                        continue

                try:
                    frame_array = self.picam2.capture_array('main')
                    if frame_array is not None and frame_array.size > 0:
                        if frame_array.shape[2] == 4:
                            frame_bgr = cv2.cvtColor(frame_array, cv2.COLOR_RGBA2BGR)
                        else:
                            frame_bgr = frame_array
                        with self.lock:
                            self.frame = frame_bgr
                    time.sleep(0.04)
                except Exception as e:
                    print("CSI frame capture error:", e)
                    self._close_cameras()
                    time.sleep(0.5)

            # Option B: USB Webcam via OpenCV V4L2
            else:
                if self.cap is None or not self.cap.isOpened():
                    self._close_cameras()
                    candidates = [8, 23, 0, 1, 6, 2]
                    if cur_source.isdigit():
                        candidates.insert(0, int(cur_source))
                    candidates = list(dict.fromkeys(candidates))

                    opened = False
                    for idx in candidates:
                        try:
                            cap = cv2.VideoCapture(idx, cv2.CAP_V4L2)
                            if cap.isOpened():
                                ret, frame = cap.read()
                                if ret and frame is not None and frame.size > 0:
                                    self.cap = cap
                                    with self.lock:
                                        self.frame = frame
                                    opened = True
                                    break
                                else:
                                    cap.release()
                        except Exception:
                            pass

                    if not opened:
                        time.sleep(4.0)

                if self.cap and self.cap.isOpened():
                    try:
                        ret, frame = self.cap.read()
                        if ret and frame is not None and frame.size > 0:
                            with self.lock:
                                self.frame = frame
                            time.sleep(0.04)
                        else:
                            self._close_cameras()
                            time.sleep(1.0)
                    except Exception:
                        self._close_cameras()
                        time.sleep(1.0)
                else:
                    time.sleep(0.5)

    def get_frame(self):
        with self.lock:
            if self.frame is not None:
                return self.frame.copy()
        return generate_synthetic_camera_frame()

camera_stream = CameraStream("usb")
gemini_bridge = GeminiHexapodBridge()

# 4WD Rover Motor State (2x L298 Motor Controllers driving 4 wheels independently)
motor_state = {
    "fl": {"dir": "stop", "speed": 100},
    "fr": {"dir": "stop", "speed": 100},
    "rl": {"dir": "stop", "speed": 100},
    "rr": {"dir": "stop", "speed": 100}
}

# Head & Neck L298 Motor Controller State
# Channel 1: Head Moving Mouth Motor
# Channel 2: Pulsating Neck Motor
head_neck_state = {
    "mouth_channel1": False,
    "neck_channel2": False
}

sensor_state = {
    "front": 45, # cm
    "rear": 120,
    "left": 80,
    "right": 65
}

def update_simulated_sensors():
    while True:
        sensor_state["front"] = max(10, min(200, sensor_state["front"] + random.randint(-2, 2)))
        sensor_state["rear"]  = max(10, min(200, sensor_state["rear"]  + random.randint(-2, 2)))
        sensor_state["left"]  = max(10, min(200, sensor_state["left"]  + random.randint(-2, 2)))
        sensor_state["right"] = max(10, min(200, sensor_state["right"] + random.randint(-2, 2)))
        time.sleep(0.5)

threading.Thread(target=update_simulated_sensors, daemon=True).start()

# Rover Presets / Motion Modes
SAVED_POSES = {
    "4WD Full Forward": {
        "wheels": {"fl": "forward", "fr": "forward", "rl": "forward", "rr": "forward"},
        "description": "Drive all 4 wheels forward in unison"
    },
    "Full Reverse": {
        "wheels": {"fl": "reverse", "fr": "reverse", "rl": "reverse", "rr": "reverse"},
        "description": "Drive all 4 wheels in reverse"
    },
    "Tank Spin Left": {
        "wheels": {"fl": "reverse", "fr": "forward", "rl": "reverse", "rr": "forward"},
        "description": "Spin in place counter-clockwise (Left wheels reverse, Right wheels forward)"
    },
    "Tank Spin Right": {
        "wheels": {"fl": "forward", "fr": "reverse", "rl": "forward", "rr": "reverse"},
        "description": "Spin in place clockwise (Left wheels forward, Right wheels reverse)"
    },
    "Pivot Turn Left": {
        "wheels": {"fl": "stop", "fr": "forward", "rl": "stop", "rr": "forward"},
        "description": "Pivot turn left (Left wheels stopped, Right wheels forward)"
    },
    "Pivot Turn Right": {
        "wheels": {"fl": "forward", "fr": "stop", "rl": "forward", "rr": "stop"},
        "description": "Pivot turn right (Left wheels forward, Right wheels stopped)"
    },
    "Diagonal Crab Drive": {
        "wheels": {"fl": "forward", "fr": "reverse", "rl": "reverse", "rr": "forward"},
        "description": "Opposing wheel directions for diagonal skid motion"
    },
    "Emergency Halt": {
        "wheels": {"fl": "stop", "fr": "stop", "rl": "stop", "rr": "stop"},
        "description": "Stop all 4 wheels immediately"
    }
}

def apply_rover_command(cmd, speed=100):
    cmd = str(cmd).lower()
    if cmd in ["forward", "fwd", "run", "run_forward"]:
        motor_state["fl"] = {"dir": "forward", "speed": speed}
        motor_state["fr"] = {"dir": "forward", "speed": speed}
        motor_state["rl"] = {"dir": "forward", "speed": speed}
        motor_state["rr"] = {"dir": "forward", "speed": speed}
    elif cmd in ["backward", "reverse", "bwd"]:
        motor_state["fl"] = {"dir": "reverse", "speed": speed}
        motor_state["fr"] = {"dir": "reverse", "speed": speed}
        motor_state["rl"] = {"dir": "reverse", "speed": speed}
        motor_state["rr"] = {"dir": "reverse", "speed": speed}
    elif cmd in ["spin_left", "spin_l", "tank_left"]:
        motor_state["fl"] = {"dir": "reverse", "speed": speed}
        motor_state["fr"] = {"dir": "forward", "speed": speed}
        motor_state["rl"] = {"dir": "reverse", "speed": speed}
        motor_state["rr"] = {"dir": "forward", "speed": speed}
    elif cmd in ["spin_right", "spin_r", "tank_right"]:
        motor_state["fl"] = {"dir": "forward", "speed": speed}
        motor_state["fr"] = {"dir": "reverse", "speed": speed}
        motor_state["rl"] = {"dir": "forward", "speed": speed}
        motor_state["rr"] = {"dir": "reverse", "speed": speed}
    elif cmd in ["turn_left", "left"]:
        motor_state["fl"] = {"dir": "stop", "speed": speed}
        motor_state["fr"] = {"dir": "forward", "speed": speed}
        motor_state["rl"] = {"dir": "stop", "speed": speed}
        motor_state["rr"] = {"dir": "forward", "speed": speed}
    elif cmd in ["turn_right", "right"]:
        motor_state["fl"] = {"dir": "forward", "speed": speed}
        motor_state["fr"] = {"dir": "stop", "speed": speed}
        motor_state["rl"] = {"dir": "forward", "speed": speed}
        motor_state["rr"] = {"dir": "stop", "speed": speed}
    elif cmd in ["stop", "halt", "park"]:
        motor_state["fl"] = {"dir": "stop", "speed": 0}
        motor_state["fr"] = {"dir": "stop", "speed": 0}
        motor_state["rl"] = {"dir": "stop", "speed": 0}
        motor_state["rr"] = {"dir": "stop", "speed": 0}

class RoverRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_HEAD(self):
        if self.path.startswith("/api/"):
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
        elif self.path.startswith("/audio/") or self.path.startswith("/music/"):
            self.send_response(200)
            self.send_header('Content-type', 'audio/mpeg')
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
        else:
            super().do_HEAD()

    def do_GET(self):
        if self.path.startswith("/api/status"):
            self.send_json({"status": "online", "device": "Raspberry Pi 4WD Rover with Robotic Head", "python_version": sys.version})
        elif self.path.startswith("/api/poses"):
            self.send_json(SAVED_POSES)
        elif self.path.startswith("/api/camera/frame"):
            self.serve_camera_frame()
        elif self.path.startswith("/api/sensors/distances"):
            self.send_json(sensor_state)
        elif self.path.startswith("/api/motor/state"):
            self.send_json(motor_state)
        elif self.path.startswith("/api/motor/head_neck"):
            self.send_json(head_neck_state)
        elif self.path.startswith("/api/audio/list") or self.path.startswith("/api/music/list"):
            files = []
            if os.path.exists(AUDIO_DIR):
                for fname in sorted(os.listdir(AUDIO_DIR)):
                    if fname.lower().endswith(('.mp3', '.wav', '.ogg', '.m4a')):
                        fpath = os.path.join(AUDIO_DIR, fname)
                        size = os.path.getsize(fpath)
                        mtime = os.path.getmtime(fpath)
                        files.append({"name": fname, "size": size, "mtime": mtime})
            self.send_json({"files": files})
        elif self.path.startswith("/audio/") or self.path.startswith("/music/"):
            prefix = "/audio/" if self.path.startswith("/audio/") else "/music/"
            raw_filename = self.path[len(prefix):]
            filename = urllib.parse.unquote(raw_filename.split('?')[0])
            filename = os.path.basename(filename)
            file_path = os.path.join(AUDIO_DIR, filename)
            if os.path.isfile(file_path):
                try:
                    with open(file_path, "rb") as f:
                        content = f.read()
                    self.send_response(200)
                    if filename.lower().endswith('.mp3'):
                        self.send_header('Content-type', 'audio/mpeg')
                    elif filename.lower().endswith('.wav'):
                        self.send_header('Content-type', 'audio/wav')
                    elif filename.lower().endswith('.ogg'):
                        self.send_header('Content-type', 'audio/ogg')
                    else:
                        self.send_header('Content-type', 'application/octet-stream')
                    self.send_header('Content-Length', str(len(content)))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()
                    self.wfile.write(content)
                except Exception as e:
                    self.send_json({"error": str(e)}, status=500)
            else:
                self.send_json({"error": "File not found"}, status=404)
        elif self.path.startswith("/api/tts/speak"):
            query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            text_to_speak = query_params.get("text", ["Hello!"])[0]
            voice_id = query_params.get("voice", ["ai_female_us"])[0]

            try:
                from gtts import gTTS
                import io
                clean_text = re.sub(r'\*[^*]*\*', '', text_to_speak).strip()
                if not clean_text:
                    clean_text = "Hello!"

                tld_map = {
                    "ai_female_us": ("en", "com"),
                    "ai_male_us": ("en", "us"),
                    "ai_male_uk": ("en", "co.uk"),
                    "ai_female_uk": ("en", "co.uk")
                }

                lang, tld = tld_map.get(voice_id, ("en", "com"))
                tts = gTTS(text=clean_text, lang=lang, tld=tld)
                mp3_fp = io.BytesIO()
                tts.write_to_fp(mp3_fp)
                mp3_fp.seek(0)
                audio_bytes = mp3_fp.read()

                self.send_response(200)
                self.send_header('Content-type', 'audio/mpeg')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                self.wfile.write(audio_bytes)
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = {}

        if self.path in ["/api/motor/rover", "/api/motor/wheels"]:
            if "command" in data:
                apply_rover_command(data["command"], data.get("speed", 100))
            else:
                for wheel in ["fl", "fr", "rl", "rr"]:
                    if wheel in data:
                        w_data = data[wheel]
                        if isinstance(w_data, dict):
                            motor_state[wheel]["dir"] = w_data.get("dir", motor_state[wheel]["dir"])
                            motor_state[wheel]["speed"] = w_data.get("speed", motor_state[wheel]["speed"])
                        elif isinstance(w_data, str):
                            motor_state[wheel]["dir"] = w_data

            self.send_json({"success": True, "state": motor_state})

        elif self.path in ["/api/motor/head_neck", "/api/motor/l298"]:
            head_neck_state["mouth_channel1"] = data.get("mouth", data.get("mouth_channel1", False))
            head_neck_state["neck_channel2"]  = data.get("neck", data.get("neck_channel2", False))
            self.send_json({"success": True, "state": head_neck_state})

        elif self.path == "/api/camera/select":
            source = data.get("source", "usb")
            camera_stream.set_source(source)
            self.send_json({"success": True, "active_source": source})

        elif self.path == "/api/gemini/chat":
            user_text = data.get("prompt", "")
            DEFAULT_GEMINI_KEY = ""
            api_key = data.get("api_key") or os.environ.get("GEMINI_API_KEY") or DEFAULT_GEMINI_KEY
            include_vision = data.get("include_vision", True)

            image_bytes = None
            if include_vision:
                image_bytes = self.capture_camera_bytes()

            result = gemini_bridge.generate_chat_response(api_key, user_text, image_bytes)
            if result.get("action"):
                act = result["action"]
                if act.get("name") in ["rover_drive", "hexapod_walk"]:
                    args = act.get("args", {})
                    apply_rover_command(args.get("direction", "forward"), args.get("speed", 100))
                elif act.get("name") in ["rover_stop", "hexapod_stop"]:
                    apply_rover_command("stop")

            self.send_json(result)

        elif self.path == "/api/gemini/voice":
            DEFAULT_GEMINI_KEY = ""
            api_key = data.get("api_key") or os.environ.get("GEMINI_API_KEY") or DEFAULT_GEMINI_KEY
            audio_b64 = data.get("audio_b64", "")
            mime_type = data.get("mime_type", "audio/webm")
            include_vision = data.get("include_vision", True)

            audio_bytes = base64.b64decode(audio_b64) if audio_b64 else None
            image_bytes = self.capture_camera_bytes() if include_vision else None

            result = gemini_bridge.generate_voice_chat_response(api_key, audio_bytes, mime_type, image_bytes)
            if result.get("action"):
                act = result["action"]
                if act.get("name") in ["rover_drive", "hexapod_walk"]:
                    args = act.get("args", {})
                    apply_rover_command(args.get("direction", "forward"), args.get("speed", 100))
                elif act.get("name") in ["rover_stop", "hexapod_stop"]:
                    apply_rover_command("stop")

            self.send_json(result)

        elif self.path == "/api/gemini/gesture":
            frame = self.capture_camera_frame()
            if frame is None:
                self.send_json({"gesture": "None", "finger_count": 0, "action": None})
            else:
                gesture, finger_count, _ = gemini_bridge.detect_hand_gestures(frame)
                action = None
                if gesture == "5_FINGERS_FORWARD":
                    action = {"name": "rover_drive", "args": {"direction": "forward"}}
                    apply_rover_command("forward")
                elif gesture == "2_FINGERS_WAVE":
                    action = {"name": "rover_drive", "args": {"direction": "spin_left"}}
                    apply_rover_command("spin_left")
                elif gesture == "1_FINGER_ATTACK":
                    action = {"name": "rover_drive", "args": {"direction": "reverse"}}
                    apply_rover_command("reverse")

                self.send_json({
                    "gesture": gesture,
                    "finger_count": finger_count,
                    "action": action
                })

        elif self.path in ["/api/audio/upload", "/api/music/upload"]:
            filename = data.get("filename", "")
            file_b64 = data.get("data", "") or data.get("file_b64", "")
            if not filename or not file_b64:
                self.send_json({"error": "Missing filename or data"}, status=400)
            else:
                safe_name = os.path.basename(filename)
                if not safe_name.lower().endswith(('.mp3', '.wav', '.ogg', '.m4a')):
                    safe_name += ".mp3"
                target_path = os.path.join(AUDIO_DIR, safe_name)
                try:
                    if "," in file_b64:
                        file_b64 = file_b64.split(",", 1)[1]
                    raw_bytes = base64.b64decode(file_b64)
                    with open(target_path, "wb") as f:
                        f.write(raw_bytes)
                    self.send_json({"success": True, "filename": safe_name, "size": len(raw_bytes)})
                except Exception as e:
                    self.send_json({"error": str(e)}, status=500)

        elif self.path in ["/api/audio/delete", "/api/music/delete"]:
            filename = data.get("filename", "")
            safe_name = os.path.basename(filename)
            target_path = os.path.join(AUDIO_DIR, safe_name)
            if os.path.isfile(target_path):
                try:
                    os.remove(target_path)
                    self.send_json({"success": True})
                except Exception as e:
                    self.send_json({"error": str(e)}, status=500)
            else:
                self.send_json({"error": "File not found"}, status=404)

        elif self.path == "/api/export-python":
            python_script = self.generate_hardware_script(data)
            self.send_response(200)
            self.send_header('Content-type', 'application/x-python')
            self.send_header('Content-Disposition', 'attachment; filename="rover_4wd_robotic_head_control.py"')
            self.end_headers()
            self.wfile.write(python_script.encode('utf-8'))

        else:
            self.send_json({"error": "Endpoint not found"}, status=404)

    def capture_camera_frame(self):
        return camera_stream.get_frame()

    def capture_camera_bytes(self):
        frame = self.capture_camera_frame()
        if frame is None:
            frame = generate_synthetic_camera_frame()
        ret, jpeg = cv2.imencode('.jpg', frame)
        return jpeg.tobytes() if ret else None

    def serve_camera_frame(self):
        jpeg_bytes = self.capture_camera_bytes()
        if jpeg_bytes is None:
            try:
                self.send_response(503)
                self.end_headers()
            except Exception:
                pass
            return
        try:
            self.send_response(200)
            self.send_header('Content-type', 'image/jpeg')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(jpeg_bytes)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def send_json(self, data, status=200):
        try:
            self.send_response(status)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def generate_hardware_script(self, data):
        script = f'''#!/usr/bin/env python3
"""
4WD Rover Hardware Master Control Script
Controls 4 wheels independently using 2x L298N Dual H-Bridge Motor Drivers,
plus a 3rd L298N Dual Controller for Black Robotic Head Mouth & Pulsing Neck,
and 4x HC-SR04 Ultrasonic Distance Sensors.
"""

import time
import RPi.GPIO as GPIO

# --- GPIO Pin Definitions for 3x L298N Dual Motor Drivers ---

# L298 Controller #1 (Front Wheels)
L298_1_ENA = 18  # Front-Left Wheel PWM
L298_1_IN1 = 23  # Direction Pin 1
L298_1_IN2 = 24  # Direction Pin 2
L298_1_ENB = 19  # Front-Right Wheel PWM
L298_1_IN3 = 25  # Direction Pin 3
L298_1_IN4 = 8   # Direction Pin 4

# L298 Controller #2 (Rear Wheels)
L298_2_ENA = 12  # Rear-Left Wheel PWM
L298_2_IN1 = 16  # Direction Pin 1
L298_2_IN2 = 20  # Direction Pin 2
L298_2_ENB = 13  # Rear-Right Wheel PWM
L298_2_IN3 = 21  # Direction Pin 3
L298_2_IN4 = 26  # Direction Pin 4

# L298 Controller #3 (Black Robotic Head & Neck Motors)
L298_3_ENA = 17  # Channel 1: Robotic Head Moving Mouth Motor PWM
L298_3_IN1 = 27  # Direction Pin 1
L298_3_IN2 = 22  # Direction Pin 2
L298_3_ENB = 4   # Channel 2: Pulsating Neck Motor PWM
L298_3_IN3 = 5   # Direction Pin 3
L298_3_IN4 = 6   # Direction Pin 4

# 4x HC-SR04 Ultrasonic Sensors (Trig / Echo)
SENSORS = {{
    "front": {{"trig": 5, "echo": 6}},
    "rear":  {{"trig": 12, "echo": 13}},
    "left":  {{"trig": 16, "echo": 20}},
    "right": {{"trig": 21, "echo": 26}}
}}

# Initialize GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

PINS = [
    L298_1_ENA, L298_1_IN1, L298_1_IN2, L298_1_ENB, L298_1_IN3, L298_1_IN4,
    L298_2_ENA, L298_2_IN1, L298_2_IN2, L298_2_ENB, L298_2_IN3, L298_2_IN4,
    L298_3_ENA, L298_3_IN1, L298_3_IN2, L298_3_ENB, L298_3_IN3, L298_3_IN4
]
GPIO.setup(PINS, GPIO.OUT)

pwm_fl    = GPIO.PWM(L298_1_ENA, 1000)
pwm_fr    = GPIO.PWM(L298_1_ENB, 1000)
pwm_rl    = GPIO.PWM(L298_2_ENA, 1000)
pwm_rr    = GPIO.PWM(L298_2_ENB, 1000)
pwm_mouth = GPIO.PWM(L298_3_ENA, 1000)
pwm_neck  = GPIO.PWM(L298_3_ENB, 1000)

for p in [pwm_fl, pwm_fr, pwm_rl, pwm_rr, pwm_mouth, pwm_neck]:
    p.start(0)

def set_mouth_energized(active):
    """L298 Controller #3 Channel 1: Drives robotic mouth motor in sync with speech."""
    if active:
        GPIO.output(L298_3_IN1, GPIO.HIGH)
        GPIO.output(L298_3_IN2, GPIO.LOW)
        pwm_mouth.ChangeDutyCycle(100)
    else:
        pwm_mouth.ChangeDutyCycle(0)

def set_neck_pulsating(active):
    """L298 Controller #3 Channel 2: Drives neck pulsating motor."""
    if active:
        GPIO.output(L298_3_IN3, GPIO.HIGH)
        GPIO.output(L298_3_IN4, GPIO.LOW)
        pwm_neck.ChangeDutyCycle(80)
    else:
        pwm_neck.ChangeDutyCycle(0)

def set_wheel(wheel, direction="stop", speed=100):
    speed = max(0, min(100, speed))

    if wheel == "fl":
        p_in1, p_in2, pwm = L298_1_IN1, L298_1_IN2, pwm_fl
    elif wheel == "fr":
        p_in1, p_in2, pwm = L298_1_IN3, L298_1_IN4, pwm_fr
    elif wheel == "rl":
        p_in1, p_in2, pwm = L298_2_IN1, L298_2_IN2, pwm_rl
    elif wheel == "rr":
        p_in1, p_in2, pwm = L298_2_IN3, L298_2_IN4, pwm_rr
    else:
        return

    if direction == "forward":
        GPIO.output(p_in1, GPIO.HIGH)
        GPIO.output(p_in2, GPIO.LOW)
        pwm.ChangeDutyCycle(speed)
    elif direction == "reverse":
        GPIO.output(p_in1, GPIO.LOW)
        GPIO.output(p_in2, GPIO.HIGH)
        pwm.ChangeDutyCycle(speed)
    else:
        GPIO.output(p_in1, GPIO.LOW)
        GPIO.output(p_in2, GPIO.LOW)
        pwm.ChangeDutyCycle(0)

def drive_rover(cmd, speed=100):
    cmd = str(cmd).lower()
    if cmd in ["forward", "run"]:
        for w in ["fl", "fr", "rl", "rr"]: set_wheel(w, "forward", speed)
    elif cmd in ["reverse", "backward"]:
        for w in ["fl", "fr", "rl", "rr"]: set_wheel(w, "reverse", speed)
    elif cmd in ["spin_left", "tank_left"]:
        set_wheel("fl", "reverse", speed)
        set_wheel("rl", "reverse", speed)
        set_wheel("fr", "forward", speed)
        set_wheel("rr", "forward", speed)
    elif cmd in ["spin_right", "tank_right"]:
        set_wheel("fl", "forward", speed)
        set_wheel("rl", "forward", speed)
        set_wheel("fr", "reverse", speed)
        set_wheel("rr", "reverse", speed)
    else:
        for w in ["fl", "fr", "rl", "rr"]: set_wheel(w, "stop", 0)

def main():
    print("Master 4WD Rover with Robotic Head Controller Online.")
    print("L298 #1 & #2 (4 Wheels) + L298 #3 (Mouth & Neck Motors) Ready.")
    set_mouth_energized(True)
    set_neck_pulsating(True)
    time.sleep(2)
    set_mouth_energized(False)
    set_neck_pulsating(False)

if __name__ == "__main__":
    try:
        main()
    finally:
        GPIO.cleanup()
'''
        return script

class ThreadingReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == "__main__":
    for i in range(1, len(sys.argv)):
        if sys.argv[i] == "--port" and i + 1 < len(sys.argv):
            PORT = int(sys.argv[i + 1])
        elif sys.argv[i] == "--host" and i + 1 < len(sys.argv):
            HOST = sys.argv[i + 1]

    display_host = "localhost" if HOST in ["", "0.0.0.0", "127.0.0.1"] else HOST
    print(f"Starting Multithreaded 4WD Rover Control Server on http://{display_host}:{PORT}")
    bind_host = "" if HOST == "0.0.0.0" else HOST
    with ThreadingReusableTCPServer((bind_host, PORT), RoverRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

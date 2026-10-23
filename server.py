#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import sys
import socket
import ssl
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
        if self.path.startswith("/api/export-pdf"):
            pdf_bytes = self.generate_schematic_pdf()
            self.send_response(200)
            self.send_header('Content-type', 'application/pdf')
            self.send_header('Content-Disposition', 'attachment; filename="4WD_Rover_Wiring_Schematic.pdf"')
            self.end_headers()
            self.wfile.write(pdf_bytes)

        elif self.path.startswith("/api/status"):
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

    def generate_schematic_pdf(self):
        import io
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(letter), leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle('DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, textColor=colors.HexColor('#003366'), spaceAfter=4)
        subtitle_style = ParagraphStyle('DocSubTitle', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=9, textColor=colors.HexColor('#444444'), spaceAfter=10)
        heading_style = ParagraphStyle('SectionHeading', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11, textColor=colors.HexColor('#0055a5'), spaceBefore=8, spaceAfter=4)
        cell_style = ParagraphStyle('TableCell', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=colors.HexColor('#111111'))
        header_cell_style = ParagraphStyle('TableHeaderCell', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)

        story = [
            Paragraph("🤖 4WD ROVER WITH ANIMATRONIC HEAD - MASTER WIRING SCHEMATIC", title_style),
            Paragraph("Page 1 of 2: Pinout Guide for Raspberry Pi 4/5, 3x L298N Motor Controllers, 4x HC-SR04 Sonar & Power Rail", subtitle_style),
            HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0055a5'), spaceBefore=2, spaceAfter=8),
            Paragraph("⚡ Core System Hardware Overview", heading_style)
        ]

        overview_data = [
            [Paragraph("Module / Component", header_cell_style), Paragraph("Hardware Role & Signals", header_cell_style), Paragraph("Power Requirements", header_cell_style)],
            [Paragraph("<b>Raspberry Pi 4 / 5</b>", cell_style), Paragraph("Executes master server, Gemini AI, L298N motor drivers, Sonar VAD & Pan/Tilt Servos", cell_style), Paragraph("+5V @ 3A DC (UBEC)"),],
            [Paragraph("<b>L298N Driver #1 (Front)</b>", cell_style), Paragraph("Front-Left Wheel (GPIO 18 ENA, 23, 24) and Front-Right Wheel (GPIO 19 ENB, 25, 8)", cell_style), Paragraph("+7.4V - +11.1V LiPo Rail"),],
            [Paragraph("<b>L298N Driver #2 (Rear)</b>", cell_style), Paragraph("Rear-Left Wheel (GPIO 12 ENA, 16, 20) and Rear-Right Wheel (GPIO 13 ENB, 21, 26)", cell_style), Paragraph("+7.4V - +11.1V LiPo Rail"),],
            [Paragraph("<b>L298N Driver #3 (Head/Neck)</b>", cell_style), Paragraph("Mouth DC Motor (GPIO 17 ENA, 27, 22) and Pulsating Neck Motor (GPIO 4 ENB, 14, 15)", cell_style), Paragraph("+6V DC Power Rail"),],
            [Paragraph("<b>HC-SR04 Sonar (4x)</b>", cell_style), Paragraph("Front (GPIO 5/6), Rear (GPIO 13/19), Left (GPIO 26/21), Right (GPIO 20/16) Ultrasonic Distance", cell_style), Paragraph("+5V DC Logic VCC"),]
        ]
        t_overview = Table(overview_data, colWidths=[150, 430, 140])
        t_overview.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#003366')),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#ffffff'), colors.HexColor('#f5f8ff')])
        ]))
        story.append(t_overview)
        story.append(Spacer(1, 10))

        # --- PAGE 2: FRITZING-STYLE VISUAL PINOUT DIAGRAM PAGE ---
        story.append(PageBreak())
        story.append(Paragraph("🍓 FRITZING-STYLE RASPBERRY PI GPIO & PCA9685 PINOUT DIAGRAM", title_style))
        story.append(Paragraph("Page 2 of 3: Visual Labeled Hardware Pinout Diagrams for Raspberry Pi 40-Pin Header, PCA9685 Board & Motor Drivers", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0055a5'), spaceBefore=2, spaceAfter=8))

        story.append(Paragraph("📌 Raspberry Pi 40-Pin GPIO Header (Dual-Row Fritzing-Style Pin Layout)", heading_style))

        rpi_header_rows = [[
            Paragraph("Odd Pin (Left)", header_cell_style),
            Paragraph("BCM Signal / Function", header_cell_style),
            Paragraph("Pin #", header_cell_style),
            Paragraph("Pin #", header_cell_style),
            Paragraph("BCM Signal / Function", header_cell_style),
            Paragraph("Even Pin (Right)", header_cell_style)
        ]]

        rpi_pin_pairs = [
            ("3.3V Power - Logic Ref", "Pin 1", "Pin 2", "5.0V Power - Logic VCC"),
            ("GPIO 2 (SDA1) - I2C Data", "Pin 3", "Pin 4", "5.0V Power - Logic VCC"),
            ("GPIO 3 (SCL1) - I2C Clock", "Pin 5", "Pin 6", "Ground (GND) - Common GND"),
            ("GPIO 4 - L298 #3 ENB (Neck PWM)", "Pin 7", "Pin 8", "GPIO 14 (TX) - L298 #3 IN3 (Neck)"),
            ("Ground (GND) - Common GND", "Pin 9", "Pin 10", "GPIO 15 (RX) - L298 #3 IN4 (Neck)"),
            ("GPIO 17 - L298 #3 ENA (Mouth PWM)", "Pin 11", "Pin 12", "GPIO 18 (PWM) - L298 #1 ENA (FL Wheel)"),
            ("GPIO 27 - L298 #3 IN1 (Mouth)", "Pin 13", "Pin 14", "Ground (GND) - Common GND"),
            ("GPIO 22 - L298 #3 IN2 (Mouth)", "Pin 15", "Pin 16", "GPIO 23 - L298 #1 IN1 (FL Wheel)"),
            ("3.3V Power", "Pin 17", "Pin 18", "GPIO 24 - L298 #1 IN2 (FL Wheel)"),
            ("GPIO 10 - Sonar Front Trig", "Pin 19", "Pin 20", "Ground (GND) - Common GND"),
            ("GPIO 9 - Sonar Front Echo", "Pin 21", "Pin 22", "GPIO 25 - L298 #1 IN3 (FR Wheel)"),
            ("GPIO 11 - Sonar Rear Trig", "Pin 23", "Pin 24", "GPIO 8 - L298 #1 IN4 (FR Wheel)"),
            ("Ground (GND)", "Pin 25", "Pin 26", "GPIO 7"),
            ("GPIO 0 (ID_SD)", "Pin 27", "Pin 28", "GPIO 1 (ID_SC)"),
            ("GPIO 5 - Sonar Left Trig", "Pin 29", "Pin 30", "Ground (GND) - Common GND"),
            ("GPIO 6 - Sonar Left Echo", "Pin 31", "Pin 32", "GPIO 12 (PWM) - L298 #2 ENA (RL Wheel)"),
            ("GPIO 13 (PWM) - L298 #2 ENB (RR)", "Pin 33", "Pin 34", "Ground (GND) - Common GND"),
            ("GPIO 19 (PWM) - L298 #1 ENB (FR)", "Pin 35", "Pin 36", "GPIO 16 - L298 #2 IN1 (RL Wheel)"),
            ("GPIO 26 - L298 #2 IN4 (RR Wheel)", "Pin 37", "Pin 38", "GPIO 20 - L298 #2 IN2 (RL Wheel)"),
            ("Ground (GND)", "Pin 39", "Pin 40", "GPIO 21 - L298 #2 IN3 (RR Wheel)")
        ]

        for left_sig, left_p, right_p, right_sig in rpi_pin_pairs:
            rpi_header_rows.append([
                Paragraph(f"<b>{left_sig}</b>", cell_style),
                Paragraph(f"<code>{left_sig.split(' - ')[0]}</code>", cell_style),
                Paragraph(f"<b>{left_p}</b>", cell_style),
                Paragraph(f"<b>{right_p}</b>", cell_style),
                Paragraph(f"<code>{right_sig.split(' - ')[0]}</code>", cell_style),
                Paragraph(f"<b>{right_sig}</b>", cell_style)
            ])

        t_rpi = Table(rpi_header_rows, colWidths=[150, 100, 45, 45, 100, 150])
        t_rpi.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#003366')),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('BACKGROUND', (2,1), (2,-1), colors.HexColor('#e6f2ff')),
            ('BACKGROUND', (3,1), (3,-1), colors.HexColor('#e6f2ff'))
        ]))
        story.append(t_rpi)
        story.append(Spacer(1, 10))

        # PCA9685 Fritzing Pinout Table
        story.append(Paragraph("🎛️ PCA9685 16-Channel PWM Servo & MOSFET Driver (Pinout Diagram & Signal Map)", heading_style))
        pca_rows = [[
            Paragraph("Terminal / Channel", header_cell_style),
            Paragraph("Signal Type", header_cell_style),
            Paragraph("Target Module Connected", header_cell_style),
            Paragraph("Function Description", header_cell_style),
            Paragraph("Output Voltage / Power", header_cell_style)
        ]]

        pca_items = [
            ("I2C Header", "SDA / SCL / VCC / GND", "Raspberry Pi GPIO 2, 3 & 3.3V Pin 1", "I2C Serial Communication Bus (Addr: 0x40)", "3.3V DC VCC Logic"),
            ("Ext Power V+", "V+ Screw Terminal", "5V 10A UBEC Regulator", "High-Current Servo & MOSFET Power Rail", "5V DC @ 10A"),
            ("Channel 0", "PWM Servo Out", "Camera Gimbal Pan Servo", "Camera Horizontal Pan Servo", "5V Servo Power"),
            ("Channel 1", "PWM Servo Out", "Camera Gimbal Tilt Servo", "Camera Vertical Tilt Servo", "5V Servo Power"),
            ("Channel 2", "PWM Dimmer Out", "Front Headlights MOSFET", "3.3V Gate MOSFET -> 12V High-Power Headlights PWM", "3.3V PWM / 12V DC"),
            ("Channel 3", "PWM Dimmer Out", "Underglow RGB LEDs MOSFET", "3.3V Gate MOSFET -> 12V Underglow RGB LED Strips PWM", "3.3V PWM / 12V DC"),
            ("Channel 4", "PWM Dimmer Out", "Rear Brake Lights MOSFET", "3.3V Gate MOSFET -> 12V Rear Tail / Brake Lights PWM", "3.3V PWM / 12V DC")
        ]

        for item in pca_items:
            pca_rows.append([
                Paragraph(f"<b>{item[0]}</b>", cell_style),
                Paragraph(item[1], cell_style),
                Paragraph(f"<b>{item[2]}</b>", cell_style),
                Paragraph(item[3], cell_style),
                Paragraph(item[4], cell_style)
            ])

        t_pca = Table(pca_rows, colWidths=[110, 100, 140, 150, 90])
        t_pca.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#003366')),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#ffffff'), colors.HexColor('#f5f8ff')])
        ]))
        story.append(t_pca)

        # PAGE 3: BILL OF MATERIALS / PARTS LIST
        story.append(PageBreak())
        story.append(Paragraph("📦 4WD ROVER WITH ANIMATRONIC HEAD - BILL OF MATERIALS (PARTS LIST)", title_style))
        story.append(Paragraph("Page 3 of 3: Complete Parts Specification, Quantities, Power Requirements & Subsystem Roles", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0055a5'), spaceBefore=2, spaceAfter=8))

        bom_rows = [[
            Paragraph("Item #", header_cell_style),
            Paragraph("Component / Part Name", header_cell_style),
            Paragraph("Specification / Model", header_cell_style),
            Paragraph("Qty", header_cell_style),
            Paragraph("Subsystem Role & Interface", header_cell_style),
            Paragraph("Power / Voltage", header_cell_style)
        ]]

        bom_data_items = [
            ("1", "Raspberry Pi 4 or 5", "4GB / 8GB RAM Model B", "1", "Master Server, Gemini AI, Motor Controls & Sonar VAD", "5V @ 3A DC"),
            ("2", "4WD Metal Chassis Kit", "Aluminum Alloy Frame with 4 Wheels", "1", "Rover Mechanical Body Frame with 4 Independent Motors", "6V - 12V DC"),
            ("3", "L298N Dual H-Bridge Drivers", "Dual-Channel DC Motor Controllers", "3", "Driver 1 (Left Wheels), Driver 2 (Right Wheels), Driver 3 (Head/Neck)", "6V - 12V DC"),
            ("4", "HC-SR04 Ultrasonic Sonar Sensors", "Ultrasonic Distance Sensors (4-Pin)", "4", "Front, Rear, Left, and Right Obstacle Avoidance Sonar", "5V DC Logic"),
            ("5", "Black Animatronic Head Assembly", "Robotic Head with Moving Mouth & Neck", "1", "Head with Mouth DC Motor (Ch 1) and Pulsating Neck DC Motor (Ch 2)", "6V DC"),
            ("6", "Pan/Tilt Camera Gimbal Servos", "SG90 / MG90S Micro Servos", "2", "2-DOF Pan & Tilt Camera Platform Servos", "5V DC"),
            ("7", "Wide-Angle HD Web Camera", "USB Webcam / Pi CSI Camera", "1", "Live Video Stream & Gemini AI Computer Vision Input", "USB 5V DC"),
            ("8", "LiPo Battery Power Supply", "2S 7.4V or 3S 11.1V LiPo Battery", "1", "Main High-Current Power Source for Rover Motors & Pi UBEC", "7.4V - 11.1V DC"),
            ("9", "5V 10A UBEC Buck Converter", "Step-Down Voltage Regulator", "1", "Converts LiPo Battery Voltage to Clean +5V DC for Pi & Servos", "5V @ 10A DC Out")
        ]

        for item in bom_data_items:
            bom_rows.append([
                Paragraph(f"<b>{item[0]}</b>", cell_style),
                Paragraph(f"<b>{item[1]}</b>", cell_style),
                Paragraph(item[2], cell_style),
                Paragraph(f"<b>{item[3]}</b>", cell_style),
                Paragraph(item[4], cell_style),
                Paragraph(item[5], cell_style)
            ])

        t_bom = Table(bom_rows, colWidths=[40, 130, 130, 35, 255, 130])
        t_bom.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0055a5')),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dddddd')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#ffffff'), colors.HexColor('#f8fafd')])
        ]))
        story.append(t_bom)

        doc.build(story)
        return buffer.getvalue()

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
    ssl_context = None

    def get_request(self):
        newsocket, fromaddr = self.socket.accept()
        if self.ssl_context:
            try:
                first_byte = newsocket.recv(1, socket.MSG_PEEK)
                if first_byte and first_byte[0] == 0x16:
                    newsocket = self.ssl_context.wrap_socket(newsocket, server_side=True)
            except Exception:
                pass
        return newsocket, fromaddr

if __name__ == "__main__":
    for i in range(1, len(sys.argv)):
        if sys.argv[i] == "--port" and i + 1 < len(sys.argv):
            PORT = int(sys.argv[i + 1])
        elif sys.argv[i] == "--host" and i + 1 < len(sys.argv):
            HOST = sys.argv[i + 1]

    cert_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cert.pem")
    key_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "key.pem")
    if not (os.path.exists(cert_path) and os.path.exists(key_path)):
        cert_path = "/home/markirgang/Tweedpump/cert.pem"
        key_path = "/home/markirgang/Tweedpump/key.pem"

    ssl_ctx = None
    if os.path.exists(cert_path) and os.path.exists(key_path):
        try:
            ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_ctx.load_cert_chain(certfile=cert_path, keyfile=key_path)
        except Exception as e:
            print(f"SSL cert load warning: {e}")

    display_host = "localhost" if HOST in ["", "0.0.0.0", "127.0.0.1"] else HOST
    print(f"Starting Multithreaded 4WD Rover Control Server on http://{display_host}:{PORT} (http & https supported)")
    bind_host = "" if HOST == "0.0.0.0" else HOST
    with ThreadingReusableTCPServer((bind_host, PORT), RoverRequestHandler) as httpd:
        httpd.ssl_context = ssl_ctx
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import sys
import socket
import ssl
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
import cv2
import base64
import threading
import time
import random
import urllib.parse
import re
from gemini_bridge import GeminiHexapodBridge
import numpy as np

PORT = int(os.environ.get("PORT", 14090))
HOST = os.environ.get("HOST", os.environ.get("IP", "127.0.0.1"))
DIRECTORY = os.environ.get("DIRECTORY", os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"))
AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio")
MUSIC_DIR = AUDIO_DIR
os.makedirs(AUDIO_DIR, exist_ok=True)

def generate_synthetic_camera_frame():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:, :] = (20, 30, 25)
    cv2.putText(frame, "WALL DEERHEAD CAMERA FEED", (130, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 240, 255), 2)
    cv2.putText(frame, "STATUS: Wall-Mounted AI Vision Active", (140, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160, 255, 160), 1)
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
                    candidates = [0, 1, 2, 6, 8, 23]
                    if cur_source.isdigit():
                        candidates.insert(0, int(cur_source))
                    candidates = [idx for idx in dict.fromkeys(candidates) if os.path.exists(f"/dev/video{idx}")]

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
                        time.sleep(10.0)

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

# Wall-Mounted Animatronic Deerhead State
# L298 Motor Controller Channel 1: Mouth Motor (Energized = Jaw Open/Moving)
# L298 Motor Controller Channel 2: Bowing Motor (Energized = Deerhead Bows Forward)
deerhead_state = {
    "mouth_channel1": False,
    "bow_channel2": False,
    "auto_bow": True,
    "last_bow_time": time.time()
}

# Occasional Auto-Bowing Thread
def auto_bow_background_loop():
    while True:
        time.sleep(1.0)
        now = time.time()
        if deerhead_state["auto_bow"] and not deerhead_state["bow_channel2"]:
            # Bow occasionally every 20-35 seconds
            interval = random.randint(20, 35)
            if now - deerhead_state["last_bow_time"] > interval:
                trigger_bow_sequence(duration=1.8)

def trigger_bow_sequence(duration=1.8):
    def bow_worker():
        deerhead_state["bow_channel2"] = True
        deerhead_state["last_bow_time"] = time.time()
        time.sleep(duration)
        deerhead_state["bow_channel2"] = False

    threading.Thread(target=bow_worker, daemon=True).start()

threading.Thread(target=auto_bow_background_loop, daemon=True).start()

DEERHEAD_PRESETS = {
    "Welcome Bow": {
        "description": "Bows gracefully forward to welcome guests into the room.",
        "action": "bow"
    },
    "Singing Performance": {
        "description": "Syncs mouth to song audio while performing rhythmic head bows.",
        "action": "sing"
    },
    "Mouth Calibration Test": {
        "description": "Pulses Channel 1 mouth motor to verify lower jaw mechanical movement.",
        "action": "mouth_test"
    },
    "Idle Sentinel Mode": {
        "description": "Mounts vertically on wall, eyes active, bowing occasionally.",
        "action": "sentinel"
    }
}

class DeerheadRequestHandler(http.server.SimpleHTTPRequestHandler):
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
            self.send_header('Content-Disposition', 'attachment; filename="Animatronic_Deerhead_Wiring_Schematic.pdf"')
            self.end_headers()
            self.wfile.write(pdf_bytes)

        elif self.path.startswith("/api/status"):
            self.send_json({"status": "online", "device": "Raspberry Pi Wall-Mounted Animatronic Deerhead", "python_version": sys.version})
        elif self.path.startswith("/api/poses") or self.path.startswith("/api/presets"):
            self.send_json(DEERHEAD_PRESETS)
        elif self.path.startswith("/api/camera/frame"):
            self.serve_camera_frame()
        elif self.path.startswith("/api/deerhead/state") or self.path.startswith("/api/motor/head_neck") or self.path.startswith("/api/motor/state"):
            self.send_json(deerhead_state)
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

        if self.path in ["/api/deerhead/control", "/api/motor/head_neck", "/api/motor/l298", "/api/motor/rover", "/api/motor/wheels"]:
            if "mouth" in data or "mouth_channel1" in data:
                deerhead_state["mouth_channel1"] = data.get("mouth", data.get("mouth_channel1", False))
            if "bow" in data or "neck" in data or "neck_channel2" in data or "bow_channel2" in data:
                deerhead_state["bow_channel2"] = data.get("bow", data.get("neck", data.get("neck_channel2", data.get("bow_channel2", False))))
            if "auto_bow" in data:
                deerhead_state["auto_bow"] = bool(data["auto_bow"])

            self.send_json({"success": True, "state": deerhead_state})

        elif self.path in ["/api/deerhead/bow", "/api/bow"]:
            duration = float(data.get("duration", 1.8))
            trigger_bow_sequence(duration)
            self.send_json({"success": True, "message": f"Bowing deerhead for {duration} seconds"})

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
                if act.get("name") in ["deerhead_bow", "bow"]:
                    args = act.get("args", {})
                    trigger_bow_sequence(args.get("duration_seconds", 1.8))
                elif act.get("name") == "deerhead_mouth":
                    args = act.get("args", {})
                    state = args.get("state", "close")
                    deerhead_state["mouth_channel1"] = (state == "open" or state == "pulse")

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
                if act.get("name") in ["deerhead_bow", "bow"]:
                    args = act.get("args", {})
                    trigger_bow_sequence(args.get("duration_seconds", 1.8))

            self.send_json(result)

        elif self.path == "/api/gemini/gesture":
            frame = self.capture_camera_frame()
            if frame is None:
                self.send_json({"gesture": "None", "finger_count": 0, "action": None})
            else:
                gesture, finger_count, _ = gemini_bridge.detect_hand_gestures(frame)
                action = None
                if gesture == "5_FINGERS_BOW":
                    action = {"name": "deerhead_bow", "args": {"duration_seconds": 2.0}}
                    trigger_bow_sequence(2.0)
                elif gesture == "2_FINGERS_TALK":
                    action = {"name": "deerhead_mouth", "args": {"state": "open"}}
                    deerhead_state["mouth_channel1"] = True
                elif gesture == "1_FINGER_SING":
                    action = {"name": "deerhead_sing", "args": {}}
                    trigger_bow_sequence(1.5)

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
            self.send_header('Content-Disposition', 'attachment; filename="deerhead_animatronic_control.py"')
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
            Paragraph("🦌 WALL-MOUNTED ANIMATRONIC DEERHEAD - MASTER SCHEMATIC", title_style),
            Paragraph("Hardware Pinout Guide for Raspberry Pi 4/5, L298 Motor Driver (Mouth Ch1 & Bow Ch2) & Audio Sync", subtitle_style),
            HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0055a5'), spaceBefore=2, spaceAfter=8),
            Paragraph("⚡ Core System Hardware Overview", heading_style)
        ]

        overview_data = [
            [Paragraph("Module / Component", header_cell_style), Paragraph("Hardware Role & Signals", header_cell_style), Paragraph("Power Requirements", header_cell_style)],
            [Paragraph("<b>Raspberry Pi 4 / 5</b>", cell_style), Paragraph("Master Web Server, Gemini AI, Audio VAD Mouth Sync & Bow Controller", cell_style), Paragraph("+5V @ 3A DC (UBEC)")],
            [Paragraph("<b>L298 Driver Channel 1 (Mouth)</b>", cell_style), Paragraph("Lower Jaw Motor / Solenoid (GPIO 17 ENA, GPIO 27 IN1, GPIO 22 IN2)", cell_style), Paragraph("+12V DC Rail")],
            [Paragraph("<b>L298 Driver Channel 2 (Bow)</b>", cell_style), Paragraph("Head Bowing Pivot Motor (GPIO 4 ENB, GPIO 14 IN3, GPIO 15 IN4)", cell_style), Paragraph("+12V DC Rail")],
            [Paragraph("<b>USB / CSI Camera</b>", cell_style), Paragraph("Mounted on Deerhead nose/eyes for Gemini Computer Vision", cell_style), Paragraph("+5V DC USB Power")],
            [Paragraph("<b>USB Audio / Speaker System</b>", cell_style), Paragraph("Speaker system for TTS Speech & Singing performance playback", cell_style), Paragraph("5V - 12V DC Power")]
        ]
        t_overview = Table(overview_data, colWidths=[160, 420, 140])
        t_overview.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#003366')),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#ffffff'), colors.HexColor('#f5f8ff')])
        ]))
        story.append(t_overview)
        story.append(Spacer(1, 10))

        doc.build(story)
        return buffer.getvalue()

    def generate_hardware_script(self, data):
        script = f'''#!/usr/bin/env python3
"""
Wall-Mounted Animatronic Deerhead Master Hardware Control Script
Controls lower jaw mouth motor using L298 Channel 1 (GPIO 17, 27, 22)
and head bowing motor using L298 Channel 2 (GPIO 4, 14, 15).
"""

import time
import RPi.GPIO as GPIO

# GPIO Pin Definitions for L298 Motor Driver
# Channel 1: Lower Jaw Mouth Motor
L298_ENA = 17  # Mouth PWM
L298_IN1 = 27  # Mouth IN1
L298_IN2 = 22  # Mouth IN2

# Channel 2: Bowing Neck Motor
L298_ENB = 4   # Bow PWM
L298_IN3 = 14  # Bow IN3
L298_IN4 = 15  # Bow IN4

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

PINS = [L298_ENA, L298_IN1, L298_IN2, L298_ENB, L298_IN3, L298_IN4]
GPIO.setup(PINS, GPIO.OUT)

pwm_mouth = GPIO.PWM(L298_ENA, 1000)
pwm_bow   = GPIO.PWM(L298_ENB, 1000)

pwm_mouth.start(0)
pwm_bow.start(0)

def set_mouth_energized(active, speed=100):
    """Channel 1: Opens lower jaw when active."""
    if active:
        GPIO.output(L298_IN1, GPIO.HIGH)
        GPIO.output(L298_IN2, GPIO.LOW)
        pwm_mouth.ChangeDutyCycle(speed)
    else:
        GPIO.output(L298_IN1, GPIO.LOW)
        GPIO.output(L298_IN2, GPIO.LOW)
        pwm_mouth.ChangeDutyCycle(0)

def set_bow_energized(active, speed=90):
    """Channel 2: Bows deerhead forward when active."""
    if active:
        GPIO.output(L298_IN3, GPIO.HIGH)
        GPIO.output(L298_IN4, GPIO.LOW)
        pwm_bow.ChangeDutyCycle(speed)
    else:
        GPIO.output(L298_IN3, GPIO.LOW)
        GPIO.output(L298_IN4, GPIO.LOW)
        pwm_bow.ChangeDutyCycle(0)

def perform_bow(duration=1.8):
    print("Bowing deerhead forward...")
    set_bow_energized(True)
    time.sleep(duration)
    set_bow_energized(False)
    print("Returned upright.")

def main():
    print("Wall-Mounted Animatronic Deerhead Controller Online.")
    print("Testing Mouth (Channel 1) and Bow (Channel 2)...")
    set_mouth_energized(True)
    time.sleep(1.0)
    set_mouth_energized(False)
    time.sleep(0.5)
    perform_bow(1.8)

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
    print(f"Starting Multithreaded Animatronic Deerhead Server on http://{display_host}:{PORT} (http & https supported)")
    bind_host = "" if HOST == "0.0.0.0" else HOST
    with ThreadingReusableTCPServer((bind_host, PORT), DeerheadRequestHandler) as httpd:
        httpd.ssl_context = ssl_ctx
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

import cv2
import numpy as np
import base64
import json
import os
from google import genai
from google.genai import types

class GeminiHexapodBridge:
    def __init__(self):
        self.system_instruction = (
            "You are the friendly, intelligent AI brain of a 4WD Rover robot equipped with 2x L298 dual-channel motor controllers, camera, and microphone. "
            "Your job is to:\n"
            "1. Produce warm, friendly, concise, conversational responses and ask the user questions about what they want the rover to do.\n"
            "2. Describe what you see in front of you clearly and concisely when presented with camera images.\n"
            "3. Control the rover using function calls whenever the user asks the rover to move, drive, turn, spin, or stop.\n"
            "Always respond to all spoken voice commands naturally and keep responses concise (1-2 sentences)."
        )

    def detect_hand_gestures(self, frame):
        """
        Analyzes camera frame for hand gestures (skin color segmentation + contour convexity defects)
        Returns: (gesture_name, finger_count, annotated_frame)
        """
        try:
            resized = cv2.resize(frame, (320, 240))
            blur = cv2.GaussianBlur(resized, (5, 5), 0)
            hsv = cv2.cvtColor(blur, cv2.COLOR_BGR2HSV)

            lower_skin = np.array([0, 20, 70], dtype=np.uint8)
            upper_skin = np.array([20, 255, 255], dtype=np.uint8)
            mask = cv2.inRange(hsv, lower_skin, upper_skin)

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            mask = cv2.erode(mask, kernel, iterations=1)
            mask = cv2.dilate(mask, kernel, iterations=2)

            contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return "None", 0, frame

            max_contour = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(max_contour)

            if area < 3000:
                return "None", 0, frame

            hull = cv2.convexHull(max_contour, returnPoints=False)
            if hull is None or len(hull) < 3:
                return "None", 0, frame

            defects = cv2.convexityDefects(max_contour, hull)
            finger_count = 0

            if defects is not None:
                for i in range(defects.shape[0]):
                    s, e, f, d = defects[i, 0]
                    start = tuple(max_contour[s][0])
                    end = tuple(max_contour[e][0])
                    far = tuple(max_contour[f][0])

                    a = np.sqrt((end[0] - start[0])**2 + (end[1] - start[1])**2)
                    b = np.sqrt((far[0] - start[0])**2 + (far[1] - start[1])**2)
                    c = np.sqrt((end[0] - far[0])**2 + (end[1] - far[1])**2)

                    angle = np.arccos((b**2 + c**2 - a**2) / (2 * b * c + 1e-5))

                    if angle <= np.pi / 2 and d > 1200:
                        finger_count += 1

                finger_count += 1

            gesture = "None"
            if finger_count >= 4:
                gesture = "5_FINGERS_FORWARD"
            elif finger_count == 2 or finger_count == 3:
                gesture = "2_FINGERS_WAVE"
            elif finger_count == 1:
                gesture = "1_FINGER_ATTACK"

            return gesture, finger_count, frame
        except Exception as e:
            return "None", 0, frame

    def generate_chat_response(self, api_key, user_text="", image_bytes=None):
        if not api_key:
            return {
                "text": "Please provide a valid Google Gemini API Key in the settings tab to enable AI vision & voice features.",
                "action": None
            }

        client = genai.Client(api_key=api_key)

        tools = [
            types.Tool(function_declarations=[
                types.FunctionDeclaration(
                    name="rover_drive",
                    description="Drives the 4WD Rover in a specified direction.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "direction": types.Schema(
                                type=types.Type.STRING,
                                enum=["forward", "reverse", "spin_left", "spin_right", "turn_left", "turn_right"]
                            ),
                            "speed": types.Schema(type=types.Type.NUMBER),
                            "duration_seconds": types.Schema(type=types.Type.NUMBER)
                        },
                        required=["direction"]
                    )
                ),
                types.FunctionDeclaration(
                    name="rover_set_wheels",
                    description="Independently controls each of the 4 wheels.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "fl_dir": types.Schema(type=types.Type.STRING, enum=["forward", "reverse", "stop"]),
                            "fr_dir": types.Schema(type=types.Type.STRING, enum=["forward", "reverse", "stop"]),
                            "rl_dir": types.Schema(type=types.Type.STRING, enum=["forward", "reverse", "stop"]),
                            "rr_dir": types.Schema(type=types.Type.STRING, enum=["forward", "reverse", "stop"]),
                            "speed": types.Schema(type=types.Type.NUMBER)
                        }
                    )
                ),
                types.FunctionDeclaration(
                    name="rover_stop",
                    description="Stops all 4 wheels of the rover immediately.",
                    parameters=types.Schema(type=types.Type.OBJECT, properties={})
                )
            ])
        ]

        contents = []

        if image_bytes:
            contents.append(types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/jpeg"
            ))

        prompt_text = user_text if user_text else "Describe what you see through your camera!"
        contents.append(prompt_text)

        config = types.GenerateContentConfig(
            system_instruction=self.system_instruction,
            tools=tools,
            temperature=0.7
        )

        try:
            response = client.models.generate_content(
                model="gemini-3.8-flash",
                contents=contents,
                config=config
            )

            action = None
            text_response = response.text or ""

            if response.function_calls:
                call = response.function_calls[0]
                action = {
                    "name": call.name,
                    "args": call.args
                }
                if not text_response:
                    text_response = f"Executing command: {call.name}"

            return {
                "text": text_response,
                "action": action
            }

        except Exception as e:
            return {
                "text": f"Gemini API Error: {str(e)}",
                "action": None
            }

    def generate_voice_chat_response(self, api_key, audio_bytes=None, mime_type="audio/webm", image_bytes=None):
        if not api_key:
            return {
                "text": "Please configure your Gemini API Key in settings.",
                "action": None
            }

        client = genai.Client(api_key=api_key)

        tools = [
            types.Tool(function_declarations=[
                types.FunctionDeclaration(
                    name="rover_drive",
                    description="Drives the 4WD Rover in a specified direction.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "direction": types.Schema(
                                type=types.Type.STRING,
                                enum=["forward", "reverse", "spin_left", "spin_right", "turn_left", "turn_right"]
                            ),
                            "speed": types.Schema(type=types.Type.NUMBER),
                            "duration_seconds": types.Schema(type=types.Type.NUMBER)
                        },
                        required=["direction"]
                    )
                ),
                types.FunctionDeclaration(
                    name="rover_stop",
                    description="Stops all 4 wheels of the rover immediately.",
                    parameters=types.Schema(type=types.Type.OBJECT, properties={})
                )
            ])
        ]

        contents = []

        if image_bytes:
            contents.append(types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/jpeg"
            ))

        if audio_bytes:
            contents.append(types.Part.from_bytes(
                data=audio_bytes,
                mime_type=mime_type
            ))
            contents.append(
                "Listen to my voice recording, describe what you see in the image if relevant, answer my request concisely, and execute requested tool actions."
            )
        else:
            contents.append("What do you see?")

        config = types.GenerateContentConfig(
            system_instruction=self.system_instruction,
            tools=tools,
            temperature=0.7
        )

        try:
            response = client.models.generate_content(
                model="gemini-3.8-flash",
                contents=contents,
                config=config
            )

            action = None
            text_response = response.text or ""

            if response.function_calls:
                call = response.function_calls[0]
                action = {
                    "name": call.name,
                    "args": call.args
                }
                if not text_response:
                    text_response = f"Executing voice command: {call.name}"

            return {
                "text": text_response,
                "action": action
            }

        except Exception as e:
            return {
                "text": f"Voice AI Error: {str(e)}",
                "action": None
            }

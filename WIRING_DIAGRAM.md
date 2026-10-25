# 🦌 WALL-MOUNTED ANIMATRONIC DEERHEAD - HARDWARE WIRING DIAGRAM
## SYSTEM SCHEMATIC GUIDE & L298 / IRLZ44N MOSFET SPECIFICATIONS

This document details all physical hardware connections, Raspberry Pi GPIO pin mappings, L298 Dual H-Bridge motor driver channel configurations, 4x IRLZ44N logic-level MOSFET drivers for 12V DC Flashing Dome Lights, USB / CSI camera connections, audio output setup, and power rails for the **Wall-Mounted Animatronic Deerhead**.

---

## 📐 OVERVIEW OF SYSTEM HARDWARE ARCHITECTURE

```
+-----------------------------------------------------------------------------------+
|                                  MAIN POWER SUPPLY                                |
|  12V 5A DC Power Supply + 5V 3A UBEC Step-Down Buck Converter                     |
|  +12V DC (L298 Motor Rail & 4x Dome Lights)  +5V @ 3A DC (Raspberry Pi 4 / 5 MCU)  |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                              RASPBERRY PI 4 / 5 MCU                               |
| - 40-Pin GPIO Header                                                              |
| - USB Audio Out / Speaker System (Audio Playback & Vocal Sync)                    |
| - L298 Motor Controller GPIO Signals (Mouth & Bow Actuators)                      |
| - 4x Direct Pi GPIO PWM Lines for IRLZ44N MOSFET Dome Light Drivers               |
| - USB / CSI Camera Feed (Eye / Nose / Wall Mounted AI Vision)                     |
+-------------------+---------------------------------------+-----------------------+
                    |                                       |
                    v (GPIO Mouth & Bow Signals)            v (GPIO PWM Light Lines)
+-----------------------------------+   +-------------------------------------------+
|  L298 DUAL H-BRIDGE MOTOR DRIVER  |   | 4x IRLZ44N LOGIC-LEVEL MOSFET DRIVERS     |
| +12V Motor VCC  |  Common GND     |   | (220Ω Series Gate Resistors / 10kΩ GND)   |
+-----------------+-----------------+   +--------------------+----------------------+
        |                   |                                |
        v (Mouth Ch 1)      v (Bow Ch 2)                     v (12V DC PWM Load Lines)
+---------------+   +---------------+   +-------------------------------------------+
| CHANNEL 1:    |   | CHANNEL 2:    |   | 4x 12V DC FLASHING DOME BEACON LIGHTS     |
| MOUTH MOTOR   |   | BOW MOTOR     |   | - Dome 1 (GPIO 5 / Pin 29) Top-Left       |
| Opens lower   |   | Bows head     |   | - Dome 2 (GPIO 6 / Pin 31) Top-Right      |
| jaw on speech |   | on greetings  |   | - Dome 3 (GPIO 13 / Pin 33) Bottom-Left   |
| & singing     |   | & beat drops  |   | - Dome 4 (GPIO 19 / Pin 35) Bottom-Right  |
+---------------+   +---------------+   +-------------------------------------------+
```

---

## 🍓 1. RASPBERRY PI 40-PIN GPIO PINOUT MAP

| Header Pin # | GPIO Name | Signal Description | Connected Target Hardware | Function Description |
| :---: | :---: | :--- | :--- | :--- |
| **Pin 1** | 3.3V Power | Logic VCC (3.3V) | Logic Reference Rail | 3.3V Logic Reference |
| **Pin 2** | 5.0V Power | Logic VCC (5.0V) | L298 5V Logic In | 5.0V Logic Power Rail |
| **Pin 6** | Ground (GND) | Common Ground | L298 & MOSFET GND Bus | Shared Reference Ground Rail |
| **Pin 11** | GPIO 17 | PWM Output | L298 ENA (Channel 1) | **Mouth Motor Speed / PWM Control** |
| **Pin 13** | GPIO 27 | Digital Output | L298 IN1 (Channel 1) | **Mouth Motor Direction Signal 1** |
| **Pin 15** | GPIO 22 | Digital Output | L298 IN2 (Channel 1) | **Mouth Motor Direction Signal 2** |
| **Pin 7** | GPIO 4 | PWM Output | L298 ENB (Channel 2) | **Bowing Motor Speed / PWM Control** |
| **Pin 8** | GPIO 14 | Digital Output | L298 IN3 (Channel 2) | **Bowing Motor Direction Signal 1** |
| **Pin 10** | GPIO 15 | Digital Output | L298 IN4 (Channel 2) | **Bowing Motor Direction Signal 2** |
| **Pin 29** | GPIO 5 | PWM Output | IRLZ44N MOSFET #1 Gate | **Dome Light 1 PWM (Top-Left)** |
| **Pin 31** | GPIO 6 | PWM Output | IRLZ44N MOSFET #2 Gate | **Dome Light 2 PWM (Top-Right)** |
| **Pin 33** | GPIO 13 | PWM Output | IRLZ44N MOSFET #3 Gate | **Dome Light 3 PWM (Bottom-Left)** |
| **Pin 35** | GPIO 19 | PWM Output | IRLZ44N MOSFET #4 Gate | **Dome Light 4 PWM (Bottom-Right)** |

---

## 🚨 2. 4x IRLZ44N LOGIC-LEVEL MOSFET DOME LIGHT CIRCUIT

Each of the 4 DC Flashing Dome Lights is driven by a discrete **IRLZ44N N-Channel Logic-Level MOSFET**:
- **Gate Circuit Protection:** Connect the Pi GPIO pin through a **220Ω series resistor** directly to Gate (Pin 1 of IRLZ44N) to limit current draw on the Pi pin.
- **Boot Pull-Down Resistor:** Connect a **10kΩ pull-down resistor** between Gate (Pin 1) and Ground (GND) to prevent un-driven pin floating/flickering during Raspberry Pi bootup.
- **Load Wiring:** Connect the Negative (-) terminal of the 12V DC Dome Light to Drain (Pin 2). Connect Source (Pin 3) to Common GND. Connect the Positive (+) terminal of the Dome Light to +12V DC VCC.

| Dome Light # | BCM GPIO | Header Pin | Series Gate Resistors | Pull-Down | Target DC Light Controlled |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Dome Light 1** | GPIO 5 | Pin 29 | 220Ω | 10kΩ to GND | Top-Left 12V DC Flashing Dome Beacon |
| **Dome Light 2** | GPIO 6 | Pin 31 | 220Ω | 10kΩ to GND | Top-Right 12V DC Flashing Dome Beacon |
| **Dome Light 3** | GPIO 13 | Pin 33 | 220Ω | 10kΩ to GND | Bottom-Left 12V DC Flashing Dome Beacon |
| **Dome Light 4** | GPIO 19 | Pin 35 | 220Ω | 10kΩ to GND | Bottom-Right 12V DC Flashing Dome Beacon |

---

## ⚙️ 3. L298 DUAL H-BRIDGE MOTOR DRIVER FUNCTION MAPPING

- **CHANNEL 1 (Mouth Actuator):**
  - **Inputs:** `GPIO 17` (ENA - PWM), `GPIO 27` (IN1), `GPIO 22` (IN2)
  - **Outputs:** OUT1 & OUT2 connected to Deerhead Mouth DC Motor / Solenoid / Actuator mechanism.
  - **Operation:** Energized opens mouth / jaw in real-time sync with AI speech or song audio; unenergized closes mouth softly.

- **CHANNEL 2 (Bowing Mechanism):**
  - **Inputs:** `GPIO 4` (ENB - PWM), `GPIO 14` (IN3), `GPIO 15` (IN4)
  - **Outputs:** OUT3 & OUT4 connected to Neck/Wall Bowing DC Motor / Actuator mechanism.
  - **Operation:** Energized bows deerhead forward / downwards on wall mount; unenergized returns head upright.

---

## 📦 4. BILL OF MATERIALS (PARTS LIST)

1. **Raspberry Pi 4 or 5 MCU** (4GB or 8GB RAM) - Master AI brain & web server.
2. **Wall-Mounted Deerhead Shell & Plaque Assembly** - Decorative wall plaque, skull frame, 3D antlers, hinged mouth jaw, and neck pivot joint.
3. **L298N Dual H-Bridge Motor Driver Module** - Driving Channel 1 (Mouth) and Channel 2 (Bow).
4. **4x IRLZ44N N-Channel Logic-Level MOSFETs (TO-220 Package)** - Driving 4x 12V DC Flashing Dome Beacon Lights.
5. **4x 220Ω Series Gate Resistors & 4x 10kΩ Pull-Down Resistors**.
6. **4x 12V DC Flashing Beacon Dome Lights** - Mounted at top-left, top-right, bottom-left, and bottom-right of trophy plaque.
7. **USB / CSI Camera Lens Module** (Mounted on nose/eyes for AI computer vision).
8. **USB Audio Speaker System / 3.5mm AUX Audio Amplifier** - High clarity audio output for singing & voice responses.
9. **Power Supply Rail** - 12V 5A DC Power Supply + 5V 3A UBEC Regulator for Raspberry Pi.

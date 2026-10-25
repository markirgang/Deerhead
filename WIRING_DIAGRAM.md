# 🦌 WALL-MOUNTED ANIMATRONIC DEERHEAD - HARDWARE WIRING DIAGRAM
## SYSTEM SCHEMATIC GUIDE & L298 MOTOR CONTROLLER SPECIFICATIONS

This document details all physical hardware connections, Raspberry Pi GPIO pin mappings, L298 Dual H-Bridge motor driver channel configurations, USB / CSI camera connections, audio output setup, and power rails for the **Wall-Mounted Animatronic Deerhead**.

---

## 📐 OVERVIEW OF SYSTEM HARDWARE ARCHITECTURE

```
+-----------------------------------------------------------------------------------+
|                                  MAIN POWER SUPPLY                                |
|  12V DC / 7.4V LiPo Power Supply + 5V 3A UBEC Step-Down Buck Converter            |
|  +12V DC (L298 Motor Driver Rail)  +5V @ 3A DC (Raspberry Pi 4 / 5 MCU)          |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                              RASPBERRY PI 4 / 5 MCU                               |
| - 40-Pin GPIO Header                                                              |
| - USB Audio Out / Speaker System (Audio Playback & Vocal Sync)                    |
| - L298 Motor Controller GPIO Signals (Mouth & Bow Actuators)                       |
| - USB / CSI Camera Feed (Eye / Nose / Wall Mounted AI Vision)                      |
+------------------------------------------+----------------------------------------+
                                           |
                                           v (GPIO Direction & PWM Signals)
+-----------------------------------------------------------------------------------+
|                        L298 DUAL H-BRIDGE MOTOR DRIVER                            |
| +12V Motor VCC Rail  |  Logic GND  |  5V Logic Ref                                 |
+------------------------------------------+----------------------------------------+
              |                                        |
              v (Channel 1 OUT1/OUT2)                  v (Channel 2 OUT3/OUT4)
+------------------------------------+   +------------------------------------------+
|      CHANNEL 1: MOUTH MOTOR        |   |         CHANNEL 2: BOW MOTOR             |
| - Opens lower jaw when energized   |   | - Bows deerhead forward when energized   |
| - Closes lower jaw when inactive   |   | - Returns upright when inactive          |
| - Real-time sync with AI Speech    |   | - Occasional nodding/bowing movement     |
+------------------------------------+   +------------------------------------------+
```

---

## 🍓 1. RASPBERRY PI 40-PIN GPIO PINOUT MAP

| Header Pin # | GPIO Name | Signal Description | L298 Driver Connection | Function Description |
| :---: | :---: | :--- | :--- | :--- |
| **Pin 1** | 3.3V Power | Logic VCC (3.3V) | Sensors / Logic | 3.3V Logic Reference |
| **Pin 2** | 5.0V Power | Logic VCC (5.0V) | L298 5V Logic In | 5.0V Logic Power Rail |
| **Pin 6** | Ground (GND) | Common Ground | L298 Common GND Bus | Shared Reference Ground |
| **Pin 11** | GPIO 17 | PWM Output | L298 ENA (Channel 1) | **Mouth Motor Speed / PWM Control** |
| **Pin 13** | GPIO 27 | Digital Output | L298 IN1 (Channel 1) | **Mouth Motor Direction Signal 1** |
| **Pin 15** | GPIO 22 | Digital Output | L298 IN2 (Channel 1) | **Mouth Motor Direction Signal 2** |
| **Pin 7** | GPIO 4 | PWM Output | L298 ENB (Channel 2) | **Bowing Motor Speed / PWM Control** |
| **Pin 8** | GPIO 14 | Digital Output | L298 IN3 (Channel 2) | **Bowing Motor Direction Signal 1** |
| **Pin 10** | GPIO 15 | Digital Output | L298 IN4 (Channel 2) | **Bowing Motor Direction Signal 2** |

---

## ⚙️ 2. L298 DUAL H-BRIDGE MOTOR DRIVER FUNCTION MAPPING

- **CHANNEL 1 (Mouth Actuator):**
  - **Inputs:** `GPIO 17` (ENA - PWM), `GPIO 27` (IN1), `GPIO 22` (IN2)
  - **Outputs:** OUT1 & OUT2 connected to Deerhead Mouth DC Motor / Solenoid / Actuator mechanism.
  - **Operation:**
    - Energized: Opens mouth / jaw in real-time sync with AI speech or song audio.
    - Unenergized: Jaw spring closes mouth softly.

- **CHANNEL 2 (Bowing Mechanism):**
  - **Inputs:** `GPIO 4` (ENB - PWM), `GPIO 14` (IN3), `GPIO 15` (IN4)
  - **Outputs:** OUT3 & OUT4 connected to Neck/Wall Bowing DC Motor / Actuator mechanism.
  - **Operation:**
    - Energized: Bows deerhead forward / downwards on the wall mount.
    - Unenergized: Returns head to upright vertical wall mount orientation.

---

## 📦 3. BILL OF MATERIALS (PARTS LIST)

1. **Raspberry Pi 4 or 5 MCU** (4GB or 8GB RAM) - Master AI brain & web server.
2. **Wall-Mounted Deerhead Shell & Plaque Assembly** - Decorative wall plaque, skull frame, 3D antlers, hinged mouth jaw, and neck pivot joint.
3. **L298N Dual H-Bridge Motor Driver Module** - Driving Channel 1 (Mouth) and Channel 2 (Bow).
4. **Mouth DC Motor / Actuator Mechanism** (Connected to L298 Channel 1).
5. **Neck Bowing DC Motor / Actuator Mechanism** (Connected to L298 Channel 2).
6. **USB / CSI Camera Lens Module** (Mounted on nose/eyes for AI computer vision).
7. **USB Audio Speaker System / 3.5mm AUX Audio Amplifier** - High clarity audio output for singing & voice responses.
8. **Power Supply Rail** - 12V 3A DC Power Supply + 5V 3A UBEC Regulator for Raspberry Pi.

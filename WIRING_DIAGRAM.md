# 🤖 4WD ROVER WITH ANIMATRONIC HEAD - HARDWARE WIRING DIAGRAM
## SYSTEM SCHEMATIC GUIDE & PCA9685 / L298N / MOSFET SPECIFICATIONS

This document details all physical hardware connections, Raspberry Pi GPIO pin mappings, 3x L298N motor drivers (driving 4 wheel motors across 4 independent L298 channels + head/neck motors), 4x HC-SR04 ultrasonic sonar sensors, PCA9685 12-bit PWM servo driver (reserved strictly for SERVOS ONLY), and direct Pi GPIO-driven IRLZ44N N-Channel Logic-Level MOSFET power transistors (with 220Ω series gate resistors and 10kΩ pull-down resistors) for 12V DC headlights, underglow LEDs, and tail lights.

---

## 📐 OVERVIEW OF SYSTEM HARDWARE ARCHITECTURE

```
+-----------------------------------------------------------------------------------+
|                                  MAIN POWER SUPPLY                                |
|  7.4V / 11.1V LiPo Battery + 5V 10A UBEC Buck Converter                           |
|  +12V DC (IRLZ44N MOSFET Headlights & Underglow LEDs)  +5V @ 3A DC (Raspberry Pi)|
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                              RASPBERRY PI 4 / 5 MCU                               |
| - 40-Pin GPIO Header                                                              |
| - I2C Bus (SDA: GPIO 2, SCL: GPIO 3) -> PCA9685 Servo Controller (SERVOS ONLY)    |
| - 3x L298N Motor Drivers: 4 Wheel Motors on 4 Channels + Head Mouth & Neck Motors|
| - 3x IRLZ44N MOSFETs: GPIO 5 (Headlights), 6 (Underglow), 11 (Brake Lights)      |
| - 4x HC-SR04 Sonar Sensors: Front, Rear, Left, and Right Distance Measurement    |
+-----+----------------------+---------------------+--------------------------------+
      | (I2C Bus)            | (L298 Channels)     | (Direct Pi GPIO MOSFET Lights)
      v                      v                     v
+-----+--------------+  +----+---------------+  +--+--------------------------------+
| PCA9685 16-CHANNEL |  | 3x L298N DUAL      |  | 3x IRLZ44N LOGIC-LEVEL MOSFETS    |
| 12-BIT PWM DRIVER  |  | H-BRIDGE DRIVERS   |  | (220Ω Gate Resistor / 10kΩ GND)   |
| (SERVOS ONLY)      |  | (4 Wheel Channels) |  | (Headlights, Underglow, Brake)   |
+-----+--------------+  +----+---------------+  +-----------------------------------+
      |                      |                     |
      v (5V Servos)          v (Wheel/Head Motors) v (12V DC Lights)
+-----+----------------------+---------------------+--------------------------------+
|                       4WD ROVER ACTUATORS & LIGHTS                                |
| - 4 Independent Wheel Drive Motors on 4 L298 Channels:                            |
|   * L298 #1 Ch 1 (Front-Left), L298 #1 Ch 2 (Front-Right)                         |
|   * L298 #2 Ch 1 (Rear-Left),  L298 #2 Ch 2 (Rear-Right)                          |
| - Black Animatronic Head Motors: Mouth DC (L298 #3 Ch 1), Neck DC (L298 #3 Ch 2) |
| - PCA9685 Servos ONLY: Ch 0 (Camera Pan Servo) & Ch 1 (Camera Tilt Servo)         |
| - IRLZ44N Logic-Level MOSFET 12V DC Rover Lights (220Ω Gate Resistor / 10kΩ GND): |
|   * GPIO 5 (Pin 29) -> 220Ω -> Gate IRLZ44N #1 -> 12V High-Power Headlights (-)    |
|   * GPIO 6 (Pin 31) -> 220Ω -> Gate IRLZ44N #2 -> 12V Underglow RGB LED Strips (-) |
|   * GPIO 11 (Pin 23) -> 220Ω -> Gate IRLZ44N #3 -> 12V Rear Tail / Brake Lights (-)|
+-----------------------------------------------------------------------------------+
```

---

## 🍓 1. RASPBERRY PI 40-PIN GPIO PINOUT MAP

| Header Pin # | GPIO Name | Signal Description | Target Module Connected | Function Description |
| :---: | :---: | :--- | :--- | :--- |
| **Pin 1** | 3.3V Power | Logic VCC (3.3V) | Sensors / PCA9685 Logic | 3.3V Logic Reference |
| **Pin 2** | 5V Power | Logic VCC (5V) | PCA9685 VCC & Servos | 5V Logic VCC Rail |
| **Pin 3** | GPIO 2 (SDA1) | I2C Serial Data | PCA9685 SDA Terminal | I2C Data for PCA9685 Servo Controller |
| **Pin 5** | GPIO 3 (SCL1) | I2C Serial Clock | PCA9685 SCL Terminal | I2C Clock for PCA9685 Servo Controller |
| **Pin 6** | Ground (GND) | Common Ground | Common GND Bus | Shared Reference Ground |
| **Pin 12** | GPIO 18 (PWM) | PWM Output | L298N #1 ENA (FL Wheel) | Front-Left Wheel Motor Speed PWM |
| **Pin 16** | GPIO 23 | Digital Output | L298N #1 IN1 (FL Wheel) | Front-Left Wheel Motor Direction 1 |
| **Pin 18** | GPIO 24 | Digital Output | L298N #1 IN2 (FL Wheel) | Front-Left Wheel Motor Direction 2 |
| **Pin 35** | GPIO 19 (PWM) | PWM Output | L298N #1 ENB (FR Wheel) | Front-Right Wheel Motor Speed PWM |
| **Pin 22** | GPIO 25 | Digital Output | L298N #1 IN3 (FR Wheel) | Front-Right Wheel Motor Direction 1 |
| **Pin 24** | GPIO 8 | Digital Output | L298N #1 IN4 (FR Wheel) | Front-Right Wheel Motor Direction 2 |
| **Pin 32** | GPIO 12 (PWM) | PWM Output | L298N #2 ENA (RL Wheel) | Rear-Left Wheel Motor Speed PWM |
| **Pin 36** | GPIO 16 | Digital Output | L298N #2 IN1 (RL Wheel) | Rear-Left Wheel Motor Direction 1 |
| **Pin 38** | GPIO 20 | Digital Output | L298N #2 IN2 (RL Wheel) | Rear-Left Wheel Motor Direction 2 |
| **Pin 33** | GPIO 13 (PWM) | PWM Output | L298N #2 ENB (RR Wheel) | Rear-Right Wheel Motor Speed PWM |
| **Pin 40** | GPIO 21 | Digital Output | L298N #2 IN3 (RR Wheel) | Rear-Right Wheel Motor Direction 1 |
| **Pin 37** | GPIO 26 | Digital Output | L298N #2 IN4 (RR Wheel) | Rear-Right Wheel Motor Direction 2 |
| **Pin 11** | GPIO 17 | PWM Output | L298N #3 ENA (Head Mouth) | Head Mouth Motor Speed PWM |
| **Pin 13** | GPIO 27 | Digital Output | L298N #3 IN1 (Head Mouth) | Head Mouth Motor Direction 1 |
| **Pin 15** | GPIO 22 | Digital Output | L298N #3 IN2 (Head Mouth) | Head Mouth Motor Direction 2 |
| **Pin 7** | GPIO 4 | PWM Output | L298N #3 ENB (Neck Motor) | Pulsating Neck Motor Speed PWM |
| **Pin 8** | GPIO 14 | Digital Output | L298N #3 IN3 (Neck Motor) | Neck Motor Direction 1 |
| **Pin 10** | GPIO 15 | Digital Output | L298N #3 IN4 (Neck Motor) | Neck Motor Direction 2 |
| **Pin 29** | GPIO 5 | PWM Output | IRLZ44N MOSFET #1 (Headlights) | **220Ω Series Gate Resistor & 10kΩ Pull-Down to GND** -> 12V Headlights (-) |
| **Pin 31** | GPIO 6 | PWM Output | IRLZ44N MOSFET #2 (Underglow) | **220Ω Series Gate Resistor & 10kΩ Pull-Down to GND** -> 12V RGB LEDs (-) |
| **Pin 23** | GPIO 11 | PWM Output | IRLZ44N MOSFET #3 (Brake Lights) | **220Ω Series Gate Resistor & 10kΩ Pull-Down to GND** -> 12V Brake Lights (-) |

---

## 🎛️ 2. PCA9685 16-CHANNEL PWM SERVO DRIVER (SERVOS ONLY)

| Channel # | Connected Hardware Output | Function Description | Signal Range & Voltage |
| :---: | :--- | :--- | :---: |
| **Ch 0** | Camera Gimbal Pan Servo | Camera Horizontal Pan Servo | 500μs - 2500μs (5V) |
| **Ch 1** | Camera Gimbal Tilt Servo | Camera Vertical Tilt Servo | 500μs - 2500μs (5V) |

*(PCA9685 channels are reserved 100% for SERVOS ONLY; zero lights are connected to PCA9685).*

---

## ⚙️ 3. 3x L298N DUAL H-BRIDGE MOTOR DRIVER CANNELS (4 WHEELS + HEAD)

- **L298N Driver #1 (Front Wheels):**
  - **Channel 1 (Front-Left Wheel Motor):** `GPIO 18` ENA, `GPIO 23` IN1, `GPIO 24` IN2.
  - **Channel 2 (Front-Right Wheel Motor):** `GPIO 19` ENB, `GPIO 25` IN3, `GPIO 8` IN4.

- **L298N Driver #2 (Rear Wheels):**
  - **Channel 1 (Rear-Left Wheel Motor):** `GPIO 12` ENA, `GPIO 16` IN1, `GPIO 20` IN2.
  - **Channel 2 (Rear-Right Wheel Motor):** `GPIO 13` ENB, `GPIO 21` IN3, `GPIO 26` IN4.

- **L298N Driver #3 (Animatronic Head & Neck):**
  - **Channel 1 (Mouth Motor):** `GPIO 17` ENA, `GPIO 27` IN1, `GPIO 22` IN2.
  - **Channel 2 (Neck Motor):** `GPIO 4` ENB, `GPIO 14` IN3, `GPIO 15` IN4.

---

## ⚡ 4. IRLZ44N MOSFET LIGHTING CIRCUIT SCHEMATIC (DIRECT PI GPIOs)

```
             Raspberry Pi GPIO Pin (GPIO 5 / GPIO 6 / GPIO 11)
                                |
                                |
                             [220Ω Series Gate Resistor]
                                |
                                +-------------------+
                                |                   |
                          (Gate - Pin 1)     [10kΩ Pull-Down]
                          IRLZ44N MOSFET           |
                         +--------------+           |
                         |  G    D    S |           |
                         +--|----|----|-+           |
                            |    |    +-------------+----> Raspberry Pi GND &
                            |    |                         12V Power Supply (-) GND
                            |    |
                            |    +-----------------------> 12V DC Light (-) Negative Wire
                            |
                     12V Light (+) Positive Wire --------> +12V DC Power Supply (+) Rail
```

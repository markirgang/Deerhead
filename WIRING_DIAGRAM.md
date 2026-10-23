# 🤖 4WD ROVER WITH ANIMATRONIC HEAD - HARDWARE WIRING DIAGRAM
## SYSTEM SCHEMATIC GUIDE & IRLZ44N MOSFET LIGHTING SPECIFICATIONS

This document details all physical hardware connections, Raspberry Pi GPIO pin mappings, 3x L298N motor drivers, 4x HC-SR04 ultrasonic sonar sensors, and PCA9685 12-bit PWM channel assignments driving IRLZ44N N-Channel Logic-Level MOSFET power transistors (with 220Ω series gate resistors and 10kΩ pull-down resistors) for 12V DC headlights, underglow LEDs, and tail lights.

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
| - I2C Bus (SDA: GPIO 2, SCL: GPIO 3) -> PCA9685 PWM Servo & MOSFET Controller    |
| - 3x L298N Motor Drivers: Front Wheels, Rear Wheels, Head Mouth & Neck Motors    |
| - 4x HC-SR04 Sonar Sensors: Front, Rear, Left, and Right Distance Measurement    |
+-----+----------------------+---------------------+--------------------------------+
      | (I2C Bus)            | (PWM & GPIO)        | (Sonar Triggers)
      v                      v                     v
+-----+--------------+  +----+---------------+  +--+--------------------------------+
| PCA9685 16-CHANNEL |  | 3x L298N DUAL      |  | 4x HC-SR04 ULTRASONIC             |
| 12-BIT PWM DRIVER  |  | H-BRIDGE DRIVERS   |  | SONAR DISTANCE SENSORS            |
| (I2C Addr: 0x40)   |  | (#1, #2, #3)       |  | (Front, Rear, Left, Right)        |
+-----+--------------+  +----+---------------+  +-----------------------------------+
      |                      |
      v (PCA9685 PWM to IRLZ44N MOSFETs: 3.3V Gate / 12V Power)
+-----+----------------------+------------------------------------------------------+
|                       4WD ROVER ACTUATORS & DC LIGHTS                             |
| - 4WD Wheel Drive Motors: Front-Left, Front-Right, Rear-Left, Rear-Right          |
| - Black Animatronic Head: Mouth DC Motor (L298 #3 Ch 1) & Neck Motor (L298 #3 Ch 2) |
| - 2-DOF Pan/Tilt Camera Gimbal: PCA Ch 0 (Pan Servo) & PCA Ch 1 (Tilt Servo)      |
| - IRLZ44N Logic-Level MOSFET 12V DC Rover Lights (220Ω Gate Resistor / 10kΩ GND): |
|   * PCA Ch 2 -> 220Ω -> Gate IRLZ44N #1 -> 12V High-Power Front Headlights (-)    |
|   * PCA Ch 3 -> 220Ω -> Gate IRLZ44N #2 -> 12V Underglow RGB LED Strips (-)      |
|   * PCA Ch 4 -> 220Ω -> Gate IRLZ44N #3 -> 12V Rear Tail / Brake Lights (-)        |
+-----------------------------------------------------------------------------------+
```

---

## 🍓 1. RASPBERRY PI 40-PIN GPIO PINOUT MAP

| Header Pin # | GPIO Name | Signal Description | Target Module Connected | Function Description |
| :---: | :---: | :--- | :--- | :--- |
| **Pin 1** | 3.3V Power | Logic VCC (3.3V) | Sensors / Logic | 3.3V Logic Reference |
| **Pin 2** | 5V Power | Logic VCC (5V) | PCA9685 VCC & Servos | 5V Logic VCC Rail |
| **Pin 3** | GPIO 2 (SDA1) | I2C Serial Data | PCA9685 SDA Terminal | I2C Data for PCA9685 PWM Controller |
| **Pin 5** | GPIO 3 (SCL1) | I2C Serial Clock | PCA9685 SCL Terminal | I2C Clock for PCA9685 PWM Controller |
| **Pin 6** | Ground (GND) | Common Ground | Common GND Bus | Shared Reference Ground |
| **Pin 12** | GPIO 18 (PWM) | PWM Output | L298N #1 ENA (FL Wheel) | Front-Left Wheel Speed PWM |
| **Pin 16** | GPIO 23 | Digital Output | L298N #1 IN1 (FL Wheel) | Front-Left Wheel Direction 1 |
| **Pin 18** | GPIO 24 | Digital Output | L298N #1 IN2 (FL Wheel) | Front-Left Wheel Direction 2 |
| **Pin 35** | GPIO 19 (PWM) | PWM Output | L298N #1 ENB (FR Wheel) | Front-Right Wheel Speed PWM |
| **Pin 22** | GPIO 25 | Digital Output | L298N #1 IN3 (FR Wheel) | Front-Right Wheel Direction 1 |
| **Pin 24** | GPIO 8 | Digital Output | L298N #1 IN4 (FR Wheel) | Front-Right Wheel Direction 2 |
| **Pin 32** | GPIO 12 (PWM) | PWM Output | L298N #2 ENA (RL Wheel) | Rear-Left Wheel Speed PWM |
| **Pin 36** | GPIO 16 | Digital Output | L298N #2 IN1 (RL Wheel) | Rear-Left Wheel Direction 1 |
| **Pin 38** | GPIO 20 | Digital Output | L298N #2 IN2 (RL Wheel) | Rear-Left Wheel Direction 2 |
| **Pin 33** | GPIO 13 (PWM) | PWM Output | L298N #2 ENB (RR Wheel) | Rear-Right Wheel Speed PWM |
| **Pin 40** | GPIO 21 | Digital Output | L298N #2 IN3 (RR Wheel) | Rear-Right Wheel Direction 1 |
| **Pin 37** | GPIO 26 | Digital Output | L298N #2 IN4 (RR Wheel) | Rear-Right Wheel Direction 2 |
| **Pin 11** | GPIO 17 | PWM Output | L298N #3 ENA (Head Mouth) | Head Mouth Motor Speed PWM |
| **Pin 13** | GPIO 27 | Digital Output | L298N #3 IN1 (Head Mouth) | Head Mouth Motor Direction 1 |
| **Pin 15** | GPIO 22 | Digital Output | L298N #3 IN2 (Head Mouth) | Head Mouth Motor Direction 2 |
| **Pin 7** | GPIO 4 | PWM Output | L298N #3 ENB (Pulsating Neck)| Pulsating Neck Motor Speed PWM |
| **Pin 8** | GPIO 14 | Digital Output | L298N #3 IN3 (Neck Motor) | Neck Motor Direction 1 |
| **Pin 10** | GPIO 15 | Digital Output | L298N #3 IN4 (Neck Motor) | Neck Motor Direction 2 |

---

## 🎛️ 2. PCA9685 16-CHANNEL PWM SERVO & MOSFET LIGHTING DRIVER (I2C Addr: 0x40)

| Channel # | Connected Hardware Output | Function Description | Signal Range & Voltage |
| :---: | :--- | :--- | :---: |
| **Ch 0** | Camera Gimbal Pan Servo | Camera Horizontal Pan Servo | 500μs - 2500μs (5V) |
| **Ch 1** | Camera Gimbal Tilt Servo | Camera Vertical Tilt Servo | 500μs - 2500μs (5V) |
| **Ch 2** | Front Headlights MOSFET | **220Ω Gate Resistor (10kΩ GND) -> IRLZ44N -> 12V Headlights (-)** | 0% - 100% PWM (12V) |
| **Ch 3** | Underglow RGB LEDs MOSFET | **220Ω Gate Resistor (10kΩ GND) -> IRLZ44N -> 12V RGB LEDs (-)** | 0% - 100% PWM (12V) |
| **Ch 4** | Rear Brake Lights MOSFET | **220Ω Gate Resistor (10kΩ GND) -> IRLZ44N -> 12V Brake Lights (-)** | 0% - 100% PWM (12V) |

---

## ⚡ 3. IRLZ44N MOSFET LIGHTING CIRCUIT SCHEMATIC (GEMINI AI SPECIFICATION)

```
             PCA9685 PWM Output Channel Pin (PCA Ch 2 / Ch 3 / Ch 4)
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

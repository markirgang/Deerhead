/**
 * 4WD Rover 3D Renderer (Three.js WebGL Engine)
 * Builds procedural 3D model of a 4WD Rover with a Black Robotic Head (Moving Mouth),
 * Pulsing Neck (controlled by L298 Motor Controller), 4 independent animated wheels,
 * and 4x HC-SR04 Ultrasonic Distance Sensors.
 */

class Hexapod3DRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = new THREE.Scene();

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.container.clientWidth / (this.container.clientHeight || 1),
            1,
            5000
        );
        this.camera.position.set(320, 260, 380);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight || 300);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1;
        this.controls.target.set(0, 50, 0);

        // Hardware State Flags
        this.wheelStates = {
            fl: { dir: "stop", speed: 100 },
            fr: { dir: "stop", speed: 100 },
            rl: { dir: "stop", speed: 100 },
            rr: { dir: "stop", speed: 100 }
        };

        this.wheelRotations = { fl: 0, fr: 0, rl: 0, rr: 0 };
        this.sensorDistances = { front: 45, rear: 120, left: 80, right: 65 };

        // Head & Neck L298 Motor States
        this.mouthEnergized = false; // L298 Channel 1 (DC Motor: Moving Mouth)
        this.neckPulsating = false;  // L298 Channel 2 (DC Motor: Pulsating Neck)

        // Setup Lighting & Environment
        this.setupEnvironment();

        // Build 4WD Rover 3D Object Hierarchy
        this.buildRobot();

        // Window resize event listener
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupEnvironment() {
        this.scene.background = new THREE.Color(0x0b0e14);
        this.scene.fog = new THREE.FogExp2(0x0b0e14, 0.0008);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(300, 500, 250);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 100;
        dirLight.shadow.camera.far = 1500;
        this.scene.add(dirLight);

        const pointLight = new THREE.PointLight(0x00f0ff, 1.5, 600);
        pointLight.position.set(0, 150, 0);
        this.scene.add(pointLight);

        const grid = new THREE.GridHelper(1600, 32, 0x00f0ff, 0x1e293b);
        grid.position.y = 0;
        this.scene.add(grid);

        const planeGeo = new THREE.PlaneGeometry(2000, 2000);
        const planeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
        const ground = new THREE.Mesh(planeGeo, planeMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    buildRobot() {
        this.robotGroup = new THREE.Group();
        this.robotGroup.position.y = 48; // Elevate above ground for wheels
        this.scene.add(this.robotGroup);

        // 1. Chassis Main Body Box
        const bodyGeo = new THREE.BoxGeometry(130, 32, 190);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
        this.chassisMesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.chassisMesh.castShadow = true;
        this.chassisMesh.receiveShadow = true;
        this.robotGroup.add(this.chassisMesh);

        // Top Carbon Deck Plate
        const topPlateGeo = new THREE.BoxGeometry(124, 4, 184);
        const topPlateMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 });
        const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat);
        topPlate.position.y = 18;
        this.chassisMesh.add(topPlate);

        // Center Cyber Light Ring
        const ringGeo = new THREE.RingGeometry(24, 32, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 20.5;
        this.chassisMesh.add(ring);

        // 2. Dual L298 Motor Controller Modules mounted on top deck
        this.buildL298Modules();

        // 3. Black Robotic Head with Moving Mouth & Pulsing Neck (Driven by L298 Driver)
        this.buildBlackRoboticHeadAndNeck();

        // 4. 4x HC-SR04 Ultrasonic Sensors (Front, Rear, Left, Right)
        this.buildUltrasonicSensors();

        // 5. Build 4 Independent Wheels (FL, FR, RL, RR)
        this.buildWheels();
    }

    buildL298Modules() {
        const positions = [
            { x: -35, z: -30, label: "L298 #1 (Front Wheels)" },
            { x: -35, z: 30, label: "L298 #2 (Rear Wheels)" },
            { x: 35, z: -30, label: "L298 #3 (Head & Neck)" }
        ];

        positions.forEach(p => {
            const l298Group = new THREE.Group();
            l298Group.position.set(p.x, 23, p.z);
            this.chassisMesh.add(l298Group);

            // Red/Amber PCB
            const pcbGeo = new THREE.BoxGeometry(32, 4, 32);
            const pcbMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 });
            const pcb = new THREE.Mesh(pcbGeo, pcbMat);
            l298Group.add(pcb);

            // Black Aluminium Heatsink Fins
            const sinkGeo = new THREE.BoxGeometry(18, 14, 18);
            const sinkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
            const sink = new THREE.Mesh(sinkGeo, sinkMat);
            sink.position.set(0, 9, 0);
            l298Group.add(sink);

            // Green Screw Terminals
            const termGeo = new THREE.BoxGeometry(26, 6, 6);
            const termMat = new THREE.MeshStandardMaterial({ color: 0x16a34a });
            const term = new THREE.Mesh(termGeo, termMat);
            term.position.set(0, 5, 12);
            l298Group.add(term);
        });
    }

    buildBlackRoboticHeadAndNeck() {
        // Mounted on top center of chassis deck
        this.headAndNeckGroup = new THREE.Group();
        this.headAndNeckGroup.position.set(0, 20, 20);
        this.chassisMesh.add(this.headAndNeckGroup);

        // 1. Pulsing Neck (Controlled by L298 Channel 2)
        this.neckGroup = new THREE.Group();
        this.headAndNeckGroup.add(this.neckGroup);

        const neckMat = new THREE.MeshStandardMaterial({
            color: 0x8b5cf6, // Purple/Violet Metallic Accent
            metalness: 0.8,
            roughness: 0.2
        });

        this.neckRings = [];
        for (let r = 0; r < 4; r++) {
            const ringGeo = new THREE.TorusGeometry(16 - r * 1.2, 3.5, 12, 24);
            const ringMesh = new THREE.Mesh(ringGeo, neckMat);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.position.y = r * 12 + 6;
            this.neckGroup.add(ringMesh);
            this.neckRings.push(ringMesh);
        }

        // 2. Black Robotic Head Assembly (Mounted on top of Pulsing Neck)
        this.headBase = new THREE.Group();
        this.headBase.position.y = 52;
        this.headAndNeckGroup.add(this.headBase);

        // Upper Skull - Matte Black Metallic Armor
        const skullGeo = new THREE.BoxGeometry(42, 26, 38);
        const blackHeadMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.9, roughness: 0.2 });
        const skullMesh = new THREE.Mesh(skullGeo, blackHeadMat);
        skullMesh.position.set(0, 10, 10);
        this.headBase.add(skullMesh);

        // Visor Plate
        const visorGeo = new THREE.BoxGeometry(38, 10, 4);
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.95, roughness: 0.1 });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 12, 29);
        this.headBase.add(visor);

        // Cyan Glowing Cyber Eyes
        const eyeGeo = new THREE.SphereGeometry(4, 12, 12);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-11, 12, 30);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(11, 12, 30);
        this.headBase.add(leftEye);
        this.headBase.add(rightEye);

        // Camera Lens on Forehead
        const lensGeo = new THREE.CylinderGeometry(5, 5, 8, 16);
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9 });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 19, 28);
        this.headBase.add(lens);

        // 3. Articulated Lower Jaw / Moving Mouth (Controlled by L298 Channel 1)
        this.lowerJawGroup = new THREE.Group();
        this.lowerJawGroup.position.set(0, -2, 10); // Pivot hinge
        this.headBase.add(this.lowerJawGroup);

        const lowerJawGeo = new THREE.BoxGeometry(38, 10, 32);
        lowerJawGeo.translate(0, -5, 14); // Offset for hinge pivot
        const lowerJawMesh = new THREE.Mesh(lowerJawGeo, blackHeadMat);
        this.lowerJawGroup.add(lowerJawMesh);

        // Chrome Teeth Inside Mouth
        const teethMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.9 });
        for (let t = -12; t <= 12; t += 6) {
            const toothGeo = new THREE.ConeGeometry(2, 5, 4);
            const tooth = new THREE.Mesh(toothGeo, teethMat);
            tooth.position.set(t, 0, 26);
            tooth.rotation.x = Math.PI;
            this.lowerJawGroup.add(tooth);
        }
    }

    buildUltrasonicSensors() {
        this.sensorCones = {};

        const sensorPositions = [
            { id: 'front', pos: [0, 10, 98], rotY: 0 },
            { id: 'rear', pos: [0, 10, -98], rotY: Math.PI },
            { id: 'left', pos: [-68, 10, 0], rotY: -Math.PI / 2 },
            { id: 'right', pos: [68, 10, 0], rotY: Math.PI / 2 }
        ];

        sensorPositions.forEach(cfg => {
            const sensorGroup = new THREE.Group();
            sensorGroup.position.set(...cfg.pos);
            sensorGroup.rotation.y = cfg.rotY;
            this.chassisMesh.add(sensorGroup);

            // Blue PCB Board
            const pcbGeo = new THREE.BoxGeometry(40, 18, 5);
            const pcbMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3 });
            const pcb = new THREE.Mesh(pcbGeo, pcbMat);
            sensorGroup.add(pcb);

            // Dual Transducer Barrels
            const barrelGeo = new THREE.CylinderGeometry(6, 6, 10, 16);
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.1 });

            const barrelL = new THREE.Mesh(barrelGeo, barrelMat);
            barrelL.rotation.x = Math.PI / 2;
            barrelL.position.set(-10, 0, 5);

            const barrelR = new THREE.Mesh(barrelGeo, barrelMat);
            barrelR.rotation.x = Math.PI / 2;
            barrelR.position.set(10, 0, 5);

            sensorGroup.add(barrelL);
            sensorGroup.add(barrelR);

            // Glowing Ultrasonic Visual Beam Cone
            const coneGeo = new THREE.ConeGeometry(35, 90, 16, 1, true);
            coneGeo.rotateX(-Math.PI / 2);
            coneGeo.translate(0, 0, 45);
            const coneMat = new THREE.MeshBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.2,
                wireframe: true,
                side: THREE.DoubleSide
            });
            const coneMesh = new THREE.Mesh(coneGeo, coneMat);
            sensorGroup.add(coneMesh);

            this.sensorCones[cfg.id] = coneMesh;
        });
    }

    buildWheels() {
        this.wheels = {};

        const wheelConfigs = [
            { id: 'fl', x: -76, z: 62, isLeft: true },
            { id: 'fr', x: 76, z: 62, isLeft: false },
            { id: 'rl', x: -76, z: -62, isLeft: true },
            { id: 'rr', x: 76, z: -62, isLeft: false }
        ];

        const tireMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.9 });
        const rimMat  = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
        const hubMat  = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.9 });

        wheelConfigs.forEach(cfg => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(cfg.x, 0, cfg.z);
            this.chassisMesh.add(wheelGroup);

            // Wheel Axle Mount
            const axleGeo = new THREE.CylinderGeometry(4, 4, 20, 12);
            const axleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 });
            const axle = new THREE.Mesh(axleGeo, axleMat);
            axle.rotation.z = Math.PI / 2;
            axle.position.x = cfg.isLeft ? 10 : -10;
            wheelGroup.add(axle);

            // Animated Wheel Mesh Pivot
            const tirePivot = new THREE.Group();
            wheelGroup.add(tirePivot);

            // Rubber Tire Outer Cylinder
            const tireGeo = new THREE.CylinderGeometry(34, 34, 24, 28);
            const tireMesh = new THREE.Mesh(tireGeo, tireMat);
            tireMesh.rotation.z = Math.PI / 2;
            tireMesh.castShadow = true;
            tirePivot.add(tireMesh);

            // Metallic Rim Inner Disc
            const rimGeo = new THREE.CylinderGeometry(22, 22, 25, 24);
            const rimMesh = new THREE.Mesh(rimGeo, rimMat);
            rimMesh.rotation.z = Math.PI / 2;
            tirePivot.add(rimMesh);

            // Spokes / Hub Cap detailing
            for (let s = 0; s < 4; s++) {
                const spokeGeo = new THREE.BoxGeometry(6, 26, 6);
                const spoke = new THREE.Mesh(spokeGeo, hubMat);
                spoke.rotation.x = (s * Math.PI) / 4;
                spoke.position.x = cfg.isLeft ? -13 : 13;
                tirePivot.add(spoke);
            }

            this.wheels[cfg.id] = tirePivot;
        });
    }

    /**
     * Updates 3D Rover chassis, 4 wheel rotations, Moving Mouth (L298 Ch1), and Pulsing Neck (L298 Ch2).
     */
    updatePose(bodyState, wheelStateOverride) {
        if (wheelStateOverride) {
            this.wheelStates = wheelStateOverride;
        }

        // 1. Animate 4 Wheels Rotation based on direction & speed
        const dt = 0.03;
        ['fl', 'fr', 'rl', 'rr'].forEach(id => {
            const wState = this.wheelStates[id] || { dir: 'stop', speed: 100 };
            const speedFactor = (wState.speed || 100) / 100.0;
            let dirSign = 0;

            if (wState.dir === 'forward') dirSign = 1;
            else if (wState.dir === 'reverse') dirSign = -1;

            if (id === 'fr' || id === 'rr') dirSign *= -1;

            this.wheelRotations[id] += dirSign * speedFactor * 8.0 * dt;

            const tireMesh = this.wheels[id];
            if (tireMesh) {
                tireMesh.rotation.x = this.wheelRotations[id];
            }
        });

        // 2. Animate L298 Channel 1 (Black Robotic Head Moving Mouth) in sync with AI Speech
        if (this.lowerJawGroup) {
            if (this.mouthEnergized) {
                const talkPulse = Math.abs(Math.sin(performance.now() * 0.016)) * 0.55; // Open/close ~6 Hz
                this.lowerJawGroup.rotation.x = talkPulse;
            } else {
                this.lowerJawGroup.rotation.x += (0.0 - this.lowerJawGroup.rotation.x) * 0.25;
            }
        }

        // 3. Animate L298 Channel 2 (Pulsing Neck)
        if (this.neckRings) {
            const time = performance.now() * 0.012;
            this.neckRings.forEach((ring, idx) => {
                if (this.neckPulsating) {
                    const scale = 1.0 + Math.sin(time + idx * 0.8) * 0.28;
                    ring.scale.set(scale, scale, 1.0);
                } else {
                    ring.scale.set(1.0, 1.0, 1.0);
                }
            });
        }

        // 4. Update Ultrasonic Sensor Beam Cones
        Object.keys(this.sensorDistances).forEach(sensorId => {
            const cone = this.sensorCones[sensorId];
            if (cone) {
                const distCm = this.sensorDistances[sensorId] || 50;
                const scaleZ = Math.max(0.2, Math.min(2.5, distCm / 50));
                cone.scale.set(scaleZ, scaleZ, scaleZ);
            }
        });
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const parent = (this.renderer && this.renderer.domElement && this.renderer.domElement.parentElement) ? this.renderer.domElement.parentElement : this.container;
        const targetContainer = parent || this.container;
        if (!targetContainer) return;

        const width = targetContainer.clientWidth || targetContainer.offsetWidth || 800;
        const height = targetContainer.clientHeight || targetContainer.offsetHeight || 300;

        if (width > 0 && height > 0) {
            this.container = targetContainer;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        }
    }
}

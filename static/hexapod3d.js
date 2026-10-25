/**
 * Wall-Mounted Animatronic Deerhead 3D Renderer (Three.js WebGL Engine)
 * Builds procedural 3D model of a Wall-Mounted Animatronic Deerhead with:
 * - Wooden Wall Shield Plaque & Wall Backing
 * - Bowing Pivot Mechanism (L298 Channel 2: Bows Deerhead Forward)
 * - Articulated Lower Jaw / Mouth (L298 Channel 1: Syncs Mouth to AI Speech & Singing)
 * - Detailed Branching 3D Antlers, Glowing Cyber Eyes & Camera Lens Nose
 * - Visible L298 Motor Controller Module
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
        this.camera.position.set(0, 40, 320);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight || 350);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Orbit Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.2;
        this.controls.target.set(0, 20, 0);

        // Hardware State Flags
        this.mouthEnergized = false; // L298 Channel 1 (Lower Jaw Mouth)
        this.bowEnergized = false;   // L298 Channel 2 (Head Bowing Pivot)
        this.bowAngle = 0;           // Current interpolated bowing angle (radians)

        // Setup Lighting & Environment
        this.setupEnvironment();

        // Build Wall-Mounted Deerhead 3D Object Hierarchy
        this.buildDeerhead();

        // Window resize listener
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupEnvironment() {
        this.scene.background = new THREE.Color(0x0a0d14);
        this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.0008);

        const ambientLight = new THREE.AmbientLight(0xfff5ea, 0.8);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffedd5, 1.3);
        dirLight.position.set(150, 300, 250);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Cyan Spotlight on Deerhead
        const spotLight = new THREE.SpotLight(0x00f0ff, 2.0, 500, Math.PI / 4, 0.3);
        spotLight.position.set(0, 180, 220);
        spotLight.target.position.set(0, 20, 0);
        this.scene.add(spotLight);
        this.scene.add(spotLight.target);

        // Warm Accent Light
        const warmLight = new THREE.PointLight(0xf59e0b, 1.2, 400);
        warmLight.position.set(-100, 50, 100);
        this.scene.add(warmLight);
    }

    buildDeerhead() {
        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);

        // 1. Vertical Wall & Wooden Plaque Backing
        const wallGeo = new THREE.PlaneGeometry(600, 400);
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(0, 20, -40);
        wallMesh.receiveShadow = true;
        this.rootGroup.add(wallMesh);

        // Decorative Grid lines on Wall
        const wallGrid = new THREE.GridHelper(500, 20, 0x00f0ff, 0x1f2937);
        wallGrid.rotation.x = Math.PI / 2;
        wallGrid.position.set(0, 20, -39);
        this.rootGroup.add(wallGrid);

        // Wooden Shield Plaque (Mounted vertically on wall)
        const plaqueGroup = new THREE.Group();
        plaqueGroup.position.set(0, 20, -35);
        this.rootGroup.add(plaqueGroup);

        // Oval Wooden Shield Shape
        const shieldGeo = new THREE.CylinderGeometry(65, 55, 12, 32);
        shieldGeo.rotateX(Math.PI / 2);
        shieldGeo.scale(1.0, 1.4, 1.0);
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x451a03, // Rich Mahogany Wood
            roughness: 0.4,
            metalness: 0.1
        });
        const shieldMesh = new THREE.Mesh(shieldGeo, woodMat);
        shieldMesh.castShadow = true;
        plaqueGroup.add(shieldMesh);

        // Gold Trim Edge
        const trimGeo = new THREE.CylinderGeometry(67, 57, 4, 32);
        trimGeo.rotateX(Math.PI / 2);
        trimGeo.scale(1.0, 1.4, 1.0);
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 });
        const trimMesh = new THREE.Mesh(trimGeo, goldMat);
        trimMesh.position.z = -2;
        plaqueGroup.add(trimMesh);

        // L298 Motor Driver Board Mounted on Lower Corner of Shield
        this.buildL298Board(plaqueGroup);

        // 2. Bowing Pivot Mechanism (Driven by L298 Channel 2)
        this.bowPivotGroup = new THREE.Group();
        this.bowPivotGroup.position.set(0, 10, 0); // Bowing hinge axis
        plaqueGroup.add(this.bowPivotGroup);

        // Neck Support Mount Bracket
        const bracketGeo = new THREE.CylinderGeometry(18, 22, 25, 16);
        bracketGeo.rotateX(Math.PI / 2);
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
        const bracketMesh = new THREE.Mesh(bracketGeo, metalMat);
        bracketMesh.position.set(0, 0, 10);
        this.bowPivotGroup.add(bracketMesh);

        // 3. Deer Neck Structure (Extending forward from wall plaque)
        const neckGeo = new THREE.CylinderGeometry(24, 32, 60, 20);
        neckGeo.rotateX(Math.PI / 3); // Angle forward from wall
        const deerFurMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }); // Deer fur coat
        const neckMesh = new THREE.Mesh(neckGeo, deerFurMat);
        neckMesh.position.set(0, 15, 30);
        neckMesh.castShadow = true;
        this.bowPivotGroup.add(neckMesh);

        // 4. Main Head Skull Assembly
        this.headSkullGroup = new THREE.Group();
        this.headSkullGroup.position.set(0, 38, 55);
        this.bowPivotGroup.add(this.headSkullGroup);

        // Main Head Contour
        const headGeo = new THREE.BoxGeometry(42, 36, 55);
        const headMesh = new THREE.Mesh(headGeo, deerFurMat);
        headMesh.position.set(0, 0, 10);
        headMesh.castShadow = true;
        this.headSkullGroup.add(headMesh);

        // Snout / Muzzle
        const snoutGeo = new THREE.BoxGeometry(28, 22, 38);
        const snoutMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });
        const snoutMesh = new THREE.Mesh(snoutGeo, snoutMat);
        snoutMesh.position.set(0, -5, 45);
        snoutMesh.castShadow = true;
        this.headSkullGroup.add(snoutMesh);

        // Nose Tip with Integrated Camera Lens
        const noseGeo = new THREE.SphereGeometry(6, 16, 16);
        const noseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
        const noseMesh = new THREE.Mesh(noseGeo, noseMat);
        noseMesh.scale.set(1.2, 0.8, 1.0);
        noseMesh.position.set(0, -2, 64);
        this.headSkullGroup.add(noseMesh);

        // Camera Lens Glass Center on Nose
        const cameraLensGeo = new THREE.CylinderGeometry(3, 3, 4, 16);
        const cameraLensMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        const cameraLens = new THREE.Mesh(cameraLensGeo, cameraLensMat);
        cameraLens.rotation.x = Math.PI / 2;
        cameraLens.position.set(0, -2, 65);
        this.headSkullGroup.add(cameraLens);

        // Cyber / Glowing Deer Eyes
        const eyeGeo = new THREE.SphereGeometry(5, 16, 16);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff }); // Cyan LED eyes
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-18, 5, 30);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(18, 5, 30);
        this.headSkullGroup.add(leftEye);
        this.headSkullGroup.add(rightEye);

        // Ears (Left and Right)
        this.buildEar(-24, 12, 10, -Math.PI / 6, -Math.PI / 8);
        this.buildEar(24, 12, 10, Math.PI / 6, Math.PI / 8);

        // 5. Grand Branching Antlers
        const antlerMat = new THREE.MeshStandardMaterial({
            color: 0xfef3c7, // Bone / Ivory Antler color
            roughness: 0.5,
            metalness: 0.1
        });

        this.buildAntlerTree(-16, 18, 5, -1, antlerMat); // Left Antler
        this.buildAntlerTree(16, 18, 5, 1, antlerMat);   // Right Antler

        // 6. Articulated Lower Jaw / Moving Mouth (L298 Channel 1)
        this.lowerJawGroup = new THREE.Group();
        this.lowerJawGroup.position.set(0, -12, 30); // Jaw Hinge Pivot
        this.headSkullGroup.add(this.lowerJawGroup);

        const jawGeo = new THREE.BoxGeometry(26, 10, 36);
        jawGeo.translate(0, -4, 16); // Pivot offset
        const jawMesh = new THREE.Mesh(jawGeo, snoutMat);
        jawMesh.castShadow = true;
        this.lowerJawGroup.add(jawMesh);

        // Chrome / White Teeth inside Jaw
        const teethMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5 });
        for (let t = -8; t <= 8; t += 4) {
            const toothGeo = new THREE.ConeGeometry(1.5, 4, 4);
            const tooth = new THREE.Mesh(toothGeo, teethMat);
            tooth.position.set(t, 0, 30);
            tooth.rotation.x = Math.PI;
            this.lowerJawGroup.add(tooth);
        }
    }

    buildEar(x, y, z, rotZ, rotY) {
        const earGroup = new THREE.Group();
        earGroup.position.set(x, y, z);
        earGroup.rotation.z = rotZ;
        earGroup.rotation.y = rotY;

        const earGeo = new THREE.ConeGeometry(7, 24, 8);
        earGeo.scale(1.0, 1.0, 0.4);
        const earMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
        const earMesh = new THREE.Mesh(earGeo, earMat);
        earMesh.position.y = 10;
        earGroup.add(earMesh);

        const innerEarGeo = new THREE.ConeGeometry(4, 18, 8);
        innerEarGeo.scale(1.0, 1.0, 0.3);
        const innerMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.9 });
        const innerMesh = new THREE.Mesh(innerEarGeo, innerMat);
        innerMesh.position.set(0, 8, 1);
        earGroup.add(innerMesh);

        this.headSkullGroup.add(earGroup);
    }

    buildAntlerTree(startX, startY, startZ, side, mat) {
        const antlerGroup = new THREE.Group();
        antlerGroup.position.set(startX, startY, startZ);

        // Main Antler Beam (Curving Upward and Back)
        const mainBeamGeo = new THREE.CylinderGeometry(3.5, 5, 65, 12);
        mainBeamGeo.translate(0, 30, 0);
        const mainBeam = new THREE.Mesh(mainBeamGeo, mat);
        mainBeam.rotation.z = side * -Math.PI / 8;
        mainBeam.rotation.x = -Math.PI / 10;
        mainBeam.castShadow = true;
        antlerGroup.add(mainBeam);

        // Brow Tine (Pointing forward/down)
        const browTineGeo = new THREE.CylinderGeometry(2, 3.5, 25, 10);
        browTineGeo.translate(0, 12, 0);
        const browTine = new THREE.Mesh(browTineGeo, mat);
        browTine.position.set(side * 2, 15, 5);
        browTine.rotation.x = Math.PI / 4;
        browTine.rotation.z = side * -Math.PI / 6;
        browTine.castShadow = true;
        antlerGroup.add(browTine);

        // Bay Tine (Mid branch pointing up/out)
        const bayTineGeo = new THREE.CylinderGeometry(2, 3, 28, 10);
        bayTineGeo.translate(0, 14, 0);
        const bayTine = new THREE.Mesh(bayTineGeo, mat);
        bayTine.position.set(side * 8, 35, -2);
        bayTine.rotation.z = side * -Math.PI / 4;
        bayTine.rotation.x = -Math.PI / 12;
        bayTine.castShadow = true;
        antlerGroup.add(bayTine);

        // Crown Tine Top Branch
        const crownTineGeo = new THREE.CylinderGeometry(1.5, 2.5, 22, 10);
        crownTineGeo.translate(0, 10, 0);
        const crownTine = new THREE.Mesh(crownTineGeo, mat);
        crownTine.position.set(side * -2, 52, -10);
        crownTine.rotation.z = side * Math.PI / 8;
        crownTine.rotation.x = -Math.PI / 6;
        crownTine.castShadow = true;
        antlerGroup.add(crownTine);

        this.headSkullGroup.add(antlerGroup);
    }

    buildL298Board(parent) {
        const l298Group = new THREE.Group();
        l298Group.position.set(50, -50, 12);
        parent.add(l298Group);

        // Red / Amber PCB
        const pcbGeo = new THREE.BoxGeometry(30, 30, 4);
        const pcbMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 });
        const pcb = new THREE.Mesh(pcbGeo, pcbMat);
        l298Group.add(pcb);

        // Black Aluminum Heatsink Fins
        const sinkGeo = new THREE.BoxGeometry(16, 16, 12);
        const sinkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
        const sink = new THREE.Mesh(sinkGeo, sinkMat);
        sink.position.z = 8;
        l298Group.add(sink);

        // Green Screw Terminals (Channel 1 Mouth & Channel 2 Bow)
        const termGeo = new THREE.BoxGeometry(24, 6, 6);
        const termMat = new THREE.MeshStandardMaterial({ color: 0x16a34a });
        const term1 = new THREE.Mesh(termGeo, termMat);
        term1.position.set(0, 12, 5);
        l298Group.add(term1);
    }

    /**
     * Updates 3D Deerhead bowing angle (L298 Ch2) and mouth movement (L298 Ch1).
     */
    updatePose(bodyState, overrideState) {
        if (overrideState) {
            if ('mouth_channel1' in overrideState) this.mouthEnergized = overrideState.mouth_channel1;
            if ('bow_channel2' in overrideState) this.bowEnergized = overrideState.bow_channel2;
        }

        // 1. Animate Bowing Pivot (L298 Channel 2: Bows forward ~30 degrees = 0.5 rad)
        const targetBowAngle = this.bowEnergized ? 0.52 : 0.0;
        this.bowAngle += (targetBowAngle - this.bowAngle) * 0.12;

        if (this.bowPivotGroup) {
            this.bowPivotGroup.rotation.x = this.bowAngle;
        }

        // 2. Animate Articulated Lower Jaw Mouth (L298 Channel 1) in sync with AI Speech / Singing
        if (this.lowerJawGroup) {
            if (this.mouthEnergized) {
                const speechPulse = Math.abs(Math.sin(performance.now() * 0.018)) * 0.55; // Mouth pulses ~6-7 Hz
                this.lowerJawGroup.rotation.x = speechPulse;
            } else {
                this.lowerJawGroup.rotation.x += (0.0 - this.lowerJawGroup.rotation.x) * 0.3;
            }
        }
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
        const height = targetContainer.clientHeight || targetContainer.offsetHeight || 350;

        if (width > 0 && height > 0) {
            this.container = targetContainer;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        }
    }
}

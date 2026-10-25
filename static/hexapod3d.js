/**
 * Wall-Mounted Gemmy Animated Trophy Deer Head ("Buck") 3D Renderer
 * Builds a 3D model matching the Gemmy Animatronic Deer Head with:
 * - Dark Oak Shield Plaque with Carved Bevel & Gold "BUCK" Nameplate
 * - Tawny Brown Deer Coat with Cream Muzzle, Eye-Rings & White Throat Bib
 * - Glossy Dark Buck Eyes & Realistic Wet Black Deer Nose Tip
 * - Articulated Moving Jaw (L298 Ch1) with Pinkish Interior & Lower Lip
 * - Smooth Bowing Neck Joint (L298 Ch2)
 * - Classic 8-Point Ivory/Bone Trophy Antlers
 * - L298 Motor Controller Module
 */

class Hexapod3DRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = new THREE.Scene();

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            42,
            this.container.clientWidth / (this.container.clientHeight || 1),
            1,
            5000
        );
        this.camera.position.set(0, 30, 320);

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
        this.controls.maxPolarAngle = Math.PI / 2 + 0.15;
        this.controls.target.set(0, 15, 0);

        // Hardware State Flags
        this.mouthEnergized = false; // L298 Channel 1 (Lower Jaw Mouth)
        this.bowEnergized = false;   // L298 Channel 2 (Head Bowing Pivot)
        this.bowAngle = 0;           // Current interpolated bowing angle (radians)

        // Setup Gemmy Warm Mantle Lighting
        this.setupEnvironment();

        // Build Gemmy Deerhead Model
        this.buildGemmyDeerhead();

        // Window resize listener
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupEnvironment() {
        this.scene.background = new THREE.Color(0x0c0a09); // Dark wood / mantle room ambience
        this.scene.fog = new THREE.FogExp2(0x0c0a09, 0.0008);

        const ambientLight = new THREE.AmbientLight(0xfff7ed, 0.9);
        this.scene.add(ambientLight);

        // Warm Key Light (Spotlight like a cozy den / fireplace mantle light)
        const keyLight = new THREE.DirectionalLight(0xffedd5, 1.4);
        keyLight.position.set(120, 260, 220);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        this.scene.add(keyLight);

        // Soft Warm Fill Light
        const fillLight = new THREE.PointLight(0xd97706, 1.2, 500);
        fillLight.position.set(-140, 60, 150);
        this.scene.add(fillLight);

        // Cyan Tech Highlight Light (Gives modern cyber accent to trophy)
        const techSpot = new THREE.SpotLight(0x00f0ff, 1.5, 400, Math.PI / 5, 0.4);
        techSpot.position.set(0, 180, 200);
        techSpot.target.position.set(0, 15, 0);
        this.scene.add(techSpot);
        this.scene.add(techSpot.target);
    }

    buildGemmyDeerhead() {
        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);

        // Materials Palette for Gemmy "Buck" Deer Head
        this.mats = {
            darkOak: new THREE.MeshStandardMaterial({ color: 0x2b1507, roughness: 0.3, metalness: 0.1 }),
            goldTrim: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.8 }),
            brassPlate: new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.15, metalness: 0.9 }),
            deerCoat: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.85 }), // Buckskin Tawny Brown
            deerDarkCoat: new THREE.MeshStandardMaterial({ color: 0x652b08, roughness: 0.8 }), // Spine/Skull shade
            creamSnout: new THREE.MeshStandardMaterial({ color: 0xf5f0eb, roughness: 0.75 }), // Cream Muzzle & Eye Rings
            whiteBib: new THREE.MeshStandardMaterial({ color: 0xf8f5f0, roughness: 0.9 }), // White Throat Bib
            innerEar: new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.8 }), // Pinkish inner ear
            blackNose: new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.25 }), // Moist Nose
            darkEye: new THREE.MeshStandardMaterial({ color: 0x0f0b08, roughness: 0.05, metalness: 0.3 }), // Glossy Deer Eye
            eyeHighlight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            antlerBone: new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4, metalness: 0.05 }), // Ivory Antlers
            mouthPink: new THREE.MeshStandardMaterial({ color: 0xc026d3, roughness: 0.5 }), // Interior Tongue/Mouth
            blackLip: new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.5 })
        };

        // 1. Wood Wall Panel Background
        const wallGeo = new THREE.PlaneGeometry(600, 420);
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.9 });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(0, 15, -45);
        wallMesh.receiveShadow = true;
        this.rootGroup.add(wallMesh);

        // Subtle Cyan Grid Accent on Wall
        const wallGrid = new THREE.GridHelper(500, 20, 0x00f0ff, 0x292524);
        wallGrid.rotation.x = Math.PI / 2;
        wallGrid.position.set(0, 15, -44);
        this.rootGroup.add(wallGrid);

        // 2. Iconic Gemmy Wooden Shield Plaque
        const plaqueGroup = new THREE.Group();
        plaqueGroup.position.set(0, 15, -40);
        this.rootGroup.add(plaqueGroup);

        // Main Oak Shield Base (Beveled Oval)
        const shieldGeo = new THREE.CylinderGeometry(70, 60, 14, 36);
        shieldGeo.rotateX(Math.PI / 2);
        shieldGeo.scale(1.0, 1.42, 1.0);
        const shieldMesh = new THREE.Mesh(shieldGeo, this.mats.darkOak);
        shieldMesh.castShadow = true;
        plaqueGroup.add(shieldMesh);

        // Carved Gold / Brass Bevel Beading Edge
        const trimGeo = new THREE.CylinderGeometry(72, 62, 5, 36);
        trimGeo.rotateX(Math.PI / 2);
        trimGeo.scale(1.0, 1.42, 1.0);
        const trimMesh = new THREE.Mesh(trimGeo, this.mats.goldTrim);
        trimMesh.position.z = -3;
        plaqueGroup.add(trimMesh);

        // Brass Nameplate ("BUCK") at Lower Center of Plaque
        const plateGeo = new THREE.BoxGeometry(38, 14, 3);
        const plateMesh = new THREE.Mesh(plateGeo, this.mats.brassPlate);
        plateMesh.position.set(0, -68, 8);
        plaqueGroup.add(plateMesh);

        // Black Screws on Plate Corners
        for (let x of [-16, 16]) {
            for (let y of [-4, 4]) {
                const screwGeo = new THREE.CylinderGeometry(1.2, 1.2, 4, 8);
                const screwMesh = new THREE.Mesh(screwGeo, this.mats.darkEye);
                screwMesh.rotation.x = Math.PI / 2;
                screwMesh.position.set(x, -68 + y, 9);
                plaqueGroup.add(screwMesh);
            }
        }

        // L298 Motor Driver Module Mounted on Plaque Lower Side
        this.buildL298Board(plaqueGroup);

        // 3. Gemmy Neck Bowing Pivot Hinge (Driven by L298 Channel 2)
        this.bowPivotGroup = new THREE.Group();
        this.bowPivotGroup.position.set(0, 5, 0); // Bowing axis
        plaqueGroup.add(this.bowPivotGroup);

        // Mounting Neck Bracket Hinge
        const mountGeo = new THREE.CylinderGeometry(22, 28, 20, 20);
        mountGeo.rotateX(Math.PI / 2);
        const mountMesh = new THREE.Mesh(mountGeo, this.mats.darkOak);
        mountMesh.position.set(0, 0, 10);
        this.bowPivotGroup.add(mountMesh);

        // 4. Deer Neck & White Throat Bib
        const neckGeo = new THREE.CylinderGeometry(26, 36, 68, 24);
        neckGeo.rotateX(Math.PI / 3); // Extended forward
        const neckMesh = new THREE.Mesh(neckGeo, this.mats.deerCoat);
        neckMesh.position.set(0, 18, 34);
        neckMesh.castShadow = true;
        this.bowPivotGroup.add(neckMesh);

        // White Throat / Chest Fur Bib (Extending down front of neck)
        const bibGeo = new THREE.CylinderGeometry(14, 20, 58, 16, 1, false, -Math.PI / 3, (2 * Math.PI) / 3);
        bibGeo.rotateX(Math.PI / 3);
        const bibMesh = new THREE.Mesh(bibGeo, this.mats.whiteBib);
        bibMesh.position.set(0, 16, 36);
        bibMesh.scale.set(1.02, 1.0, 1.02);
        this.bowPivotGroup.add(bibMesh);

        // 5. Main Head Skull Assembly
        this.headSkullGroup = new THREE.Group();
        this.headSkullGroup.position.set(0, 44, 62);
        this.bowPivotGroup.add(this.headSkullGroup);

        // Skull Main Body
        const headGeo = new THREE.BoxGeometry(44, 38, 58);
        const headMesh = new THREE.Mesh(headGeo, this.mats.deerCoat);
        headMesh.position.set(0, 0, 10);
        headMesh.castShadow = true;
        this.headSkullGroup.add(headMesh);

        // Darker Spine / Crown Fur Patch on top of Skull
        const crownGeo = new THREE.BoxGeometry(32, 6, 42);
        const crownMesh = new THREE.Mesh(crownGeo, this.mats.deerDarkCoat);
        crownMesh.position.set(0, 18, 12);
        this.headSkullGroup.add(crownMesh);

        // Cream Muzzle / Upper Snout (Gemmy White Snout Patch)
        const snoutGeo = new THREE.BoxGeometry(30, 24, 40);
        const snoutMesh = new THREE.Mesh(snoutGeo, this.mats.creamSnout);
        snoutMesh.position.set(0, -6, 48);
        snoutMesh.castShadow = true;
        this.headSkullGroup.add(snoutMesh);

        // Wet Black Deer Nose Tip
        const noseGeo = new THREE.SphereGeometry(7, 16, 16);
        noseGeo.scale(1.25, 0.85, 1.0);
        const noseMesh = new THREE.Mesh(noseGeo, this.mats.blackNose);
        noseMesh.position.set(0, -3, 68);
        this.headSkullGroup.add(noseMesh);

        // Nostril Detailing
        for (let side of [-2.5, 2.5]) {
            const nostrilGeo = new THREE.SphereGeometry(1.8, 8, 8);
            const nostril = new THREE.Mesh(nostrilGeo, this.mats.darkEye);
            nostril.position.set(side, -5, 72);
            this.headSkullGroup.add(nostril);
        }

        // 6. Realistic Glossy Deer Eyes with Cream Eye-Ring Surround
        for (let side of [-1, 1]) {
            const eyeGroup = new THREE.Group();
            eyeGroup.position.set(side * 20, 6, 32);

            // Cream Eye Ring Patch
            const ringGeo = new THREE.SphereGeometry(9, 16, 16);
            ringGeo.scale(0.6, 1.0, 1.1);
            const ringMesh = new THREE.Mesh(ringGeo, this.mats.creamSnout);
            eyeGroup.add(ringMesh);

            // Glossy Dark Eyeball
            const eyeGeo = new THREE.SphereGeometry(6, 16, 16);
            const eyeMesh = new THREE.Mesh(eyeGeo, this.mats.darkEye);
            eyeMesh.position.set(side * 1.5, 0, 2);
            eyeGroup.add(eyeMesh);

            // White Specular Highlight Dot
            const dotGeo = new THREE.SphereGeometry(1.2, 8, 8);
            const dotMesh = new THREE.Mesh(dotGeo, this.mats.eyeHighlight);
            dotMesh.position.set(side * 2.8 + 2, 2, 6.5);
            eyeGroup.add(dotMesh);

            this.headSkullGroup.add(eyeGroup);
        }

        // 7. Gemmy Deer Ears
        this.buildGemmyEar(-26, 14, 12, -Math.PI / 5, -Math.PI / 7);
        this.buildGemmyEar(26, 14, 12, Math.PI / 5, Math.PI / 7);

        // 8. Gemmy 8-Point Ivory Trophy Antlers
        this.buildGemmyAntlerTree(-17, 20, 6, -1); // Left Antler
        this.buildGemmyAntlerTree(17, 20, 6, 1);   // Right Antler

        // 9. Articulated Lower Jaw & Mouth Interior (L298 Channel 1)
        this.lowerJawGroup = new THREE.Group();
        this.lowerJawGroup.position.set(0, -14, 32); // Jaw Hinge Pivot
        this.headSkullGroup.add(this.lowerJawGroup);

        // Jaw Cream Chin Exterior
        const jawGeo = new THREE.BoxGeometry(28, 10, 38);
        jawGeo.translate(0, -4, 17); // Offset for hinge pivot
        const jawMesh = new THREE.Mesh(jawGeo, this.mats.creamSnout);
        jawMesh.castShadow = true;
        this.lowerJawGroup.add(jawMesh);

        // Black Lip Line Border
        const lipGeo = new THREE.BoxGeometry(28.5, 3, 38.5);
        lipGeo.translate(0, 0, 17);
        const lipMesh = new THREE.Mesh(lipGeo, this.mats.blackLip);
        this.lowerJawGroup.add(lipMesh);

        // Pinkish Inner Mouth cavity & Tongue
        const tongueGeo = new THREE.BoxGeometry(20, 4, 26);
        tongueGeo.translate(0, -1, 15);
        const tongueMesh = new THREE.Mesh(tongueGeo, this.mats.mouthPink);
        this.lowerJawGroup.add(tongueMesh);
    }

    buildGemmyEar(x, y, z, rotZ, rotY) {
        const earGroup = new THREE.Group();
        earGroup.position.set(x, y, z);
        earGroup.rotation.z = rotZ;
        earGroup.rotation.y = rotY;

        // Ear Outer Shell (Tawny Brown)
        const earGeo = new THREE.ConeGeometry(8, 28, 12);
        earGeo.scale(1.0, 1.0, 0.45);
        const earMesh = new THREE.Mesh(earGeo, this.mats.deerCoat);
        earMesh.position.y = 12;
        earGroup.add(earMesh);

        // Ear Inner Lining (Cream / Pinkish)
        const innerGeo = new THREE.ConeGeometry(5, 22, 10);
        innerGeo.scale(1.0, 1.0, 0.35);
        const innerMesh = new THREE.Mesh(innerGeo, this.mats.innerEar);
        innerMesh.position.set(0, 10, 1.2);
        earGroup.add(innerMesh);

        this.headSkullGroup.add(earGroup);
    }

    buildGemmyAntlerTree(startX, startY, startZ, side) {
        const antlerGroup = new THREE.Group();
        antlerGroup.position.set(startX, startY, startZ);

        // Antler Base Coronet / Burr
        const burrGeo = new THREE.CylinderGeometry(5.5, 6, 6, 12);
        const burrMesh = new THREE.Mesh(burrGeo, this.mats.antlerBone);
        burrMesh.position.y = 3;
        antlerGroup.add(burrMesh);

        // Main Curved Antler Beam (Sweeping Out, Up and Forward)
        const mainBeamGeo = new THREE.CylinderGeometry(3.8, 5.2, 70, 12);
        mainBeamGeo.translate(0, 32, 0);
        const mainBeam = new THREE.Mesh(mainBeamGeo, this.mats.antlerBone);
        mainBeam.rotation.z = side * -Math.PI / 7;
        mainBeam.rotation.x = -Math.PI / 9;
        mainBeam.castShadow = true;
        antlerGroup.add(mainBeam);

        // Brow Tine (Pointing Forward & Up)
        const browTineGeo = new THREE.CylinderGeometry(2.2, 3.8, 28, 10);
        browTineGeo.translate(0, 13, 0);
        const browTine = new THREE.Mesh(browTineGeo, this.mats.antlerBone);
        browTine.position.set(side * 2, 16, 6);
        browTine.rotation.x = Math.PI / 3.5;
        browTine.rotation.z = side * -Math.PI / 6;
        browTine.castShadow = true;
        antlerGroup.add(browTine);

        // G-2 Mid Tine (Pointing Upward and Inward)
        const g2TineGeo = new THREE.CylinderGeometry(2.0, 3.2, 32, 10);
        g2TineGeo.translate(0, 15, 0);
        const g2Tine = new THREE.Mesh(g2TineGeo, this.mats.antlerBone);
        g2Tine.position.set(side * 9, 38, -2);
        g2Tine.rotation.z = side * -Math.PI / 4.5;
        g2Tine.rotation.x = -Math.PI / 10;
        g2Tine.castShadow = true;
        antlerGroup.add(g2Tine);

        // G-3 Top Crown Tine
        const g3TineGeo = new THREE.CylinderGeometry(1.6, 2.6, 24, 10);
        g3TineGeo.translate(0, 11, 0);
        const g3Tine = new THREE.Mesh(g3TineGeo, this.mats.antlerBone);
        g3Tine.position.set(side * -2, 56, -12);
        g3Tine.rotation.z = side * Math.PI / 7;
        g3Tine.rotation.x = -Math.PI / 5;
        g3Tine.castShadow = true;
        antlerGroup.add(g3Tine);

        this.headSkullGroup.add(antlerGroup);
    }

    buildL298Board(parent) {
        const l298Group = new THREE.Group();
        l298Group.position.set(52, -54, 12);
        parent.add(l298Group);

        // Red/Amber PCB
        const pcbGeo = new THREE.BoxGeometry(28, 28, 4);
        const pcbMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 });
        const pcb = new THREE.Mesh(pcbGeo, pcbMat);
        l298Group.add(pcb);

        // Black Aluminum Heatsink
        const sinkGeo = new THREE.BoxGeometry(15, 15, 12);
        const sinkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
        const sink = new THREE.Mesh(sinkGeo, sinkMat);
        sink.position.z = 8;
        l298Group.add(sink);

        // Green Screw Terminals (Ch1 Mouth & Ch2 Bow)
        const termGeo = new THREE.BoxGeometry(22, 6, 6);
        const termMat = new THREE.MeshStandardMaterial({ color: 0x16a34a });
        const term = new THREE.Mesh(termGeo, termMat);
        term.position.set(0, 11, 5);
        l298Group.add(term);
    }

    /**
     * Updates Gemmy Deerhead bowing angle (L298 Ch2) and mouth movement (L298 Ch1).
     */
    updatePose(bodyState, overrideState) {
        if (overrideState) {
            if ('mouth_channel1' in overrideState) this.mouthEnergized = overrideState.mouth_channel1;
            if ('bow_channel2' in overrideState) this.bowEnergized = overrideState.bow_channel2;
        }

        // 1. Animate Bowing Pivot (L298 Channel 2: Bows forward ~30 degrees = 0.52 rad)
        const targetBowAngle = this.bowEnergized ? 0.52 : 0.0;
        this.bowAngle += (targetBowAngle - this.bowAngle) * 0.12;

        if (this.bowPivotGroup) {
            this.bowPivotGroup.rotation.x = this.bowAngle;
        }

        // 2. Animate Articulated Lower Jaw Mouth (L298 Channel 1) in sync with AI Speech / Singing
        if (this.lowerJawGroup) {
            if (this.mouthEnergized) {
                const speechPulse = Math.abs(Math.sin(performance.now() * 0.018)) * 0.58; // Mouth pulses ~6-7 Hz
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

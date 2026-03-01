import * as THREE from "three";
import { GUI } from "dat.gui";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import { initFromGroundTruth, updateFromGroundTruth, movingObjectMap, hostVehicleId, fmt } from "./utils";
import { positionGUI } from "./uiUtils.js";
import { cameraModes } from "./constants.js";

const gtFrames = [];
const gui = new GUI();
const mousePosition = new THREE.Vector2();
const orbitTarget = new THREE.Vector3();
const standardFollowOffset = new THREE.Vector3(-15, 0, 10);
const followOffset = standardFollowOffset.clone();
const scene = new THREE.Scene();
const osiRoot = new THREE.Group();
// const osiSelectedObjId = document.getElementById('ObjectId');
// const osiSelectedObjPos = document.getElementById('ObjectPos');
// const osiSelectedObjSpeed = document.getElementById('ObjectSpeed');
// const osiSelectedObjAngle = document.getElementById('ObjectOrientation');

let latestGt = null;
let gtInitialized = false;
let frameIndex = 0;
let orbit = null;
let camera = null;
let renderer = null;
let rayCaster = null;
let axesHelper = null;
let selectedVehicle = null;
let userInteracting = false;
let selectedObjectIndex = null;
let cameraMode = cameraModes.FOLLOW;

export const osiPoints = new THREE.Group(); // Container for osiPoints
export const osiBoundaries = new THREE.Group(); // Container for osiBoundaries
export const osiRoadMarkBoundaries = new THREE.Group(); // Container for osiBoundaries which are roadMarks
export const osiStationaryObjects = new THREE.Group();
export const osiTrafficLights = new THREE.Group();
export const osiMovingObjects = new THREE.Group();

export const options = {
    play: false,
    step: 0,

    togglePlay() {
        this.play = !this.play;
    },

    wireframe: false,
    toggleWireframe() {
        this.wireframe = !this.wireframe;
        osiStationaryObjects.userData.meshes.forEach(mesh => {
            mesh.material.wireframe = this.wireframe;
            mesh.traverse(child => {
                if (child.isLineSegments) {
                    child.visible = !this.wireframe;
                }
            });
        });
    },

    aHelper: false,
    toggleAxisHelper() {
        this.aHelper = !this.aHelper;
        axesHelper.visible = this.aHelper;
    },

    osiPoints: false,
    toggleOsiPoints() {
        this.osiPoints = !this.osiPoints;
        osiPoints.visible = this.osiPoints;
    },

    boundaries: true,
    toggleBoundaries() {
        this.boundaries = !this.boundaries;
        osiBoundaries.visible = this.boundaries;
    },
}

let stepController = gui.add(options, 'step', 0, 1).step(1);

gui.add(options, 'togglePlay').name('Play / Pause (space)');
gui.add(options, 'toggleWireframe').name('Toggle wireframe (w)');
gui.add(options, 'toggleAxisHelper').name('Toggle axes-helper (a)');
gui.add(options, 'toggleOsiPoints').name('Toggle osi-points (p)');
gui.add(options, 'toggleBoundaries').name('Toggle osi-boundaries (b)');

export function addGroundTruth(gt) {
    gtFrames.push(gt);

    if (stepController) {
        stepController.max(gtFrames.length - 1);
    }
}

export function setupScene() {
    scene.add(osiRoot);
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    
    camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x222222)
    
    document.body.appendChild(renderer.domElement);

    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 0);
    orbit.dampingFactor = 0.08;
    orbit.panSpeed = 1.5;
    orbit.screenSpacePanning = false;
    orbit.minDistance = 3;
    orbit.maxDistance = 300;

    orbit.addEventListener('start', () => userInteracting = true);
    orbit.addEventListener('end', () => {
        userInteracting = false;

        if (!selectedVehicle) {
            return;
        }

        followOffset.copy(camera.position).sub(orbitTarget).applyQuaternion(selectedVehicle.mesh.quaternion.clone().invert());
    });

    axesHelper = new THREE.AxesHelper(1000);
    scene.add(axesHelper);
    axesHelper.visible = options.aHelper;

    osiRoot.add(osiPoints);
    osiPoints.visible = options.osiPoints;

    osiRoot.add(osiBoundaries);
    osiBoundaries.visible = options.boundaries;

    osiRoot.add(osiRoadMarkBoundaries);

    osiRoot.add(osiStationaryObjects);
    osiStationaryObjects.wireframe = options.wireframe;
    osiStationaryObjects.userData.meshes = []; // Store mesh for manipulation later

    osiRoot.add(osiTrafficLights);
    osiTrafficLights.wireframe = options.wireframe;

    osiRoot.add(osiMovingObjects);

    camera.position.set(-5, -30, 20);
    orbit.update();

    const ambientLight = new THREE.AmbientLight(0xFFFFFF);
    scene.add(ambientLight);

    rayCaster = new THREE.Raycaster();

    animate();
}

export function resetScene() {
    gtFrames.length = 0;
    orbitTarget.set(0, 0, 0);

    latestGt = null;
    gtInitialized = false;
    frameIndex = 0;
    orbit.update();
    camera.position.set(-5, -30, 20);
    selectedVehicle = null;
    userInteracting = null;
    selectedObjectIndex = null;
    cameraMode = cameraModes.FOLLOW;

    stepController.setValue(frameIndex);

    osiPoints.clear();
    osiBoundaries.clear();
    osiRoadMarkBoundaries.clear();
    osiStationaryObjects.clear();
    osiTrafficLights.clear();
    movingObjectMap.clear();
    osiMovingObjects.clear();
}

function animate() {
    requestAnimationFrame(animate);

    latestGt = gtFrames[frameIndex];

    if (latestGt) {
        if (!gtInitialized) {
            initFromGroundTruth(latestGt);
            console.log(latestGt);
            selectedVehicle = movingObjectMap.get(hostVehicleId);
            if (selectedVehicle) {
                resetFollowCamera();
            }
            positionGUI();
            gtInitialized = true;
        } 
        else {
            updateFromGroundTruth(latestGt);
        }
    }

    if (cameraMode == cameraModes.FOLLOW) {
        followVehicle();
    }

    if (gtFrames.length > 0 && options.play) {
        frameIndex = (frameIndex + 1) % gtFrames.length;
        stepController.setValue(frameIndex);
        options.play = true;
    }

    rayCaster.setFromCamera(mousePosition, camera);
    const intersects = rayCaster.intersectObjects(osiRoot.children, true);

    if (intersects.length > 0) {
        const mesh = intersects[0].object;
        //console.log("Local pos:", mesh.position);
    }

    orbit.update();
    renderer.render(scene, camera);
}

function followVehicle() {
    if (!selectedVehicle) {
        return;
    }

    // osiSelectedObjId.textContent = selectedVehicle.osiObj.id.value?.toString() || '-';
    // const pos = selectedVehicle.osiObj.base.position;
    // const vel = selectedVehicle.osiObj.base.velocity;
    // const ori = selectedVehicle.osiObj.base.orientation;
    // osiSelectedObjPos.textContent = `${fmt(pos.x)}, ${fmt(pos.y)}, ${fmt(pos.z)}`;
    // osiSelectedObjSpeed.textContent = `${fmt(vel.x)}, ${fmt(vel.y)}, ${fmt(vel.z)}`; 
    // osiSelectedObjAngle.textContent =  `${fmt(ori.yaw)}, ${fmt(ori.pitch)}, ${fmt(ori.roll)}`; 

    orbitTarget.copy(selectedVehicle.mesh.position);
    orbit.target.copy(orbitTarget);

    if (!userInteracting) {
        const worldOffset = followOffset.clone().applyQuaternion(selectedVehicle.mesh.quaternion);

        const desiredCameraPos =
            orbitTarget.clone().add(worldOffset);

        camera.position.copy(desiredCameraPos);
    }
}

function resetFollowCamera() {
    cameraMode = cameraModes.FOLLOW;
    
    followOffset.copy(standardFollowOffset);
    orbitTarget.copy(selectedVehicle.mesh.position);
    orbit.target.copy(orbitTarget);
    
    const offsetWorld = followOffset.clone().applyQuaternion(selectedVehicle.mesh.quaternion);
    camera.position.copy(orbitTarget).add(offsetWorld);
    orbit.update();
}

function selectNextVehicle(dir) {
    const vehicles = Array.from(movingObjectMap.values());
    if (vehicles.length == 0) {
        return;
    }

    selectedObjectIndex = (selectedObjectIndex + vehicles.length + dir) % vehicles.length;
    selectedVehicle = vehicles[selectedObjectIndex];
}

function stepForward(steps) {
    frameIndex = (frameIndex + steps) % gtFrames.length;
    stepController.setValue(frameIndex);
    options.play = false;
}

function stepBackward(steps) {
    frameIndex = frameIndex + steps;
    if (frameIndex < 0) frameIndex = gtFrames.length + frameIndex;
    stepController.setValue(frameIndex);
    options.play = false;
}

stepController.onChange((value) => {
    frameIndex = Math.floor(value);
    options.play = false;
})

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
})

window.addEventListener('mousemove', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    mousePosition.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mousePosition.y = (-(e.clientY - rect.top) / rect.height) * 2 + 1;
})

window.addEventListener('keydown', onKeyDown);

function onKeyDown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(event.key)) {
        event.preventDefault();
    }

    switch (event.key) {
        case ' ':
            options.togglePlay();
            break;
        case 'ArrowLeft':
            let b = -1;
            if (event.shiftKey) {
                b = -10;
            }
            stepBackward(b);
            break;
        case 'ArrowRight':
            let f = 1;
            if (event.shiftKey) {
                f = 10;
            }
            stepForward(f);
            break;
        case 'Tab':
            let dir = 1;
            if (event.shiftKey) {
                dir = -1;
            }
            selectNextVehicle(dir);
            break;
        case '1':
            resetFollowCamera();
            break;
        case '2':
            cameraMode = cameraModes.FREE;
            break;
        case 'a':
            options.toggleAxisHelper();
            break;
        case 'b':
            options.toggleBoundaries();
            break;
        case 'p':
            options.toggleOsiPoints();
            break;
        case 'w':
            options.toggleWireframe();
            break;
    }
}
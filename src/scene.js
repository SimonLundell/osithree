import * as THREE from "three";
import { GUI } from "dat.gui";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import { initFromGroundTruth, updateFromGroundTruth, movingObjectMap, hostVehicleId, clickableMeshes, clearUtils } from "./utils";
import { focusAndExpandObject, collapseTree } from "./uiUtils.js";
import { cameraModes, stylingColors } from "./constants.js";

const gtFrames = [];
const gui = new GUI();
const mousePosition = new THREE.Vector2();
const orbitTarget = new THREE.Vector3();
const standardFollowOffset = new THREE.Vector3(-15, 0, 10);
const followOffset = standardFollowOffset.clone();
const scene = new THREE.Scene();
const osiRoot = new THREE.Group();

let latestGt = null;
let gtInitialized = false;
let frameIndex = 0;
let currentFrameUpdated = false;
let orbit = null;
let camera = null;
let renderer = null;
let rayCaster = null;
let axesHelper = null;
let cameraVehicle = null;
let userInteracting = false;
let selectedObjectIndex = null;
let cameraMode = cameraModes.FOLLOW;
let hoveredMesh = null;
let selectedMesh = null;

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

    removeSelection() {
        if (selectedMesh) {
            setEmissive(selectedMesh, stylingColors.pitchBlack);
            selectedMesh = null;
        }
    },

    collapseAndDeselect() {
        this.removeSelection();
        collapseTree();
    }
}

let stepController = gui.add(options, 'step', 0, 1).step(1);

gui.add(options, 'togglePlay').name('Play / Pause (space)');
gui.add(options, 'toggleWireframe').name('Toggle wireframe (w)');
gui.add(options, 'toggleAxisHelper').name('Toggle axes-helper (a)');
gui.add(options, 'toggleOsiPoints').name('Toggle osi-points (p)');
gui.add(options, 'toggleBoundaries').name('Toggle osi-boundaries (b)');
gui.add(options, 'collapseAndDeselect').name("Collapse tree and remove selection (esc)");
gui.add(options, 'removeSelection').name("Remove current selection (q)");

export function addGroundTruth(gt) {
    gtFrames.push(gt);

    if (stepController) {
        stepController.max(gtFrames.length - 1);
    }
}

export function setupScene() {
    scene.add(osiRoot);
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    const viewer = document.getElementById("viewer");
    
    camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewer.clientWidth, viewer.clientHeight);
    viewer.appendChild(renderer.domElement);
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x222222)
    
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

        if (!cameraVehicle) {
            return;
        }

        followOffset.copy(camera.position).sub(orbitTarget).applyQuaternion(cameraVehicle.quaternion.clone().invert());
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
    cameraVehicle = null;
    userInteracting = null;
    selectedObjectIndex = null;
    cameraMode = cameraModes.FOLLOW;
    hoveredMesh = null;
    selectedMesh = null;

    stepController.setValue(frameIndex);

    osiPoints.clear();
    osiBoundaries.clear();
    osiRoadMarkBoundaries.clear();
    osiStationaryObjects.clear();
    osiTrafficLights.clear();
    movingObjectMap.clear();
    osiMovingObjects.clear();

    clearUtils();
}

function animate() {
    requestAnimationFrame(animate);

    latestGt = gtFrames[frameIndex];
    if (!latestGt) return;

    if (!gtInitialized) {
        initFromGroundTruth(latestGt);
        console.log(latestGt);
        cameraVehicle = movingObjectMap.get(hostVehicleId);
        if (cameraVehicle) {
            resetFollowCamera();
        }
        gtInitialized = true;
        currentFrameUpdated = true;
    } 

    if (!currentFrameUpdated) {
        updateFromGroundTruth(latestGt);
    }

    if (cameraMode == cameraModes.FOLLOW) {
        followVehicle();
    }

    if (gtFrames.length > 0 && options.play) {
        stepForward(1);
        stepController.setValue(frameIndex);
        options.play = true;
    }

    orbit.update();
    renderer.render(scene, camera);
}

function followVehicle() {
    if (!cameraVehicle) {
        return;
    }

    orbitTarget.copy(cameraVehicle.position);
    orbit.target.copy(orbitTarget);

    if (!userInteracting) {
        const worldOffset = followOffset.clone().applyQuaternion(cameraVehicle.quaternion);

        const desiredCameraPos =
            orbitTarget.clone().add(worldOffset);

        camera.position.copy(desiredCameraPos);
    }
}

function resetFollowCamera() {
    cameraMode = cameraModes.FOLLOW;
    
    followOffset.copy(standardFollowOffset);
    orbitTarget.copy(cameraVehicle.position);
    orbit.target.copy(orbitTarget);
    
    const offsetWorld = followOffset.clone().applyQuaternion(cameraVehicle.quaternion);
    camera.position.copy(orbitTarget).add(offsetWorld);
    orbit.update();
}

function selectNextVehicle(dir) {
    const vehicles = Array.from(movingObjectMap.values());
    if (vehicles.length == 0) {
        return;
    }

    selectedObjectIndex = (selectedObjectIndex + vehicles.length + dir) % vehicles.length;
    cameraVehicle = vehicles[selectedObjectIndex];
}

function stepForward(steps) {
    frameIndex = (frameIndex + steps) % gtFrames.length;
    stepController.setValue(frameIndex);
    options.play = false;
    currentFrameUpdated = false;
}

function stepBackward(steps) {
    frameIndex = frameIndex + steps;
    if (frameIndex < 0) frameIndex = gtFrames.length + frameIndex;
    stepController.setValue(frameIndex);
    options.play = false;
    currentFrameUpdated = false;
}

stepController.onChange((value) => {
    frameIndex = Math.floor(value);
    options.play = false;
    currentFrameUpdated = false;
});

window.addEventListener('resize', () => {
    const viewer = document.getElementById("viewer");
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
});

function updateMouse(e) {
    // This returns the canvas position and size in screen space.
    const rect = renderer.domElement.getBoundingClientRect();
    // normale -1 .. 1
    mousePosition.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mousePosition.y = (-(e.clientY - rect.top) / rect.height) * 2 + 1;
};

function setEmissive(mesh, colorHex) {
    if (!mesh) return;
    
    if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => {
            if (mat.emissive) mat.emissive.set(colorHex);
        });
    } else {
        if (mesh.material.emissive) {
            mesh.material.emissiveIntensity = 0.8;
            mesh.material.emissive.set(colorHex);
        }
    }
}

window.addEventListener("mousemove", (e) => {

    if (!rayCaster) return;

    updateMouse(e);

    rayCaster.setFromCamera(mousePosition, camera);
    const intersections = rayCaster.intersectObjects(clickableMeshes, false);

    let newHovered = null;

    if (intersections.length > 0) {
        newHovered = intersections[0].object;
    }

    if (newHovered !== null && newHovered === selectedMesh) {
        return;
    }

    // Hover changed
    if (newHovered !== hoveredMesh) {

        // Remove hover glow from previous hovered
        if (hoveredMesh && hoveredMesh !== selectedMesh) {
            setEmissive(hoveredMesh, stylingColors.pitchBlack);
        }

        hoveredMesh = newHovered;

        // Add glow to new hovered
        if (hoveredMesh) {
            setEmissive(hoveredMesh, stylingColors.hoveredMesh);
        }
    }

});

window.addEventListener("mousedown", (e) => {
    if (!rayCaster) return;
    updateMouse(e);

    rayCaster.setFromCamera(mousePosition, camera);
    const intersections = rayCaster.intersectObjects(clickableMeshes, false);

    // LEFT CLICK → select object
    if (e.button === 0) {

        if (intersections.length === 0) return;

        const mesh = intersections[0].object;

        if (selectedMesh && selectedMesh !== mesh) {
            setEmissive(selectedMesh, stylingColors.pitchBlack);
        }

        selectedMesh = mesh;
        setEmissive(selectedMesh, stylingColors.selectedMesh);

        if (mesh.userData.osiId) {
            focusAndExpandObject(mesh.userData.topic, mesh.userData.osiId);
        }
    }
});

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
        case 'q':
            options.removeSelection();
            break;
        case 'w':
            options.toggleWireframe();
            break;
        case 'Escape':
            options.collapseAndDeselect();
    }
}
import * as THREE from "three";
import { OrbitControls, CSS2DRenderer } from "three/examples/jsm/Addons.js";
import { GUI } from "dat.gui";

import { initFromGroundTruth, updateFromGroundTruth, movingObjectMap, hostVehicleId, clickableMeshes, clearUtils, createGroundPlane, getOsiTimeInSeconds } from "./utils";
import { updateTree, focusAndExpandObject, collapseTree, initResizableSidebar } from "./uiUtils.js";
import { cameraModes, stylingColors } from "./constants.js";

const gui = new GUI();
const gtFrames = [];
const mousePosition = new THREE.Vector2();
const orbitTarget = new THREE.Vector3();
const standardFollowOffset = new THREE.Vector3(-18, 0, 7);
const followOffset = standardFollowOffset.clone();
const scene = new THREE.Scene();
const osiRoot = new THREE.Group();
const viewer = document.getElementById("viewer");

let gtInitialized = false;
let frameIndex = 0;
let lastClockTime = performance.now();
let timeAccumulator = 0;
let needsSceneUpdate = false;
let suppressControllerCallback = false;
let orbit = null;
let camera = null;
let renderer = null;
let labelRenderer = null;
let rayCaster = null;
let axesHelper = null;
let cameraVehicle = null;
let userInteracting = false;
let selectedObjectIndex = null;
let cameraMode = cameraModes.FOLLOW;
let hoveredMesh = null;
let selectedMesh = null;
let pressedMesh = null; // Temporary storage for the "down" phase
let currentGroundPlane = null;
let lastVehiclePos = new THREE.Vector3();

export let latestGt = null;
export const osiPoints = new THREE.Group(); // Container for osiPoints
export const osiBoundaries = new THREE.Group(); // Container for osiBoundaries
export const osiRoadMarkBoundaries = new THREE.Group(); // Container for osiBoundaries which are roadMarks
export const osiStationaryObjects = new THREE.Group();
export const osiTrafficLights = new THREE.Group();
export const osiTrafficSigns = new THREE.Group();
export const osiMovingObjects = new THREE.Group();

// Options
export const options = {
    play: false,
    step: 0,

    togglePlay() {
        this.play = !this.play;
    },

    toggleCameraMode() {
        if (cameraMode === cameraModes.FOLLOW) {
            cameraMode = cameraModes.FREE;
        }
        else {
            cameraMode = cameraModes.FOLLOW;
        }
    },

    resetCamera() {
        resetFollowCamera();
    },

    groundPlane: true,
    toggleGroundPlane() {
        this.groundPlane = !this.groundPlane;
        currentGroundPlane.visible = this.groundPlane;
    },

    clearColorDark: true,
    toggleClearColor() {
        this.clearColorDark = !this.clearColorDark;
        if (this.clearColorDark) {
            renderer.setClearColor(stylingColors.softGray);
        }
        else {
            renderer.setClearColor(stylingColors.brightWhite);
        }
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
        osiRoadMarkBoundaries.userData.meshes.forEach(mesh => {
            mesh.material.wireframe = this.wireframe;
        });
        osiBoundaries.userData.meshes.forEach(mesh => {
            mesh.material.wireframe = this.wireframe;
        });
        osiTrafficSigns.userData.meshes.forEach(mesh => {
            mesh.material.wireframe = this.wireframe;
        });
        osiMovingObjects.userData.meshes.forEach(mesh => {
            mesh.material.wireframe = this.wireframe;
            mesh.material.opacity = 1.0;
        });
    },

    viewModes: ["filled", "transparent", "hollow"],
    viewModeIdx: 0,
    toggleViewMode() {
        this.viewModeIdx = (this.viewModeIdx + 1) % this.viewModes.length;
        const mode = this.viewModes[this.viewModeIdx];
        let opacity = 1.0;
        let outlineVisible = false;

        if (!this.wireframe && mode  === "transparent") {
            opacity = 0.2;
            outlineVisible = false;
        } 
        else if (!this.wireframe && mode === "hollow") {
            opacity = 0.0;
            outlineVisible = true;
        }

        osiMovingObjects.userData.meshes.forEach(mesh => {
            mesh.material.opacity = opacity;
            const has2DOutline = !!mesh.getObjectByName("2DOutline");

            mesh.traverse(child => {
                if (child.name === "2DOutline" || child.name === "outlinePoint") {
                    child.visible = outlineVisible;
                }

                if (child.name === "boxEdges") {
                    child.material.opacity = opacity;
                }

                if (child.name === "refPoint" || child.name === "forwardArrow") {
                    if (has2DOutline && mode == "hollow") {
                        child.visible = outlineVisible;
                    }
                    else {
                        child.visible = !outlineVisible;
                    }
                }
            });
        });
    },

    infoLabel: false,
    toggleInfoLabel() {
        osiMovingObjects.userData.meshes.forEach(mesh => {
            mesh.traverse(child => {
                if (child.name === "hoverLabel2D") {
                    child.visible = !child.visible;
                    this.infoLabel = child.visible;
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
            if (selectedMesh.userData.osiObj === null) {
                selectedMesh.traverse(child => {
                    if (child.name === "hoverLabel2D") {
                        child.visible = false;
                    }
                });
            }
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

const sceneFolder = gui.addFolder("Helpful settings");
sceneFolder.add(options, 'toggleInfoLabel').name('Toggle hovering label (i)');
sceneFolder.add(options, 'toggleCameraMode').name('Toggle follow (1) / free (2) camera mode');
sceneFolder.add(options, 'resetCamera').name('Reset camera position (r)');
sceneFolder.add(options, 'collapseAndDeselect').name("Remove selection & collapse tree (esc)");
sceneFolder.add(options, 'removeSelection').name("Remove selection (q)");

const cosmeticsFolder = gui.addFolder("Visualization settings")
cosmeticsFolder.add(options, 'toggleGroundPlane').name('Toggle grid (g)');
cosmeticsFolder.add(options, 'toggleClearColor').name('Toggle dark/bright backround (c)');
cosmeticsFolder.add(options, 'toggleWireframe').name('Toggle wireframe (w)');
cosmeticsFolder.add(options, 'toggleOsiPoints').name('Toggle osi-points (p)');
cosmeticsFolder.add(options, 'toggleBoundaries').name('Toggle osi-boundaries (b)');
cosmeticsFolder.add(options, 'toggleViewMode').name('Toggle moving object view mode (,)');

// Helpers
axesHelper = new THREE.AxesHelper(1);
scene.add(axesHelper);
axesHelper.visible = options.aHelper;
const axesFolder = gui.addFolder('AxesHelper settings');
axesFolder.add(options, 'toggleAxisHelper').name('Toggle axes-helper (a)');
axesFolder.add({ x: "0" }, 'x').name('X').onFinishChange(value => { axesHelper.position.x = parseFloat(value) || 0; });
axesFolder.add({ y: "0" }, 'y').name('Y').onFinishChange(value => { axesHelper.position.y = parseFloat(value) || 0; });
axesFolder.add({ z: "0" }, 'z').name('Z').onFinishChange(value => { axesHelper.position.z = parseFloat(value) || 0; });
axesFolder.add({ h: "0" }, 'h').name('H').onFinishChange(value => { axesHelper.rotation.z = parseFloat(value) || 0; });
axesFolder.add({ p: "0" }, 'p').name('P').onFinishChange(value => { axesHelper.rotation.y = parseFloat(value) || 0; });
axesFolder.add({ r: "0" }, 'r').name('R').onFinishChange(value => { axesHelper.rotation.x = parseFloat(value) || 0; });
axesFolder.add({ size: "1" }, 'size').name('Size').onFinishChange(value => { const s = parseFloat(value) || 1; 
    axesHelper.scale.set(s, s, s) });


// Export functions
export function addGroundTruth(gt) {
    gtFrames.push(gt);
    if (stepController) {
        stepController.max(gtFrames.length - 1);
    }
}

export function setupScene() {
    // Some basic inits
    scene.add(osiRoot);
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    const viewer = document.getElementById("viewer");
    
    // Renderer 
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance",
        precision: "mediump"
    });
    renderer.setPixelRatio(1);
    renderer.setSize(viewer.clientWidth, viewer.clientHeight);
    viewer.appendChild(renderer.domElement);
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(stylingColors.softGray);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(viewer.clientWidth, viewer.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none'; // Allow pointer events through label
    viewer.appendChild(labelRenderer.domElement);

    // Camera
    camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    camera.position.set(standardFollowOffset);
    initResizableSidebar(camera, renderer);
    
    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 0);
    orbit.dampingFactor = 0.08;
    orbit.panSpeed = 1.5;
    orbit.zoomSpeed = 2.0;
    orbit.screenSpacePanning = false;
    orbit.minDistance = 0.1;
    orbit.maxDistance = 300;
    orbit.minPolarAngle = 0.1; 
    orbit.maxPolarAngle = Math.PI - 0.1;

    orbit.addEventListener('start', () => userInteracting = true);
    orbit.addEventListener('end', () => {
        userInteracting = false;

        if (!cameraVehicle) {
            return;
        }

        followOffset.copy(camera.position).sub(orbitTarget).applyQuaternion(cameraVehicle.quaternion.clone().invert());
    });

    orbit.update();

    // Light
    const ambientLight = new THREE.AmbientLight(0xFFFFFF);
    scene.add(ambientLight);

    // Raycaster
    rayCaster = new THREE.Raycaster();

    // OSI
    osiRoot.add(osiPoints);
    osiPoints.visible = options.osiPoints;

    osiRoot.add(osiBoundaries);
    osiBoundaries.userData.meshes = [];
    osiBoundaries.visible = options.boundaries;

    osiRoot.add(osiRoadMarkBoundaries);
    osiRoadMarkBoundaries.userData.meshes = [];

    osiRoot.add(osiStationaryObjects);
    osiStationaryObjects.wireframe = options.wireframe;
    osiStationaryObjects.userData.meshes = []; // Store mesh for manipulation later

    osiRoot.add(osiTrafficLights);
    osiTrafficLights.wireframe = options.wireframe;

    osiRoot.add(osiTrafficSigns);
    osiTrafficSigns.wireframe = options.wireframe;
    osiTrafficSigns.userData.meshes = []; // To toggle wireframe

    osiRoot.add(osiMovingObjects);
    osiMovingObjects.wireframe = options.wireframe;
    osiMovingObjects.userData.meshes = [];

    animate();
}

export function checkDataAndInit() {
    if (gtFrames && gtFrames.length > 0 && !gtInitialized) {
        const firstGt = gtFrames[0];
        initFromGroundTruth(firstGt);
     
        cameraVehicle = movingObjectMap.get(hostVehicleId);
        if (cameraVehicle) {
            resetFollowCamera();
        }
        
        // We can get the scene limits once all data is initialized
        currentGroundPlane = createGroundPlane();
        scene.add(currentGroundPlane);

        gtInitialized = true;
    }
    else if (!gtInitialized) {
        setTimeout(checkDataAndInit, 100); // Try again in 100ms if not ready
    }
}

export function resetScene() {
    gtFrames.length = 0;
    latestGt = null;
    orbitTarget.set(0, 0, 0);

    gtInitialized = false;
    frameIndex = 0;
    orbit.update();
    camera.position.set(standardFollowOffset);
    cameraVehicle = null;
    userInteracting = null;
    selectedObjectIndex = null;
    cameraMode = cameraModes.FOLLOW;
    hoveredMesh = null;
    selectedMesh = null;
    lastClockTime = performance.now();
    timeAccumulator = 0;
    options.play = false;

    stepController.setValue(frameIndex);

    [osiPoints, osiMovingObjects].forEach(group => {
        if (!group) return;
        group.traverse((child) => {
            if (child.name === 'hoverLabel2D' && child.element) {
                // Force the browser to cleanly unmount the HTML div layer from the viewport
                if (child.element.parentNode) {
                    child.element.parentNode.removeChild(child.element);
                }
                // Nullify element reference to prevent lingering garbage collection leaks
                child.element = null; 
            }
        });
    });

    osiPoints.clear();
    osiBoundaries.clear();
    osiRoadMarkBoundaries.clear();
    osiStationaryObjects.clear();
    osiTrafficLights.clear();
    osiTrafficSigns.clear();
    movingObjectMap.clear();
    osiMovingObjects.clear();

    if (currentGroundPlane) {
        scene.remove(currentGroundPlane);
        
        currentGroundPlane.geometry.dispose();
        
        // 2. Dispose Texture (It lives inside the material's map)
        if (currentGroundPlane.material.map) {
            currentGroundPlane.material.map.dispose();
        }
        
        // 3. Dispose Material
        currentGroundPlane.material.dispose();
        
        currentGroundPlane = null;
    } 

    clearUtils();
}

// Functions
function animate() {
    requestAnimationFrame(animate);

    const currentClockTime = performance.now();
    let dt = (currentClockTime - lastClockTime) / 1000;
    lastClockTime = currentClockTime;
    if (dt > 0.1) dt = 0.1;

    if (options.play && gtInitialized && gtFrames.length > 0) {
        timeAccumulator += dt;

        while (gtFrames.length > 0) {
            const currentFrame = gtFrames[frameIndex];
            const nextFrameIdx = (frameIndex + 1) % gtFrames.length;
            const nextFrame = gtFrames[nextFrameIdx];
            const currentTime = getOsiTimeInSeconds(currentFrame.timestamp);
            const nextTime = getOsiTimeInSeconds(nextFrame.timestamp); 

            let frameDuration = nextTime - currentTime;

            if (frameDuration <= 0 || frameIndex === gtFrames.length - 1) {
                frameDuration = 0.033; // Default fallback step (e.g., 30fps baseline duration)
            }

            if (timeAccumulator >= frameDuration) {
                timeAccumulator -= frameDuration;
                frameIndex = nextFrameIdx;
                latestGt = gtFrames[frameIndex];

                updateFromGroundTruth(latestGt);
                needsSceneUpdate = false;
            }
            else {
                break;
            }
        }
    }
    else {
        timeAccumulator = 0;
    }

    if (needsSceneUpdate && gtInitialized && gtFrames.length > 0) {
        latestGt = gtFrames[frameIndex]
        updateFromGroundTruth(latestGt);
        needsSceneUpdate = false;
    }

    if (cameraMode == cameraModes.FOLLOW) {
        followVehicle();
    }

    if (stepController.getValue() !== frameIndex) {
        suppressControllerCallback = true;
        stepController.setValue(frameIndex);
        suppressControllerCallback = false;
    }

    orbit.update();
    renderer.render(scene, camera);

    if (labelRenderer) {
        labelRenderer.render(scene, camera);
    }
}

function followVehicle() {
    if (!cameraVehicle) {
        return;
    }

    const deltaMove = new THREE.Vector3().subVectors(cameraVehicle.position, lastVehiclePos);

    orbitTarget.copy(cameraVehicle.position);
    orbit.target.copy(orbitTarget);

    if (userInteracting) {
        // PATCH: Move the camera by the same delta so it "keeps up" with the car 
        // while you are rotating/panning.
        camera.position.add(deltaMove);
    }
    else {
        const worldOffset = followOffset.clone().applyQuaternion(cameraVehicle.quaternion);

        const desiredCameraPos =
            orbitTarget.clone().add(worldOffset);

        camera.position.copy(desiredCameraPos);
    }

    lastVehiclePos.copy(cameraVehicle.position);

    orbit.update();
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
    options.play = false;
    needsSceneUpdate = true;
}

function stepBackward(steps) {
    frameIndex = frameIndex + steps;
    if (frameIndex < 0) frameIndex = gtFrames.length + frameIndex;
    options.play = false;
    needsSceneUpdate = true;
}

function updateMouse(e) {
    // This returns the canvas position and size in screen space.
    const rect = viewer.getBoundingClientRect();
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

// Events //
// stepcontroller
stepController.onChange((value) => {
    if (suppressControllerCallback) return;
    frameIndex = Math.floor(value);
    needsSceneUpdate = true;
});

// viewer
viewer.addEventListener("mousemove", (e) => {

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

viewer.addEventListener("mousedown", (e) => {
    if (!rayCaster || e.button !== 0) return;
    updateMouse(e);

    rayCaster.setFromCamera(mousePosition, camera);
    const intersections = rayCaster.intersectObjects(clickableMeshes, false);

    if (intersections.length > 0) {
        pressedMesh = intersections[0].object;
    } else {
        pressedMesh = null;
    }
});

viewer.addEventListener("mouseup", (e) => {
    if (!rayCaster || e.button !== 0 || !pressedMesh) return;
    updateMouse(e);

    rayCaster.setFromCamera(mousePosition, camera);
    const intersections = rayCaster.intersectObjects(clickableMeshes, false);

    if (intersections.length > 0) {
        const releasedMesh = intersections[0].object;

        // ONLY select if the object released is the same as the one pressed
        if (releasedMesh === pressedMesh) {
            // 1. Clean up previous selection
            if (selectedMesh && selectedMesh !== releasedMesh) {
                setEmissive(selectedMesh, stylingColors.pitchBlack);
            }

            // Remove the label from the point, it will either stay removed or added again depending on clicked object
            if (selectedMesh !== null && selectedMesh.userData.osiObj === null) {
                selectedMesh.traverse(child => {
                    if (child.name === "hoverLabel2D") {
                        child.visible = false;
                    }
                });
            }

            // 2. Set new selection
            selectedMesh = releasedMesh;
            setEmissive(selectedMesh, stylingColors.selectedMesh);

            // 3. UI logic
            if (selectedMesh.userData.osiId) {
                const treeContainer = document.querySelector('.treeContainer');

                // We first go to top of the view, then find and expand so we have consistent behavior
                if (treeContainer) {
                    treeContainer.scrollTop = 0;
                }

                if (!e.shiftKey) {
                    collapseTree();
                }
                focusAndExpandObject(selectedMesh.userData.topic, selectedMesh.userData.osiId);
                updateTree(latestGt); // Ensure update if we click an object
            }
            else { // Its a osi point
                selectedMesh.traverse(child => {
                    if (child.name === "hoverLabel2D") {
                        child.visible = true;
                    }
                });
            }
        }
        else {
        }
    }
    
    // Always reset the pressed state on mouseup
    pressedMesh = null;
});

// window
window.addEventListener('resize', () => {
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
});

window.addEventListener('keydown', (event) => {
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
        case ',':
            options.toggleViewMode();
            break;
        case '1':
            cameraMode = cameraModes.FOLLOW;
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
        case 'c':
            options.toggleClearColor();
            break;
        case 'g':
            options.toggleGroundPlane();
            break;
        case 'i':
            options.toggleInfoLabel();
            break;
        case 'p':
            options.toggleOsiPoints();
            break;
        case 'q':
            options.removeSelection();
            break;
        case 'r':
            options.resetCamera();
            break;
        case 'w':
            options.toggleWireframe();
            break;
        case 'Escape':
            options.collapseAndDeselect();
    }
});


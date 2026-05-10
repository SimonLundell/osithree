import * as THREE from "three";
import { GUI } from "dat.gui";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import { initFromGroundTruth, updateFromGroundTruth, movingObjectMap, hostVehicleId, clickableMeshes, clearUtils, sceneLimits } from "./utils";
import { focusAndExpandObject, collapseTree, initResizableSidebar } from "./uiUtils.js";
import { cameraModes, stylingColors } from "./constants.js";

const gtFrames = [];
const gui = new GUI();
const mousePosition = new THREE.Vector2();
const orbitTarget = new THREE.Vector3();
const standardFollowOffset = new THREE.Vector3(-18, 0, 7);
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
let currentGroundPlane = null;

export const osiPoints = new THREE.Group(); // Container for osiPoints
export const osiBoundaries = new THREE.Group(); // Container for osiBoundaries
export const osiRoadMarkBoundaries = new THREE.Group(); // Container for osiBoundaries which are roadMarks
export const osiStationaryObjects = new THREE.Group();
export const osiTrafficLights = new THREE.Group();
export const osiTrafficSigns = new THREE.Group();
export const osiMovingObjects = new THREE.Group();

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
        let opacity = 1.0;
        const mode = this.viewModes[this.viewModeIdx];
        if (!this.wireframe && mode  === "transparent") {
            opacity = 0.2;
        } 
        else if (!this.wireframe && mode === "hollow") {
            opacity = 0.0;
        }
        osiMovingObjects.userData.meshes.forEach(mesh => {
            mesh.material.opacity = opacity;
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
gui.add(options, 'toggleCameraMode').name('Toggle follow (1) / free (2) camera mode');
gui.add(options, 'resetCamera').name('Reset camera position (r)');
gui.add(options, 'toggleGroundPlane').name('Toggle grid (g)');
gui.add(options, 'toggleClearColor').name('Toggle dark/bright backround (c)');
gui.add(options, 'collapseAndDeselect').name("Remove selection & collapse tree (esc)");
gui.add(options, 'removeSelection').name("Remove selection (q)");
gui.add(options, 'toggleWireframe').name('Toggle wireframe (w)');
gui.add(options, 'toggleOsiPoints').name('Toggle osi-points (p)');
gui.add(options, 'toggleBoundaries').name('Toggle osi-boundaries (b)');
gui.add(options, 'toggleViewMode').name('Toggle moving object view mode (,)');

// Manual Input Fields
gui.add(options, 'toggleAxisHelper').name('Toggle axes-helper (a)');
const folder = gui.addFolder('Axes Position');

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
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewer.clientWidth, viewer.clientHeight);
    viewer.appendChild(renderer.domElement);
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(stylingColors.softGray);

    // Camera
    camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    camera.position.set(standardFollowOffset);
    initResizableSidebar(camera, renderer);
    
    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 0);
    orbit.dampingFactor = 0.08;
    orbit.panSpeed = 1.5;
    orbit.screenSpacePanning = false;
    orbit.minDistance = 3;
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

    // Helpers
    axesHelper = new THREE.AxesHelper(1000);
    scene.add(axesHelper);
    axesHelper.visible = options.aHelper;

    folder.add({ x: "0" }, 'x').name('X').onFinishChange(value => { axesHelper.position.x = parseFloat(value) || 0; });
    folder.add({ y: "0" }, 'y').name('Y').onFinishChange(value => { axesHelper.position.y = parseFloat(value) || 0; });
    folder.add({ z: "0" }, 'z').name('Z').onFinishChange(value => { axesHelper.position.z = parseFloat(value) || 0; });

    // OSI
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

    osiRoot.add(osiTrafficSigns);
    osiTrafficSigns.wireframe = options.wireframe;
    osiTrafficSigns.userData.meshes = []; // To toggle wireframe

    osiRoot.add(osiMovingObjects);
    osiMovingObjects.wireframe = options.wireframe;
    osiMovingObjects.userData.meshes = [];

    animate();
}

function createGroundPlane(sceneLimits) {
    const width = sceneLimits.maxX - sceneLimits.minX + 5;
    const height = sceneLimits.maxY - sceneLimits.minY + 5;
    const centerX = (sceneLimits.minX + sceneLimits.maxX) / 2;
    const centerY = (sceneLimits.minY + sceneLimits.maxY) / 2;

    const geometry = new THREE.PlaneGeometry(width, height);
    
    // Create a 1x1 canvas texture for the grid line
    const loader = new THREE.TextureLoader();
    // Using a data URI for a simple grid pattern so you don't need an external image file
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    // This repeats the texture every 1 meter
    texture.repeat.set(width, height);

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.2,
        color: stylingColors.groundPlane,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(centerX, centerY, sceneLimits.minZ - 0.1); // Slightly below lowest z

    return plane;
}

export function resetScene() {
    gtFrames.length = 0;
    orbitTarget.set(0, 0, 0);

    latestGt = null;
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

    stepController.setValue(frameIndex);

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

        currentGroundPlane = createGroundPlane(sceneLimits);
        scene.add(currentGroundPlane);
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

let lastVehiclePos = new THREE.Vector3();

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

const viewer = document.getElementById("viewer");

window.addEventListener('resize', () => {
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
});

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

let pressedMesh = null; // Temporary storage for the "down" phase

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
            }
        }
    }
    
    // Always reset the pressed state on mouseup
    pressedMesh = null;
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
}
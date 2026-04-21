import * as THREE from "three";
import { laneBoundaryColor, trafficLightColor, stylingColors } from "./constants";
import { trafficSignShape, signShape } from "./trafficSigns.js";
import { osiPoints, osiBoundaries, osiRoadMarkBoundaries, osiStationaryObjects, osiTrafficLights, osiTrafficSigns, osiMovingObjects, options } from "./scene";
import { initTree, updateTree } from "./uiUtils.js";
import { FOVHelper } from "./fovhelper";

export const movingObjectMap = new Map();
export const trafficLightMap = new Map();
export const clickableMeshes = [];
export let hostVehicleId = null;

export function initFromGroundTruth(gt) {
    initMetaData(gt); // Build dynamic html tree

    initLanes(gt.lane);
    initLaneBoundaries(gt.laneBoundary);
    initStationaryObjects(gt.stationaryObject);
    initTrafficLights(gt.trafficLight);
    initTrafficSigns(gt.trafficSign);
    initMovingObjs(gt.movingObject);
}

export function updateFromGroundTruth(gt) {
    
    const currentIds = new Set();

    gt.movingObject.forEach(obj => {
        updateMovingObj(obj);
        currentIds.add(obj.id.value);
    });

    // Remove objects no longer present
    for (const [id, mesh] of movingObjectMap.entries()) {
        if (!currentIds.has(id)) {
            removeObj(id, mesh);
        }
    }

    gt.trafficLight.forEach(tl => {
        updateTrafficLight(tl);
    });

    updateTree(gt);
}

export function fmt(n, digits = 3) {
    return Number(n).toFixed(digits);
}

export function clearUtils() {
    movingObjectMap.clear();
    trafficLightMap.clear();
    clickableMeshes.length = 0;
    hostVehicleId = null;
}

function initMetaData(gt) {
    hostVehicleId = gt.hostVehicleId.value; // TODO: add safeguard if not existing
    initTree(gt);
}

function setPosAndAngle(mesh, base, offset = 0) {
    const pos = new THREE.Vector3(base.position.x, base.position.y, base.position.z + offset);
    const yawQuat =  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), base.orientation.yaw);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), base.orientation.pitch);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), base.orientation.roll);
    
    mesh.position.copy(pos);
    mesh.quaternion.copy(yawQuat).multiply(pitchQuat).multiply(rollQuat);
}

function setClickable(topic, obj, mesh) {
    mesh.userData.topic = topic;
    mesh.userData.osiObj = obj;
    mesh.userData.osiId = obj.id.value;

    clickableMeshes.push(mesh);
}

function initMovingObj(obj) {
    const width = obj.base.dimension.width;
    const height = obj.base.dimension.height;
    const length = obj.base.dimension.length;
    const boxGeometry = new THREE.BoxGeometry(length, width, height);
    // const color = obj.base.colorDescription.rgb
    const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0x1111AA,
        wireframe: false,
        transparent: true,
        opacity: 0.5
    });
    const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
    addEdges(mesh);
    const axesHelper = new THREE.AxesHelper();
    mesh.add(axesHelper);
    mesh.add(refPoint());

    /* Maybe fix later
    const fovHelper = new FOVHelper({
        fov: 90,
        range: 15,
        color: 0xFFFFFF
    });
    fovHelper.rotation.x = -Math.PI / 2;
    fovHelper.rotation.y = Math.PI / 2;
    box.add(fovHelper);
    */

    osiMovingObjects.add(mesh);
    
    setPosAndAngle(mesh, obj.base);
    setClickable("movingObject", obj, mesh);
    movingObjectMap.set(obj.id.value, mesh);
}

function initMovingObjs(movingObjects) {
    movingObjects.forEach(obj => {
        initMovingObj(obj);
    });
}

function initLaneBoundaries(laneBoundaries) {
    laneBoundaries.forEach(boundary => {
        const points = [];
        boundary.boundaryLine.forEach(data => {
            points.push(new THREE.Vector3(data.position.x, data.position.y, data.position.z));
            addPoint(points[points.length - 1]);
        });
        
        let width = -1;
        if (boundary.boundaryLine[0].width != 0) {
            width = boundary.boundaryLine[0].width; // Assume all lines are same width
        }

        const type = boundary.classification.type;
        let color = null;
        if (boundary.classification.color == 0) {
            if (type == 2) { // INVISIBLE
                color = laneBoundaryColor.get(8);
            } 
            else if (type == 3 || type == 4) { // SOLID or DASHED
                color = laneBoundaryColor.get(3); // WHITE
            }
            else if (type == 6) { // ROAD_EDGE
                color = laneBoundaryColor.get(6); // BLUE
            }
            else { // ALL ELSE
                color = laneBoundaryColor.get(9); // ORANGE
            }
        } 
        else {
            color = laneBoundaryColor.get(boundary.classification.color);
        }
        
        let geometry = null;
        if (type == 4) { // DASHED LINES
            geometry = buildDashedStripGeometry(points, width, 0.015); // slightly above 
        }
        else {
            geometry = buildStripGeometry(points, width);
        }

        const material = new THREE.MeshStandardMaterial({
            color: color,
            side: THREE.DoubleSide
        });

        const strip = new THREE.Mesh(geometry, material);
        
        // We want to be able to toggle any boundary that isn't solid or dashed line
        if (type == 3 || type == 4) {
            osiRoadMarkBoundaries.add(strip);
        }
        else {
            osiBoundaries.add(strip);
        }

        setClickable("laneBoundary", boundary, strip);
    });
}

function initLanes(lanes) {
    lanes.forEach(lane => {
        const points = [];
        lane.classification.centerline.forEach(data => {
            points.push(new THREE.Vector3(data.x, data.y, data.z));
            addPoint(points[points.length - 1]);
        });
        const geometry = buildStripGeometry(points, -1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xCC0000,
            side: THREE.DoubleSide
        });

        const strip = new THREE.Mesh(geometry, material);
        setClickable("lane", lane, strip);
        // We want to be able to toggle any boundary that isn't solid or dashed line
        osiBoundaries.add(strip);
    })
}

function initStationaryObjects(stationaryObjects) {
    stationaryObjects.forEach(sObj => {
        if (sObj.base.basePolygon.length != 0) {
            // Break out the 2D points
            const points = [];
            sObj.base.basePolygon.forEach(vertex => {
                points.push(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
            });
            // Create a polygon and make it a geometry which extrudes with the height
            const shape = new THREE.Shape(points);
            const height = sObj.base.dimension.height;
            const geometry = new THREE.ExtrudeGeometry(shape, {
                depth: height,
                bevelEnabled: false
            });

            const material = new THREE.MeshStandardMaterial({color: 0xAAAAAA})
            
            // Create the mesh and shift the reference point down to center
            const mesh = new THREE.Mesh(geometry, material);
            
            addEdges(mesh);
            // Create a parent empty object and send that object to the target position
            // This is so we could rotate the object around its own axis 
            const container = new THREE.Object3D();
            container.add(mesh);
            osiStationaryObjects.add(container);
            osiStationaryObjects.userData.meshes.push(mesh);

            setPosAndAngle(mesh, sObj.base, -height / 2);
            setClickable("stationaryObject", sObj, mesh)
        } 
        else { // Its just a box with a position and rotation?
            const width = sObj.base.dimension.width;
            const height = sObj.base.dimension.height;
            const length = sObj.base.dimension.length;
            const boxGeometry = new THREE.BoxGeometry(length, width, height);
            const boxMaterial = new THREE.MeshStandardMaterial({
                color: 0xAAAAAA,
                wireframe: false,
                transparent: true,
                opacity: 0.9
            });
            const box = new THREE.Mesh(boxGeometry, boxMaterial);
            box.position.z = -height / 2;
            
            addEdges(box);

            osiStationaryObjects.add(box);
            osiStationaryObjects.userData.meshes.push(box);
            
            setPosAndAngle(box, sObj.base);
            setClickable("stationaryObject", sObj, box)
        }

    });
}

function initTrafficLights(trafficLights) {
    trafficLights.forEach(trafficLight => {
        const height = trafficLight.base.dimension.height;
        const width = trafficLight.base.dimension.width;
        const shape = new THREE.Shape();
        shape.absellipse(0, 0, height * 0.5, width * 0.5, 0, Math.PI * 2, false, 0);
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.02,
            bevelEnabled: false
        });
        geometry.rotateY(-Math.PI / 2);

        const groups = geometry.groups;

        const capGroup = groups[0];
        const sideGroup = groups[1];

        const halfCap = capGroup.count / 2;

        geometry.clearGroups();

        geometry.addGroup(
            capGroup.start,
            halfCap,
            0
        );

        geometry.addGroup(
            capGroup.start + halfCap,
            halfCap,
            1
        );

        geometry.addGroup(
            sideGroup.start,
            sideGroup.count,
            2
        );

        let color = stylingColors.basicBlack;
        if (trafficLight.classification.mode > 2) {
            color = trafficLightColor.get(trafficLight.classification.color);
        }

        const materials = [
            new THREE.MeshStandardMaterial({color: color}),
            new THREE.MeshStandardMaterial({color: stylingColors.pitchBlack}),
            new THREE.MeshStandardMaterial({color: stylingColors.pitchBlack}),
        ];

        const mesh = new THREE.Mesh(geometry, materials);
        mesh.geometry.computeBoundingSphere();

        setPosAndAngle(mesh, trafficLight.base);
        setClickable("trafficLight", trafficLight, mesh);

        osiTrafficLights.add(mesh);

        trafficLightMap.set(trafficLight.id.value, mesh);
    });
}

function initTrafficSigns(trafficSigns) {
    trafficSigns.forEach(trafficSign => {
        let geometry = null;
        const tsShape = trafficSignShape.get(trafficSign.mainSign.classification.type);
        
        if (tsShape === undefined) return;

        const height = trafficSign.mainSign.base.dimension.height;
        const width = trafficSign.mainSign.base.dimension.width;

        if (tsShape === signShape.ELLIPSE) {
            const shape = new THREE.Shape();
            shape.absellipse(0, 0, height * 0.5, width * 0.5, 0, Math.PI * 2, false, 0);
            geometry = new THREE.ExtrudeGeometry(shape, {
                depth: 0.02,
                bevelEnabled: false
            });
        }
        else if (tsShape === signShape.RECTANGLE) {
            geometry = new THREE.BoxGeometry(width, height, 0.02);
        }
        else if (tsShape === signShape.RECTANGLE_90) {
            // width/height after box rotated 45 degrees
            const localW = width / Math.sqrt(2);
            const localH = height / Math.sqrt(2);
            geometry = new THREE.BoxGeometry(localW, localH, 0.02);
            geometry.rotateZ(-Math.PI / 4);
        }
        else if (tsShape === signShape.OCTAGON) {
            const shape = new THREE.Shape();
            const rx = width / 2;
            const ry = height / 2;
            const sides = 8;
            
            // Offset by 22.5 degrees (PI/8) to ensure flat top/bottom
            const offset = Math.PI / 8; 

            for (let i = 0; i < sides; i++) {
                const theta = (i / sides) * Math.PI * 2 + offset;
                const x = rx * Math.cos(theta);
                const y = ry * Math.sin(theta);
                
                if (i === 0) {
                    shape.moveTo(x, y);
                } else {
                    shape.lineTo(x, y);
                }
            }
            shape.closePath();

            geometry = new THREE.ExtrudeGeometry(shape, {
                depth: 0.02,
                bevelEnabled: false
            });
        }
        else if (tsShape === signShape.TRIANGLE || tsShape === signShape.TRIANGLE_INV) {
            const shape = new THREE.Shape();

            const halfW = width / 2;
            const halfH = height / 2;

            // Start at the bottom-left
            shape.moveTo(-halfW, -halfH);
            // Move to the bottom-right
            shape.lineTo(halfW, -halfH);
            // Move to the top-middle
            shape.lineTo(0, halfH);
            
            shape.closePath();

            geometry = new THREE.ExtrudeGeometry(shape, {
                depth: 0.02,
                bevelEnabled: false
            });

            let zRotation = -Math.PI / 2;
            if (tsShape === signShape.TRIANGLE_INV) {
                zRotation -= Math.PI;
            }

            geometry.rotateZ(zRotation);
        }
        else { // UNKNOWN, or an X, just make a box
            geometry = new THREE.BoxGeometry(width, height, 0.02);
        }
        
        geometry.rotateY(-Math.PI / 2);
        const material = new THREE.MeshStandardMaterial({ color: stylingColors.basicGray });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.geometry.computeBoundingSphere();

        setPosAndAngle(mesh, trafficSign.mainSign.base);
        setClickable("trafficSign", trafficSign, mesh);

        osiTrafficSigns.add(mesh);
        osiTrafficSigns.userData.meshes.push(mesh);
    });
}

function updateTrafficLight(tl) {
   const mesh = trafficLightMap.get(tl.id.value);
   if (mesh) {
    let color = stylingColors.basicBlack;
    if (tl.classification.mode > 2) {
        color = trafficLightColor.get(tl.classification.color);
    }

    mesh.material[0].color.set(color);
    mesh.material.forEach(mat => {
        mat.wireframe = options.wireframe;
    });

   }
}

function removeObj(id, mesh) {
    movingObjectMap.delete(id);
    osiMovingObjects.remove(mesh);
    const index = clickableMeshes.indexOf(mesh);
    if (index !== -1) clickableMeshes.splice(index, 1);
}

function updateMovingObj(obj) {
    if (!movingObjectMap.has(obj.id.value)) {
        initMovingObj(obj);
    }

    const mesh = movingObjectMap.get(obj.id.value);
    if (mesh) {
        setPosAndAngle(mesh, mesh.userData.osiObj.base);
        mesh.material.wireframe = options.wireframe;
    }
    mesh.userData.osiObj = obj;
}

function addEdges(mesh, color = 0x000000) {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color })
    );
    mesh.add(line);
}

function addPoint(point, color = 0xFFFFFF) {
    const geometry = new THREE.SphereGeometry(0.15);
    const material = new THREE.MeshStandardMaterial({color: color});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(point);
    osiPoints.add(mesh);
}

function refPoint() {
    const sphereGeometry = new THREE.SphereGeometry(0.2);
    const sphereMaterial = new THREE.MeshStandardMaterial({color: 0x3399FF});
    return new THREE.Mesh(sphereGeometry, sphereMaterial);

}

function buildDashedStripGeometry(
    points,
    width,
    zOffset = 0.01
) {
    if (width == -1) {
        width = 0.1
    }
    const positions = [];

    const half = width * 0.5;

    for (let i = 0; i < points.length - 1; i += 2) {
        const p0 = points[i].clone();
        const p1 = points[i + 1].clone();

        const segmentLength = p0.distanceTo(p1);
        const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
        const normal = new THREE.Vector3(-dir.y, dir.x, 0);

        const a = p0.clone().addScaledVector(dir, 0);
        const b = p0.clone().addScaledVector(dir, segmentLength);

        a.z += zOffset;
        b.z += zOffset;

        const l0 = a.clone().addScaledVector(normal, half);
        const r0 = a.clone().addScaledVector(normal, -half);
        const l1 = b.clone().addScaledVector(normal, half);
        const r1 = b.clone().addScaledVector(normal, -half);

        positions.push(
            l0.x, l0.y, l0.z,
            r0.x, r0.y, r0.z,
            l1.x, l1.y, l1.z,

            r0.x, r0.y, r0.z,
            r1.x, r1.y, r1.z,
            l1.x, l1.y, l1.z
        );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.computeVertexNormals();

    return geometry;
}

function buildStripGeometry(points, width, zOffset = 0.01) {
    if (width == -1) {
        width = 0.1
    }
    const positions = [];
    const half = width * 0.5;

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i].clone();
        const p1 = points[i + 1].clone();

        p0.z += zOffset;
        p1.z += zOffset;

        // Direction along segment
        const dir = new THREE.Vector3().subVectors(p1, p0).normalize();

        // Perpendicular in XY plane (z-up)
        const normal = new THREE.Vector3(-dir.y, dir.x, 0);

        const l0 = p0.clone().addScaledVector(normal, half);
        const r0 = p0.clone().addScaledVector(normal, -half);
        const l1 = p1.clone().addScaledVector(normal, half);
        const r1 = p1.clone().addScaledVector(normal, -half);

        positions.push(
            l0.x, l0.y, l0.z,
            r0.x, r0.y, r0.z,
            l1.x, l1.y, l1.z,

            r0.x, r0.y, r0.z,
            r1.x, r1.y, r1.z,
            l1.x, l1.y, l1.z,
        )
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.computeVertexNormals();

    return geometry;
}

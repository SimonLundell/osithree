import * as THREE from "three";
import { laneBoundaryColor, trafficLightColor, basicBlack } from "./constants";
import { osiPoints, osiBoundaries, osiRoadMarkBoundaries, osiStationaryObjects, osiTrafficLights, osiMovingObjects, options } from "./scene";
import { setCopyable } from "./uiUtils";
import { FOVHelper } from "./fovhelper";

const osiVersionEl = document.getElementById('osiVersion');
const osiTimestampEl = document.getElementById('osiTimestamp');
const osiXodrModelReferenceEl = document.getElementById('xodrModelReference');
const osiMapReferenceEl = document.getElementById('mapReference');
const osiProjStringEl = document.getElementById('projString');

export const movingObjectMap = new Map();
export const trafficLightMap = new Map();
export let hostVehicleId = null;

export function initFromGroundTruth(gt) {
    initMetaData(gt);
    initLanes(gt.lane);
    initLaneBoundaries(gt.laneBoundary);
    initStationaryObjects(gt.stationaryObject);
    initTrafficLights(gt.trafficLight);
    initMovingObjs(gt.movingObject);
}

export function updateFromGroundTruth(gt) {
    updateTimestamp(gt.timestamp.seconds, gt.timestamp.nanos);
    gt.movingObject.forEach(obj => {
        updateMovingObj(obj);
    });
    gt.trafficLight.forEach(tl => {
        updateTrafficLight(tl);
    });
}

export function fmt(n, digits = 3) {
    return Number(n).toFixed(digits);
}

function updateTimestamp(seconds, nanos) {
    const nanoStr = String(nanos).padStart(9, '0');
    osiTimestampEl.textContent = `seconds: ${seconds} nanos: ${nanoStr}`
}

function initMetaData(gt) {
    osiVersionEl.textContent = `${gt.version.versionMajor}.${gt.version.versionMinor}.${gt.version.versionPatch}`;
    updateTimestamp(gt.timestamp.seconds, gt.timestamp.nanos);
    hostVehicleId = gt.hostVehicleId.value;
    setCopyable(osiXodrModelReferenceEl, gt.modelReference?.toString());
    setCopyable(osiMapReferenceEl, gt.mapReference?.toString());
    setCopyable(osiProjStringEl, gt.projString?.toString());
}

function setPosAndAngle(mesh, base, offset = 0) {
    const pos = new THREE.Vector3(base.position.x, base.position.y, base.position.z + offset);
    const yawQuat =  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), base.orientation.yaw);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), base.orientation.pitch);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), base.orientation.roll);
    
    mesh.position.copy(pos);
    mesh.quaternion.copy(yawQuat).multiply(pitchQuat).multiply(rollQuat);
}

function initMovingObjs(movingObject) {
    movingObject.forEach(obj => {
        const width = obj.base.dimension.width;
        const height = obj.base.dimension.height;
        const length = obj.base.dimension.length;
        const boxGeometry = new THREE.BoxGeometry(length, width, height);
        const boxMaterial = new THREE.MeshStandardMaterial({
            color: 0xFF0000,
            wireframe: false,
            transparent: true,
            opacity: 0.5
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        addEdges(box);
        const axesHelper = new THREE.AxesHelper();
        box.add(axesHelper);
        box.add(refPoint());

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

        osiMovingObjects.add(box);
        
        setPosAndAngle(box, obj.base);

        movingObjectMap.set(obj.id.value, {
            mesh: box,
            osiObj: obj
        });
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
            geometry = buildDashedStripGeometry(points, width);
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

        let color = basicBlack;
        if (trafficLight.classification.mode > 2) {
            color = trafficLightColor.get(trafficLight.classification.color);
        }

        const materials = [
            new THREE.MeshStandardMaterial({color: color}),
            new THREE.MeshStandardMaterial({color: 0x000000}),
            new THREE.MeshStandardMaterial({color: 0x000000}),
        ];

        const mesh = new THREE.Mesh(geometry, materials);

        setPosAndAngle(mesh, trafficLight.base);

        osiTrafficLights.add(mesh);

        trafficLightMap.set(trafficLight.id.value, mesh);
    });
}

function updateTrafficLight(tl) {
   const mesh = trafficLightMap.get(tl.id.value);
   if (mesh) {
    let color = basicBlack;
    if (tl.classification.mode > 2) {
        color = trafficLightColor.get(tl.classification.color);
    }

    mesh.material[0].color.set(color);
    mesh.material.forEach(mat => {
        mat.wireframe = options.wireframe;
    });

   }
}

function updateMovingObj(obj) {
    const mapObj = movingObjectMap.get(obj.id.value);
    if (mapObj.mesh) {
        setPosAndAngle(mapObj.mesh, obj.base);
        mapObj.mesh.material.wireframe = options.wireframe;
    }
    mapObj.osiObj = obj;
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

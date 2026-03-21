
export const laneBoundaryColor = new Map([
    [3, 0xFFFFFF], // WHITE
    [4, 0xFFFF00], // YELLOW
    [5, 0xFF0000], // RED
    [6, 0x0066FF], // BLUE
    [7, 0x00FF00], // GREEN
    [8, 0x9933FF], // VIOLET
    [9, 0xFF8000], // ORANGE
]);

export const trafficLightColor = new Map([
    [2, 0xFF0000], // RED
    [3, 0xFFFF00], // YELLOW
    [4, 0x00FF00], // GREEN
    [5, 0x0066FF], // BLUE
    [6, 0xFFFFFF], // WHITE
]);

export const stylingColors = {
    pitchBlack: 0x000000,
    basicBlack: 0x111111,
    hoveredMesh: 0x444444,
    selectedMesh: 0x888888
}

export const cameraModes = Object.freeze({
    FOLLOW: 0,
    FREE: 1
});

export const GT_ORDER = [
    "version",
    "modelReference",
    "projString",
    "mapReference",
    "timestamp",
    "hostVehicleId",

    "environmentalConditions",

    "movingObject",
    "stationaryObject",
    "trafficLight",
    "trafficSign",

    "lane",
    "laneBoundary",
    "logicalLane",
    "logicalLaneBoundary",
    "referenceLine",

    "roadMarking",

    "occupant"
];

export const AUTO_EXPAND = new Set([
    "timestamp",
]);

export const dynamicRoots = [
    "timestamp",
    "environmentalConditions",
    "movingObject",
    "trafficLight",
    "trafficSign"
];
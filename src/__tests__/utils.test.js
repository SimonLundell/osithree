import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dat.gui", () => ({
  GUI: class {
    add() {
      return {
        name() { return this; },
        step() { return this; },
        onFinishChange() { return this; },
        onChange() { return this; }
      };
    }

    addFolder() {
      return {
        add: () => ({
          name() { return this; },
          onFinishChange() { return this; }
        })
      };
    }
  }
}));

vi.mock("three/examples/jsm/Addons.js", () => ({
  CSS2DObject: class {
    constructor(element) {
      this.element = element;
      this.position = { set: () => {} };
      this.name = "hoverLabel2D";
      this.visible = false;
    }
  },
  OrbitControls: class {
    constructor() {
      this.target = { set: () => {} };
      this.dampingFactor = 0;
      this.panSpeed = 0;
      this.zoomSpeed = 0;
      this.screenSpacePanning = false;
      this.minDistance = 0;
      this.maxDistance = 0;
      this.minPolarAngle = 0;
      this.maxPolarAngle = 0;
    }
    addEventListener() {}
    update() {}
  },
  CSS2DRenderer: class {
    constructor() {
      this.domElement = document.createElement("div");
    }
    setSize() {}
    render() {}
  }
}));

let utils;

beforeEach(async () => {
  document.body.innerHTML = `
    <div id="viewer" style="width:600px;height:400px"></div>
    <div class="treeContainer"></div>
    <ul id="gtTree"></ul>
  `;
  globalThis.requestAnimationFrame = vi.fn();
  globalThis.performance = { now: () => 0 };
  utils = await import("../utils.js");
});

describe("utils module", () => {
  // Utility functions used by scene and decoder logic are validated here.
  it("formats timestamps to seconds correctly", () => {
    expect(utils.getOsiTimeInSeconds({ seconds: 1, nanos: 500_000_000 })).toBe(1.5);
    expect(utils.getOsiTimeInSeconds({ seconds: 0, nanos: 100 })).toBe(0.0000001);
    expect(utils.getOsiTimeInSeconds(null)).toBe(0);
    expect(utils.getOsiTimeInSeconds({})).toBe(0);
  });

  // Check that clearUtils resets global state and scene bounds for a fresh load.
  it("clears utility state and resets scene limits", () => {
    utils.movingObjectMap.set(1, {});
    utils.trafficLightMap.set(2, {});
    utils.clickableMeshes.push({});
    utils.sceneLimits.minX = 3;
    utils.sceneLimits.maxX = 5;
    utils.sceneLimits.minY = 7;
    utils.sceneLimits.maxY = 9;
    utils.sceneLimits.minZ = -2;

    utils.clearUtils();

    expect(utils.movingObjectMap.size).toBe(0);
    expect(utils.trafficLightMap.size).toBe(0);
    expect(utils.clickableMeshes.length).toBe(0);
    expect(utils.hostVehicleId).toBe(null);
    expect(utils.sceneLimits.minX).toBe(Infinity);
    expect(utils.sceneLimits.maxX).toBe(-Infinity);
    expect(utils.sceneLimits.minY).toBe(Infinity);
    expect(utils.sceneLimits.maxY).toBe(-Infinity);
    expect(utils.sceneLimits.minZ).toBe(Infinity);
  });

  // Validate ground plane construction from scene extents and canvas texture creation.
  it("creates a ground plane mesh from scene limits", () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: () => ({
        strokeStyle: "",
        lineWidth: 0,
        strokeRect: () => {}
      }),
      configurable: true
    });

    utils.sceneLimits.minX = 0;
    utils.sceneLimits.maxX = 10;
    utils.sceneLimits.minY = 0;
    utils.sceneLimits.maxY = 10;
    utils.sceneLimits.minZ = -1;

    const plane = utils.createGroundPlane();

    expect(plane).toBeTruthy();
    expect(plane.position.z).toBeCloseTo(-1.1, 2);
    expect(plane.material.opacity).toBe(0.2);
    expect(plane.material.map).toBeTruthy();
  });
});

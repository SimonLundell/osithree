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

let sceneModule;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="viewer" style="width:600px;height:400px"></div>
    <div class="treeContainer"></div>
    <ul id="gtTree"></ul>
  `;
  globalThis.requestAnimationFrame = vi.fn();
  globalThis.performance = { now: () => 0 };

  sceneModule = await import("../scene.js");
});

describe("scene module", () => {
  // Scene module unit tests validate camera and display option toggles without rendering.
  it("toggles play state", () => {
    const { options } = sceneModule;
    expect(options.play).toBe(false);

    options.togglePlay();
    expect(options.play).toBe(true);

    options.togglePlay();
    expect(options.play).toBe(false);
  });

  // Ensure wireframe toggles update all relevant object materials in the scene.
  it("toggles wireframe mode on object meshes", () => {
    const { options, osiStationaryObjects, osiRoadMarkBoundaries, osiBoundaries, osiTrafficSigns, osiMovingObjects } = sceneModule;

    const createMesh = () => ({
      material: { wireframe: false, opacity: 1.0 },
      traverse: (fn) => fn({ isLineSegments: false })
    });

    const meshA = createMesh();
    const meshB = createMesh();
    const meshC = createMesh();
    const meshD = createMesh();

    osiStationaryObjects.userData.meshes = [meshA];
    osiRoadMarkBoundaries.userData.meshes = [meshB];
    osiBoundaries.userData.meshes = [meshC];
    osiTrafficSigns.userData.meshes = [meshD];
    osiMovingObjects.userData.meshes = [meshD];

    options.toggleWireframe();

    expect(meshA.material.wireframe).toBe(true);
    expect(meshB.material.wireframe).toBe(true);
    expect(meshC.material.wireframe).toBe(true);
    expect(meshD.material.wireframe).toBe(true);
  });

  // Verify view mode switching updates moving object opacity and outline visibility.
  it("toggles moving object view mode and updates material opacity", () => {
    const { options, osiMovingObjects } = sceneModule;

    const outlineChild = { name: "2DOutline", visible: true };
    const mesh = {
      material: { opacity: 1.0 },
      getObjectByName: () => outlineChild,
      traverse: (fn) => fn(outlineChild)
    };
    osiMovingObjects.userData.meshes = [mesh];
    options.wireframe = false;
    options.viewModeIdx = 0;

    options.toggleViewMode();

    expect(options.viewModeIdx).toBe(1);
    expect(mesh.material.opacity).toBe(0.2);
    expect(outlineChild.visible).toBe(false);
  });

  // Confirm toggling information labels flips visibility on hover label objects.
  it("toggles hover info labels on moving objects", () => {
    const { options, osiMovingObjects } = sceneModule;

    const labelChild = { name: "hoverLabel2D", visible: false };
    const mesh = {
      traverse: (fn) => fn(labelChild)
    };

    osiMovingObjects.userData.meshes = [mesh];

    options.toggleInfoLabel();
    expect(labelChild.visible).toBe(true);

    options.toggleInfoLabel();
    expect(labelChild.visible).toBe(false);
  });
});

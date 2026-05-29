import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDecodeOSIFile = vi.fn((file, callback) => callback({ frame: true }));
const mockSetupScene = vi.fn();
const mockResetScene = vi.fn();
const mockAddGroundTruth = vi.fn();
const mockCheckDataAndInit = vi.fn();

vi.mock("../osidecoder.js", () => ({
  decodeOSIFile: mockDecodeOSIFile
}));

vi.mock("../scene.js", () => ({
  setupScene: mockSetupScene,
  resetScene: mockResetScene,
  addGroundTruth: mockAddGroundTruth,
  checkDataAndInit: mockCheckDataAndInit
}));

describe("main module", () => {
  // Main module tests ensure the app initializes correctly and handles file input.
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <input id="fileInput" type="file" />
      <span id="fileName"></span>
    `;

    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(["x"], { type: "application/octet-stream" }))
    }));

    await import("../main.js");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verify startup automatically fetches the default OSI example and updates the UI state.
  it("loads the default OSI file on startup", async () => {
    await Promise.resolve();
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledWith("../examples/traffic_lights.osi");
    expect(document.getElementById("fileName").textContent).toBe("traffic_lights.osi (default)");
  });

  // Make sure user file selection triggers the expected scene reset and decode flow.
  it("processes the selected file without crashing and updates the UI", () => {
    const input = document.getElementById("fileInput");
    const file = new File(["binary"], "test.osi", { type: "application/octet-stream" });
    Object.defineProperty(input, "files", {
      value: [file],
      writable: false,
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(document.getElementById("fileName").textContent).toBe("test.osi");
    expect(mockResetScene).toHaveBeenCalled();
    expect(mockDecodeOSIFile).toHaveBeenCalledWith(file, expect.any(Function));
    expect(mockCheckDataAndInit).toHaveBeenCalled();
  });
});

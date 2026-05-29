import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoad = vi.fn();
vi.mock("protobufjs", () => ({
  __esModule: true,
  default: {
    load: mockLoad
  }
}));

describe("osiDecoder", () => {
  // Test harness covers the OSI file decoder behavior with a mocked FileReader.
  beforeEach(() => {
    document.body.innerHTML = `<input id="fileInput" disabled>`;
    vi.stubGlobal("FileReader", class {
      constructor() {
        this.onload = null;
        this.result = null;
      }
      readAsArrayBuffer(file) {
        this.result = file;
        if (typeof this.onload === "function") {
          this.onload();
        }
      }
    });
    mockLoad.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // Ensure the decoder reads a valid OSI-style frame and forwards the decoded message.
  it("decodes an OSI file and passes a frame to the callback", async () => {
    const mockDecode = vi.fn().mockReturnValue({ frame: true });
    mockLoad.mockResolvedValue({ lookupType: () => ({ decode: mockDecode }) });

      const { decodeOSIFile } = await import("../osidecoder.js");

    const file = new Uint8Array([4, 0, 0, 0, 1, 2, 3, 4]).buffer;
    let frameReceived = null;

    decodeOSIFile(file, (frame) => {
      frameReceived = frame;
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(frameReceived).toEqual({ frame: true });
    expect(mockDecode).toHaveBeenCalled();
  });

  // Verify decoder error handling does not propagate exceptions for corrupt stream data.
  it("does not throw when the OSI stream is invalid", async () => {
    const mockDecode = vi.fn();
    mockLoad.mockResolvedValue({ lookupType: () => ({ decode: mockDecode }) });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { decodeOSIFile } = await import("../osidecoder.js");

    const invalidFile = new Uint8Array([255, 255, 255, 255]).buffer;
    decodeOSIFile(invalidFile, () => {});
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(consoleError).toHaveBeenCalled();
  });
});

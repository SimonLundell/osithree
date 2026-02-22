import protobuf from "protobufjs";

let GroundTruthType = null;

export async function loadSchema() {
  const root = await protobuf.load("/src/proto/osi_groundtruth.proto");
  GroundTruthType = root.lookupType("osi3.GroundTruth");
  console.log("OSI GroundTruth schema loaded");
  document.getElementById("fileInput").disabled = false;
}

export async function decodeOSIFile(file, onFrame) {
  if (!GroundTruthType) await loadSchema();

  const reader = new FileReader();

  reader.onload = () => {
    const buffer = new DataView(reader.result);
    let offset = 0;

    try {
      while (offset < buffer.byteLength) {
        // Read uint32 length (little-endian)
        const length = buffer.getUint32(offset, true);
        offset += 4;

        const slice = new Uint8Array(
          buffer.buffer,
          offset,
          length
        );

        const message = GroundTruthType.decode(slice);

        onFrame(message);

        offset += length;
      }
    } catch (err) {
      console.error("Stream decode failed:", err, "at offset", offset);
    }
  };

  reader.readAsArrayBuffer(file);
}
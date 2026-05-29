// npm run dev

import { decodeOSIFile } from "./osidecoder.js";
import { setupScene, addGroundTruth, resetScene, checkDataAndInit } from "./scene.js";

setupScene();

const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");

function processOSIFile(file) {
  resetScene();

  decodeOSIFile(file, (groundTruth) => {
    addGroundTruth(groundTruth);
  });

  checkDataAndInit();
}

function loadDefaultFile() {
  const defaultFile = "./traffic_lights.osi";
  fileName.textContent = "Loading default simulation...";

  fetch(defaultFile).then(response => {
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    return response.blob();
  }).then(blob => {
    processOSIFile(blob);
    fileName.textContent = "traffic_lights.osi (default)";
  })
  .catch(error => {
    console.error("Failed to load default OSI file", error);
    fileName.textContent = "Error loading default simulation";
  });
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  fileName.textContent = file ? file.name : 'No file selected';
  
  if (!file) {
    return;
  }

  processOSIFile(file);

});

loadDefaultFile();


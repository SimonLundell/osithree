// npm run dev

import { decodeOSIFile } from "./osiDecoder.js";
import { setupScene, addGroundTruth, resetScene } from "./scene.js";

setupScene();

const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  fileName.textContent = file ? file.name : 'No file selected';
  
  if (!file) {
    return;
  }

  resetScene();

  decodeOSIFile(file, (groundTruth) => {
    addGroundTruth(groundTruth);
  });

});

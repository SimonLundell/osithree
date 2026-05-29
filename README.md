# OSI Viewer

A lightweight, three.js powered, browser-based visualizer for OpenSimulationInterface (.osi) ground-truth data. Load OSI files directly and explore 3D scene data with an interactive tree view.

## Website

Visit the deployed version at: **[placeholder: https://osithree.pages.dev](https://osithree.pages.dev)**

## Getting Started

### Build from Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/SimonLundell/osithree.git
   cd osi-viewer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Development server** (hot reload)
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` (normally) in your browser

4. **Build for production**
   ```bash
   npm run build
   ```
   Output goes to `dist/` folder

5. **Run tests**
   ```bash
   npm test
   ```

## Usage

- Click **Load** to select an OSI file (`.osi` format)
- Explore the scene hierarchy in the left sidebar
- Rotate/zoom the 3D view with your mouse
- Use dat.GUI controls to adjust visualization settings

## Features

- 📦 Decode protobuf-based OSI messages
- 🎯 Interactive 3D visualization with Three.js
- 🌳 Hierarchical tree view of scene data
- ⚡ Fast, no backend required, no data stored
- 🧪 Tested with Vitest (rudimentary)

## Generate .osi files
This project was built using .osi files generated from [esmini](https://github.com/esmini/esmini)

## Disclaimers
- This is a hobby project
- Tested mostly on Windows using firefox browser
- Only tested with osi version 3.5.0
- Visualizes osi ground-truth only (for now)
- Supports single channel .osi format (not .mcap)
- Lots of stuff supported, but not everything 

## License

This project is licensed under the **Mozilla Public License 2.0** (MPL-2.0). See [LICENSE](LICENSE) file for details.

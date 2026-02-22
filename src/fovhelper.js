import * as THREE from 'three';

export class FOVHelper extends THREE.Object3D {
  constructor({
    fov = 60,      // degrees
    range = 10,    // how far the lines go
    color = 0x00ff00
  } = {}) {
    super();

    this.fov = fov;
    this.range = range;

    const material = new THREE.LineBasicMaterial({ color });

    const geometry = new THREE.BufferGeometry();
    this._buildGeometry(geometry);

    this.lines = new THREE.LineSegments(geometry, material);
    this.add(this.lines);
  }

  _buildGeometry(geometry) {
    const halfFovRad = THREE.MathUtils.degToRad(this.fov / 2);

    const leftDir = new THREE.Vector3(
      Math.sin(-halfFovRad),
      0,
      Math.cos(-halfFovRad)
    ).multiplyScalar(this.range);

    const rightDir = new THREE.Vector3(
      Math.sin(halfFovRad),
      0,
      Math.cos(halfFovRad)
    ).multiplyScalar(this.range);

    const vertices = new Float32Array([
      0, 0, 0,   leftDir.x,  leftDir.y,  leftDir.z,
      0, 0, 0,   rightDir.x, rightDir.y, rightDir.z
    ]);

    // const farLeft = leftDir.clone();
    // const farRight = rightDir.clone();

    // vertices.push(
    // farLeft.x, farLeft.y, farLeft.z,
    // farRight.x, farRight.y, farRight.z
    // );

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  }
}

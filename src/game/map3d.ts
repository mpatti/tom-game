import * as THREE from 'three';
import { MAP_DATA } from './map';
import { MAP_COLS, MAP_ROWS, WALL_HEIGHT, COLORS } from './constants';

export function buildMapScene(scene: THREE.Scene): void {
  // --- Ground plane ---
  const floorGeo = new THREE.PlaneGeometry(MAP_COLS, MAP_ROWS);
  const floorMat = new THREE.MeshLambertMaterial({ color: COLORS.floor });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(MAP_COLS / 2, 0, MAP_ROWS / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Ceiling ---
  const ceilingGeo = new THREE.PlaneGeometry(MAP_COLS, MAP_ROWS);
  const ceilingMat = new THREE.MeshLambertMaterial({ color: '#1a1a2e' });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(MAP_COLS / 2, WALL_HEIGHT, MAP_ROWS / 2);
  scene.add(ceiling);

  // --- Walls (instanced mesh for performance) ---
  let wallCount = 0;
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (MAP_DATA[row]?.[col] === 1) wallCount++;
    }
  }

  const wallGeo = new THREE.BoxGeometry(1, WALL_HEIGHT, 1);
  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.wall });
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
  walls.receiveShadow = true;
  walls.castShadow = true;

  const matrix = new THREE.Matrix4();
  let idx = 0;
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (MAP_DATA[row]?.[col] !== 1) continue;
      matrix.setPosition(col + 0.5, WALL_HEIGHT / 2, row + 0.5);
      walls.setMatrixAt(idx, matrix);
      idx++;
    }
  }
  walls.instanceMatrix.needsUpdate = true;
  scene.add(walls);

  // --- Base zones (semi-transparent colored planes) ---
  const blueBaseTiles: { col: number; row: number }[] = [];
  const redBaseTiles: { col: number; row: number }[] = [];

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (MAP_DATA[row]?.[col] === 2) blueBaseTiles.push({ col, row });
      if (MAP_DATA[row]?.[col] === 3) redBaseTiles.push({ col, row });
    }
  }

  // Create individual base tile planes
  const basePlaneGeo = new THREE.PlaneGeometry(1, 1);

  const blueMat = new THREE.MeshBasicMaterial({
    color: COLORS.blue.primary,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  for (const tile of blueBaseTiles) {
    const plane = new THREE.Mesh(basePlaneGeo, blueMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(tile.col + 0.5, 0.02, tile.row + 0.5);
    scene.add(plane);
  }

  const redMat = new THREE.MeshBasicMaterial({
    color: COLORS.red.primary,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  for (const tile of redBaseTiles) {
    const plane = new THREE.Mesh(basePlaneGeo, redMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(tile.col + 0.5, 0.02, tile.row + 0.5);
    scene.add(plane);
  }

  // --- Lighting ---
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 0.6);
  directional.position.set(MAP_COLS / 2, WALL_HEIGHT * 2, MAP_ROWS / 2);
  directional.target.position.set(MAP_COLS / 2, 0, MAP_ROWS / 2);
  scene.add(directional);
  scene.add(directional.target);

  // --- Fog ---
  scene.fog = new THREE.Fog(0x111122, 12, 35);
  scene.background = new THREE.Color(0x111122);
}

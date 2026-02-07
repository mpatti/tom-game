import * as THREE from 'three';
import { GameState, Player, PowerUp, Team } from './types';
import { buildMapScene } from './map3d';
import { Camera3D } from './camera3d';
import {
  COLORS, PLAYER_BODY_RADIUS,
  FOV,
} from './constants';

// Helper: create canvas texture for name labels
function createNameTexture(name: string, teamColor: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 32px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = teamColor;
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface PlayerMesh {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  label: THREE.Sprite;
  shield: THREE.Mesh;
  team: Team;
  name: string;
}

interface FlagMesh {
  group: THREE.Group;
  pole: THREE.Mesh;
  cloth: THREE.Mesh;
  team: Team;
}

interface PowerUpMesh {
  group: THREE.Group;
  shape: THREE.Mesh;
  id: string;
}

const BULLET_POOL_SIZE = 50;

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;

  // Entity pools
  private playerMeshes: Map<string, PlayerMesh> = new Map();
  private flagMeshes: Map<string, FlagMesh> = new Map();
  private bulletMeshes: THREE.Mesh[] = [];
  private bulletMaterials: { blue: THREE.MeshBasicMaterial; red: THREE.MeshBasicMaterial };
  private powerUpMeshes: Map<string, PowerUpMesh> = new Map();

  // Shared geometries
  private bodyGeo: THREE.CylinderGeometry;
  private headGeo: THREE.SphereGeometry;
  private bulletGeo: THREE.SphereGeometry;
  private shieldGeo: THREE.SphereGeometry;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      FOV,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );

    this.scene = new THREE.Scene();
    buildMapScene(this.scene);

    // Shared geometries
    this.bodyGeo = new THREE.CylinderGeometry(PLAYER_BODY_RADIUS, PLAYER_BODY_RADIUS, 1.2, 8);
    this.headGeo = new THREE.SphereGeometry(0.2, 8, 6);
    this.bulletGeo = new THREE.SphereGeometry(0.08, 6, 4);
    this.shieldGeo = new THREE.SphereGeometry(0.6, 12, 8);

    // Bullet materials
    this.bulletMaterials = {
      blue: new THREE.MeshBasicMaterial({ color: COLORS.blue.light }),
      red: new THREE.MeshBasicMaterial({ color: COLORS.red.light }),
    };

    // Pre-allocate bullet pool
    for (let i = 0; i < BULLET_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMaterials.blue);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bulletMeshes.push(mesh);
    }

    // Pre-create flag meshes
    this._createFlagMesh('blue');
    this._createFlagMesh('red');
  }

  private _createFlagMesh(team: Team): void {
    const group = new THREE.Group();
    const color = team === 'blue' ? COLORS.blue.flag : COLORS.red.flag;

    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: '#aaaaaa' });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.0;
    group.add(pole);

    // Cloth
    const clothGeo = new THREE.BoxGeometry(0.6, 0.4, 0.05);
    const clothMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.position.set(0.3, 1.6, 0);
    group.add(cloth);

    this.scene.add(group);
    this.flagMeshes.set(team, { group, pole, cloth, team });
  }

  private _getOrCreatePlayerMesh(id: string, player: Player): PlayerMesh {
    let pm = this.playerMeshes.get(id);
    if (pm) return pm;

    const color = player.team === 'blue' ? COLORS.blue.primary : COLORS.red.primary;
    const group = new THREE.Group();

    // Body cylinder
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(this.bodyGeo, bodyMat);
    body.position.y = 0.6;
    group.add(body);

    // Head sphere
    const headMat = new THREE.MeshLambertMaterial({ color });
    const head = new THREE.Mesh(this.headGeo, headMat);
    head.position.y = 1.4;
    group.add(head);

    // Name label
    const labelTex = createNameTexture(player.name, color);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(2, 0.5, 1);
    label.position.y = 2.0;
    group.add(label);

    // Shield (hidden by default)
    const shieldMat = new THREE.MeshBasicMaterial({
      color: COLORS.shield,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const shield = new THREE.Mesh(this.shieldGeo, shieldMat);
    shield.position.y = 0.75;
    shield.visible = false;
    group.add(shield);

    this.scene.add(group);
    pm = { group, body, head, label, shield, team: player.team, name: player.name };
    this.playerMeshes.set(id, pm);
    return pm;
  }

  private _getOrCreatePowerUpMesh(pu: PowerUp): PowerUpMesh {
    let pm = this.powerUpMeshes.get(pu.id);
    if (pm) return pm;

    const group = new THREE.Group();
    let geo: THREE.BufferGeometry;
    let color: string;

    switch (pu.type) {
      case 'speed':
        geo = new THREE.OctahedronGeometry(0.3, 0);
        color = COLORS.speed;
        break;
      case 'shield':
        geo = new THREE.IcosahedronGeometry(0.3, 0);
        color = COLORS.shield;
        break;
      case 'dash_reset':
      default:
        geo = new THREE.DodecahedronGeometry(0.3, 0);
        color = COLORS.dashReset;
        break;
    }

    const mat = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.5 });
    const shape = new THREE.Mesh(geo!, mat);
    shape.position.y = 1.0;
    group.add(shape);

    this.scene.add(group);
    pm = { group, shape, id: pu.id };
    this.powerUpMeshes.set(pu.id, pm);
    return pm;
  }

  syncEntities(state: GameState, localPlayerId: string, time: number): void {
    // --- Players ---
    const activePlayerIds = new Set(Object.keys(state.players));

    // Remove old player meshes
    for (const [id, pm] of this.playerMeshes) {
      if (!activePlayerIds.has(id)) {
        this.scene.remove(pm.group);
        this.playerMeshes.delete(id);
      }
    }

    // Update/create player meshes
    for (const [id, player] of Object.entries(state.players)) {
      const pm = this._getOrCreatePlayerMesh(id, player);

      if (id === localPlayerId) {
        // Hide local player mesh (we're in first person)
        pm.group.visible = false;
        continue;
      }

      pm.group.visible = player.state !== 'dead';
      if (player.state === 'dead') continue;

      pm.group.position.set(player.x, 0, player.z);
      pm.group.rotation.y = player.yaw;

      // Shield visibility
      pm.shield.visible = player.shieldActive;
      if (player.shieldActive) {
        (pm.shield.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(time * 5) * 0.1;
      }

      // Speed boost visual: slightly brighter body
      if (player.speedBoostActive) {
        (pm.body.material as THREE.MeshLambertMaterial).emissive = new THREE.Color(COLORS.speed);
        (pm.body.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.3 + Math.sin(time * 8) * 0.15;
      } else {
        (pm.body.material as THREE.MeshLambertMaterial).emissive = new THREE.Color(0x000000);
        (pm.body.material as THREE.MeshLambertMaterial).emissiveIntensity = 0;
      }

      // Dash visual: slight lean
      if (player.isDashing) {
        pm.body.rotation.x = 0.3;
      } else {
        pm.body.rotation.x = 0;
      }
    }

    // --- Flags ---
    for (const flagTeam of ['blue', 'red'] as Team[]) {
      const flag = state.flags[flagTeam];
      const fm = this.flagMeshes.get(flagTeam);
      if (!fm) continue;

      fm.group.position.set(flag.x, 0, flag.z);

      // Bob animation
      const bob = Math.sin(time * 3 + (flagTeam === 'red' ? Math.PI : 0)) * 0.1;
      fm.cloth.position.y = 1.6 + bob;

      // If carried, hide flag (it follows the player)
      fm.group.visible = flag.carrierId === null;
    }

    // --- Bullets ---
    const projectiles = state.projectiles;
    for (let i = 0; i < BULLET_POOL_SIZE; i++) {
      const mesh = this.bulletMeshes[i];
      if (i < projectiles.length) {
        const b = projectiles[i];
        mesh.visible = true;
        mesh.position.set(b.x, b.y, b.z);
        mesh.material = b.team === 'blue' ? this.bulletMaterials.blue : this.bulletMaterials.red;
      } else {
        mesh.visible = false;
      }
    }

    // --- PowerUps ---
    const activePuIds = new Set(state.powerUps.filter(p => p.active).map(p => p.id));

    // Remove old
    for (const [id, pm] of this.powerUpMeshes) {
      if (!activePuIds.has(id)) {
        this.scene.remove(pm.group);
        this.powerUpMeshes.delete(id);
      }
    }

    // Update/create
    for (const pu of state.powerUps) {
      if (!pu.active) continue;
      const pm = this._getOrCreatePowerUpMesh(pu);
      pm.group.position.set(pu.x, 0, pu.z);
      // Rotate
      pm.shape.rotation.y = time * 2;
      pm.shape.rotation.x = Math.sin(time * 1.5) * 0.3;
      // Bob
      pm.shape.position.y = 1.0 + Math.sin(time * 2 + pu.x) * 0.2;
    }
  }

  render(camera3d: Camera3D): void {
    camera3d.applyToThreeCamera(this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  addToScene(obj: THREE.Object3D): void {
    this.scene.add(obj);
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose(): void {
    // Clean up all meshes
    for (const [, pm] of this.playerMeshes) {
      this.scene.remove(pm.group);
    }
    for (const [, fm] of this.flagMeshes) {
      this.scene.remove(fm.group);
    }
    for (const mesh of this.bulletMeshes) {
      this.scene.remove(mesh);
    }
    for (const [, pm] of this.powerUpMeshes) {
      this.scene.remove(pm.group);
    }
    this.playerMeshes.clear();
    this.flagMeshes.clear();
    this.powerUpMeshes.clear();
    this.bulletMeshes = [];

    this.bodyGeo.dispose();
    this.headGeo.dispose();
    this.bulletGeo.dispose();
    this.shieldGeo.dispose();
    this.bulletMaterials.blue.dispose();
    this.bulletMaterials.red.dispose();

    this.renderer.dispose();
  }
}

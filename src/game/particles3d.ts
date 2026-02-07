import * as THREE from 'three';

const MAX_PARTICLES = 500;

interface ParticleData {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
}

// Parse hex color to r,g,b (0-1)
function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
}

export class ParticleSystem3D {
  private particles: ParticleData[];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;
  private aliveCount = 0;

  constructor() {
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1,
        r: 1, g: 1, b: 1,
      });
    }

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  private findFreeSlot(): number {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.particles[i].alive) return i;
    }
    // Overwrite oldest (index 0 area)
    return Math.floor(Math.random() * MAX_PARTICLES);
  }

  /** Radial burst emission */
  emit(x: number, y: number, z: number, count: number, color: string, speed: number = 3, life: number = 0.5): void {
    const { r, g, b } = hexToRGB(color);
    for (let i = 0; i < count; i++) {
      const idx = this.findFreeSlot();
      const p = this.particles[idx];
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      p.alive = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(theta) * Math.cos(phi) * spd;
      p.vy = Math.sin(phi) * spd * 0.5 + 1; // slight upward bias
      p.vz = Math.sin(theta) * Math.cos(phi) * spd;
      p.life = life * (0.7 + Math.random() * 0.3);
      p.maxLife = p.life;
      p.r = r;
      p.g = g;
      p.b = b;
    }
  }

  /** Cone direction emission */
  emitDirectional(x: number, y: number, z: number, dx: number, dy: number, dz: number, count: number, color: string, speed: number = 3): void {
    const { r, g, b } = hexToRGB(color);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) return;
    const ndx = dx / len;
    const ndy = dy / len;
    const ndz = dz / len;

    for (let i = 0; i < count; i++) {
      const idx = this.findFreeSlot();
      const p = this.particles[idx];
      const spread = 0.4;
      const sx = ndx + (Math.random() - 0.5) * spread;
      const sy = ndy + (Math.random() - 0.5) * spread;
      const sz = ndz + (Math.random() - 0.5) * spread;
      const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
      const spd = speed * (0.5 + Math.random() * 0.5);
      p.alive = true;
      p.x = x + (Math.random() - 0.5) * 0.2;
      p.y = y + (Math.random() - 0.5) * 0.2;
      p.z = z + (Math.random() - 0.5) * 0.2;
      p.vx = (sx / sLen) * spd;
      p.vy = (sy / sLen) * spd;
      p.vz = (sz / sLen) * spd;
      p.life = 0.3 + Math.random() * 0.2;
      p.maxLife = 0.5;
      p.r = r;
      p.g = g;
      p.b = b;
    }
  }

  /** Ring pattern emission on XZ plane at given height */
  emitRing(x: number, y: number, z: number, count: number, color: string, radius: number = 0.6): void {
    const { r, g, b } = hexToRGB(color);
    for (let i = 0; i < count; i++) {
      const idx = this.findFreeSlot();
      const p = this.particles[idx];
      const angle = (i / count) * Math.PI * 2;
      const spd = radius * 3;
      p.alive = true;
      p.x = x + Math.cos(angle) * radius * 0.3;
      p.y = y;
      p.z = z + Math.sin(angle) * radius * 0.3;
      p.vx = Math.cos(angle) * spd;
      p.vy = (Math.random() - 0.3) * 0.5;
      p.vz = Math.sin(angle) * spd;
      p.life = 0.4;
      p.maxLife = 0.4;
      p.r = r;
      p.g = g;
      p.b = b;
    }
  }

  update(dt: number): void {
    this.aliveCount = 0;
    const friction = 0.95;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        // Park off-screen
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = -100;
        this.positions[i * 3 + 2] = 0;
        this.colors[i * 3] = 0;
        this.colors[i * 3 + 1] = 0;
        this.colors[i * 3 + 2] = 0;
        this.sizes[i] = 0;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= friction;
      p.vy *= friction;
      p.vz *= friction;
      p.vy -= 2 * dt; // gravity
      p.life -= dt;

      if (p.life <= 0 || p.y < -1) {
        p.alive = false;
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = -100;
        this.positions[i * 3 + 2] = 0;
        this.sizes[i] = 0;
        continue;
      }

      const alpha = Math.max(0, p.life / p.maxLife);
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.colors[i * 3] = p.r * alpha;
      this.colors[i * 3 + 1] = p.g * alpha;
      this.colors[i * 3 + 2] = p.b * alpha;
      this.sizes[i] = 0.15 * alpha;
      this.aliveCount++;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  getObject(): THREE.Points {
    return this.points;
  }
}

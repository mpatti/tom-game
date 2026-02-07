import { Particle } from './types';

export class ParticleSystem {
  particles: Particle[] = [];

  emit(x: number, y: number, count: number, color: string, speed: number = 100, life: number = 0.5, size: number = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life,
        maxLife: life,
        color,
        size: size * (0.5 + Math.random() * 0.5),
      });
    }
  }

  emitDirectional(x: number, y: number, dirX: number, dirY: number, count: number, color: string, speed: number = 150) {
    for (let i = 0; i < count; i++) {
      const spread = 0.5;
      const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const spd = speed * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.5,
        color,
        size: 2 + Math.random() * 2,
      });
    }
  }

  emitRing(x: number, y: number, count: number, color: string, radius: number = 20) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(angle) * radius * 0.3,
        y: y + Math.sin(angle) * radius * 0.3,
        vx: Math.cos(angle) * radius * 3,
        vy: Math.sin(angle) * radius * 3,
        life: 0.4,
        maxLife: 0.4,
        color,
        size: 3,
      });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const screenX = p.x - cameraX;
      const screenY = p.y - cameraY;
      // Pixel-perfect rendering
      const size = Math.max(1, Math.floor(p.size * alpha));
      ctx.fillRect(Math.floor(screenX - size / 2), Math.floor(screenY - size / 2), size, size);
    }
    ctx.globalAlpha = 1;
  }
}

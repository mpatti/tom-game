import { MAP_WIDTH, MAP_HEIGHT } from './types';
import { SCREEN_SHAKE_DECAY } from './constants';

export class Camera {
  x = 0;
  y = 0;
  targetX = 0;
  targetY = 0;
  width: number;
  height: number;
  shakeX = 0;
  shakeY = 0;
  shakeIntensity = 0;
  smoothing = 0.08;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  follow(targetX: number, targetY: number) {
    this.targetX = targetX - this.width / 2;
    this.targetY = targetY - this.height / 2;
  }

  shake(intensity: number) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  update(dt: number) {
    // Smooth follow
    this.x += (this.targetX - this.x) * this.smoothing * (dt * 60);
    this.y += (this.targetY - this.y) * this.smoothing * (dt * 60);

    // Clamp to map bounds
    this.x = Math.max(0, Math.min(this.x, MAP_WIDTH - this.width));
    this.y = Math.max(0, Math.min(this.y, MAP_HEIGHT - this.height));

    // Screen shake
    if (this.shakeIntensity > 0.5) {
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= SCREEN_SHAKE_DECAY;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeIntensity = 0;
    }
  }

  get scrollX(): number {
    return Math.floor(this.x + this.shakeX);
  }

  get scrollY(): number {
    return Math.floor(this.y + this.shakeY);
  }
}

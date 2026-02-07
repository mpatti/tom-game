import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT, MOUSE_SENSITIVITY, SCREEN_SHAKE_DECAY } from './constants';

export class Camera3D {
  public yaw = 0;    // horizontal rotation (radians)
  public pitch = 0;  // vertical rotation (radians)
  public x = 0;
  public y = PLAYER_EYE_HEIGHT;
  public z = 0;

  // Screen shake
  private shakeIntensity = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;
  private shakeOffsetZ = 0;

  applyMouseDelta(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    // Clamp pitch so you can't look completely up or down
    this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
  }

  setPosition(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.y = PLAYER_EYE_HEIGHT;
  }

  shake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  update(dt: number): void {
    if (this.shakeIntensity > 0.01) {
      // Convert pixel-based shake to world units (roughly)
      const worldShake = this.shakeIntensity * 0.02;
      this.shakeOffsetX = (Math.random() - 0.5) * 2 * worldShake;
      this.shakeOffsetY = (Math.random() - 0.5) * 2 * worldShake;
      this.shakeOffsetZ = (Math.random() - 0.5) * 2 * worldShake;
      this.shakeIntensity *= SCREEN_SHAKE_DECAY;
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeOffsetZ = 0;
    }
  }

  applyToThreeCamera(camera: THREE.PerspectiveCamera): void {
    camera.position.set(
      this.x + this.shakeOffsetX,
      this.y + this.shakeOffsetY,
      this.z + this.shakeOffsetZ
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch, this.yaw, 0);
  }

  // Forward direction on floor plane (for WASD movement)
  getForwardXZ(): { x: number; z: number } {
    return {
      x: -Math.sin(this.yaw),
      z: -Math.cos(this.yaw),
    };
  }

  // Right direction on floor plane
  getRightXZ(): { x: number; z: number } {
    return {
      x: Math.cos(this.yaw),
      z: -Math.sin(this.yaw),
    };
  }

  // Full 3D aim direction (for shooting)
  getAimDirection(): { x: number; y: number; z: number } {
    const cosPitch = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cosPitch,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cosPitch,
    };
  }
}

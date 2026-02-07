import { InputState } from './types';

export class InputManager {
  private keys: Set<string> = new Set();
  private dashPressed = false;
  public state: InputState = { up: false, down: false, left: false, right: false, dash: false };
  private prevEncoded = 0;
  public onInputChange?: (encoded: number) => void;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Prevent scrolling for game keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'].includes(e.key)) {
      e.preventDefault();
    }
    this.keys.add(e.key.toLowerCase());
    if (e.key === ' ' && !this.dashPressed) {
      this.dashPressed = true;
    }
    this.update();
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    if (e.key === ' ') {
      this.dashPressed = false;
    }
    this.update();
  };

  private update() {
    const newState: InputState = {
      up: this.keys.has('w') || this.keys.has('arrowup'),
      down: this.keys.has('s') || this.keys.has('arrowdown'),
      left: this.keys.has('a') || this.keys.has('arrowleft'),
      right: this.keys.has('d') || this.keys.has('arrowright'),
      dash: this.dashPressed,
    };

    this.state = newState;

    // Encode and notify if changed
    const encoded = this.encode();
    if (encoded !== this.prevEncoded) {
      this.prevEncoded = encoded;
      this.onInputChange?.(encoded);
    }

    // Reset dash after sending (it's a one-shot)
    if (this.dashPressed) {
      this.dashPressed = false;
      this.state.dash = false;
    }
  }

  encode(): number {
    let v = 0;
    if (this.state.up) v |= 1;
    if (this.state.down) v |= 2;
    if (this.state.left) v |= 4;
    if (this.state.right) v |= 8;
    if (this.state.dash) v |= 16;
    return v;
  }

  static decode(v: number): InputState {
    return {
      up: (v & 1) !== 0,
      down: (v & 2) !== 0,
      left: (v & 4) !== 0,
      right: (v & 8) !== 0,
      dash: (v & 16) !== 0,
    };
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }
  }
}

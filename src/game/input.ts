import { InputState } from './types';

export class InputManager {
  private keys: Set<string> = new Set();
  private dashPressed = false;
  public state: InputState = { up: false, down: false, left: false, right: false, dash: false };
  private prevEncoded = 0;
  public onInputChange?: (encoded: number) => void;
  public onShoot?: () => void;

  // Mouse tracking (screen coordinates)
  public mouseScreenX = 0;
  public mouseScreenY = 0;
  private canvas: HTMLCanvasElement | null = null;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private contextMenuHandler: ((e: Event) => void) | null = null;

  // Chat toggle
  public onChatToggle?: () => void;
  private chatInputActive = false;

  setChatInputActive(active: boolean) {
    this.chatInputActive = active;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
    }
  }

  bindCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.mouseMoveHandler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseScreenX = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouseScreenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    };

    this.mouseDownHandler = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        e.preventDefault();
        this.onShoot?.();
      }
    };

    this.contextMenuHandler = (e: Event) => e.preventDefault();

    canvas.addEventListener('mousemove', this.mouseMoveHandler);
    canvas.addEventListener('mousedown', this.mouseDownHandler);
    canvas.addEventListener('contextmenu', this.contextMenuHandler);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Chat toggle on Enter
    if (e.key === 'Enter' && !this.chatInputActive) {
      e.preventDefault();
      this.onChatToggle?.();
      return;
    }

    // Don't handle game keys while chat is active
    if (this.chatInputActive) return;

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
    // Don't handle game keys while chat is active
    if (this.chatInputActive) return;

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
    if (this.canvas) {
      if (this.mouseMoveHandler) this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
      if (this.mouseDownHandler) this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
      if (this.contextMenuHandler) this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    }
    this.canvas = null;
  }
}

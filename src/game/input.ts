import { InputState } from './types';

export class InputManager {
  private keys: Set<string> = new Set();
  private dashPressed = false;
  public state: InputState = { up: false, down: false, left: false, right: false, dash: false, shoot: false };
  private prevEncoded = 0;
  public onInputChange?: (encoded: number) => void;

  // Pointer lock mouse deltas
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private _mouseHeld = false;
  private _pointerLocked = false;
  private canvas: HTMLCanvasElement | null = null;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private mouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private contextMenuHandler: ((e: Event) => void) | null = null;
  private pointerLockChangeHandler: (() => void) | null = null;

  // Callbacks
  public onPointerLockChange?: (locked: boolean) => void;
  public onChatToggle?: () => void;
  private chatInputActive = false;

  setChatInputActive(active: boolean) {
    this.chatInputActive = active;
    if (active) {
      this._mouseHeld = false;
    }
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
      if (this._pointerLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    };

    this.mouseDownHandler = (e: MouseEvent) => {
      if (e.button === 0) {
        e.preventDefault();
        if (!this._pointerLocked) {
          // Request pointer lock on first click
          canvas.requestPointerLock();
        } else {
          this._mouseHeld = true;
        }
      }
    };

    this.mouseUpHandler = (e: MouseEvent) => {
      if (e.button === 0) {
        this._mouseHeld = false;
      }
    };

    this.contextMenuHandler = (e: Event) => e.preventDefault();

    this.pointerLockChangeHandler = () => {
      this._pointerLocked = document.pointerLockElement === canvas;
      if (!this._pointerLocked) {
        this._mouseHeld = false;
      }
      this.onPointerLockChange?.(this._pointerLocked);
    };

    canvas.addEventListener('mousemove', this.mouseMoveHandler);
    canvas.addEventListener('mousedown', this.mouseDownHandler);
    window.addEventListener('mouseup', this.mouseUpHandler);
    canvas.addEventListener('contextmenu', this.contextMenuHandler);
    document.addEventListener('pointerlockchange', this.pointerLockChangeHandler);
  }

  /** Consume accumulated mouse movement deltas (resets to 0) */
  consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }

  /** Whether left mouse button is currently held (while pointer locked) */
  isMouseHeld(): boolean {
    return this._mouseHeld && this._pointerLocked;
  }

  /** Whether pointer is currently locked */
  isPointerLocked(): boolean {
    return this._pointerLocked;
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
      shoot: this._mouseHeld,
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
      shoot: false,
    };
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }
    if (this.mouseUpHandler) {
      window.removeEventListener('mouseup', this.mouseUpHandler);
    }
    if (this.canvas) {
      if (this.mouseMoveHandler) this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
      if (this.mouseDownHandler) this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
      if (this.contextMenuHandler) this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    }
    if (this.pointerLockChangeHandler) {
      document.removeEventListener('pointerlockchange', this.pointerLockChangeHandler);
    }
    // Exit pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.canvas = null;
  }
}

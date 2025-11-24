import { stdin } from "process";
import * as readline from "readline";

export type KeyboardEvent =
  | { type: "press-start" } // Right Option pressed
  | { type: "press-end" } // Right Option released
  | { type: "toggle-on" } // Shift + Right Option pressed (toggle on)
  | { type: "toggle-off" } // Shift + Right Option pressed again (toggle off)
  | { type: "cancel" }; // Escape pressed

export class KeyboardListener {
  private handlers: Set<(event: KeyboardEvent) => void> = new Set();
  private isToggled = false;
  private isRightOptionPressed = false;
  private isShiftPressed = false;

  start() {
    // Enable raw mode to capture individual keypresses
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding("utf8");

    // Set up readline interface
    readline.emitKeypressEvents(stdin);

    // Listen for keypress events
    stdin.on("keypress", (str, key) => {
      if (!key) return;

      // Handle Escape key
      if (key.name === "escape") {
        this.emit({ type: "cancel" });
        this.isToggled = false;
        this.isRightOptionPressed = false;
        this.isShiftPressed = false;
        return;
      }

      // Track shift state
      if (key.name === "shift") {
        this.isShiftPressed = true;
        return;
      }

      // Detect Right Option key (on macOS, this might come through as different key codes)
      // For macOS, Right Option is typically detected via key.sequence or key.name
      // We'll use a combination approach to detect it
      const isRightOption =
        key.name === "option" ||
        key.name === "alt" ||
        (key.ctrl === false && key.meta === true && key.shift === false);

      if (isRightOption) {
        this.isRightOptionPressed = true;

        // Check if Shift is also pressed
        if (this.isShiftPressed || key.shift) {
          // Toggle mode
          this.isToggled = !this.isToggled;
          if (this.isToggled) {
            this.emit({ type: "toggle-on" });
          } else {
            this.emit({ type: "toggle-off" });
          }
        } else {
          // Press-and-hold mode
          if (!this.isToggled) {
            this.emit({ type: "press-start" });
          }
        }
      }
    });

    // Listen for key release (this is trickier in raw mode)
    // We'll simulate it by checking when keys are released
    let lastKey: any = null;
    stdin.on("keypress", (str, key) => {
      if (!key) return;

      // Reset shift when any other key is pressed
      if (key.name !== "shift" && this.isShiftPressed) {
        this.isShiftPressed = false;
      }

      // Detect Right Option release (when another key is pressed after Right Option)
      if (lastKey && lastKey.meta && !key.meta && this.isRightOptionPressed) {
        this.isRightOptionPressed = false;
        if (!this.isToggled) {
          this.emit({ type: "press-end" });
        }
      }

      lastKey = key;
    });
  }

  stop() {
    stdin.pause();
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
  }

  on(handler: (event: KeyboardEvent) => void) {
    this.handlers.add(handler);
  }

  off(handler: (event: KeyboardEvent) => void) {
    this.handlers.delete(handler);
  }

  private emit(event: KeyboardEvent) {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

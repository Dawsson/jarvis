#!/usr/bin/env python3
"""
Global keyboard listener for Jarvis activation.
Listens for:
- Right Option: Press and hold to activate (releases when key is released)
- Shift + Right Option: Toggle mode (press once to activate, press again to deactivate)
- Escape: Cancel/stop listening
"""

import sys
from pynput import keyboard
from pynput.keyboard import Key, KeyCode

# Track key states
right_option_pressed = False
shift_pressed = False
toggled_on = False

def on_press(key):
    global right_option_pressed, shift_pressed, toggled_on

    # Track Shift key
    if key == Key.shift or key == Key.shift_r:
        shift_pressed = True
        return

    # Track Right Option key (Key.alt_r on macOS)
    if key == Key.alt_r:
        right_option_pressed = True

        # Check if Shift is also pressed
        if shift_pressed:
            # Toggle mode
            toggled_on = not toggled_on
            if toggled_on:
                print("TOGGLE_ON", flush=True)
            else:
                print("TOGGLE_OFF", flush=True)
        else:
            # Press-and-hold mode (only if not already toggled)
            if not toggled_on:
                print("PRESS_START", flush=True)
        return

    # Handle Escape key
    if key == Key.esc:
        print("CANCEL", flush=True)
        toggled_on = False
        right_option_pressed = False
        shift_pressed = False
        return

def on_release(key):
    global right_option_pressed, shift_pressed

    # Track Shift release
    if key == Key.shift or key == Key.shift_r:
        shift_pressed = False
        return

    # Track Right Option release
    if key == Key.alt_r:
        right_option_pressed = False
        # Only send PRESS_END if we're not in toggle mode
        if not toggled_on:
            print("PRESS_END", flush=True)
        return

if __name__ == "__main__":
    print("READY", flush=True)

    # Start listening for keyboard events
    with keyboard.Listener(on_press=on_press, on_release=on_release) as listener:
        listener.join()

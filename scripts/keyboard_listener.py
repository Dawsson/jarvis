#!/usr/bin/env python3
"""
Global keyboard listener for Jarvis activation.
Simple toggle mode: Press Right Option to start recording, press again to stop.
"""

import sys
from pynput import keyboard
from pynput.keyboard import Key

# Track recording state
is_recording = False

def on_press(key):
    global is_recording

    # Only respond to Right Option key (Key.alt_r on macOS)
    if key == Key.alt_r:
        # Toggle recording state
        is_recording = not is_recording

        if is_recording:
            print("TOGGLE_ON", flush=True)
        else:
            print("TOGGLE_OFF", flush=True)

def on_release(key):
    # We don't need to track key releases anymore
    pass

if __name__ == "__main__":
    print("READY", flush=True)

    # Start listening for keyboard events
    with keyboard.Listener(on_press=on_press, on_release=on_release) as listener:
        listener.join()

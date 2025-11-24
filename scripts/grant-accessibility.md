# Granting Accessibility Permissions for Keyboard Listener

The keyboard listener needs accessibility permissions to monitor global keyboard input on macOS.

**Note:** This is only required when using **Keyboard only** or **Both** activation modes. If you're using **Voice only** mode, you can skip this setup.

## Quick Fix: Grant Terminal Accessibility Access

1. Open **System Settings** (Apple menu → System Settings)
2. Go to **Privacy & Security** → **Accessibility**
3. Click the **+** button or **Edit** button
4. Find and add your Terminal app:
   - **Terminal.app**: `/Applications/Utilities/Terminal.app`
   - **iTerm2**: `/Applications/iTerm.app`
   - **VS Code integrated terminal**: `/Applications/Visual Studio Code.app`
5. Toggle the switch to **ON**
6. Restart the daemon with `bun run daemon`

## Alternative: Create Dedicated App (More Secure)

If you don't want to grant your entire Terminal accessibility permissions, you can create a dedicated app wrapper:

```bash
# Create app structure
mkdir -p ~/JarvisKeyboard.app/Contents/MacOS

# Create launcher script
cat > ~/JarvisKeyboard.app/Contents/MacOS/jarvis-keyboard << 'EOF'
#!/bin/bash
cd /Users/dawson/projects/jarvis
uvx --with pynput python3 scripts/keyboard_listener.py
EOF

chmod +x ~/JarvisKeyboard.app/Contents/MacOS/jarvis-keyboard

# Create Info.plist
cat > ~/JarvisKeyboard.app/Contents/Info.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>jarvis-keyboard</string>
    <key>CFBundleIdentifier</key>
    <string>com.jarvis.keyboard</string>
    <key>CFBundleName</key>
    <string>Jarvis Keyboard</string>
</dict>
</plist>
EOF

# Move to Applications
mv ~/JarvisKeyboard.app /Applications/
```

Then grant accessibility permissions to **JarvisKeyboard.app** instead of Terminal, and update the daemon to launch it.

## Verify Permissions

After granting permissions, you can verify by checking:
- System Settings → Privacy & Security → Accessibility
- Your terminal/app should be listed with the toggle ON

# Claude Code Sessions UI

## Overview
The Claude Code Sessions view provides a full-screen interface for monitoring and reviewing Claude Agent SDK sessions created by Jarvis.

## Features

### Full Screen Height
- The view uses `100vh` (full viewport height) to maximize screen real estate
- No wasted space - the interface adapts to your entire screen

### Scrollable Logs Area
The messages/logs area has been optimized for scrollability:

- **Full height utilization**: Messages panel uses `flex: 1` with proper `minHeight: 0` to enable flex-based scrolling
- **Auto-scroll**: New messages automatically scroll into view as they arrive
- **Custom scrollbars**: Sleek, minimal scrollbars with hover effects
  - Width: 8px
  - Track color: `#0a0a0a`
  - Thumb color: `#333` (hover: `#555`)

### Three Scrollable Sections

1. **Session List (Left Panel)**
   - Shows all sessions with status indicators
   - Scrollable when many sessions exist
   - Width: 350px

2. **Files List**
   - Shows modified/created files
   - Max height: 120px with overflow scroll
   - Separate scroll area for file changes

3. **Messages Stream (Main Panel)**
   - Full height, auto-scrolling message log
   - Shows all message types: assistant, user, result, system
   - Color-coded borders and icons
   - No artificial message limit - shows all messages

## Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  HEADER (Fixed)                                         │
│  - Title, session count, back button                    │
├──────────────┬──────────────────────────────────────────┤
│  Sessions    │  Session Detail                          │
│  List        │  ┌────────────────────────────────────┐  │
│  (Scroll)    │  │ Session Header (Fixed)             │  │
│              │  │ - Task, status, files, PR link     │  │
│  Session 1   │  ├────────────────────────────────────┤  │
│  Session 2   │  │ Files List (Scroll, max 120px)     │  │
│  Session 3   │  ├────────────────────────────────────┤  │
│  ...         │  │                                     │  │
│              │  │ Messages Stream                     │  │
│              │  │ (Full Height Scroll)                │  │
│              │  │                                     │  │
│              │  │ ┌─ Message 1 ───────────────────┐  │  │
│              │  │ │ 🤖 ASSISTANT                   │  │  │
│              │  │ │ Implementing feature...        │  │  │
│              │  │ └────────────────────────────────┘  │  │
│              │  │ ┌─ Message 2 ───────────────────┐  │  │
│              │  │ │ 📋 RESULT                      │  │  │
│              │  │ │ File created successfully      │  │  │
│              │  │ └────────────────────────────────┘  │  │
│              │  │ ...                                 │  │
│              │  │ (auto-scrolls to bottom)            │  │
│              │  └─────────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────┘
```

## Usage

### Accessing the View
1. When Claude sessions are active, a button appears on the home screen
2. Click "⚡ X ACTIVE SESSIONS" to view the sessions interface
3. Or navigate via voice command: "Show me the coding sessions"

### Navigation
- **Select session**: Click any session in the left panel
- **View messages**: Scroll through the full message history
- **View PR**: Click the PR link if a PR was created
- **Return home**: Click "← BACK TO HOME" button

### Message Types
- 🤖 **ASSISTANT**: Claude's thoughts and actions
- 👤 **USER**: Your input/commands
- 📋 **RESULT**: Tool execution results
- ⚙️ **SYSTEM**: System messages

### Status Indicators
- ⚡ **Active**: Session in progress (cyan)
- ✓ **Completed**: Session finished (green)
- ✗ **Error**: Session failed (red)

## Technical Details

### Key CSS Properties
```css
/* Critical for proper flex scrolling */
.message-container {
  flex: 1;
  min-height: 0;  /* Enables flex child to scroll */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
```

### Auto-scroll Implementation
```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [sessionMessages]);
```

## Future Enhancements
- [ ] Real-time syntax highlighting for code blocks
- [ ] Message filtering (by type, search)
- [ ] Export session logs
- [ ] Split view mode (sessions + home)
- [ ] Session replay/playback

<div align="center">

[![Русский](https://img.shields.io/badge/Язык-Русский-gray?style=for-the-badge)](README.md)
[![English](https://img.shields.io/badge/Language-English-4f46e5?style=for-the-badge)](README_EN.md)

# ⚡ Chromium AI Browser Bridge

> A seamless bridge between your daily Chromium-based browser (Chrome, Edge, Brave, Yandex, Opera) and your local AI coding assistant (**Google Antigravity**, **Claude Desktop**, **Cursor**, etc.) via the open **MCP (Model Context Protocol)** standard.

</div>

Allows your AI assistant to operate directly within your **real everyday browser session**: inspect open web pages, click buttons, submit forms, take screenshots, and switch between tabs — preserving all active logins, cookies, and session state without sterile headless browser workarounds.

---

## ✨ Features

- 🚀 **Real User Profile**: Full access to your existing browser state, authenticated accounts, and active tabs.
- ⚡ **Manifest V3**: Modern, secure background Service Worker with automatic reconnection and heartbeat keep-alive.
- 🔌 **Model Context Protocol (MCP)**: Native tool integration for Google Antigravity, Claude Desktop, Cursor, and any MCP-compliant agent.
- 🎯 **Ultra-Fast Semantic Parsing**: Native Blink text extraction and interactive element listing in milliseconds.
- 🔢 **Direct Element IDs**: Instant, zero-latency interactions by numeric ID (`browser_click("1")`, `browser_type("3", "text")`).
- 🟢 **Visual Feedback**: Real-time element highlighting on the webpage during AI interactions.
- 📸 **Viewport Screenshots**: Full-color PNG capture of the visible screen area.
- 💬 **Natural Commands**: Trigger effortlessly via `/browser` slash commands or phrases like *"in browser..."*.

---

## 🚀 Quick Start (2 Minutes)

### Step 1. Install Extension in Your Browser

1. Open your Chromium-based browser (Google Chrome, Edge, Brave, Yandex).
2. Navigate to your extensions page:
   - In Chrome: `chrome://extensions`
   - In Edge: `edge://extensions`
   - In Yandex Browser: `browser://tune` (or `chrome://extensions`)
3. Enable **"Developer mode"** in the top-right corner.
4. Click **"Load unpacked"** (Загрузить распакованное).
5. Select the **`extension`** folder from this repository.
6. The **AI Browser Bridge** icon will appear in your extension toolbar.

---

### Step 2. Launch Local Bridge Server

#### Windows:
Double-click **`start.bat`**.  
The script automatically verifies Python, installs requirements (`websockets`, `mcp`), and starts the bridge.

#### macOS / Linux:
Open a terminal in the project directory:
```bash
chmod +x start.sh
./start.sh
```

Once running, the extension badge in your browser will switch from red `OFF` to green **`ON`**.

---

## 🤖 Connect to AI Assistants (Antigravity / Claude / Cursor)

### 1. Configure MCP Server

To let your assistant launch the bridge automatically, add the following entry to your `mcp_config.json` (for Antigravity: `~/.gemini/config/mcp_config.json`):

```json
{
  "mcpServers": {
    "chromium-browser": {
      "command": "python",
      "args": [
        "ABSOLUTE_PATH_TO/server/bridge_server.py",
        "--mcp"
      ]
    }
  }
}
```
*(Replace `ABSOLUTE_PATH_TO` with the actual path to your repository on your machine)*

---

### 2. Configure `/browser` Command & Natural Triggers

A ready-to-use **Skill** is included:

1. Copy the skill to your global Antigravity skills directory:
   ```bash
   cp -r skills/browser-bridge ~/.gemini/config/skills/browser-bridge
   ```
2. Now interact naturally in chat:
   - `/browser open github.com`
   - *"Check my browser and summarize what's on the screen"*
   - *"Click the 'Play' button in my browser"*
   - *"Type 'search query' into the search bar and press Enter"*

---

## 🛠 Available Tools (MCP)

| Tool | Description |
| :--- | :--- |
| `browser_get_active_tab` | Returns URL, title, and tab ID of the current active tab |
| `browser_read_page` | Returns compact page summary and indexed element list `[1]`, `[2]`, `[3]` |
| `browser_click` | Clicks an element by numeric ID (`"1"`), button text, or CSS selector |
| `browser_type` | Inputs text into a field by numeric ID or selector, supports auto-submit |
| `browser_open_tab` | Opens a new URL in a new browser tab |
| `browser_list_tabs` | Lists all open tabs across browser windows |
| `browser_switch_tab` | Switches active focus to a tab by ID |
| `browser_close_tab` | Closes active or specified tab |
| `browser_scroll` | Scrolls page (`down`, `up`, `top`, `bottom`) or to a specific element |
| `browser_screenshot` | Captures visible screen area as a PNG DataURL |

---

## 📁 Repository Structure

```
chromium-ai-bridge/
├── extension/                  # Chromium Browser Extension (Manifest V3)
│   ├── manifest.json           # Extension manifest
│   ├── background.js           # Background Service Worker + WebSocket client
│   ├── content.js              # In-page automation (DOM inspection, clicks, typing)
│   ├── popup.html / css / js   # Extension status popup (green/red indicators)
│   └── icons/                  # High-res icons (16, 48, 128 px)
├── server/                     # Local bridge server
│   ├── bridge_server.py        # WebSocket server + MCP stdio protocol
│   ├── client.py               # Lightweight CLI client for scripts
│   └── requirements.txt        # Minimal dependencies (websockets, mcp)
├── skills/browser-bridge/      # Agent skill definition
│   └── SKILL.md                # Activation rules and guidelines
├── start.bat                   # 1-click Windows launcher
├── start.sh                    # 1-click Linux / macOS launcher
├── mcp_config.json             # Configuration template
├── LICENSE                     # MIT License
└── README.md                   # Documentation
```

---

## 📄 License

Distributed under the [MIT](LICENSE) License. Free for commercial, personal, and educational use.

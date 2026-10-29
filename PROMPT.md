# 🚀 One-Click AI Setup Prompt

Copy and paste the text below into your AI coding assistant (**Google Antigravity**, **Cursor**, **Claude Desktop / Code**, **Windsurf**, etc.). Your assistant will clone the repository, configure everything automatically, and ask how you want to run the server.

---

```text
Please clone the repository https://github.com/ManyHere/chromium-ai-bridge and configure everything automatically on my machine:

1. Clone the repository into my workspace:
   git clone https://github.com/ManyHere/chromium-ai-bridge.git

2. Install Python dependencies:
   pip install -r chromium-ai-bridge/server/requirements.txt

3. Register the MCP server in my assistant's configuration file:
   - For Google Antigravity: Add "chromium-browser" to ~/.gemini/config/mcp_config.json:
     {
       "mcpServers": {
         "chromium-browser": {
           "command": "python",
           "args": ["<FULL_ABSOLUTE_PATH>/chromium-ai-bridge/server/bridge_server.py", "--mcp"]
         }
       }
     }
   - For Claude Desktop or Cursor: Add the equivalent MCP server configuration to claude_desktop_config.json or mcpSettings.json.

4. Set up the browser automation skill:
   Copy chromium-ai-bridge/skills/browser-bridge into ~/.gemini/config/skills/browser-bridge (or configure a rule to handle "/browser" commands and phrases like "in browser").

5. Give me a clear 1-step instruction to load the unpacked extension in chrome://extensions from the "extension" folder.

6. Ask me:
   "Would you like me to start the bridge server in the background for you right now, or would you prefer to launch it yourself using start.bat / ./start.sh?"
```

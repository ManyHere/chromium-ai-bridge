# 🤖 Готовый промпт для настройки нейросетью (AI One-Click Setup Prompt)

> Скопируйте и отправьте текст ниже вашему AI-ассистенту (**Google Antigravity**, **Cursor**, **Claude Code**, **Windsurf** и др.), открыв папку с этим проектом. Ассистент сам всё настроит, пропишет пути в конфигурациях и проверит готовность.

---

## 🇷🇺 Промпт на русском языке (для вставки в чат с AI)

```text
Привет! Настрой, пожалуйста, проект Chromium AI Browser Bridge на моём компьютере:

1. Определи абсолютный путь к этой папке репозитория на моей системе.
2. Установи необходимые библиотеки из файла server/requirements.txt (команда: pip install -r server/requirements.txt).
3. Добавь MCP-сервер в конфигурационный файл моего ассистента:
   - Если это Google Antigravity: добавь сервер "chromium-browser" в файл ~/.gemini/config/mcp_config.json:
     command: "python", args: ["<ПОЛНЫЙ_ПУТЬ>/server/bridge_server.py", "--mcp"]
   - Если это Claude Desktop или Cursor: добавь аналогичный блок в mcpSettings.json / claude_desktop_config.json.
4. Скопируй навык skills/browser-bridge в глобальную папку навыков (~/.gemini/config/skills/browser-bridge) или настрой правило, чтобы ты автоматически обращался к инструментам browser_* по команде /browser или фразам "в браузере", "посмотри на страницу".
5. Убедись, что всё настроено без ошибок, и напиши мне короткое подтверждение и напоминание: открыть chrome://extensions, включить «Режим разработчика», нажать «Загрузить распакованное» и выбрать подпапку "extension".
```

---

## 🇬🇧 Prompt in English (Copy & paste to your AI agent)

```text
Hi! Please configure and set up this Chromium AI Browser Bridge on my computer:

1. Detect the absolute path to this repository on my operating system.
2. Install Python dependencies from server/requirements.txt (run: pip install -r server/requirements.txt).
3. Register the MCP server in my AI assistant's configuration file:
   - For Google Antigravity: add "chromium-browser" into ~/.gemini/config/mcp_config.json:
     command: "python", args: ["<ABSOLUTE_PATH>/server/bridge_server.py", "--mcp"]
   - For Claude Desktop or Cursor: add the equivalent entry in claude_desktop_config.json or mcpSettings.json.
4. Copy skills/browser-bridge into the global skills directory (~/.gemini/config/skills/browser-bridge) or configure a rule so you automatically invoke browser_* tools on "/browser" commands or phrases like "in browser".
5. Verify that everything is configured without errors and provide me with a brief 1-step reminder: open chrome://extensions, enable Developer Mode, click "Load unpacked", and select the "extension" folder.
```

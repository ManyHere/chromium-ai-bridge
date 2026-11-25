<div align="center">

[![Language](https://img.shields.io/badge/Language-1f2937?style=for-the-badge)](#)  [![Russian](https://img.shields.io/badge/Russian-4f46e5?style=for-the-badge)](README.md)  [![English](https://img.shields.io/badge/English-6b7280?style=for-the-badge)](README_EN.md)

# ⚡ Chromium AI Browser Bridge

[![ManyHere/chromium-ai-bridge MCP server](https://glama.ai/mcp/servers/ManyHere/chromium-ai-bridge/badges/score.svg)](https://glama.ai/mcp/servers/ManyHere/chromium-ai-bridge)

> Мост между вашим браузером на движке Chromium (Chrome, Edge, Brave, Яндекс Браузер, Opera) и локальным AI-ассистентом (**Google Antigravity**, **Claude Desktop**, **Cursor** и др.) через открытый протокол **MCP (Model Context Protocol)**.

</div>

Позволяет вашему AI-ассистенту работать прямо в вашем **реальном рабочем браузере**: читать открытые страницы, нажимать на кнопки, заполнять формы, делать скриншоты и переключаться между вкладками — без необходимости повторной авторизации и использования безликих headless-браузеров.

---

## ✨ Возможности

- 🚀 **Работа в реальном профиле**: доступ ко всем вашим авторизованным сессиям, вкладкам и сохранённым данным.
- ⚡ **Manifest V3**: современная и безопасная архитектура расширения с автопереподключением и фоновым keep-alive.
- 🔌 **Поддержка MCP (Model Context Protocol)**: стандартная интеграция со всеми современными AI-агентами.
- 🎯 **Умное чтение DOM**: извлечение очищенного текста и интерактивных элементов (кнопки, ссылки, поля ввода) без визуального шума.
- 🟢 **Визуальный отклик**: подсветка элементов на странице зеленым/синим цветом в момент клика или ввода текста агентом.
- 📸 **Скриншоты**: возможность снятия снимка видимой области страницы.
- 💬 **Ключевые фразы и команды**: запуск по фразам *"в браузере"*, *"посмотри на страницу"* или по команде `/browser`.

---

## 🚀 Быстрый старт (за 2 минуты)

> 💡 **Автонастройка через AI:**  
> Если вы настраиваете проект через AI-ассистента (Antigravity, Cursor, Claude), просто скопируйте текст из файла **[`PROMPT.md`](PROMPT.md)** и отправьте ассистенту в чат — он сам пропишет пути и всё настроит!

### Шаг 1. Установка расширения в браузер

1. Откройте любой браузер на базе Chromium (Google Chrome, Яндекс, Microsoft Edge, Brave).
2. Перейдите по адресу:
   - В Chrome: `chrome://extensions`
   - В Яндекс Браузере: `browser://tune` (или `chrome://extensions`)
   - В Edge: `edge://extensions`
3. Включите переключатель **«Режим разработчика»** (Developer mode) в правом верхнем углу.
4. Нажмите кнопку **«Загрузить распакованное расширение»** (Load unpacked).
5. Выберите папку `extension` из этого репозитория.
6. *Готово!* В панели расширений появится иконка **AI Browser Bridge**.

---

### Шаг 2. Запуск локального сервера-моста

#### Windows:
Просто дважды кликните по файлу **`start.bat`**.  
Скрипт сам проверит Python, при необходимости доустановит зависимости (`websockets`, `mcp`) и запустит мост.

#### macOS / Linux:
Откройте терминал в папке проекта и выполните:
```bash
chmod +x start.sh
./start.sh
```

После запуска значок расширения в браузере сменится с красного `OFF` на зелёный **`ON`**.

---

## 🤖 Подключение к AI-агенту (Antigravity / Claude / Cursor)

### 1. Настройка MCP сервера

Чтобы ассистент запускал сервер автоматически при старте и получал доступ к инструментам, добавьте в ваш конфигурационный файл `mcp_config.json` (для Antigravity: `~/.gemini/config/mcp_config.json`):

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
*(Замените путь на фактический путь к файлу `bridge_server.py` на вашем компьютере)*

---

### 2. Настройка ключевой команды `/browser` и триггеров

Чтобы агент понимал, когда нужно обращаться к браузеру, используется готовый **Skill (Навык)**:

1. Скопируйте папку `skills/browser-bridge` в вашу глобальную папку навыков Antigravity:
   ```powershell
   Copy-Item -Recurse "skills\browser-bridge" "$HOME\.gemini\config\skills\browser-bridge"
   ```
2. Теперь вы можете просто писать в чате:
   - `/browser перейди на github.com`
   - *"Посмотри в браузере, что написано на текущей странице"*
   - *"Кликни по кнопке 'Войти' в браузере"*
   - *"Введи в поле поиска 'купить ноутбук' и нажми Enter"*

---

## 🛠 Доступные инструменты (MCP Tools)

| Инструмент | Описание |
| :--- | :--- |
| `browser_read_page` | Читает страницу: сжатый текст + список элементов `[1]`, `[2]` (с приоритетом модальных окон и Shadow DOM) |
| `browser_click` | Кликает по элементу по номеру `[1]`, тексту кнопки или CSS-селектору |
| `browser_type` | Вводит текст в `<input>`, `<textarea>` и `contenteditable` (с поддержкой React/Vue и Enter) |
| `browser_press_key` | Нажимает клавиши клавиатуры (`Escape`, `Enter`, `Tab`, стрелки и др.) |
| `browser_select_option` | Выбирает пункт в выпадающем списке `<select>` |
| `browser_open_tab` / `browser_navigate` | Открывает новую вкладку или переходит по URL в текущей с автоожиданием загрузки |
| `browser_reload` / `browser_go_back` / `browser_go_forward` | Перезагружает вкладку и управляет историей переходов |
| `browser_get_active_tab` / `browser_list_tabs` | Возвращает активную вкладку или список всех вкладок |
| `browser_switch_tab` / `browser_close_tab` | Переключает фокус на вкладку или закрывает её |
| `browser_scroll` | Прокручивает страницу (`down`, `up`, `top`, `bottom`) или к указанному элементу |
| `browser_download_file` | Скачивает файл по URL через авторизованную сессию браузера прямо на диск |
| `browser_screenshot` | Резервный визуальный режим: делает PNG-скриншот экрана и передаёт изображение ИИ |
| `browser_eval_js` | Выполняет JavaScript в контексте страницы (`MAIN` world) |

---

## 📁 Структура проекта

```
chromium-ai-bridge/
├── extension/                  # Браузерное расширение (Manifest V3)
│   ├── manifest.json           # Манифест расширения
│   ├── background.js           # Фоновый воркер + WebSocket клиент
│   ├── content.js              # Скрипт взаимодействия со страницами (DOM, клики, ввод)
│   ├── popup.html              # Всплывающее окно статуса подключения
│   ├── popup.css               # Стили всплывающего окна
│   ├── popup.js                # Логика всплывающего окна
│   └── icons/                  # Иконки (16x16, 48x48, 128x128)
├── server/                     # Локальный сервер
│   ├── bridge_server.py        # Сервер WebSocket + MCP (JSON-RPC)
│   ├── client.py               # Быстрый CLI клиент для скриптов
│   └── requirements.txt        # Зависимости (websockets, mcp)
├── skills/                     # Навык для AI-агента
│   └── browser-bridge/
│       └── SKILL.md            # Инструкции активации по /browser и ключевым словам
├── start.bat                   # Быстрый запуск для Windows в 1 клик
├── start.sh                    # Быстрый запуск для Linux / macOS
├── mcp_config.json             # Шаблон конфигурации для AI-ассистентов
├── LICENSE                     # Лицензия MIT
└── README.md                   # Документация проекта
```

---

## 📄 Лицензия

Распространяется под лицензией [MIT](LICENSE). Вы можете свободно модифицировать, использовать и распространять данный проект.

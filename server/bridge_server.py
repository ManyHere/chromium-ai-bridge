#!/usr/bin/env python3
"""
Antigravity AI Chromium Bridge Server (v1.1)
Связывает локального AI-ассистента с расширением браузера Chromium по WebSocket.
Поддерживает Standalone режим (start.bat / start.sh), CLI запросы и MCP режим.
"""

import os
import re
import sys
import json
import uuid
import base64
import socket
import asyncio
import logging
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any

import websockets

try:
    from mcp.server.mcpserver import MCPServer, Image
except ImportError:
    from mcp.server.fastmcp import FastMCP as MCPServer, Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger("browser_bridge")

WS_HOST = "127.0.0.1"
WS_PORT = 8785
MAX_WS_SIZE = 50 * 1024 * 1024  # 50 МБ для скриншотов высокого разрешения и файлов

# Разрешаем только локальные клиенты без Origin (Python/MCP) и браузерные расширения.
# Любые обычные веб-сайты (http:// / https://) отсекаются на этапе рукопожатия (0 мс накладных расходов на пакеты).
ALLOWED_ORIGINS = [
    None,
    re.compile(r"^(chrome-extension|moz-extension|safari-web-extension)://.*"),
]

# Глобальное состояние сервера
active_browser_ws: Any = None
pending_requests: Dict[str, asyncio.Future] = {}
external_mode = False  # True если сервер уже был запущен снаружи (start.bat)

mcp = MCPServer("chromium-browser-bridge")


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Проверяет, занят ли порт."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


async def send_command_via_external_ws(action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 25.0) -> Any:
    """Отправляет команду через уже запущенный внешний WebSocket сервер (режим прокси-клиента)."""
    req_id = str(uuid.uuid4())
    payload = {
        "type": "command",
        "role": "client",
        "id": req_id,
        "action": action,
        "params": params or {}
    }
    uri = f"ws://{WS_HOST}:{WS_PORT}"
    async with websockets.connect(uri, max_size=MAX_WS_SIZE) as ws:
        await ws.send(json.dumps(payload))
        while True:
            resp_raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            msg = json.loads(resp_raw)
            if msg.get("id") == req_id:
                if msg.get("status") == "success":
                    return msg.get("data")
                raise RuntimeError(msg.get("error") or "Неизвестная ошибка расширения")


async def send_command_internal(action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 25.0) -> Any:
    """Отправляет команду расширению напрямую (если текущий процесс является WebSocket сервером)."""
    global active_browser_ws, pending_requests

    if active_browser_ws is None:
        raise RuntimeError(
            "Расширение Chromium не подключено к мосту. "
            "Откройте браузер и убедитесь, что расширение AI Browser Bridge включено (значок ON)."
        )

    req_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    pending_requests[req_id] = future

    payload = {
        "id": req_id,
        "action": action,
        "params": params or {}
    }

    try:
        await active_browser_ws.send(json.dumps(payload))
        logger.info(f"Отправлена команда {action} (id={req_id[:8]}...)")
        return await asyncio.wait_for(future, timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError(f"Превышено время ожидания ответа от браузера ({timeout} сек)")
    finally:
        pending_requests.pop(req_id, None)


async def send_command_to_extension(action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 25.0) -> Any:
    """Универсальная отправка команды (автоматически выбирает внутренний или внешний канал)."""
    if external_mode:
        return await send_command_via_external_ws(action, params, timeout)
    return await send_command_internal(action, params, timeout)


# -------------------------------------------------------------
# MCP Инструменты для агента
# -------------------------------------------------------------

@mcp.tool()
async def browser_get_active_tab() -> str:
    """Получить заголовок, URL, ID и статус текущей активной вкладки в браузере."""
    try:
        data = await send_command_to_extension("get_active_tab")
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_list_tabs() -> str:
    """Получить список всех открытых вкладок браузера (ID, заголовок, URL, активна ли)."""
    try:
        data = await send_command_to_extension("list_tabs")
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_switch_tab(tab_id: int) -> str:
    """Переключить фокус на указанную вкладку по её ID."""
    try:
        data = await send_command_to_extension("switch_tab", {"tab_id": tab_id})
        return f"Успешно переключено на вкладку: {data.get('title')} ({data.get('url')})"
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_open_tab(url: str, active: bool = True) -> str:
    """Открыть URL в новой вкладке браузера и дождаться её загрузки."""
    try:
        data = await send_command_to_extension("open_tab", {"url": url, "active": active})
        return f"Вкладка открыта: ID={data.get('id')}, Title='{data.get('title')}', URL={data.get('url')}"
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_navigate(url: str, tab_id: Optional[int] = None) -> str:
    """Перейти по указанному URL в текущей (или указанной по tab_id) вкладке и дождаться загрузки."""
    try:
        data = await send_command_to_extension("navigate", {"url": url, "tab_id": tab_id})
        return f"Переход выполнен: ID={data.get('id')}, Title='{data.get('title')}', URL={data.get('url')}"
    except Exception as e:
        return f"Ошибка навигации: {str(e)}"


@mcp.tool()
async def browser_reload(tab_id: Optional[int] = None) -> str:
    """Перезагрузить текущую (или указанную по tab_id) вкладку браузера."""
    try:
        data = await send_command_to_extension("reload_tab", {"tab_id": tab_id})
        return f"Вкладка перезагружена: ID={data.get('id')}, URL={data.get('url')}"
    except Exception as e:
        return f"Ошибка перезагрузки: {str(e)}"


@mcp.tool()
async def browser_go_back(tab_id: Optional[int] = None) -> str:
    """Вернуться на предыдущую страницу в истории вкладки (кнопка «Назад»)."""
    try:
        data = await send_command_to_extension("go_back", {"tab_id": tab_id})
        return f"Переход назад выполнен: Title='{data.get('title')}', URL={data.get('url')}"
    except Exception as e:
        return f"Ошибка перехода назад: {str(e)}"


@mcp.tool()
async def browser_go_forward(tab_id: Optional[int] = None) -> str:
    """Перейти вперёд в истории вкладки (кнопка «Вперёд»)."""
    try:
        data = await send_command_to_extension("go_forward", {"tab_id": tab_id})
        return f"Переход вперёд выполнен: Title='{data.get('title')}', URL={data.get('url')}"
    except Exception as e:
        return f"Ошибка перехода вперёд: {str(e)}"


@mcp.tool()
async def browser_close_tab(tab_id: Optional[int] = None) -> str:
    """Закрыть вкладку браузера (если tab_id не передан, закрывается текущая активная)."""
    try:
        data = await send_command_to_extension("close_tab", {"tab_id": tab_id})
        return f"Вкладка закрыта: ID={data.get('closed_tab_id')}"
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_read_page(tab_id: Optional[int] = None) -> str:
    """
    ОСНОВНОЙ БЫСТРЫЙ РЕЖИМ: Прочитать содержимое веб-страницы в ультра-компактном текстовом формате.
    Возвращает заголовок, URL, очищенный текст и пронумерованный список интерактивных элементов [1], [2]...
    Всегда используйте этот инструмент первым перед любыми действиями на странице!
    """
    try:
        data = await send_command_to_extension("read_page", {"tab_id": tab_id})
        if isinstance(data, dict) and "summary" in data:
            return data["summary"]
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка чтения страницы: {str(e)}"


@mcp.tool()
async def browser_click(selector: str, tab_id: Optional[int] = None) -> str:
    """
    Кликнуть по элементу на странице.
    Параметр selector может быть:
    - Числовым номером элемента из read_page: '1', '2', '[3]' (самый быстрый и точный способ!)
    - Текстом кнопки/ссылки ('Пауза', 'Войти', 'Submit')
    - CSS-селектором ('button.submit', '#btn')
    """
    try:
        data = await send_command_to_extension("click", {"selector": selector, "tab_id": tab_id})
        if isinstance(data, dict) and data.get("success"):
            return f"Успешный клик по: {data.get('clicked')}"
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка клика: {str(e)}"


@mcp.tool()
async def browser_type(
    selector: str,
    text: str,
    press_enter: bool = False,
    clear: bool = True,
    tab_id: Optional[int] = None
) -> str:
    """
    Ввести текст в поле ввода (<input>, <textarea> или contenteditable редактор, включая React/Next.js).
    :param selector: Числовой номер поля из read_page (например, '4') или CSS-селектор
    :param text: Текст для ввода
    :param press_enter: Нажать Enter после ввода (отправка формы / сообщения)
    :param clear: Очистить поле перед вводом
    """
    try:
        data = await send_command_to_extension("type", {
            "selector": selector,
            "text": text,
            "press_enter": press_enter,
            "clear": clear,
            "tab_id": tab_id
        })
        if isinstance(data, dict) and data.get("success"):
            return f"Введен текст '{data.get('typed')}' в поле {selector}"
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка ввода текста: {str(e)}"


@mcp.tool()
async def browser_press_key(key: str = "Enter", selector: Optional[str] = None, tab_id: Optional[int] = None) -> str:
    """
    Нажать клавишу клавиатуры на странице или конкретном элементе ('Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'Space').
    Удобно для закрытия всплывающих окон (key='Escape') и навигации по спискам.
    """
    try:
        data = await send_command_to_extension("press_key", {
            "key": key,
            "selector": selector,
            "tab_id": tab_id
        })
        if isinstance(data, dict) and data.get("success"):
            return f"Клавиша '{key}' нажата (цель: {data.get('target')})"
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка нажатия клавиши: {str(e)}"


@mcp.tool()
async def browser_select_option(selector: str, value: str, tab_id: Optional[int] = None) -> str:
    """Выбрать пункт в выпадающем списке <select> по значению value или видимому тексту."""
    try:
        data = await send_command_to_extension("select_option", {
            "selector": selector,
            "value": value,
            "tab_id": tab_id
        })
        if isinstance(data, dict) and data.get("success"):
            return f"Выбрана опция: '{data.get('selected_text')}' (value={data.get('selected_value')})"
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка выбора опции: {str(e)}"


@mcp.tool()
async def browser_scroll(
    direction: str = "down",
    amount: Optional[int] = None,
    selector: Optional[str] = None,
    tab_id: Optional[int] = None
) -> str:
    """Прокрутить страницу ('down', 'up', 'top', 'bottom') или к конкретному элементу selector."""
    try:
        data = await send_command_to_extension("scroll", {
            "direction": direction,
            "amount": amount,
            "selector": selector,
            "tab_id": tab_id
        })
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка прокрутки: {str(e)}"


@mcp.tool()
async def browser_screenshot(tab_id: Optional[int] = None) -> list:
    """
    РЕЗЕРВНЫЙ ВИЗУАЛЬНЫЙ РЕЖИМ: Сделать снимок экрана (скриншот) видимой области страницы и передать картинку ИИ.
    ВАЖНО: НЕ вызывайте этот инструмент при обычной работе! Всегда используйте быстрый `browser_read_page`.
    Используйте `browser_screenshot` ТОЛЬКО если возникли проблемы с обычным текстовым режимом
    (нужный элемент не виден в DOM, интерфейс на <canvas>, капча, сбой клика) или по прямой просьбе пользователя.
    """
    try:
        data = await send_command_to_extension("screenshot", {"tab_id": tab_id})
        img_data_url = data.get("screenshot_base64", "")
        if not img_data_url or "," not in img_data_url:
            return ["Ошибка: пустые данные скриншота"]

        b64_part = img_data_url.split(",", 1)[1]
        raw_bytes = base64.b64decode(b64_part)

        out_path = Path(tempfile.gettempdir()) / "chromium_bridge_screenshot.png"
        out_path.write_bytes(raw_bytes)

        meta = f"Скриншот вкладки '{data.get('title', '')}' ({data.get('url', '')}). Сохранен локально: {out_path}"
        return [meta, Image(data=raw_bytes, format="png")]
    except Exception as e:
        return [f"Ошибка создания скриншота: {str(e)}"]


@mcp.tool()
async def browser_eval_js(code: str, tab_id: Optional[int] = None) -> str:
    """Выполнить JavaScript-выражение в контексте страницы (MAIN world) и вернуть результат."""
    try:
        data = await send_command_to_extension("eval_js", {"code": code, "tab_id": tab_id})
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка выполнения JS: {str(e)}"


@mcp.tool()
async def browser_download_file(url: str, save_path: str) -> str:
    """
    Скачать файл по URL через авторизованную сессию браузера (с куками пользователя) и сохранить на диск.
    """
    try:
        data = await send_command_to_extension("download_file_base64", {"url": url}, timeout=60.0)
        raw_bytes = base64.b64decode(data.get("base64", ""))
        dest = Path(os.path.expanduser(save_path)).resolve()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw_bytes)
        return f"Файл успешно сохранен: {dest} ({len(raw_bytes)} байт, тип: {data.get('type')})"
    except Exception as e:
        return f"Ошибка скачивания файла: {str(e)}"


@mcp.tool()
async def browser_parse_vk_wall(tab_id: Optional[int] = None) -> str:
    """Извлечь структурированный список постов и прикрепленных документов со страницы стены ВКонтакте."""
    try:
        data = await send_command_to_extension("parse_vk_wall", {"tab_id": tab_id})
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка разбора стены ВК: {str(e)}"


# -------------------------------------------------------------
# Обработчик WebSocket соединений (сервер)
# -------------------------------------------------------------

async def ws_handler(websocket):
    global active_browser_ws, pending_requests

    logger.info(f"Новое WebSocket подключение от {websocket.remote_address}")
    try:
        async for raw_message in websocket:
            try:
                msg = json.loads(raw_message)
            except json.JSONDecodeError:
                continue

            # 1. Запрос от локального CLI клиента или MCP прокси
            if msg.get("type") == "command" or msg.get("role") == "client":
                req_id = msg.get("id", str(uuid.uuid4()))
                action = msg.get("action")
                params = msg.get("params", {})

                if active_browser_ws is None:
                    await websocket.send(json.dumps({
                        "id": req_id,
                        "status": "error",
                        "error": "Расширение Chromium не подключено к серверу"
                    }))
                    continue

                try:
                    res = await send_command_internal(action, params)
                    await websocket.send(json.dumps({
                        "id": req_id,
                        "status": "success",
                        "data": res
                    }))
                except Exception as err:
                    await websocket.send(json.dumps({
                        "id": req_id,
                        "status": "error",
                        "error": str(err)
                    }))
                continue

            # 2. Регистрация и heartbeat от браузерного расширения
            if msg.get("role") == "browser":
                active_browser_ws = websocket
                if msg.get("type") == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
                    continue

            # 3. Ответ от браузерного расширения на отправленную команду
            req_id = msg.get("id")
            if req_id and req_id in pending_requests:
                active_browser_ws = websocket
                future = pending_requests[req_id]
                if not future.done():
                    if msg.get("status") == "success":
                        future.set_result(msg.get("data"))
                    else:
                        future.set_exception(RuntimeError(msg.get("error") or "Неизвестная ошибка расширения"))
                continue

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if active_browser_ws == websocket:
            active_browser_ws = None
            logger.info("Расширение Chromium отключилось.")
            for _, fut in list(pending_requests.items()):
                if not fut.done():
                    fut.set_exception(ConnectionError("Соединение с расширением браузера прервано"))
            pending_requests.clear()


# -------------------------------------------------------------
# Главный цикл
# -------------------------------------------------------------

async def main():
    global external_mode

    is_mcp = "--mcp" in sys.argv
    port_busy = is_port_in_use(WS_PORT, WS_HOST)

    if port_busy:
        if is_mcp:
            external_mode = True
            logger.info(f"Обнаружен активный мост на ws://{WS_HOST}:{WS_PORT}. Работаем в режиме прокси-клиента.")
            await mcp.run_stdio_async()
            return
        else:
            print(f"[!] Ошибка: Порт {WS_PORT} уже используется другой программой!", file=sys.stderr)
            sys.exit(1)

    logger.info(f"Запуск WebSocket сервера на ws://{WS_HOST}:{WS_PORT}...")
    server = await websockets.serve(
        ws_handler,
        WS_HOST,
        WS_PORT,
        origins=ALLOWED_ORIGINS,
        max_size=MAX_WS_SIZE,
    )

    if is_mcp:
        try:
            await mcp.run_stdio_async()
        finally:
            server.close()
            await server.wait_closed()
    else:
        print("\n" + "=" * 60, file=sys.stderr)
        print("  [+] Antigravity AI Chromium Bridge v1.1 запущен!", file=sys.stderr)
        print(f"  [+] WebSocket сервер: ws://{WS_HOST}:{WS_PORT}", file=sys.stderr)
        print("  [+] Защита Origin: включена (только расширение и локальный CLI)", file=sys.stderr)
        print("  [+] Статус: Ожидание подключения расширения браузера...", file=sys.stderr)
        print("  [+] Нажмите Ctrl+C для остановки.", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)

        try:
            await asyncio.Future()
        except (asyncio.CancelledError, KeyboardInterrupt):
            pass
        finally:
            server.close()
            await server.wait_closed()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Сервер остановлен.")

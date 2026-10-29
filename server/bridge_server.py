#!/usr/bin/env python3
"""
Antigravity AI Chromium Bridge Server
Связывает локального AI-ассистента с расширением браузера Chromium по WebSocket.
Поддерживает Standalone режим (start.bat), CLI запросы и MCP режим.
"""

import sys
import json
import uuid
import socket
import asyncio
import logging
from typing import Optional, Dict, Any

import websockets
from mcp.server.mcpserver import MCPServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger("browser_bridge")

WS_HOST = "127.0.0.1"
WS_PORT = 8785

# Глобальное состояние сервера
active_browser_ws: Any = None
pending_requests: Dict[str, asyncio.Future] = {}
external_mode = False  # True если сервер уже был запущен снаружи (start.bat)

mcp = MCPServer("chromium-browser-bridge")


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Проверяет, занят ли порт."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


async def send_command_via_external_ws(action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 25.0) -> Any:
    """Отправляет команду через уже запущенный внешний WebSocket сервер (режим клиента)."""
    req_id = str(uuid.uuid4())
    payload = {
        "type": "command",
        "id": req_id,
        "action": action,
        "params": params or {}
    }
    uri = f"ws://{WS_HOST}:{WS_PORT}"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps(payload))
        while True:
            resp_raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            msg = json.loads(resp_raw)
            if msg.get("id") == req_id:
                if msg.get("status") == "success":
                    return msg.get("data")
                raise RuntimeError(msg.get("error") or "Неизвестная ошибка расширения")


async def send_command_internal(action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 25.0) -> Any:
    """Отправляет команду расширению напрямую (если мы являемся WebSocket сервером)."""
    global active_browser_ws, pending_requests

    if active_browser_ws is None:
        raise RuntimeError(
            "Расширение Chromium не подключено к мосту. "
            "Откройте ваш браузер Chromium и убедитесь, что расширение включено (значок ON в панели расширений)."
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
        result = await asyncio.wait_for(future, timeout=timeout)
        return result
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
    """Получить заголовок, URL и статус текущей активной вкладки в браузере."""
    try:
        data = await send_command_to_extension("get_active_tab")
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_list_tabs() -> str:
    """Получить список всех открытых вкладок (ID, заголовок, URL, активна ли)."""
    try:
        data = await send_command_to_extension("list_tabs")
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_switch_tab(tab_id: int) -> str:
    """Переключить активную вкладку по её ID."""
    try:
        data = await send_command_to_extension("switch_tab", {"tab_id": tab_id})
        return f"Успешно переключено на вкладку: {data.get('title')} ({data.get('url')})"
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_open_tab(url: str) -> str:
    """Открыть новый URL в новой вкладке браузера."""
    try:
        data = await send_command_to_extension("open_tab", {"url": url})
        return f"Вкладка открыта: ID={data.get('id')}, URL={data.get('url')}"
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_close_tab(tab_id: Optional[int] = None) -> str:
    """Закрыть вкладку браузера (если tab_id не передан, закрывается активная)."""
    try:
        data = await send_command_to_extension("close_tab", {"tab_id": tab_id})
        return f"Вкладка закрыта: ID={data.get('closed_tab_id')}"
    except Exception as e:
        return f"Ошибка: {str(e)}"


@mcp.tool()
async def browser_read_page(tab_id: Optional[int] = None) -> str:
    """
    Прочитать содержимое веб-страницы в ультра-компактном формате.
    Возвращает: заголовок, URL, сжатый текст и пронумерованный список элементов [1], [2]... для мгновенных действий.
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
    - Текстом кнопки/ссылки ('Пауза', 'Войти')
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
async def browser_type(selector: str, text: str, press_enter: bool = False, clear: bool = True, tab_id: Optional[int] = None) -> str:
    """
    Ввести текст в поле ввода на странице.
    :param selector: Числовой номер поля из read_page (например, '4') или CSS-селектор
    :param text: Текст для ввода
    :param press_enter: Нажать Enter после ввода (отправка формы)
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
async def browser_scroll(direction: str = "down", amount: Optional[int] = None, selector: Optional[str] = None, tab_id: Optional[int] = None) -> str:
    """Прокрутить веб-страницу ('down', 'up', 'top', 'bottom') или к конкретному селектору."""
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
async def browser_screenshot(tab_id: Optional[int] = None) -> str:
    """Сделать снимок экрана (скриншот) текущей видимой области страницы."""
    try:
        data = await send_command_to_extension("screenshot", {"tab_id": tab_id})
        img_data = data.get("screenshot_base64", "")
        return f"Скриншот получен! (DataURL длина: {len(img_data)} симв.)"
    except Exception as e:
        return f"Ошибка создания скриншота: {str(e)}"


@mcp.tool()
async def browser_eval_js(code: str, tab_id: Optional[int] = None) -> str:
    """Выполнить произвольный JavaScript на странице вкладки и вернуть результат."""
    try:
        data = await send_command_to_extension("eval_js", {"code": code, "tab_id": tab_id})
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Ошибка выполнения JS: {str(e)}"


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

            # 1. Запрос от CLI клиента или внешнего агента
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

            # 2. Сообщение от браузера
            active_browser_ws = websocket

            if msg.get("type") == "ping":
                await websocket.send(json.dumps({"type": "pong"}))
                continue

            req_id = msg.get("id")
            if req_id and req_id in pending_requests:
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


# -------------------------------------------------------------
# Главный цикл
# -------------------------------------------------------------

async def main():
    global external_mode

    is_mcp = "--mcp" in sys.argv
    port_busy = is_port_in_use(WS_PORT, WS_HOST)

    if port_busy:
        if is_mcp:
            # Порт уже занят (например, запущен start.bat) - подключаемся как клиент
            external_mode = True
            logger.info(f"Обнаружен активный мост на ws://{WS_HOST}:{WS_PORT}. Работаем в режиме прокси-клиента.")
            await mcp.run_stdio_async()
            return
        else:
            print(f"[!] Ошибка: Порт {WS_PORT} уже используется другой программой!", file=sys.stderr)
            sys.exit(1)

    # Порт свободен: запускаем полноценный сервер
    logger.info(f"Запуск WebSocket сервера на ws://{WS_HOST}:{WS_PORT}...")
    server = await websockets.serve(ws_handler, WS_HOST, WS_PORT)

    if is_mcp:
        try:
            await mcp.run_stdio_async()
        finally:
            server.close()
            await server.wait_closed()
    else:
        print("\n" + "="*60, file=sys.stderr)
        print("  [+] Antigravity AI Chromium Bridge запущен!", file=sys.stderr)
        print(f"  [+] WebSocket сервер: ws://{WS_HOST}:{WS_PORT}", file=sys.stderr)
        print("  [+] Статус: Ожидание подключения расширения браузера...", file=sys.stderr)
        print("  [+] Нажмите Ctrl+C для остановки.", file=sys.stderr)
        print("="*60 + "\n", file=sys.stderr)

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

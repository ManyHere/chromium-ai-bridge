#!/usr/bin/env python3
"""
Antigravity AI Chromium Bridge CLI Client
Используется для отправки команд мосту из командной строки или скриптов.
"""

import sys
import json
import uuid
import asyncio
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

WS_URL = "ws://127.0.0.1:8785"

async def execute(action: str, params: dict = None, timeout: float = 20.0):
    params = params or {}
    req_id = str(uuid.uuid4())
    payload = {
        "type": "command",
        "id": req_id,
        "action": action,
        "params": params
    }

    try:
        async with websockets.connect(WS_URL) as ws:
            await ws.send(json.dumps(payload))
            while True:
                resp_raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                msg = json.loads(resp_raw)
                if msg.get("id") == req_id:
                    if msg.get("status") == "success":
                        print(json.dumps(msg.get("data"), ensure_ascii=False, indent=2))
                        return 0
                    else:
                        print(f"Ошибка: {msg.get('error')}", file=sys.stderr)
                        return 1
    except ConnectionRefusedError:
        print(f"Ошибка: Сервер моста не запущен на {WS_URL}. Запустите start.bat!", file=sys.stderr)
        return 2
    except asyncio.TimeoutError:
        print(f"Ошибка: Превышено время ожидания ответа ({timeout} сек)", file=sys.stderr)
        return 3
    except Exception as e:
        print(f"Ошибка: {str(e)}", file=sys.stderr)
        return 4

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python client.py <action> [params_json]")
        print("Примеры:")
        print("  python client.py get_active_tab")
        print("  python client.py read_page")
        print("  python client.py list_tabs")
        print("  python client.py click '{\"selector\": \"button\"}'")
        sys.exit(1)

    act = sys.argv[1]
    prms = {}

    if len(sys.argv) >= 3:
        raw_args = " ".join(sys.argv[2:])
        if raw_args.startswith("{") and raw_args.endswith("}"):
            try:
                prms = json.loads(raw_args)
            except Exception:
                prms = {"selector": raw_args}
        elif act in ("click", "scroll"):
            prms = {"selector": raw_args}
        elif act in ("open_tab", "navigate"):
            prms = {"url": raw_args}
        elif act == "eval_js":
            prms = {"code": raw_args}
        elif act == "type":
            prms = {"selector": sys.argv[2], "text": " ".join(sys.argv[3:])}
        else:
            prms = {"text": raw_args}

    code = asyncio.run(execute(act, prms))
    sys.exit(code)

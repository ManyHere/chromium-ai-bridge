// Antigravity Browser Bridge - Background Service Worker (Manifest V3, v1.1)

let socket = null;
let isConnected = false;
let isConnecting = false;
let reconnectTimer = null;
let pingInterval = null;

const DEFAULT_SERVER_URL = "ws://127.0.0.1:8785";
const KEEPALIVE_ALARM = "antigravity_bridge_keepalive";
const RESTRICTED_URL_RE = /^(chrome|edge|browser|opera|vivaldi|brave|chrome-extension|about|view-source):/i;

// Получение URL сервера из хранилища или по умолчанию
async function getServerUrl() {
  const data = await chrome.storage.local.get("serverUrl");
  return data.serverUrl || DEFAULT_SERVER_URL;
}

// Обновление бейджа расширения
function updateBadge(connected) {
  isConnected = connected;
  if (connected) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    chrome.action.setTitle({ title: "Antigravity Bridge: Подключено к агенту" });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    chrome.action.setTitle({ title: "Antigravity Bridge: Сервер отключен (автопоиск...)" });
  }
}

// Настройка фонового будильника, чтобы MV3 Service Worker не засыпал навсегда
function setupKeepAliveAlarm() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
}

// Подключение к локальному WebSocket серверу (защищено от гонок)
async function connect() {
  if (isConnecting) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  isConnecting = true;
  try {
    const url = await getServerUrl();
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      isConnecting = false;
      console.log("[Bridge] Соединение установлено!");
      updateBadge(true);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // Регистрация роли браузера в мосте
      ws.send(JSON.stringify({ type: "ping", role: "browser" }));

      // Дополнительный быстрый пинг каждые 20 сек пока воркер активен
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (socket === ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", role: "browser" }));
        }
      }, 20000);
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "pong") return;
        await handleCommand(message);
      } catch (err) {
        console.error("[Bridge] Ошибка разбора сообщения:", err);
      }
    };

    ws.onclose = () => {
      isConnecting = false;
      if (socket === ws) {
        socket = null;
        updateBadge(false);
      }
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      isConnecting = false;
      updateBadge(false);
    };
  } catch (e) {
    isConnecting = false;
    console.error("[Bridge] Ошибка при создании WebSocket:", e);
    updateBadge(false);
    scheduleReconnect();
  }
}

function ensureConnected() {
  if (!socket || (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING)) {
    connect();
  } else if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: "ping", role: "browser" }));
    } catch (_) {}
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

// Отправка ответа обратно серверу
function sendResponse(id, status, data = null, error = null) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("[Bridge] Не удалось отправить ответ: сокет закрыт");
    return;
  }
  socket.send(JSON.stringify({ id, status, data, error }));
}

// Получение активной вкладки
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) return tab;
  const [anyTab] = await chrome.tabs.query({ active: true });
  return anyTab || null;
}

// Ожидание завершения загрузки вкладки (с безопасным таймаутом)
async function waitForTabLoad(tabId, timeoutMs = 8000) {
  try {
    const initial = await chrome.tabs.get(tabId);
    if (initial && initial.status === "complete" && initial.url && initial.url !== "about:blank") {
      await new Promise(r => setTimeout(r, 120));
      return await chrome.tabs.get(tabId);
    }
  } catch (_) {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      try {
        await new Promise(r => setTimeout(r, 150));
        resolve(await chrome.tabs.get(tabId));
      } catch (_) {
        resolve(null);
      }
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish();
      }
    };

    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Безопасная отправка сообщения в Content Script с автоинъекцией при необходимости
async function sendToContentScript(tabId, message) {
  const numericTabId = Number(tabId);
  const tab = await chrome.tabs.get(numericTabId);
  if (!tab || !tab.url) {
    throw new Error(`Вкладка с id ${numericTabId} не найдена`);
  }

  if (RESTRICTED_URL_RE.test(tab.url)) {
    throw new Error(`Невозможно взаимодействовать со служебной страницей браузера: ${tab.url}`);
  }

  try {
    return await chrome.tabs.sendMessage(numericTabId, message);
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: numericTabId },
        files: ["content.js"]
      });
      await new Promise(r => setTimeout(r, 80));
      return await chrome.tabs.sendMessage(numericTabId, message);
    } catch (injectErr) {
      throw new Error(`Не удалось внедрить скрипт на страницу: ${injectErr.message}`);
    }
  }
}

// Обработка команд от локального агента
async function handleCommand(req) {
  const { id, action, params = {} } = req;

  try {
    switch (action) {
      case "ping": {
        sendResponse(id, "success", { message: "pong", timestamp: Date.now() });
        break;
      }

      case "get_active_tab": {
        const tab = await getActiveTab();
        if (!tab) throw new Error("Активная вкладка не найдена");
        sendResponse(id, "success", {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          status: tab.status
        });
        break;
      }

      case "list_tabs": {
        const tabs = await chrome.tabs.query({});
        const result = tabs.map(t => ({
          id: t.id,
          title: t.title,
          url: t.url,
          active: t.active,
          windowId: t.windowId
        }));
        sendResponse(id, "success", { tabs: result });
        break;
      }

      case "switch_tab": {
        if (!params.tab_id) throw new Error("Требуется указать tab_id");
        const tab = await chrome.tabs.update(Number(params.tab_id), { active: true });
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        sendResponse(id, "success", { id: tab.id, title: tab.title, url: tab.url });
        break;
      }

      case "open_tab": {
        if (!params.url) throw new Error("Требуется указать url");
        const newTab = await chrome.tabs.create({ url: params.url, active: params.active ?? true });
        const loadedTab = (params.wait !== false) ? (await waitForTabLoad(newTab.id)) || newTab : newTab;
        sendResponse(id, "success", {
          id: loadedTab.id,
          title: loadedTab.title || "",
          url: loadedTab.url || params.url,
          status: loadedTab.status
        });
        break;
      }

      case "navigate": {
        const tabId = params.tab_id ? Number(params.tab_id) : (await getActiveTab())?.id;
        if (!tabId) throw new Error("Активная вкладка не найдена");
        if (!params.url) throw new Error("Требуется указать url");
        const updated = await chrome.tabs.update(tabId, { url: params.url });
        const loadedTab = (params.wait !== false) ? (await waitForTabLoad(tabId)) || updated : updated;
        sendResponse(id, "success", {
          id: loadedTab.id,
          title: loadedTab.title || "",
          url: loadedTab.url || params.url,
          status: loadedTab.status
        });
        break;
      }

      case "reload_tab": {
        const tabId = params.tab_id ? Number(params.tab_id) : (await getActiveTab())?.id;
        if (!tabId) throw new Error("Активная вкладка не найдена");
        await chrome.tabs.reload(tabId);
        const loadedTab = await waitForTabLoad(tabId);
        sendResponse(id, "success", {
          reloaded: true,
          id: tabId,
          title: loadedTab?.title || "",
          url: loadedTab?.url || ""
        });
        break;
      }

      case "go_back": {
        const tabId = params.tab_id ? Number(params.tab_id) : (await getActiveTab())?.id;
        if (!tabId) throw new Error("Активная вкладка не найдена");
        await chrome.tabs.goBack(tabId);
        const loadedTab = await waitForTabLoad(tabId, 5000);
        sendResponse(id, "success", {
          id: tabId,
          title: loadedTab?.title || "",
          url: loadedTab?.url || ""
        });
        break;
      }

      case "go_forward": {
        const tabId = params.tab_id ? Number(params.tab_id) : (await getActiveTab())?.id;
        if (!tabId) throw new Error("Активная вкладка не найдена");
        await chrome.tabs.goForward(tabId);
        const loadedTab = await waitForTabLoad(tabId, 5000);
        sendResponse(id, "success", {
          id: tabId,
          title: loadedTab?.title || "",
          url: loadedTab?.url || ""
        });
        break;
      }

      case "close_tab": {
        const tabId = params.tab_id ? Number(params.tab_id) : (await getActiveTab())?.id;
        if (!tabId) throw new Error("Вкладка для закрытия не найдена");
        await chrome.tabs.remove(tabId);
        sendResponse(id, "success", { closed_tab_id: tabId });
        break;
      }

      case "screenshot": {
        let tab = await getActiveTab();
        if (params.tab_id && (!tab || tab.id !== Number(params.tab_id))) {
          tab = await chrome.tabs.update(Number(params.tab_id), { active: true });
          await new Promise(r => setTimeout(r, 150));
        }
        if (!tab) throw new Error("Активная вкладка не найдена");
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId ?? null, { format: "png" });
        sendResponse(id, "success", {
          screenshot_base64: dataUrl,
          tab_id: tab.id,
          title: tab.title,
          url: tab.url
        });
        break;
      }

      case "download_file_base64": {
        if (!params.url) throw new Error("Требуется указать url для скачивания");
        const resp = await fetch(params.url, { credentials: "include" });
        if (!resp.ok) {
          throw new Error(`Ошибка загрузки: HTTP ${resp.status} ${resp.statusText}`);
        }
        const blob = await resp.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const chunks = [];
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.byteLength; i += chunkSize) {
          chunks.push(String.fromCharCode.apply(null, uint8Array.subarray(i, i + chunkSize)));
        }
        sendResponse(id, "success", {
          base64: btoa(chunks.join("")),
          size: blob.size,
          type: blob.type,
          url: resp.url
        });
        break;
      }

      case "eval_js": {
        const tabId = params.tab_id ? Number(params.tab_id) : (await getActiveTab())?.id;
        if (!tabId) throw new Error("Активная вкладка не найдена");
        const tab = await chrome.tabs.get(tabId);
        if (!tab?.url || RESTRICTED_URL_RE.test(tab.url)) {
          throw new Error(`Невозможно выполнить JS на служебной странице: ${tab?.url}`);
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          args: [params.code || ""],
          func: async (code) => {
            try {
              const indirectEval = (0, eval);
              let out = indirectEval(code);
              if (out instanceof Promise) out = await out;
              if (out instanceof Element) {
                out = {
                  tag: out.tagName,
                  id: out.id,
                  className: out.className,
                  text: (out.innerText || out.textContent || "").trim().slice(0, 500)
                };
              }
              return { success: true, result: out ?? null };
            } catch (err) {
              const msg = err && err.message ? err.message : String(err);
              // CSP-безопасный фолбэк для сайтов без unsafe-eval (GitHub, Google и др.)
              if (/Content Security Policy|unsafe-eval/i.test(msg)) {
                try {
                  const trimmed = String(code).trim().replace(/;$/, "");
                  if (trimmed === "document.title") return { success: true, result: document.title };
                  if (trimmed === "location.href" || trimmed === "window.location.href") return { success: true, result: window.location.href };
                  if (trimmed === "document.body.innerText") return { success: true, result: document.body?.innerText || "" };

                  const qsMatch = trimmed.match(/^document\.querySelector\(\s*(['"`])([\s\S]+?)\1\s*\)(?:\.([a-zA-Z0-9_]+)(?:\(\))?)?$/);
                  if (qsMatch) {
                    const el = document.querySelector(qsMatch[2]);
                    if (!el) return { success: true, result: null };
                    const prop = qsMatch[3];
                    if (prop) {
                      const val = typeof el[prop] === "function" ? el[prop]() : el[prop];
                      return { success: true, result: val ?? null };
                    }
                    return {
                      success: true,
                      result: {
                        tag: el.tagName,
                        text: (el.innerText || el.textContent || "").trim().slice(0, 500),
                        html: el.outerHTML.slice(0, 1000)
                      }
                    };
                  }

                  const qsaLenMatch = trimmed.match(/^document\.querySelectorAll\(\s*(['"`])([\s\S]+?)\1\s*\)\.length$/);
                  if (qsaLenMatch) {
                    return { success: true, result: document.querySelectorAll(qsaLenMatch[2]).length };
                  }
                } catch (_) {}

                return {
                  success: false,
                  error: `CSP сайта запрещает динамический eval(). Используйте read_page, click, type, press_key или простые селекторы document.querySelector('...'). (${msg})`
                };
              }
              return { success: false, error: msg };
            }
          }
        });

        const res = results?.[0]?.result || { success: false, error: "Нет результата выполнения JS" };
        sendResponse(id, "success", res);
        break;
      }

      case "read_page":
      case "click":
      case "type":
      case "scroll":
      case "press_key":
      case "select_option":
      case "parse_vk_wall": {
        const tabId = params.tab_id ? Number(params.tab_id) : (await getActiveTab())?.id;
        if (!tabId) throw new Error("Активная вкладка не найдена");
        const res = await sendToContentScript(tabId, { action, params });
        sendResponse(id, "success", res);
        break;
      }

      default:
        sendResponse(id, "error", null, `Неизвестное действие: ${action}`);
        break;
    }
  } catch (err) {
    console.error(`[Bridge] Ошибка выполнения ${action}:`, err);
    sendResponse(id, "error", null, err.message || String(err));
  }
}

// Автозапуск и пробуждение воркера при любых событиях браузера
chrome.runtime.onStartup.addListener(() => {
  setupKeepAliveAlarm();
  connect();
});
chrome.runtime.onInstalled.addListener(() => {
  setupKeepAliveAlarm();
  connect();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) ensureConnected();
});
chrome.tabs.onActivated.addListener(() => ensureConnected());
chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId !== chrome.windows.WINDOW_ID_NONE) ensureConnected();
});

// Слушатель сообщений от popup окна
chrome.runtime.onMessage.addListener((msg, sender, sendResponseCallback) => {
  if (msg.action === "get_status") {
    ensureConnected();
    sendResponseCallback({ isConnected });
  } else if (msg.action === "reconnect") {
    if (socket) {
      try { socket.close(); } catch (_) {}
      socket = null;
    }
    isConnecting = false;
    connect();
    sendResponseCallback({ status: "reconnecting" });
  }
  return true;
});

// Инициализация при загрузке Service Worker
setupKeepAliveAlarm();
connect();

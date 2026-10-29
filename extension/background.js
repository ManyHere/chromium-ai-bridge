// Antigravity Browser Bridge - Background Service Worker (Manifest V3)

let socket = null;
let isConnected = false;
let reconnectTimer = null;
let pingInterval = null;

const DEFAULT_SERVER_URL = "ws://127.0.0.1:8785";

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
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Зеленый
    chrome.action.setTitle({ title: "Antigravity Bridge: Подключено к агенту" });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }); // Красный
    chrome.action.setTitle({ title: "Antigravity Bridge: Сервер отключен (поиск...)" });
  }
}

// Подключение к локальному WebSocket серверу
async function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const url = await getServerUrl();
  console.log(`[Bridge] Подключение к ${url}...`);

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("[Bridge] Соединение установлено!");
      updateBadge(true);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // Немедленная регистрация в мосте
      socket.send(JSON.stringify({ type: "ping", role: "browser" }));

      // Heartbeat каждые 20 сек для поддержания активности Service Worker
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping", role: "browser" }));
        }
      }, 20000);
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "pong") return;

        console.log("[Bridge] Получена команда:", message);
        await handleCommand(message);
      } catch (err) {
        console.error("[Bridge] Ошибка разбора сообщения:", err);
      }
    };

    socket.onclose = () => {
      console.log("[Bridge] Соединение закрыто. Повтор через 3 сек...");
      updateBadge(false);
      if (pingInterval) clearInterval(pingInterval);
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      console.warn("[Bridge] Ошибка сокета:", err);
      updateBadge(false);
    };
  } catch (e) {
    console.error("[Bridge] Ошибка при создании WebSocket:", e);
    updateBadge(false);
    scheduleReconnect();
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
  const payload = { id, status, data, error };
  socket.send(JSON.stringify(payload));
}

// Получение активной вкладки
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) {
    const [anyTab] = await chrome.tabs.query({ active: true });
    return anyTab || null;
  }
  return tab;
}

// Безопасная отправка сообщения в Content Script с инъекцией при необходимости
async function sendToContentScript(tabId, message) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !tab.url) {
    throw new Error(`Вкладка с id ${tabId} не найдена`);
  }

  // Проверка запрещенных URL
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:")) {
    throw new Error(`Невозможно взаимодействовать со служебной страницей браузера: ${tab.url}`);
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    // Если content script ещё не внедрён (например, страница открыта до расширения), инжектим
    console.log(`[Bridge] Внедрение content.js во вкладку ${tabId}...`);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
      // Небольшая задержка для инициализации скрипта
      await new Promise(r => setTimeout(r, 100));
      return await chrome.tabs.sendMessage(tabId, message);
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
          active: t.active
        }));
        sendResponse(id, "success", { tabs: result });
        break;
      }

      case "switch_tab": {
        if (!params.tab_id) throw new Error("Требуется указать tab_id");
        const tab = await chrome.tabs.update(params.tab_id, { active: true });
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        sendResponse(id, "success", { id: tab.id, title: tab.title, url: tab.url });
        break;
      }

      case "open_tab": {
        if (!params.url) throw new Error("Требуется указать url");
        const newTab = await chrome.tabs.create({ url: params.url, active: params.active ?? true });
        sendResponse(id, "success", { id: newTab.id, url: newTab.url });
        break;
      }

      case "reload_tab": {
        const tabId = params.tab_id || (await getActiveTab())?.id;
        if (tabId) await chrome.tabs.reload(tabId);
        sendResponse(id, "success", { reloaded: true });
        break;
      }

      case "close_tab": {
        const tabId = params.tab_id || (await getActiveTab())?.id;
        if (!tabId) throw new Error("Вкладка для закрытия не найдена");
        await chrome.tabs.remove(tabId);
        sendResponse(id, "success", { closed_tab_id: tabId });
        break;
      }

      case "screenshot": {
        const tab = await getActiveTab();
        if (!tab) throw new Error("Активная вкладка не найдена");
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
        sendResponse(id, "success", { screenshot_base64: dataUrl });
        break;
      }

      case "read_page":
      case "click":
      case "type":
      case "scroll":
      case "eval_js": {
        let tabId = params.tab_id;
        if (!tabId) {
          const activeTab = await getActiveTab();
          if (!activeTab) throw new Error("Активная вкладка не найдена");
          tabId = activeTab.id;
        }

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

// Запуск при старте браузера / расширения
chrome.runtime.onStartup.addListener(() => connect());
chrome.runtime.onInstalled.addListener(() => connect());

// Слушатель сообщений от popup окна
chrome.runtime.onMessage.addListener((msg, sender, sendResponseCallback) => {
  if (msg.action === "get_status") {
    sendResponseCallback({ isConnected });
  } else if (msg.action === "reconnect") {
    if (socket) {
      try { socket.close(); } catch (_) {}
    }
    connect();
    sendResponseCallback({ status: "reconnecting" });
  }
  return true;
});

// Первоначальное подключение
connect();

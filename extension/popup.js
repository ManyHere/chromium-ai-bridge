document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const serverUrlInput = document.getElementById("serverUrl");
  const saveBtn = document.getElementById("saveBtn");
  const reconnectBtn = document.getElementById("reconnectBtn");

  // Загружаем сохраненный URL
  const data = await chrome.storage.local.get("serverUrl");
  serverUrlInput.value = data.serverUrl || "ws://127.0.0.1:8785";

  // Функция запроса статуса у background скрипта
  function checkStatus() {
    chrome.runtime.sendMessage({ action: "get_status" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        setDisconnected();
        return;
      }
      if (res.isConnected) {
        setConnected();
      } else {
        setDisconnected();
      }
    });
  }

  function setConnected() {
    statusDot.className = "status-dot connected";
    statusText.textContent = "Подключено к агенту";
    statusText.style.color = "#10b981";
  }

  function setDisconnected() {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Ожидание сервера (start.bat)";
    statusText.style.color = "#ef4444";
  }

  // Сохранить новый URL
  saveBtn.addEventListener("click", async () => {
    const newUrl = serverUrlInput.value.trim();
    if (newUrl) {
      await chrome.storage.local.set({ serverUrl: newUrl });
      saveBtn.textContent = "✓";
      setTimeout(() => (saveBtn.textContent = "ОК"), 1000);
      chrome.runtime.sendMessage({ action: "reconnect" }, () => {
        setTimeout(checkStatus, 500);
      });
    }
  });

  // Кнопка переподключения
  reconnectBtn.addEventListener("click", () => {
    reconnectBtn.textContent = "Подключение...";
    chrome.runtime.sendMessage({ action: "reconnect" }, () => {
      setTimeout(() => {
        reconnectBtn.textContent = "Переподключить";
        checkStatus();
      }, 1000);
    });
  });

  checkStatus();
});

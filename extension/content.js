// Antigravity Browser Bridge - Content Script (Ultra-Fast Edition)

(() => {
  // Кеш найденных интерактивных элементов для мгновенного доступа по числовому ID
  window.__ai_elements = window.__ai_elements || [];

  // Быстрая проверка видимости элемента
  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.offsetParent === null) {
      const pos = window.getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Подсветка элемента для наглядности действий AI
  function highlightElement(el, color = "#6366f1") {
    try {
      const origOutline = el.style.outline;
      const origTransition = el.style.transition;
      el.style.transition = "outline 0.2s ease";
      el.style.outline = `3px solid ${color}`;
      setTimeout(() => {
        el.style.outline = origOutline;
        el.style.transition = origTransition;
      }, 700);
    } catch (_) {}
  }

  // Поиск элемента по числовому ID [1], селектору или тексту
  function resolveElement(query) {
    if (!query && query !== 0) return null;

    // 1. Быстрый поиск по числовому ID: 1, "1", "[1]"
    const numMatch = String(query).trim().match(/^\[?(\d+)\]?$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      if (window.__ai_elements && window.__ai_elements[idx]) {
        return window.__ai_elements[idx];
      }
    }

    const strQuery = String(query).trim();

    // 2. Попытка как CSS селектор
    try {
      const el = document.querySelector(strQuery);
      if (el) return el;
    } catch (_) {}

    // 3. Попытка по aria-label или title
    try {
      const ariaEl = document.querySelector(`[aria-label="${strQuery}"], [title="${strQuery}"]`);
      if (ariaEl) return ariaEl;
    } catch (_) {}

    // 4. Поиск по тексту или вхождению
    const clean = strQuery.toLowerCase();
    const candidates = Array.from(document.querySelectorAll("button, a, input, textarea, select, [role='button'], label"));
    for (const el of candidates) {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase().trim();
      const txt = (el.textContent || "").toLowerCase().trim();
      if (isVisible(el) && (aria === clean || txt === clean)) return el;
    }
    for (const el of candidates) {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const txt = (el.textContent || "").toLowerCase();
      if (isVisible(el) && (aria.includes(clean) || txt.includes(clean))) return el;
    }

    return null;
  }

  // Сбор основных интерактивных элементов с генерацией компактного дерева
  function extractInteractiveElements(maxCount = 45) {
    window.__ai_elements = [];
    const selector = "button, a[href], input, textarea, select, [role='button'], [tabindex='0']";
    const rawList = Array.from(document.querySelectorAll(selector));
    const lines = [];

    for (const el of rawList) {
      if (!isVisible(el)) continue;

      const tag = el.tagName.toLowerCase();
      let label = "";

      if (tag === "input" || tag === "textarea") {
        label = el.placeholder || el.getAttribute("aria-label") || el.name || el.value || "";
      } else {
        label = el.getAttribute("aria-label") || el.title || el.textContent.trim().replace(/\s+/g, " ");
      }

      label = label.slice(0, 60).trim();
      if (!label && !el.id) continue;

      // Сохраняем ссылку в массив для мгновенного доступа по индексу
      window.__ai_elements.push(el);
      const id = window.__ai_elements.length;

      let typeInfo = tag;
      if (el.type && el.type !== "text" && el.type !== "submit") {
        typeInfo += `[${el.type}]`;
      }

      lines.push(`[${id}] ${typeInfo}: "${label || '#' + el.id}"`);
      if (window.__ai_elements.length >= maxCount) break;
    }

    return lines.join("\n");
  }

  // Мгновенное извлечение сжатого текста страницы
  function extractPageText(maxLength = 3500) {
    if (!document.body) return "";
    const raw = document.body.innerText || "";
    const cleanLines = raw
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Удаление повторяющихся строк подряд (например, одинаковые логи или разделители)
    const deduped = [];
    for (let i = 0; i < cleanLines.length; i++) {
      if (cleanLines[i] !== cleanLines[i - 1]) {
        deduped.push(cleanLines[i]);
      }
    }

    const text = deduped.join("\n");
    return text.length > maxLength ? text.slice(0, maxLength) + "\n... [остальной текст опущен для скорости]" : text;
  }

  // Обработчик команд
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    const { action, params = {} } = req;

    try {
      switch (action) {
        case "read_page": {
          const elementsText = extractInteractiveElements();
          const pageText = extractPageText();

          // Формируем единый ультра-компактный блок для нейросети
          const summary = [
            `# Вкладка: ${document.title}`,
            `URL: ${window.location.href}`,
            "",
            "--- ТЕКСТ / СТАТУС НА СТРАНИЦЕ ---",
            pageText,
            "",
            "--- ИНТЕРАКТИВНЫЕ ЭЛЕМЕНТЫ (кликайте по номеру [ID]) ---",
            elementsText || "(интерактивные элементы не найдены)"
          ].join("\n");

          sendResponse({
            title: document.title,
            url: window.location.href,
            summary: summary,
            count: window.__ai_elements.length
          });
          break;
        }

        case "click": {
          const target = params.selector;
          const el = resolveElement(target);
          if (!el) {
            sendResponse({ success: false, error: `Элемент не найден: ${target}` });
            return;
          }

          el.scrollIntoView({ behavior: "instant", block: "center" });
          highlightElement(el, "#22c55e");

          const opts = { bubbles: true, cancelable: true, view: window };
          el.dispatchEvent(new PointerEvent("pointerdown", opts));
          el.dispatchEvent(new MouseEvent("mousedown", opts));
          el.dispatchEvent(new PointerEvent("pointerup", opts));
          el.dispatchEvent(new MouseEvent("mouseup", opts));
          el.click();

          const label = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || el.value || el.tagName;
          sendResponse({
            success: true,
            clicked: label
          });
          break;
        }

        case "type": {
          const target = params.selector;
          const el = resolveElement(target);
          if (!el) {
            sendResponse({ success: false, error: `Поле ввода не найдено: ${target}` });
            return;
          }

          el.scrollIntoView({ behavior: "instant", block: "center" });
          el.focus();
          highlightElement(el, "#3b82f6");

          if (params.clear !== false) {
            el.value = "";
          }

          el.value = (el.value || "") + (params.text || "");
          el.dispatchEvent(new Event("beforeinput", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));

          if (params.press_enter) {
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
            if (el.form && typeof el.form.requestSubmit === "function") {
              el.form.requestSubmit();
            }
          }

          sendResponse({
            success: true,
            typed: params.text,
            current_value: el.value
          });
          break;
        }

        case "scroll": {
          const direction = params.direction || "down";
          const amount = params.amount || (window.innerHeight * 0.75);

          if (direction === "down") {
            window.scrollBy({ top: amount, behavior: "smooth" });
          } else if (direction === "up") {
            window.scrollBy({ top: -amount, behavior: "smooth" });
          } else if (direction === "top") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (direction === "bottom") {
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          } else if (params.selector) {
            const el = resolveElement(params.selector);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }

          sendResponse({ success: true, scrollY: window.scrollY });
          break;
        }

        default:
          sendResponse({ success: false, error: `Действие ${action} не поддерживается` });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message || String(err) });
    }

    return true;
  });
})();

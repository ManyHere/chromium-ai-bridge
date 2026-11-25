// Antigravity Browser Bridge - Content Script (Ultra-Fast Edition v1.1)

(() => {
  // Защита от повторной регистрации слушателей при ручной инъекции
  if (window.__ai_bridge_loaded) return;
  window.__ai_bridge_loaded = true;

  // Кеш найденных интерактивных элементов для мгновенного доступа по числовому ID
  window.__ai_elements = window.__ai_elements || [];

  const INTERACTIVE_SELECTOR = [
    "button",
    "a[href]",
    "input:not([type='hidden'])",
    "textarea",
    "select",
    "summary",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='option']",
    "[role='tab']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='combobox']",
    "[tabindex='0']"
  ].join(", ");

  const MODAL_SELECTOR = "dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true'], [role='menu'], [role='listbox']";

  // Быстрая проверка видимости элемента
  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  // Рекурсивный сбор элементов с учетом открытых Shadow DOM
  function queryAllDeep(root, selector, out = []) {
    if (!root || !root.querySelectorAll) return out;
    const matches = root.querySelectorAll(selector);
    for (const m of matches) out.push(m);

    const allNodes = root.querySelectorAll("*");
    for (const node of allNodes) {
      if (node.shadowRoot) {
        queryAllDeep(node.shadowRoot, selector, out);
      }
    }
    return out;
  }

  // Подсветка элемента для наглядности действий AI
  function highlightElement(el, color = "#6366f1") {
    try {
      if (!(el instanceof HTMLElement)) return;
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

  // Установка значения input/textarea в обход внутреннего трекера React 16-19 / Vue
  function setNativeInputValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : null;
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  // Безопасное экранирование для CSS-атрибутов
  function escapeCss(str) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(str);
    }
    return str.replace(/["\\]/g, "\\$&");
  }

  // Поиск элемента по числовому ID [1], селектору или тексту
  function resolveElement(query) {
    if (!query && query !== 0) return null;

    // 1. Быстрый поиск по числовому ID: 1, "1", "[1]"
    const numMatch = String(query).trim().match(/^\[?(\d+)\]?$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      const cached = window.__ai_elements && window.__ai_elements[idx];
      if (cached && cached.isConnected) {
        return cached;
      }
    }

    const strQuery = String(query).trim();
    if (!strQuery) return null;

    // 2. Попытка как прямой CSS селектор
    try {
      const el = document.querySelector(strQuery);
      if (el) return el;
    } catch (_) {}

    // 3. Попытка по экранированному aria-label, title, placeholder или name
    try {
      const esc = escapeCss(strQuery);
      const attrEl = document.querySelector(
        `[aria-label="${esc}"], [title="${esc}"], [placeholder="${esc}"], [name="${esc}"]`
      );
      if (attrEl) return attrEl;
    } catch (_) {}

    // 4. Поиск по точному тексту или вхождению (включая Shadow DOM)
    const clean = strQuery.toLowerCase();
    const candidates = queryAllDeep(document, INTERACTIVE_SELECTOR + ", label");

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const aria = (el.getAttribute("aria-label") || "").toLowerCase().trim();
      const txt = (el.textContent || "").toLowerCase().trim();
      const placeholder = (el.getAttribute("placeholder") || "").toLowerCase().trim();
      if (aria === clean || txt === clean || placeholder === clean) return el;
    }

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const txt = (el.textContent || "").toLowerCase();
      const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
      if (aria.includes(clean) || txt.includes(clean) || placeholder.includes(clean)) return el;
    }

    return null;
  }

  // Сбор интерактивных элементов с приоритетом открытых модальных окон и видимого экрана
  function extractInteractiveElements(maxCount = 150) {
    window.__ai_elements = [];
    const seen = new Set();
    const orderedCandidates = [];

    // 1. Сначала элементы внутри открытых диалогов, меню и модальных окон
    const modals = Array.from(document.querySelectorAll(MODAL_SELECTOR)).filter(isVisible);
    for (const modal of modals) {
      for (const el of queryAllDeep(modal, INTERACTIVE_SELECTOR)) {
        if (!seen.has(el)) {
          seen.add(el);
          orderedCandidates.push({ el, inModal: true });
        }
      }
    }

    // 2. Затем элементы на странице: сначала в пределах экрана (viewport), потом остальные
    const allPageElements = queryAllDeep(document, INTERACTIVE_SELECTOR);
    const inViewport = [];
    const offViewport = [];
    const vh = window.innerHeight || 900;

    for (const el of allPageElements) {
      if (seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.bottom >= -100 && rect.top <= vh + 250) {
        inViewport.push({ el, inModal: false });
      } else {
        offViewport.push({ el, inModal: false });
      }
    }

    orderedCandidates.push(...inViewport, ...offViewport);

    const lines = [];
    for (const { el, inModal } of orderedCandidates) {
      if (!isVisible(el)) continue;

      const tag = el.tagName.toLowerCase();
      const isEditable = el.isContentEditable && tag !== "input" && tag !== "textarea";
      let label = "";

      if (tag === "input" || tag === "textarea") {
        label = el.placeholder || el.getAttribute("aria-label") || el.name || el.value || "";
      } else if (tag === "select") {
        const selectedText = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : "";
        const base = el.getAttribute("aria-label") || el.name || "";
        label = base ? `${base} (${selectedText})` : selectedText;
      } else if (isEditable) {
        label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("data-placeholder") || (el.innerText || "").trim();
      } else {
        label = el.getAttribute("aria-label") || el.title || (el.textContent || "").trim().replace(/\s+/g, " ");
      }

      label = label.slice(0, 65).trim();
      if (!label && !el.id && !isEditable && tag !== "input" && tag !== "textarea") continue;

      window.__ai_elements.push(el);
      const id = window.__ai_elements.length;

      let typeInfo = isEditable ? "editable" : tag;
      if (el.type && el.type !== "text" && el.type !== "submit" && tag !== "select") {
        typeInfo += `[${el.type}]`;
      }
      if (el.checked || el.getAttribute("aria-checked") === "true") {
        typeInfo += "[checked]";
      }
      if (inModal) {
        typeInfo = `modal:${typeInfo}`;
      }

      lines.push(`[${id}] ${typeInfo}: "${label || '#' + el.id || 'поле ввода'}"`);
      if (window.__ai_elements.length >= maxCount) break;
    }

    return lines.join("\n");
  }

  // Мгновенное извлечение сжатого текста страницы
  function extractPageText(maxLength = 4000) {
    if (!document.body) return "";
    const raw = document.body.innerText || "";
    const cleanLines = raw
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const deduped = [];
    for (let i = 0; i < cleanLines.length; i++) {
      if (cleanLines[i] !== cleanLines[i - 1]) {
        deduped.push(cleanLines[i]);
      }
    }

    const text = deduped.join("\n");
    return text.length > maxLength ? text.slice(0, maxLength) + "\n... [остальной текст опущен для скорости]" : text;
  }

  // Опциональное извлечение постов и файлов ВК (вызывается только по команде parse_vk_wall)
  function extractVkPosts() {
    const posts = [];
    const postElements = Array.from(document.querySelectorAll('div[id^="post-"], div._post, div[data-post-id], article'));

    for (const el of postElements) {
      let postId = el.getAttribute("data-post-id") || el.id || "";
      if (!postId) {
        const wallLink = el.querySelector('a[href*="/wall"], a[href*="wall="], a.post__anchor');
        if (wallLink) {
          const m = wallLink.href.match(/wall(-?\d+_\d+)/);
          if (m) postId = m[1];
        }
      }
      postId = postId.replace(/^post_?/, "");
      if (!postId) {
        const timeEl = el.querySelector('time, [class*="time"], [class*="date"]');
        const timeStr = timeEl ? timeEl.textContent.trim() : "";
        postId = "post_" + (timeStr || el.textContent.slice(0, 30)).replace(/\s+/g, "_");
      }

      const textEl = el.querySelector('.wall_post_text, [class*="PostText"], .post_text, [class*="wall_text"]');
      let text = textEl ? (textEl.innerText || textEl.textContent || "").trim() : "";
      if (!text) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('header, footer, a, [class*="Doc"], [class*="doc"], [class*="attach"], [class*="Action"], [class*="reaction"], [class*="Button"]').forEach(r => r.remove());
        text = (clone.innerText || "").trim();
      }

      const postLinkEl = el.querySelector('a.post__anchor, a[href*="/wall-"], a[href*="/wall"]');
      let postUrl = postLinkEl ? postLinkEl.href : "";
      if (!postUrl && postId && !postId.startsWith("post_")) {
        postUrl = `${window.location.origin}/wall${postId.startsWith("-") ? postId : ("-" + postId)}`;
      }

      const attachments = [];
      const allLinks = Array.from(el.querySelectorAll("a[href]"));

      for (const a of allLinks) {
        const href = a.href || "";
        const aText = (a.innerText || a.textContent || "").trim();
        const isDocHref = href.includes("/doc") || href.includes("docs.vk.") || href.includes("userapi.com") || /\.(pdf|docx?|xlsx?|zip|rar|7z|txt|csv)(\?|$)/i.test(href);
        const isDocText = /\.(pdf|docx?|xlsx?|zip|rar|7z|txt|csv)(\s|\b|$)/i.test(aText);
        const isDocClass = /doc/i.test(a.className || "") || /doc/i.test(a.getAttribute("data-testid") || "");

        if (isDocHref || isDocText || isDocClass) {
          let title = aText.split("\n")[0].trim();
          let sizeStr = "";
          const sizeMatch = title.match(/(\d+(?:\.\d+)?\s*(?:KB|MB|GB|КБ|МБ|ГБ|Б|B))/i);
          if (sizeMatch) {
            sizeStr = sizeMatch[1];
            title = title.replace(sizeMatch[1], "").trim();
          }
          if (!title) {
            title = href.split("/").pop().split("?")[0] || "document";
          }

          let finalUrl = href;
          if (!finalUrl.startsWith("http")) {
            finalUrl = window.location.origin + (finalUrl.startsWith("/") ? finalUrl : "/" + finalUrl);
          }

          if (!attachments.some(att => att.url === finalUrl || att.title === title)) {
            attachments.push({ title, url: finalUrl, size_str: sizeStr });
          }
        }
      }

      posts.push({
        id: postId,
        url: postUrl,
        text,
        has_files: attachments.length > 0,
        files: attachments
      });
    }
    return posts;
  }

  // Генерация кодов клавиш для реалистичных событий клавиатуры
  const KEY_MAP = {
    Enter: { code: "Enter", keyCode: 13 },
    Escape: { code: "Escape", keyCode: 27 },
    Tab: { code: "Tab", keyCode: 9 },
    Backspace: { code: "Backspace", keyCode: 8 },
    Delete: { code: "Delete", keyCode: 46 },
    ArrowUp: { code: "ArrowUp", keyCode: 38 },
    ArrowDown: { code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { code: "ArrowRight", keyCode: 39 },
    Space: { key: " ", code: "Space", keyCode: 32 }
  };

  function dispatchKey(targetEl, keyName) {
    const info = KEY_MAP[keyName] || { code: keyName, keyCode: keyName.length === 1 ? keyName.toUpperCase().charCodeAt(0) : 0 };
    const actualKey = info.key || keyName;
    const init = {
      key: actualKey,
      code: info.code,
      keyCode: info.keyCode,
      which: info.keyCode,
      bubbles: true,
      cancelable: true
    };
    targetEl.dispatchEvent(new KeyboardEvent("keydown", init));
    targetEl.dispatchEvent(new KeyboardEvent("keypress", init));
    targetEl.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  // Обработчик команд
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    const { action, params = {} } = req;

    try {
      switch (action) {
        case "read_page": {
          const elementsText = extractInteractiveElements(params.max_elements || 150);
          const pageText = extractPageText(params.max_text || 4000);

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
            summary,
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

          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const mouseOpts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: cx,
            clientY: cy,
            button: 0,
            buttons: 1
          };
          const pointerOpts = {
            ...mouseOpts,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true
          };

          el.dispatchEvent(new PointerEvent("pointerdown", pointerOpts));
          el.dispatchEvent(new MouseEvent("mousedown", mouseOpts));
          if (typeof el.focus === "function") el.focus({ preventScroll: true });
          el.dispatchEvent(new PointerEvent("pointerup", { ...pointerOpts, buttons: 0 }));
          el.dispatchEvent(new MouseEvent("mouseup", { ...mouseOpts, buttons: 0 }));

          if (typeof el.click === "function") {
            el.click();
          } else {
            el.dispatchEvent(new MouseEvent("click", { ...mouseOpts, buttons: 0 }));
          }

          const label = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 45) || el.value || el.tagName;
          sendResponse({ success: true, clicked: label });
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
          if (typeof el.focus === "function") el.focus();
          highlightElement(el, "#3b82f6");

          const textToType = params.text ?? "";
          let currentValue = "";

          if (el.isContentEditable && el.tagName.toLowerCase() !== "input" && el.tagName.toLowerCase() !== "textarea") {
            if (params.clear !== false) {
              document.execCommand("selectAll", false, null);
              document.execCommand("delete", false, null);
              if (el.innerText) el.textContent = "";
            }
            const ok = document.execCommand("insertText", false, textToType);
            if (!ok) {
              el.textContent = (el.textContent || "") + textToType;
              el.dispatchEvent(new InputEvent("input", { bubbles: true, data: textToType, inputType: "insertText" }));
            }
            currentValue = (el.innerText || el.textContent || "").trim();
          } else {
            const baseVal = params.clear !== false ? "" : (el.value || "");
            const nextVal = baseVal + textToType;
            setNativeInputValue(el, nextVal);
            el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, data: textToType, inputType: "insertText" }));
            el.dispatchEvent(new InputEvent("input", { bubbles: true, data: textToType, inputType: "insertText" }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            currentValue = el.value;
          }

          if (params.press_enter) {
            dispatchKey(el, "Enter");
            if (el.form && typeof el.form.requestSubmit === "function") {
              try { el.form.requestSubmit(); } catch (_) {}
            }
          }

          sendResponse({
            success: true,
            typed: textToType,
            current_value: currentValue
          });
          break;
        }

        case "press_key": {
          const el = params.selector
            ? resolveElement(params.selector)
            : (document.activeElement || document.body);
          if (!el) {
            sendResponse({ success: false, error: `Элемент не найден: ${params.selector}` });
            return;
          }
          if (typeof el.focus === "function" && el !== document.body) {
            el.focus({ preventScroll: true });
          }
          const key = params.key || "Enter";
          dispatchKey(el, key);
          sendResponse({ success: true, key, target: el.tagName });
          break;
        }

        case "select_option": {
          const el = resolveElement(params.selector);
          if (!el || el.tagName.toLowerCase() !== "select") {
            sendResponse({ success: false, error: `Выпадающий список <select> не найден: ${params.selector}` });
            return;
          }
          const targetVal = String(params.value ?? "").trim();
          const targetLower = targetVal.toLowerCase();
          let matchedOption = null;

          for (const opt of Array.from(el.options)) {
            if (opt.value === targetVal || opt.text.trim() === targetVal) {
              matchedOption = opt;
              break;
            }
          }
          if (!matchedOption) {
            for (const opt of Array.from(el.options)) {
              if (opt.value.toLowerCase().includes(targetLower) || opt.text.toLowerCase().includes(targetLower)) {
                matchedOption = opt;
                break;
              }
            }
          }
          if (!matchedOption) {
            sendResponse({ success: false, error: `Опция '${targetVal}' не найдена в списке` });
            return;
          }

          highlightElement(el, "#3b82f6");
          el.value = matchedOption.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          sendResponse({
            success: true,
            selected_value: matchedOption.value,
            selected_text: matchedOption.text.trim()
          });
          break;
        }

        case "scroll": {
          const direction = params.direction || "down";
          const amount = params.amount || Math.round(window.innerHeight * 0.75);

          if (params.selector) {
            const el = resolveElement(params.selector);
            if (!el) {
              sendResponse({ success: false, error: `Элемент для прокрутки не найден: ${params.selector}` });
              return;
            }
            el.scrollIntoView({ behavior: "instant", block: "center" });
          } else if (direction === "down") {
            window.scrollBy({ top: amount, behavior: "instant" });
          } else if (direction === "up") {
            window.scrollBy({ top: -amount, behavior: "instant" });
          } else if (direction === "top") {
            window.scrollTo({ top: 0, behavior: "instant" });
          } else if (direction === "bottom") {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
          }

          sendResponse({ success: true, scrollY: Math.round(window.scrollY) });
          break;
        }

        case "parse_vk_wall": {
          const posts = extractVkPosts();
          sendResponse({ success: true, count: posts.length, posts });
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

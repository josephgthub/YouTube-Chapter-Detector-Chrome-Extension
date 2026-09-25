function hasYTChat() {
  return !!document.querySelector('button[aria-label="Ask"]');
}

async function initYTChat() {
  const panelSelector = 'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"]';

  const panel = document.querySelector(panelSelector);
  const isOpen =
    panel?.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";

  if (isOpen) {
    console.log("✅ Chat already open");
    return;
  }

  const askBtn = document.querySelector('button[aria-label="Ask"]');
  if (!askBtn) {
    console.log("❌ Ask button not found");
    return;
  }

  // 👻 hide panel before opening
  const style = document.createElement("style");
  style.id = "yt-stealth-hide";
  style.textContent = `
    ${panelSelector} {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      askBtn.click();

      requestAnimationFrame(() => {
        const closeBtn = [...document.querySelectorAll('button')]
          .find(b => b.getAttribute('aria-label') === 'Close' && b.offsetParent !== null);

        closeBtn?.click();

        document.getElementById("yt-stealth-hide")?.remove();

        console.log("👻 Chat initialized invisibly");
        resolve();
      });
    });
  });
}

async function askYT(prompt) {
  await initYTChat();

  const textarea = document.querySelector('textarea.chatInputViewModelChatInput');
  const container = document.querySelector('[data-target-id="youchat_messages_section"] #contents');

  if (!textarea || !container) {
    console.log("❌ Chat UI not ready");
    return;
  }

  const initialMessages = container.querySelectorAll(
    'you-chat-item-view-model markdown-div'
  ).length;

  // type like human
  textarea.focus();
  textarea.value = "";

  for (let char of prompt) {
    textarea.value += char;
    textarea.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: char,
      inputType: "insertText"
    }));
  }

  // trigger enable
  textarea.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));

  // send
  setTimeout(() => {
    document.querySelector('button[aria-label="Send"]:not([disabled])')?.click();
  }, 200);

  console.log("📤 Prompt sent...");

  // wait for NEW response
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const messages = container.querySelectorAll(
        'you-chat-item-view-model markdown-div'
      );

      if (messages.length > initialMessages) {
        const last = messages[messages.length - 1];

        waitForStableText(last).then((text) => {
          observer.disconnect();
          console.log("🧠 Response:", text);
          resolve(text);
        });
      }
    });

    observer.observe(container, { childList: true, subtree: true });
  });
}

// helper
function waitForStableText(el, delay = 800) {
  return new Promise((resolve) => {
    let last = "";

    const i = setInterval(() => {
      const now = el.innerText.trim();

      if (now && now === last) {
        clearInterval(i);
        resolve(now);
      }

      last = now;
    }, delay);
  });
}
// content.js
if (!window.__ytChapterDetectorContentInitialized) {
  window.__ytChapterDetectorContentInitialized = true;

  function seekToTime(time, retries = 5, delay = 1000) {
    return new Promise((resolve) => {
      function attemptSeek(attempt) {
        const video = document.querySelector('video');
        if (video && video.readyState >= 1) {
          try {
            video.currentTime = time;
            resolve({ success: true });
          } catch (error) {
            resolve({ success: true });
          }
        } else if (attempt < retries) {
          setTimeout(() => attemptSeek(attempt + 1), delay);
        } else {
          resolve({ success: true });
        }
      }
      attemptSeek(0);
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'seekTo') {
      seekToTime(request.time)
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          sendResponse({ success: false, error: `SeekToTime error: ${error.message}` });
        });
      return true;
    }
  });

  (() => {
    let lastVideoId = null;
    let observer = null;
    let isRunning = true;
    let contextCheckInterval = null;

    const isContextValid = () => {
      try {
        return !!chrome.runtime && !!chrome.runtime.id && isRunning;
      } catch {
        return false;
      }
    };

    const sendVideoChangeMessage = (videoId) => {
      if (!isContextValid()) return;
      try {
        chrome.runtime.sendMessage({ action: 'videoChanged', videoId });
      } catch (e) {}
    };

    const checkVideoChange = () => {
      if (!isContextValid()) return;
      try {
        if (location.href.match(/^(chrome|about|file|edge|opera):\/\//)) return;
        const url = new URL(location.href);
        if (url.hostname !== 'www.youtube.com' || !url.pathname.startsWith('/watch')) return;
        const currentId = url.searchParams.get('v');
        if (currentId && currentId !== lastVideoId) {
          lastVideoId = currentId;
          sendVideoChangeMessage(currentId);
        }
      } catch (e) {}
    };

    try {
      const url = new URL(location.href);
      if (url.hostname === 'www.youtube.com' && url.pathname.startsWith('/watch')) {
        lastVideoId = url.searchParams.get('v');
      }
    } catch (e) {}

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
      }
      observer = null;
      isRunning = false;
      if (contextCheckInterval) {
        clearInterval(contextCheckInterval);
        contextCheckInterval = null;
      }
    };

    observer = new MutationObserver(() => {
      if (!isContextValid()) {
        cleanup();
        return;
      }
      checkVideoChange();
    });
    observer.observe(document, { childList: true, subtree: true });

    contextCheckInterval = setInterval(() => {
      if (!isContextValid()) {
        cleanup();
      }
    }, 3000);

    window.addEventListener('pagehide', cleanup, { once: true });
  })();
}
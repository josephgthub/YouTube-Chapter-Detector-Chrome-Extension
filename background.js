// background.js
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.runtime.onConnect.addListener((port) => {
    port.onDisconnect.addListener(() => {
      console.debug('Port disconnected');
    });
  });
});

chrome.tabs.onActivated.addListener(() => {
  if (!chrome.runtime) {
    console.debug('Extension context invalidated, skipping tab activation message');
    return;
  }
  chrome.runtime.sendMessage({ action: 'tabChanged' }, () => {
    if (chrome.runtime.lastError) {
      console.debug('Tab activation message failed:', chrome.runtime.lastError.message);
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchVideoDetails') {
    chrome.storage.local.get([request.url], (result) => {
      const cachedData = result[request.url];
      if (
        cachedData &&
        cachedData.title &&
        cachedData.thumbnail &&
        cachedData.duration !== undefined &&
        (!cachedData.isLive || (cachedData.isLive && (new Date() - new Date(cachedData.lastCheckedTime || '1/1/1970')) / 1000 / 60 < 5))
      ) {
        const playerResponse = {
          videoDetails: {
            title: cachedData.title,
            thumbnail: { thumbnails: [{ url: cachedData.thumbnail }] },
            shortDescription: '',
            lengthSeconds: cachedData.duration.toString(),
          },
        };
        sendResponse({ details: { playerResponse, html: '' } });
      } else {
        fetchVideoDetails(request.url)
          .then((details) => sendResponse({ details }))
          .catch((error) => sendResponse({ error: error.message }));
      }
    });
    return true;
  } else if (request.action === 'forceSavedVideos') {
    chrome.storage.local.set({ showSavedVideos: true }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'forceFetchVideoDetails') {
    fetchVideoDetails(request.url)
      .then((details) => sendResponse({ details }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  // Fallback response for unhandled actions
  sendResponse({ error: 'Unknown action' });
  return false;
});

function normalizeYouTubeUrlbacgroundjs(url) {
  try {
    if (!url) throw new Error('Empty URL');
    const urlObj = new URL(url);
    if (urlObj.hostname !== 'www.youtube.com' || !urlObj.pathname.startsWith('/watch')) {
      return url;
    }
    const videoId = urlObj.searchParams.get('v');
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
  } catch (e) {
    // console.error('Error normalizing URL:', url, e);
    return '';
  }
}

async function fetchVideoDetails(url) {
  // console.log("url:",url,"fetching url:",url.replace('view-source:', ''))
  url=normalizeYouTubeUrlbacgroundjs(url.replace('view-source:', ''))
  const retries = 2;
  const delay = 1000;

  // Check local storage for lastFetchedTime
  const storage = await new Promise((resolve) => {
    chrome.storage.local.get('lastFetchedTime', (data) => resolve(data));
  });

  const currentTime = new Date();
  const lastFetchedTime = storage.lastFetchedTime ? new Date(storage.lastFetchedTime) : null;
  if (lastFetchedTime && (currentTime - lastFetchedTime) < 5000) {
    // Wait random delay between 0 and 1000ms
    const randomDelay = Math.random() * 1000;
    console.log("last fetch time is less than 5 seconds waiting for",Math.floor(randomDelay),"ms");
    await new Promise((resolve) => setTimeout(resolve, randomDelay));
  }

  // Update lastFetchedTime in storage before fetching
  const newFetchTime = currentTime.toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  await new Promise((resolve) => {
    chrome.storage.local.set({ lastFetchedTime: newFetchTime }, resolve);
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log("Attempt "+attempt+"\n"+"fetching url:", url, newFetchTime);
      const response = await fetch(url.replace('view-source:', ''), {
        headers: {
          Accept: 'text/html',
          'User-Agent': navigator.userAgent,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();

      const jsonStrMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
      if (!jsonStrMatch) {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error('No ytInitialPlayerResponse found');
      }
      const playerResponse = JSON.parse(jsonStrMatch[1]);
      return { playerResponse, html };
    } catch (error) {
      if (attempt === retries) throw new Error(`Failed to fetch video details: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  chrome.runtime.sendMessage({
    action: details.url.includes('youtube.com/watch') ? 'videoChanged' : 'urlChanged'
  }, () => {
    if (chrome.runtime.lastError) {
      console.debug('Message sending failed:', chrome.runtime.lastError.message);
    }
  });
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.transitionType === 'link' || details.transitionType === 'typed' || details.transitionType === 'auto_bookmark' || details.transitionType === 'reload') {
    chrome.runtime.sendMessage({
      action: details.url.includes('youtube.com/watch') ? 'videoChanged' : 'urlChanged'
    }, () => {
      if (chrome.runtime.lastError) {
        console.debug('Message sending failed:', chrome.runtime.lastError.message);
      }
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.runtime.sendMessage({
      action: tab.url.includes('youtube.com/watch') ? 'videoChanged' : 'urlChanged'
    }, () => {
      if (chrome.runtime.lastError) {
        console.debug('Message sending failed:', chrome.runtime.lastError.message);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'log') {
    console.log(request.message);
  }
});
// popup.js
let currentTab = 'normal';
let currentChapters = [];
let currentTime = 0;
let videoUrl = '';
let lastActiveChapterIndex = -1;
let searchResults = [];
let currentSearchIndex = -1;
let isAutoScrolling = false;
let hasContextMenuCleanupListeners = false;
let hasTabActivatedNotificationListener = false;

function clearTransientNotification() {
  const notification = document.getElementById('notification');
  if (!notification) return;
  notification.classList.remove('show', 'seek-right', 'seek-left');
  notification.textContent = '';
  if (window.notificationTimeout) {
    clearTimeout(window.notificationTimeout);
    window.notificationTimeout = null;
  }
}

function removeAllContextMenus() {
  document.querySelectorAll('.context-menu').forEach(menu => {
    menu.style.opacity = '0';
    setTimeout(() => menu.remove(), 200);
  });
}

function ensureGlobalContextMenuCleanupListeners() {
  if (hasContextMenuCleanupListeners) return;
  window.addEventListener('blur', removeAllContextMenus);
  window.addEventListener('resize', removeAllContextMenus);
  chrome.tabs.onActivated.addListener(removeAllContextMenus);
  chrome.windows.onFocusChanged.addListener(removeAllContextMenus);
  hasContextMenuCleanupListeners = true;
}

function ensureTabActivatedNotificationCleanup() {
  if (hasTabActivatedNotificationListener) return;
  chrome.tabs.onActivated.addListener(() => {
    clearTransientNotification();
  });
  hasTabActivatedNotificationListener = true;
}



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'tabChanged' || request.action === 'videoChanged' || request.action === 'urlChanged') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs.find((t) => t.active);
      if (!activeTab || !activeTab.url.includes('youtube.com/watch')) {
        chrome.storage.local.remove('showSavedVideos', () => {
          showError('Not a valid YouTube video page');
          document.querySelector('.tabs').style.display = 'none';
          document.getElementById('sync-button').style.display = 'none';
          document.getElementById('search-button').style.display = 'block';
          document.getElementById('delete-video-button').style.display = 'none';
          document.getElementById('saved-storage-button').style.display = 'block';
          document.getElementById('back-button').style.display = 'none';
          document.getElementById('saved-content').style.display = 'none';
          document.getElementById('normal-content').style.display = 'block';
          currentTab = 'normal';
          videoUrl = '';
          updateVideoInfo('', '', 0, '');
          clearSearch();
          renderSavedVideos([]);
        });
      } else if (normalizeYouTubeUrl(activeTab.url) !== videoUrl) {
        videoUrl = normalizeYouTubeUrl(activeTab.url);
        showLoading();
        chrome.scripting.executeScript(
          {
            target: { tabId: activeTab.id },
            func: () => document.querySelector('video')?.currentTime,
          },
          (results) => {
            if (results && results[0]?.result !== undefined) {
              currentTime = results[0].result;
            } else {
              currentTime = 0;
            }
            chrome.storage.local.get(['lastActiveTab', videoUrl], async (result) => {
              const cachedData = result[videoUrl];
              const videoData = result[videoUrl] || {};
              let initialTab = videoData.lastActiveTab || 'custom';
              if (!cachedData) {
              }
              document.querySelector('.tabs').style.display = 'flex';
              document.getElementById('sync-button').style.display = 'block';
              document.getElementById('search-button').style.display = 'block';
              document.getElementById('delete-video-button').style.display = 'block';
              document.getElementById('saved-storage-button').style.display = 'block';
              document.getElementById('back-button').style.display = 'none';
              location.reload();
            });
          }
        );
      }
    });
  }
});

function updateVideoInfo(thumbnail, title, duration, channel) {
  if(duration===0){
    duration=36000;
  }
  const thumbnailEl = document.getElementById('video-thumbnail');
  const titleEl = document.getElementById('video-title');
  const metaEl = document.getElementById('video-meta-text');
  const headerEl = document.querySelector('.header');
  if (thumbnailEl && titleEl && metaEl && headerEl) {
    if (!thumbnail || !title) {
      thumbnailEl.style.display = 'none';
      titleEl.textContent = 'Youtube Video Chapters';
      titleEl.title = '';
      metaEl.textContent = '';
      metaEl.title = '';
      headerEl.style.display = 'block'; // Ensure header is visible
    } else {
      thumbnailEl.style.display = 'block';
      thumbnailEl.src = thumbnail;
      titleEl.textContent = title;
      titleEl.title = title;
      metaEl.textContent = (duration !== undefined && duration >= 0) && channel ? `${formatTime(duration)} • ${channel}` : (duration !== undefined && duration >= 0) ? formatTime(duration) : channel ? `• ${channel}` : '0:00';
      metaEl.title = channel || '';
      headerEl.style.display = 'block';
    }
  }
}

function switchTab(tab) {
  document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
  const validTabs = ['normal', 'auto', 'keymoments', 'description', 'custom'];
  if (!validTabs.includes(tab)) {
    tab = 'custom';
  }
  const searchButton = document.getElementById('search-button');
  if (searchButton) {
    searchButton.title = 'Search Chapters';
    // document.getElementById('search-input').placeholder = 'Search Chapters';
  }
  chrome.storage.local.remove('showSavedVideos', () => {
    currentTab = tab;
    const syncButton = document.getElementById('sync-button');
    syncButton.classList.remove('visible');
    lastActiveChapterIndex = -1;
    chrome.storage.local.get([videoUrl], (result) => {
      if (!result[videoUrl] || !videoUrl.includes('youtube.com/watch')) return; // Skip if no existing data or invalid URL
      const videoData = result[videoUrl];
      videoData.lastActiveTab = tab;
      chrome.storage.local.set({ [videoUrl]: videoData });
    });
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.remove('active');
      const span = t.querySelector('span');
      if (span) {
        const isOverflowing = span.scrollWidth > span.clientWidth;
        if (isOverflowing) {
          span.classList.add('overflow');
        } else {
          span.classList.remove('overflow');
        }
      }
    });
    const tabElement = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (tabElement) {
      tabElement.classList.add('active');
      const span = tabElement.querySelector('span');
      if (span) {
        const isOverflowing = span.scrollWidth > span.clientWidth;
        if (isOverflowing) {
          span.classList.add('overflow');
        } else {
          span.classList.remove('overflow');
        }
      }
    }
    document.querySelectorAll('.content').forEach((c) => (c.style.display = 'none'));
    const targetContent = document.getElementById(`${tab}-content`);
    if (targetContent) {
      targetContent.style.display = 'block';
      const chapters = window[`${tab}Chapters`] || [];
      const chapterEls = targetContent.querySelectorAll('.chapter');
      let activeIndex = -1;
      chapters.forEach((chapter, i) => {
        if (chapter && currentTime >= chapter.start_time && (!chapters[i + 1] || currentTime < chapters[i + 1].start_time)) {
          activeIndex = i;
        }
      });
      if (chapters.length > 0) {
        setTimeout(() => highlightCurrentChapter(), 50);
      }
      if (activeIndex >= 0 && chapterEls[activeIndex]) {
        const headerHeight = document.querySelector('.header').offsetHeight;
        const targetScrollPosition = chapterEls[activeIndex].offsetTop - headerHeight - 20;
        isAutoScrolling = true;
        targetContent.scrollTo({
          top: targetScrollPosition,
          behavior: 'auto',
        });
        lastActiveChapterIndex = activeIndex;
        setTimeout(() => {
          isAutoScrolling = false;
        }, 600);
      } else {
        targetContent.scrollTop = 0;
      }
    }
    currentChapters = window[`${tab}Chapters`] || [];
    clearSearch();
  });
}


document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    chrome.storage.local.remove('showSavedVideos', () => {
      switchTab(tab.dataset.tab);
    });
  });
});

document.getElementById('saved-storage-button').addEventListener('click', () => {
  chrome.storage.local.set({ showSavedVideos: true, previousTab: currentTab }, () => {
    showSavedStorage();
  });
});

document.getElementById('back-button').addEventListener('click', () => {
  chrome.storage.local.remove('showSavedVideos');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs.find((t) => t.active && t.url?.includes('youtube.com/watch'));
    if (!activeTab || !activeTab.id || !activeTab.url.includes('youtube.com/watch')) {
      showError('Not a valid YouTube video page');
      document.querySelector('.tabs').style.display = 'none';
      document.getElementById('sync-button').style.display = 'none';
      document.getElementById('search-button').style.display = 'block';
      document.getElementById('delete-video-button').style.display = 'none';
      document.getElementById('saved-storage-button').style.display = 'block';
      document.getElementById('back-button').style.display = 'none';
      document.getElementById('saved-content').style.display = 'none';
      document.getElementById('normal-content').style.display = 'block';
      currentTab = 'normal';
    } else {
      const url = normalizeYouTubeUrl(activeTab.url);
      chrome.storage.local.get([url, 'previousTab'], (result) => {
        if (result[url]) {
          const lastActiveTab = result[url].lastActiveTab || 'normal';
          switchTab(lastActiveTab);
        } else {
          const previousTab = result.previousTab || 'normal';
          switchTab(previousTab);
        }
        chrome.storage.local.remove('previousTab');
      });
    }
  });
});

document.getElementById('delete-all-button').addEventListener('click', (e) => {
  e.stopPropagation();
  const popup = document.getElementById('delete-all-popup');
  popup.style.display = 'block';
  document.body.classList.add('delete-popup-active');
  const confirmButton = document.getElementById('confirm-delete-all');
  // confirmButton.focus();
});

// Focus trap for delete-all-popup
document.getElementById('delete-all-popup').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const confirmButton = document.getElementById('confirm-delete-all');
    const cancelButton = document.getElementById('cancel-delete-all');
    const activeElement = document.activeElement;
    // Tab (forward)
    if (activeElement === confirmButton) {
      cancelButton.focus();
    } else {
      confirmButton.focus();
    }

  }
});

document.getElementById('confirm-delete-all').addEventListener('click', () => {
  const notification = document.getElementById('notification');
  if (window.notificationTimeout) {
    clearTimeout(window.notificationTimeout);
    notification.classList.remove('show');
  }
  notification.innerHTML = `
    <div class="notification-deletedallvideodata">Deleted All Saved Data</div>
  `;
  notification.classList.add('show');
  window.notificationTimeout = setTimeout(() => {
    notification.classList.remove('show');
    notification.textContent = '';
    window.notificationTimeout = null;
  }, 2000);
  chrome.storage.local.get(null, (result) => {
    const videoKeys = Object.keys(result).filter((key) => key.includes('youtube.com/watch'));
    chrome.storage.local.remove(videoKeys, () => {
      console.log('Deleted all video data');
      window.savedVideos = [];
      renderSavedVideos([]);
      document.getElementById('delete-all-popup').style.display = 'none';
      document.body.classList.remove('delete-popup-active');
      document.getElementById('delete-all-button').blur();
    });
  });
});

document.getElementById('cancel-delete-all').addEventListener('click', () => {
  document.getElementById('delete-all-popup').style.display = 'none';
  document.body.classList.remove('delete-popup-active');
  document.getElementById('delete-all-button').blur();
});


document.getElementById('cancel-delete-video').addEventListener('click', () => {
  document.getElementById('delete-video-popup').style.display = 'none';
  document.body.classList.remove('delete-popup-active');
  document.getElementById('delete-video-button').blur();
});

document.getElementById('delete-video-button').addEventListener('click', (e) => {
  e.stopPropagation();
  const popup = document.getElementById('delete-video-popup');
  popup.style.display = 'block';
  document.body.classList.add('delete-popup-active');
  const confirmButton = document.getElementById('confirm-delete-video');
  // confirmButton.focus();
});

// Focus trap for delete-video-popup
document.getElementById('delete-video-popup').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const confirmButton = document.getElementById('confirm-delete-video');
    const cancelButton = document.getElementById('cancel-delete-video');
    const activeElement = document.activeElement;
    // Tab (forward)
    if (activeElement === confirmButton) {
      cancelButton.focus();
    } else {
      confirmButton.focus();
    }

  }
});



document.getElementById('search-button').addEventListener('click', (e) => {
  e.stopPropagation();
  const searchArea = document.getElementById('search-area');
  const isOpen = searchArea.style.display === 'flex';
  searchArea.style.display = isOpen ? 'none' : 'flex';
  document.body.classList.toggle('search-area-active', !isOpen);
  if (!isOpen) {
    document.getElementById('search-input').focus();
    const searchInput = document.getElementById('search-input');
    searchInput.value = ''; // Clear input on open
    searchContent(''); // Reset search
  } else {
    clearSearch();
  }
});

document.addEventListener('click', (e) => {
  const searchArea = document.getElementById('search-area');
  const deleteAllPopup = document.getElementById('delete-all-popup');
  const deleteVideoPopup = document.getElementById('delete-video-popup');
  const content = document.querySelector('.content');
  const chapter = e.target.closest('.chapter');

  if (
    deleteAllPopup.style.display === 'block' &&
    !deleteAllPopup.contains(e.target) &&
    e.target.id !== 'delete-all-button'
  ) {
    deleteAllPopup.style.display = 'none';
    document.body.classList.remove('delete-popup-active');
    return;
  }

  if (
    deleteVideoPopup.style.display === 'block' &&
    !deleteVideoPopup.contains(e.target) &&
    e.target.id !== 'delete-video-button'
  ) {
    deleteVideoPopup.style.display = 'none';
    document.body.classList.remove('delete-popup-active');
    return;
  }

  if (
    searchArea.style.display === 'flex' &&
    !searchArea.contains(e.target) &&
    e.target.id !== 'search-button' &&
    !chapter &&
    !content.contains(e.target)
  ) {
    searchArea.style.display = 'none';
    document.body.classList.remove('search-area-active');
    clearSearch();
  }
});

document.getElementById('clear-search-button').addEventListener('click', (e) => {
  clearSearch()
});

document.getElementById('search-input').addEventListener('input', (e) => {
  searchContent(e.target.value);
});

let enterHoldTimeout;
let enterRepeatInterval;

document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) {
    e.preventDefault();

    const direction = e.shiftKey ? 'reverse' : 'forward';

    // First single action immediately
    cycleSearchResults(direction);

    // Wait 500ms before starting the repeat
    enterHoldTimeout = setTimeout(() => {
      enterRepeatInterval = setInterval(() => cycleSearchResults(direction), 100);
    }, 500);
  }
});

document.getElementById('search-input').addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(enterHoldTimeout);
    clearInterval(enterRepeatInterval);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey && e.key === 'r')||(e.ctrlKey && e.key === 'R')) {
  e.preventDefault();
  const notification = document.getElementById('notification');
  if (window.notificationTimeout) {
    clearTimeout(window.notificationTimeout);
  }
  notification.textContent = 'Reloading...';
  notification.classList.add('show');
  console.log("from 2")
  chrome.runtime.sendMessage({ action: 'forceFetchVideoDetails', url: videoUrl }, async (response) => {
    if (window.notificationTimeout) {
      clearTimeout(window.notificationTimeout);
      notification.classList.remove('show');
    }
    if (response.error) {
      // showError('Failed to fetch video details');
      // console.error(response.error);
      notification.textContent = 'Failed to fetch data';
      notification.classList.add('show');
      window.notificationTimeout = setTimeout(() => {
        notification.classList.remove('show');
        notification.textContent = '';
        window.notificationTimeout = null;
      }, 2000);
      return;
    }
    const { playerResponse, html } = response.details;
    window.videoDuration = parseInt(playerResponse.videoDetails.lengthSeconds);
    const correctUrl = playerResponse.videoDetails?.videoId ? `https://www.youtube.com/watch?v=${playerResponse.videoDetails.videoId}` : videoUrl;
    const duration = window.videoDuration;
    const thumbnails = playerResponse.videoDetails?.thumbnail?.thumbnails || [];
    const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';
    const title = playerResponse.videoDetails?.title || 'Untitled';
    const channel = playerResponse.videoDetails?.author || 'Unknown';
    const description = playerResponse.videoDetails?.shortDescription || '';
    
    // Helper function to convert timestamp string to seconds
    function timestampToSeconds(timestamp) {
      const parts = timestamp.split(':').map(Number);
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 1) {
        return parts[0];
      }
      return 0;
    }

    // Extract chapters using the Python function's logic
    let normalChapters = [];
    let autoChapters = [];
    let keyMoments = [];
    
    const initialDataMatch = html.match(/ytInitialData\s*=\s*(\{.+?\});/);
    if (initialDataMatch) {
      const initialData = JSON.parse(initialDataMatch[1]);
      
      // First, extract from playerOverlays (legacy method)
      const overlay = initialData.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer || {};
      const markersMap = overlay.markersMap || [];
      for (const markerEntry of markersMap) {
        if (markerEntry.key === 'DESCRIPTION_CHAPTERS' && markerEntry.value?.chapters) {
          normalChapters = markerEntry.value.chapters.map((ch) => ({
            title: ch.chapterRenderer?.title?.simpleText || 'Untitled',
            start_time: (ch.chapterRenderer?.timeRangeStartMillis || 0) / 1000,
          }));
        }
        if (markerEntry.key === 'AUTO_CHAPTERS' && markerEntry.value?.chapters) {
          autoChapters = markerEntry.value.chapters.map((ch) => ({
            title: ch.chapterRenderer?.title?.simpleText || 'Untitled',
            start_time: (ch.chapterRenderer?.timeRangeStartMillis || 0) / 1000,
          }));
        }
      }
      
      // Extract chapters from engagementPanels using the Python function's logic
      const engagementPanels = initialData.engagementPanels || [];
      console.log('engagementPanels found:', engagementPanels.length);
      
      for (const panel of engagementPanels) {
        const panelRenderer = panel.engagementPanelSectionListRenderer;
        if (!panelRenderer) {
          continue;
        }
        
        const panelId = panelRenderer.panelIdentifier || '';
        console.log('Panel ID:', panelId);
        
        // Skip if not a macro markers (chapters) panel
        if (!panelId.includes('macro-markers')) {
          continue;
        }
        
        console.log('Found macro-markers panel:', panelId);
        
        // Get the header to determine chapter type
        const header = panelRenderer.header || {};
        const headerTitle = header.engagementPanelTitleHeaderRenderer?.title?.runs || [];
        const headerText = headerTitle.length > 0 ? headerTitle[0].text.toLowerCase() : '';
        console.log('Header text:', headerText);
        
        // Determine chapter type based on header text and panel ID
        let chapterType = null;
        if (headerText.includes('key moments')) {
          chapterType = 'keymoments';
        } else if (panelId.includes('description-chapters')) {
          chapterType = 'description';
        } else if (panelId.includes('auto-chapters')) {
          chapterType = 'auto';
        }
        
        console.log('Chapter type determined:', chapterType);
        
        if (chapterType === null) {
          continue;
        }
        
        // Extract chapters from the content
        const content = panelRenderer.content || {};
        const macroMarkersList = content.macroMarkersListRenderer || {};
        const contents = macroMarkersList.contents || [];
        
        console.log('Contents found:', contents.length);
        
        const chaptersArray = [];
        
        for (const item of contents) {
          // Skip info items (like "auto-generated" text)
          if (!item.macroMarkersListItemRenderer) {
            continue;
          }
          
          const chapterItem = item.macroMarkersListItemRenderer;
          
          // Extract timestamp
          const timeDesc = chapterItem.timeDescription || {};
          const timestamp = timeDesc.simpleText || '';
          
          // Extract title
          const chapterTitle = chapterItem.title?.simpleText || '';
          
          console.log('Extracted - Timestamp:', timestamp, 'Title:', chapterTitle);
          
          // Only add if both timestamp and title exist
          if (timestamp && chapterTitle) {
            const seconds = timestampToSeconds(timestamp);
            chaptersArray.push({
              title: chapterTitle,
              start_time: seconds
            });
          }
        }
        
        // Assign chapters to the appropriate type if chapters were found
        if (chaptersArray.length > 0) {
          console.log(`Found ${chaptersArray.length} chapters for type: ${chapterType}`);
          
          if (chapterType === 'description') {
            normalChapters = chaptersArray;
          } else if (chapterType === 'auto') {
            autoChapters = chaptersArray;
          } else if (chapterType === 'keymoments') {
            keyMoments = chaptersArray;
          }
        }
      }
    }
    
    const descriptionChaptersRaw = await extractChapters(description || '', duration || 36000);
    const descriptionChapters = Array.isArray(descriptionChaptersRaw) ? descriptionChaptersRaw : [];
    const uniqueDescriptionChapters = [];
    const seen = new Set();
    descriptionChapters.forEach((chapter) => {
      const key = `${chapter.start_time}:${chapter.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueDescriptionChapters.push(chapter);
      }
    });

    // Preserve existing custom chapters
    const customChapters = window.customChapters || [];

    // Determine initial tab
    let initialTab = 'custom';
    if (normalChapters.length > 0) initialTab = 'normal';
    else if (autoChapters.length > 0) initialTab = 'auto';
    else if (keyMoments.length > 0) initialTab = 'keymoments';
    else if (uniqueDescriptionChapters.length > 0) initialTab = 'description';

    // Update global chapter arrays
    window.normalChapters = normalChapters;
    window.autoChapters = autoChapters;
    window.descriptionChapters = uniqueDescriptionChapters;
    window.customChapters = customChapters;
    window.keyMoments = keyMoments;

    // Get live status
    const { isLive } = getVideoInfo(html, playerResponse);
    console.log("islive:",isLive)

    const storyboardUrl = playerResponse?.storyboards?.playerStoryboardSpecRenderer?.spec;
    const videoData = {
      url: correctUrl,
      title,
      thumbnail,
      duration,
      channel,
      normalChapters,
      autoChapters,
      keyMoments,
      descriptionChapters,
      customChapters,
      fetchTime: new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      isLive,
      storyboardUrl,
      ...(isLive ? { lastCheckedTime: new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) } : {}),
      lastActiveTab: initialTab,
    };
    updateSortedOrder(correctUrl, 0)
    chrome.storage.local.set({ [correctUrl]: videoData }, () => {
      // Render chapters
      renderChapters(normalChapters, 'normal-content', thumbnail);
      renderChapters(autoChapters, 'auto-content', thumbnail);
      renderChapters(keyMoments, 'keymoments-content', thumbnail);
      renderChapters(uniqueDescriptionChapters, 'description-content', thumbnail);
      renderChapters(customChapters, 'custom-content', thumbnail);
      updateVideoInfo(thumbnail, title, duration, channel);
      switchTab(initialTab);
      notification.textContent = 'Video data refetched';
      notification.classList.add('show');
      window.notificationTimeout = setTimeout(() => {
        notification.classList.remove('show');
        notification.textContent = '';
        window.notificationTimeout = null;
      }, 2000);
    });
  });
  return;
}
  const searchArea = document.getElementById('search-area');
  const deleteAllPopup = document.getElementById('delete-all-popup');
  const deleteVideoPopup = document.getElementById('delete-video-popup');


  
  if (e.ctrlKey && e.key === 'h') {
    e.preventDefault();
    chrome.storage.local.set({ showSavedVideos: true, previousTab: currentTab }, () => {
      showSavedStorage();
    });
    return; // Exit early to avoid other key checks
  }

  if (e.key === 'Escape') {
    if (deleteAllPopup.style.display === 'block') {
      e.preventDefault();
      deleteAllPopup.style.display = 'none';
      document.body.classList.remove('delete-popup-active');
      document.getElementById('delete-all-button').blur();
    } else if (deleteVideoPopup.style.display === 'block') {
      e.preventDefault();
      deleteVideoPopup.style.display = 'none';
      document.body.classList.remove('delete-popup-active');
      document.getElementById('delete-video-button').blur();
    } else if (searchArea.style.display === 'flex') {
      e.preventDefault();
      searchArea.style.display = 'none';
      document.body.classList.remove('search-area-active');
      clearSearch();
    }
  } else if (e.key === 'Enter') {
    if (deleteAllPopup.style.display === 'block') {
      e.preventDefault();
      document.getElementById('confirm-delete-all').click();
    } else if (deleteVideoPopup.style.display === 'block') {
      e.preventDefault();
      document.getElementById('confirm-delete-video').click();
    }
  } else if (e.ctrlKey && e.key === 'f') {
  e.preventDefault();
  if (
    searchArea.style.display !== 'flex' &&
    deleteAllPopup.style.display !== 'block' &&
    deleteVideoPopup.style.display !== 'block'
  ) {
    searchArea.style.display = 'flex';
    document.body.classList.add('search-area-active');
    document.getElementById('search-input').focus();
    const searchInput = document.getElementById('search-input');
    searchInput.value = ''; // Clear input on open
    searchContent(''); // Reset search
  }
} else if (
    e.key === 'Tab' &&
    currentTab !== 'saved' &&
    searchArea.style.display !== 'flex' &&
    deleteAllPopup.style.display !== 'block' &&
    deleteVideoPopup.style.display !== 'block'
  ) {
    e.preventDefault();
    cycleTabs(e.shiftKey ? 'reverse' : 'forward');
  }

if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    if (e.ctrlKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && currentTab !== 'saved') {
      e.preventDefault();
      const chapters = window[`${currentTab}Chapters`] || [];
      if (chapters.length === 0) return;
      let currentChapterIndex = -1;
      chapters.forEach((chapter, i) => {
        if (currentTime >= chapter.start_time && (!chapters[i + 1] || currentTime < chapters[i + 1].start_time)) {
          currentChapterIndex = i;
        }
      });
      let targetIndex = e.key === 'ArrowDown' ? currentChapterIndex + 1 : currentChapterIndex - 1;
      if (targetIndex >= 0 && targetIndex < chapters.length) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs.find((t) => t.url?.includes('youtube.com/watch'));
          if (activeTab?.id) {
            chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: (time) => {
                const video = document.querySelector('video');
                if (video && video.readyState >= 1) {
                  video.currentTime = time;
                  return { success: true };
                }
                return { success: false };
              },
              args: [chapters[targetIndex].start_time],
            });
          }
        });
      }
      } else if (e.shiftKey && (e.key === '<' || e.key === '>')) {
      e.preventDefault();
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs.find((t) => t.url?.includes('youtube.com/watch'));
        if (activeTab?.id) {
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: (direction) => {
              const video = document.querySelector('video');
              if (!video) return { success: false, currentSpeed: null };
              let newSpeed = video.playbackRate;
              newSpeed = direction === 'decrease' ? newSpeed - 0.25 : newSpeed + 0.25;
              newSpeed = Math.max(0.25, Math.min(8, newSpeed));
              video.playbackRate = newSpeed;
              return { success: true, currentSpeed: newSpeed };
            },
            args: [e.key === '<' ? 'decrease' : 'increase'],
          }, (results) => {
            if (results && results[0]?.result?.success) {
              const notification = document.getElementById('notification');
              if (window.notificationTimeout) {
                clearTimeout(window.notificationTimeout);
              }
              notification.textContent = `Playback speed: ${results[0].result.currentSpeed.toFixed(2)}x`;
              notification.classList.add('show');
              window.notificationTimeout = setTimeout(() => {
                notification.classList.remove('show');
                notification.textContent = '';
                window.notificationTimeout = null;
              }, 2000);
            }
          });
        }
      });
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const seekTime = e.ctrlKey ? 
        (e.key === 'ArrowRight' ? currentTime + 60 : currentTime - 60) :
        e.shiftKey ? 
        (e.key === 'ArrowRight' ? currentTime + 5 : currentTime - 5) :
        (e.key === 'ArrowRight' ? currentTime + 10 : currentTime - 10);
      const direction = e.key === 'ArrowRight' ? 'right' : 'left';

      // Stop any ongoing animation
      let activeChapter = document.querySelector(`#${currentTab}-content .chapter.active`);
      if (activeChapter) {
        const existingTriangles = activeChapter.querySelectorAll('.seek-triangle');
        existingTriangles.forEach(t => t.remove());
        activeChapter.classList.remove('seek-animating');
        // Clear existing timeouts
        if (window.seekAnimationTimeouts) {
          window.seekAnimationTimeouts.forEach(timeout => clearTimeout(timeout));
        }
        window.seekAnimationTimeouts = [];
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs.find((t) => t.url?.includes('youtube.com/watch'));
        if (activeTab?.id) {
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: (time) => {
              const video = document.querySelector('video');
              if (video && video.readyState >= 1) {
                video.currentTime = Math.max(0, time);
                return { success: true };
              }
              return { success: false };
            },
            args: [seekTime],
          }, (results) => {
            if (results && results[0]?.result?.success) {
              const notification = document.getElementById('notification');
              if (window.notificationTimeout) {
                clearTimeout(window.notificationTimeout);
              }
              const seekAmount = e.ctrlKey ? 60 : e.shiftKey ? 5 : 10;
              ensureTabActivatedNotificationCleanup();

              // Update notification
              const currentDirection = notification.classList.contains('seek-right') ? 'right' : 
                                      notification.classList.contains('seek-left') ? 'left' : null;
              if (currentDirection !== direction) {
                notification.classList.remove('seek-right', 'seek-left');
                notification.classList.add(`seek-${direction}`);
              }
              notification.textContent = `${direction === 'right' ? 'Forwarded ' : 'Reversed '}${seekAmount}s`;
              notification.classList.add('show');
              clearTimeout(window.notificationTimeout);
              window.notificationTimeout = setTimeout(() => {
                clearTransientNotification();
              }, 2500); // Match animation duration
            }
          });
        }
      });
    }
  }
  if (e.key === ' '&& !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
    e.preventDefault();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs.find((t) => t.url?.includes('youtube.com/watch'));
      if (activeTab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            const video = document.querySelector('video');
            if (!video) return { success: false };
            if (video.paused) {
              video.play();
              return { success: true, state: 'playing' };
            } else {
              video.pause();
              return { success: true, state: 'paused' };
            }
          },
        }, (results) => {
          if (results && results[0]?.result?.success) {
            const notification = document.getElementById('notification');
            if (window.notificationTimeout) {
              clearTimeout(window.notificationTimeout);
            }
            notification.textContent = `Video ${results[0].result.state}`;
            notification.classList.add('show');
            window.notificationTimeout = setTimeout(() => {
              notification.classList.remove('show');
              notification.textContent = '';
              window.notificationTimeout = null;
            }, 2000);
          }
        });
      }
    });
  }
});

chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
  chrome.tabs.query({ active: true, windowId: currentWindow.id }, (tabs) => {
  const activeTab = tabs.find((t) => t.active && t.url?.includes('youtube.com/watch'));
  const tabsElement = document.querySelector('.tabs');
  const syncButton = document.getElementById('sync-button');
  const searchButton = document.getElementById('search-button');
  const deleteVideoButton = document.getElementById('delete-video-button');
  const savedStorageButton = document.getElementById('saved-storage-button');
  const backButton = document.getElementById('back-button');

  if (!activeTab || !activeTab.id || activeTab.url.match(/^(chrome|about|file|edge|opera):\/\//) || !activeTab.url.includes('youtube.com/watch')) {
    updateVideoInfo('', '', 0, ''); // Set "Video Chapters" immediately
    showError('Not a valid YouTube video page');
    if (tabsElement) tabsElement.style.display = 'none';
    if (syncButton) syncButton.style.display = 'none';
    if (searchButton) searchButton.style.display = 'block';
    if (deleteVideoButton) deleteVideoButton.style.display = 'none';
    if (savedStorageButton) savedStorageButton.style.display = 'block';
    if (backButton) backButton.style.display = 'none';
    document.querySelector('.header').style.display = 'block'; // Ensure header is visible
    return;
  }

  videoUrl = normalizeYouTubeUrl(activeTab.url);
  if (!videoUrl.includes('youtube.com/watch')) {
    showError('Not a valid YouTube video page');
    if (tabsElement) tabsElement.style.display = 'none';
    if (syncButton) syncButton.style.display = 'none';
    if (searchButton) searchButton.style.display = 'block';
    if (deleteVideoButton) deleteVideoButton.style.display = 'none';
    if (savedStorageButton) savedStorageButton.style.display = 'block';
    if (backButton) backButton.style.display = 'none';
    return;
  }

  showLoading();

  chrome.scripting.executeScript(
    {
      target: { tabId: activeTab.id },
      func: () => document.querySelector('video')?.currentTime,
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.log('Script execution failed:', chrome.runtime.lastError.message);
        currentTime = 0;
        return;
      }
      if (results && results[0]?.result !== undefined) {
        currentTime = results[0].result;
      } else {
        currentTime = 0;
      }
      chrome.storage.local.get(['lastActiveTab', videoUrl], async (result) => {
        const cachedData = result[videoUrl];
        const videoData = result[videoUrl] || {};
        const lastActiveTab = videoData.lastActiveTab || (
          window.normalChapters?.length > 0 ? 'normal' :
          window.autoChapters?.length > 0 ? 'auto' :
          window.descriptionChapters?.length > 0 ? 'description' :
          window.customChapters?.length > 0 ? 'custom' : 'custom'
        );

        let initialTab = lastActiveTab;
        if (
          cachedData &&
          cachedData.normalChapters &&
          cachedData.autoChapters &&
          cachedData.descriptionChapters &&
          cachedData.thumbnail &&
          cachedData.title &&
          cachedData.duration !== undefined &&
          cachedData.channel &&
          (!cachedData.isLive || (cachedData.isLive && (new Date() - new Date(cachedData.lastCheckedTime || '1/1/1970')) / 1000 / 60 < 5))
        ) {
          const secondsPassed = (new Date() - new Date(cachedData.lastCheckedTime || '1/1/1970')) / 1000;
          const minutes = Math.floor(secondsPassed / 60);
          const seconds = Math.floor(secondsPassed % 60);
          console.log(cachedData.isLive
            ? `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'} passed, skipping refetch`
            : 'Non-live video, skipping refetch');
          window.normalChapters = cachedData.normalChapters;
          window.autoChapters = cachedData.autoChapters;
          window.descriptionChapters = cachedData.descriptionChapters;
          window.customChapters = cachedData.customChapters || [];
          window.keyMoments = cachedData.keyMoments || [];
          const thumbnail = cachedData.thumbnail;
          const channel = cachedData.channel;
          const title = cachedData.title;
          window.videoDuration = cachedData.duration;
          const duration = window.videoDuration;
          // console.log('Using cached data for rendering:', cachedData);
          console.log('Using cached data for rendering');

          renderChapters(window.normalChapters, 'normal-content', thumbnail);
          renderChapters(window.autoChapters, 'auto-content', thumbnail);
          renderChapters(window.descriptionChapters, 'description-content', thumbnail);
          renderChapters(window.keyMoments, 'keymoments-content', thumbnail);
          renderChapters(window.customChapters, 'custom-content', thumbnail);
          updateVideoInfo(thumbnail, title, duration, channel);
          currentChapters = window[`${initialTab}Chapters`];

          const currentContent = document.getElementById(`${initialTab}-content`);
          if (currentContent) {
            currentContent.style.display = 'none';
            const chapters = window[`${initialTab}Chapters`] || [];
            const chapterEls = currentContent.querySelectorAll('.chapter');
            let activeIndex = -1;
            chapters.forEach((chapter, i) => {
              if (chapter && currentTime >= chapter.start_time && (!chapters[i + 1] || currentTime < chapters[i + 1].start_time)) {
                activeIndex = i;
              }
            });
            if (activeIndex >= 0 && chapterEls[activeIndex]) {
              const headerHeight = document.querySelector('.header').offsetHeight;
              const targetScrollPosition = chapterEls[activeIndex].offsetTop - headerHeight - 20;
              currentContent.scrollTo({
                top: targetScrollPosition,
                behavior: 'instant',
              });
              lastActiveChapterIndex = activeIndex;
              chapterEls[activeIndex].classList.add('active');
            } else {
              currentContent.scrollTop = 0;
            }
            switchTab(initialTab);
          }
        } else {
          console.log("from 4 new fetch")
          chrome.runtime.sendMessage({ action: 'fetchVideoDetails', url: videoUrl }, async (response) => {
            if (chrome.runtime.lastError) {
              showError('Failed to load video details');
              console.error('Message error:', chrome.runtime.lastError.message);
              return;
            }
            if (response.error) {
              showError('Failed to load video details');
              // console.error(response.error);
              return;
            }
            const { playerResponse, html } = response.details;
            window.videoDuration = parseInt(playerResponse.videoDetails.lengthSeconds);
            const correctUrl = playerResponse.videoDetails?.videoId ? `https://www.youtube.com/watch?v=${playerResponse.videoDetails.videoId}` : 'videoUrl';
            const duration = window.videoDuration;
            const thumbnails = playerResponse.videoDetails?.thumbnail?.thumbnails || [];
            const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';
            const title = playerResponse.videoDetails?.title || 'Untitled';
            const channel = playerResponse.videoDetails?.author || 'Unknown';
            const description = playerResponse.videoDetails?.shortDescription || '';
            // console.log('Video details:', { duration, description, thumbnail, title });

            // Helper function to convert timestamp string to seconds
            function timestampToSeconds(timestamp) {
              const parts = timestamp.split(':').map(Number);
              if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
              } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
              } else if (parts.length === 1) {
                return parts[0];
              }
              return 0;
            }

            const initialDataMatch = html.match(/ytInitialData\s*=\s*(\{.+?\});/);
            let normalChapters = [];
            let autoChapters = [];
            let keyMoments = [];
            if (initialDataMatch) {
              const initialData = JSON.parse(initialDataMatch[1]);
              
              // First, extract from playerOverlays (legacy method)
              const overlay =
                initialData.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar
                  ?.multiMarkersPlayerBarRenderer || {};
              const markersMap = overlay.markersMap || [];
              for (const markerEntry of markersMap) {
                if (markerEntry.key === 'DESCRIPTION_CHAPTERS' && markerEntry.value?.chapters) {
                  normalChapters = markerEntry.value.chapters.map((ch) => ({
                    title: ch.chapterRenderer?.title?.simpleText || 'Untitled',
                    start_time: (ch.chapterRenderer?.timeRangeStartMillis || 0) / 1000,
                  }));
                }
                if (markerEntry.key === 'AUTO_CHAPTERS' && markerEntry.value?.chapters) {
                  autoChapters = markerEntry.value.chapters.map((ch) => ({
                    title: ch.chapterRenderer?.title?.simpleText || 'Untitled',
                    start_time: (ch.chapterRenderer?.timeRangeStartMillis || 0) / 1000,
                  }));
                }
              }
              
              // Extract chapters from engagementPanels using the Python function's logic
              const engagementPanels = initialData.engagementPanels || [];
              console.log('Initial fetch - engagementPanels found:', engagementPanels.length);
              
              for (const panel of engagementPanels) {
                const panelRenderer = panel.engagementPanelSectionListRenderer;
                if (!panelRenderer) {
                  continue;
                }
                
                const panelId = panelRenderer.panelIdentifier || '';
                console.log('Initial fetch - Panel ID:', panelId);
                
                // Skip if not a macro markers (chapters) panel
                if (!panelId.includes('macro-markers')) {
                  continue;
                }
                
                console.log('Initial fetch - Found macro-markers panel:', panelId);
                
                // Get the header to determine chapter type
                const header = panelRenderer.header || {};
                const headerTitle = header.engagementPanelTitleHeaderRenderer?.title?.runs || [];
                const headerText = headerTitle.length > 0 ? headerTitle[0].text.toLowerCase() : '';
                console.log('Initial fetch - Header text:', headerText);
                
                // Determine chapter type based on header text and panel ID
                let chapterType = null;
                if (headerText.includes('key moments')) {
                  chapterType = 'keymoments';
                } else if (panelId.includes('description-chapters')) {
                  chapterType = 'description';
                } else if (panelId.includes('auto-chapters')) {
                  chapterType = 'auto';
                }
                
                console.log('Initial fetch - Chapter type determined:', chapterType);
                
                if (chapterType === null) {
                  continue;
                }
                
                // Extract chapters from the content
                const content = panelRenderer.content || {};
                const macroMarkersList = content.macroMarkersListRenderer || {};
                const contents = macroMarkersList.contents || [];
                
                console.log('Initial fetch - Contents found:', contents.length);
                
                const chaptersArray = [];
                
                for (const item of contents) {
                  // Skip info items (like "auto-generated" text)
                  if (!item.macroMarkersListItemRenderer) {
                    continue;
                  }
                  
                  const chapterItem = item.macroMarkersListItemRenderer;
                  
                  // Extract timestamp
                  const timeDesc = chapterItem.timeDescription || {};
                  const timestamp = timeDesc.simpleText || '';
                  
                  // Extract title
                  const chapterTitle = chapterItem.title?.simpleText || '';
                  
                  console.log('Initial fetch - Extracted - Timestamp:', timestamp, 'Title:', chapterTitle);
                  
                  // Only add if both timestamp and title exist
                  if (timestamp && chapterTitle) {
                    const seconds = timestampToSeconds(timestamp);
                    chaptersArray.push({
                      title: chapterTitle,
                      start_time: seconds
                    });
                  }
                }
                
                // Assign chapters to the appropriate type if chapters were found
                if (chaptersArray.length > 0) {
                  console.log(`Initial fetch - Found ${chaptersArray.length} chapters for type: ${chapterType}`);
                  
                  if (chapterType === 'description') {
                    normalChapters = chaptersArray;
                  } else if (chapterType === 'auto') {
                    autoChapters = chaptersArray;
                  } else if (chapterType === 'keymoments') {
                    keyMoments = chaptersArray;
                  }
                }
              }
            }

            if (!description || !duration) {
              // console.error('Description or duration missing:', { description, duration });
            }
            const descriptionChapters = await extractChapters(description || '', duration || 36000);
            // console.log('Raw description chapters:', descriptionChapters);
            const uniqueDescriptionChapters = [];
            const seen = new Set();
            descriptionChapters.forEach((chapter) => {
              const key = `${chapter.start_time}:${chapter.title}`;
              if (!seen.has(key)) {
                seen.add(key);
                uniqueDescriptionChapters.push(chapter);
              }
            });
            // console.log('Unique description chapters:', uniqueDescriptionChapters);

            window.normalChapters = normalChapters;
            window.autoChapters = autoChapters;
            window.descriptionChapters = uniqueDescriptionChapters;
            window.customChapters = [];
            window.keyMoments = keyMoments;
            const { isLive, duration1 } = getVideoInfo(response.details.html, response.details.playerResponse);
            console.log("islive:",isLive)
            const storyboardUrl = playerResponse?.storyboards?.playerStoryboardSpecRenderer?.spec;
            const videoData = {
              url: correctUrl,
              title,
              thumbnail,
              duration,
              channel,
              normalChapters,
              autoChapters,
              keyMoments,
              descriptionChapters,
              customChapters,
              fetchTime: new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
              isLive,
              storyboardUrl,
              ...(isLive ? { lastCheckedTime: new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) } : {}),
            };
            let initialTab = 'custom';
            if (normalChapters.length > 0) initialTab = 'normal';
            else if (autoChapters.length > 0) initialTab = 'auto';
            else if (keyMoments.length > 0) initialTab = 'keymoments';
            else if (uniqueDescriptionChapters.length > 0) initialTab = 'description';
            updateSortedOrder(correctUrl, 0)

            chrome.storage.local.set({ [correctUrl]: videoData }, () => {
              // console.log('Stored video data:', videoData);
              renderChapters(normalChapters, 'normal-content', thumbnail);
              renderChapters(autoChapters, 'auto-content', thumbnail);
              renderChapters(keyMoments, 'keymoments-content', thumbnail);
              renderChapters(uniqueDescriptionChapters, 'description-content', thumbnail);
              renderChapters(window.customChapters, 'custom-content', thumbnail);
              updateVideoInfo(thumbnail, title, duration, channel);
              switchTab(initialTab)
              currentChapters = window[`${initialTab}Chapters`];

              const currentContent = document.getElementById(`${initialTab}-content`);
              if (currentContent) {
                currentContent.style.display = 'none';
                const chapters = window[`${initialTab}Chapters`] || [];
                const chapterEls = currentContent.querySelectorAll('.chapter');
                let activeIndex = -1;
                chapters.forEach((chapter, i) => {
                  if (chapter && currentTime >= chapter.start_time && (!chapters[i + 1] || currentTime < chapters[i + 1].start_time)) {
                    activeIndex = i;
                  }
                });
                if (activeIndex >= 0 && chapterEls[activeIndex]) {
                  const headerHeight = document.querySelector('.header').offsetHeight;
                  const targetScrollPosition = chapterEls[activeIndex].offsetTop - headerHeight - 20;
                  currentContent.scrollTo({
                    top: targetScrollPosition,
                    behavior: 'instant',
                  });
                  lastActiveChapterIndex = activeIndex;
                  chapterEls[activeIndex].classList.add('active');
                } else {
                  currentContent.scrollTop = 0;
                }
                switchTab(initialTab);
              }
            });
          });
        }

        let liveCheckInterval = null;
        let isFetching = false;

        function scheduleLiveCheck() {
          if (liveCheckInterval) clearInterval(liveCheckInterval); // Clear any existing interval
          liveCheckInterval = setInterval(() => {
            chrome.storage.local.get([videoUrl], (result) => {
              const videoData = result[videoUrl];
              if (!videoData || !videoData.isLive) {
                clearInterval(liveCheckInterval); // Stop interval if no data or not live
                return;
              }
              if (isFetching) return; // Skip if a fetch is in progress
              const currentTime = new Date();
              const secondsPassed = (currentTime - new Date(videoData.lastCheckedTime || '1/1/1970')) / 1000;
              const minutes = Math.floor(secondsPassed / 60);
              const seconds = Math.floor(secondsPassed % 60);
              if (secondsPassed < 5 * 60) {
                // console.log(`${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'} passed, skipped refetching`);
                return; // Skip fetch if less than 5 minutes
              }
              console.log('5 minutes passed, refetching the data');
              isFetching = true; // Set flag to prevent overlapping fetches
              console.log("from 5")
              chrome.runtime.sendMessage({ action: 'fetchVideoDetails', url: videoUrl }, (response) => {
                isFetching = false; // Reset flag after fetch completes
                if (response.error || !response.details) return;
                const { isLive, duration: newDuration } = getVideoInfo(response.details.html, response.details.playerResponse);
                const notification = document.getElementById('notification');
                if (window.notificationTimeout) {
                  clearTimeout(window.notificationTimeout);
                  notification.classList.remove('show');
                }
                console.log("islive (schedule function)", isLive);
                if (!isLive) {
                  notification.textContent = "The live completed and data updated";
                  notification.style.textAlign = 'center'; // Center only this notification
                  videoData.isLive = isLive;
                  videoData.duration = newDuration;
                  delete videoData.lastCheckedTime; // Remove lastCheckedTime when live completes
                  chrome.storage.local.set({ [videoUrl]: videoData });
                  notification.classList.add('show');
                  window.notificationTimeout = setTimeout(() => {
                    notification.classList.remove('show');
                    notification.textContent = '';
                    notification.style.textAlign = ''; // Reset to avoid affecting other notifications
                    window.notificationTimeout = null;
                  }, 2000);
                  clearInterval(liveCheckInterval); // Stop interval when live ends
                } else {
                  videoData.lastCheckedTime = new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); // Update lastCheckedTime for live videos
                  chrome.storage.local.set({ [videoUrl]: videoData });
                }
              });
            });
          }, 5000); // Check every second
        }

        // Start the first check
        scheduleLiveCheck();
        setInterval(() => {
          chrome.runtime.sendMessage({ action: 'videoChanged', url: videoUrl });
        }, 10000);
        setInterval(() => {
          // console.log("test1")
          chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
            chrome.tabs.query({ active: true, windowId: currentWindow.id }, async (tabs) => {
            const activeTab = tabs.find((t) => t.active && t.url?.includes('youtube.com/watch'));
              if (!activeTab || !activeTab.id || !activeTab.url.includes('youtube.com/watch')) {
                return;
              }
              const tempUrl = normalizeYouTubeUrl(activeTab.url);
              // console.log("test2")
              chrome.storage.local.get(tempUrl, async (data) => {
                const storedData = data[tempUrl];
                if (!storedData) return;
                const storedDuration = parseInt(storedData.duration);
                await chrome.scripting.executeScript(
                  {
                    target: { tabId: activeTab.id },
                    func: () => document.querySelector('video')?.duration,
                  },
                  (results) => {
                    if (results && results[0]?.result !== undefined) {
                      const playerDuration = Math.round(results[0].result);
                      if (Math.abs(storedDuration - playerDuration) <= 1 || storedData.isLive) {
                        chrome.scripting.executeScript(
                          {
                            target: { tabId: activeTab.id },
                            func: () => document.querySelector('video')?.currentTime,
                          },
                          (timeResults) => {
                            if (timeResults && timeResults[0]?.result !== undefined) {
                              currentTime = timeResults[0].result;
                              const chapters = currentTab === 'keymoments' ? window.keyMoments || [] : window[`${currentTab}Chapters`] || [];
                              if (chapters.length > 0) {
                                highlightCurrentChapter();
                              }
                              if (!storedData.isLive) {
                                const videoId = new URL(tempUrl).searchParams.get('v');
                                if ((currentTime > storedDuration - 3 && storedDuration > 10) || (currentTime > storedDuration - 1 && storedDuration < 10)) {
                                  currentTime = 0;
                                }
                                const newUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(currentTime)}s`;
                                if (storedData.url !== newUrl) {
                                  storedData.url = newUrl;
                                  chrome.storage.local.set({ [tempUrl]: storedData });
                                }
                              }
                            }
                          }
                        );
                      }
                    }
                  }
                );
              });


              const tabsElement = document.querySelector('.tabs');
              const syncButton = document.getElementById('sync-button');
              const searchButton = document.getElementById('search-button');
              const deleteVideoButton = document.getElementById('delete-video-button');
              const savedStorageButton = document.getElementById('saved-storage-button');
              const backButton = document.getElementById('back-button');

              chrome.storage.local.get(['showSavedVideos'], (result) => {
                // if (result.showSavedVideos && currentTab === 'saved') {
                //   return;
                // }

                if (!activeTab || !activeTab.id || !activeTab.url.includes('youtube.com/watch')) {
                  showError('Not a valid YouTube video page');
                  if (tabsElement) tabsElement.style.display = 'none';
                  if (syncButton) syncButton.style.display = 'none';
                  if (searchButton) searchButton.style.display = 'block';
                  if (deleteVideoButton) deleteVideoButton.style.display = 'none';
                  if (savedStorageButton) savedStorageButton.style.display = 'block';
                  if (backButton) backButton.style.display = 'none';
                  return;
                }

                // Retrieve stored data from local storage
                tempurl=normalizeYouTubeUrl((activeTab.url).replace('view-source:', ''));
                chrome.storage.local.get(tempurl, async (data) => {
                  const storedData = data[tempurl] || {};
                  // console.log(tempurl,storedData)
                  if (!storedData){
                    console.log("Data Not Found to get the stored duration...")
                  }
                  const isLive = storedData.isLive || false;
                  const storedDuration = storedData.duration ? parseInt(storedData.duration) : window.videoDuration;

                  // Check for ads if not live and duration exists
                  if (!isLive && storedDuration) {
                    await chrome.scripting.executeScript(
                      {
                        target: { tabId: activeTab.id },
                        func: async (storedDuration) => {
                          const video = document.querySelector('video');
                          let skipped = false;
                          let skipMethod = null;

                          if (video) {
                            function getRandomBetween(start, end) {
                              if (start > end) [start, end] = [end, start]; // Swap if start > end
                              return Math.floor(Math.random() * (end - start + 1)) + start;
                            }

                            function sendLogMessage(...args) {
                              const message = args.map(arg => {
                                try {
                                  return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                                } catch (e) {
                                  return '[Unserializable Object]';
                                }
                              }).join(' ');

                              chrome.runtime.sendMessage({
                                type: 'log',
                                message: message
                              });
                            }

                            const playerDuration = Math.round(video.duration);
                            const durationDiff = Math.abs(playerDuration - storedDuration);
                            // sendLogMessage(durationDiff > 1 && playerDuration<600,)
                            if (durationDiff > 15) {
                            // if (durationDiff > 1 && playerDuration<600) {
                              await new Promise(resolve => chrome.storage.local.get(['lastAdSkippedTime'], (result) => {
                                const now = Date.now();
                                const lastSkippedStr = result.lastAdSkippedTime;
                                const lastSkipped = lastSkippedStr ? new Date(lastSkippedStr).getTime() : 0;
                                const timeSinceLastSkip = now - lastSkipped;
                                let mintime=getRandomBetween(500, 1500)
                                if (timeSinceLastSkip >= 10000) {
                                  // const futureDate = new Date(Date.now() + 3000); // Current time + 5 seconds
                                  // const formattedTime = futureDate.toLocaleString('en-US', {
                                  //   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                                  // });
                                  const formattedTime = new Date().toLocaleString('en-US', {
                                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                                  });
                                  chrome.storage.local.set({
                                    lastAdSkippedTime: formattedTime
                                  });
                                  chrome.storage.local.get(['lastprinttime'], (result) => {
                                    const lastprinttimestr = result.lastprinttime;
                                    const lasttime = lastprinttimestr ? new Date(lastprinttimestr).getTime() : 0;
                                    const timeSinceLastprint = now - lasttime;
                                    if (timeSinceLastprint >= 5000) {
                                        sendLogMessage(`New Ad, Waiting for few ms ${formattedTime}`) 
                                    }
                                  });
                                  chrome.storage.local.set({
                                    lastprinttime: formattedTime
                                  });
                                  timeSinceLastSkip=now - formattedTime;
                                  skipped = false;
                                  skipMethod = 'duration-mismatch';
                                }

                                const skip = () => {
                                  const formattedTime = new Date().toLocaleString('en-US', {
                                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                                  });
                                  chrome.storage.local.set({
                                    lastAdSkippedTime: formattedTime
                                  });
                                  video.currentTime = video.duration;
                                  skipped = true;
                                  skipMethod = 'duration-mismatch';
                                };
                                
                                
                                if (timeSinceLastSkip >= mintime) {
                                  const formattedTime = new Date().toLocaleString('en-US', {
                                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                                  });
                                  sendLogMessage(`stored duration = ${storedDuration}, video player duration = ${playerDuration} so skipping the ad to the end\nWaited for ${mintime}ms ${formattedTime}`)
                                  skip();
                                }
                                else{
                                  skipped = false;
                                  skipMethod = 'duration-mismatch';
                                }
                                resolve();
                              }));
                            }
                          } else {
                            console.log("no video found");
                          }
                          return { skipped, skipMethod };
                        },
                        args: [storedDuration],
                      },
                      (results) => {
                        if (chrome.runtime.lastError) {
                          console.log('Script execution failed:', chrome.runtime.lastError.message);
                          return;
                        }
                        const result = results && results[0]?.result;
                        if (result) {
                          const { playerDuration, skipped, skipMethod } = result;
                          if (playerDuration !== null && skipped && skipMethod.includes('duration-mismatch')) {
                            const notification = document.getElementById('notification');
                            if (window.notificationTimeout) {
                              clearTimeout(window.notificationTimeout);
                            }
                            notification.textContent = 'Ad skipped';
                            notification.classList.add('show');
                            window.notificationTimeout = setTimeout(() => {
                              notification.classList.remove('show');
                              notification.textContent = '';
                              window.notificationTimeout = null;
                            }, 2000);
                          }
                        }
                      }
                    );
                  }

                  // Existing logic to get current time and highlight chapter
                  chrome.scripting.executeScript(
                    {
                      target: { tabId: activeTab.id },
                      func: () => document.querySelector('video')?.currentTime,
                    },
                    (results) => {
                      if (chrome.runtime.lastError) {
                        console.log('Script execution failed:', chrome.runtime.lastError.message);
                        return;
                      }
                      if (results && results[0]?.result !== undefined) {
                        currentTime = results[0].result;
                        highlightCurrentChapter();
                      }
                    }
                  );
                });
              });
            });
          });
          ensureGlobalContextMenuCleanupListeners();
        }, 350);
      });
    }
  );
});
});


function initializeCustomInput() {
  const customInput = document.getElementById('custom-input');
  if (!customInput) {
    console.error('Custom input element not found during initialization');
    const customContent = document.getElementById('custom-content');
    if (customContent) {
      customContent.insertAdjacentHTML(
        'afterbegin',
        '<textarea class="custom-input" id="custom-input" placeholder="Enter chapters (e.g., 0:00 Intro\n1:30 Part 1)"></textarea>'
      );
    }
    return document.getElementById('custom-input');
  }
  return customInput;
}

const customInput = initializeCustomInput();
if (customInput) {
    let contextMenu = null; // Declare contextMenu at the top of the customInput block
    customInput.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        if (contextMenu) {
            contextMenu.remove(); // Remove existing context menu if it exists
            contextMenu = null;
        }
        let aiAvailable = false;
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const activeTab = tabs.find((t) => t.active && t.url?.includes('youtube.com/watch'));
            if (activeTab) {
                const results = await chrome.scripting.executeScript(
                    {
                        target: { tabId: activeTab.id },
                        func: () => !!document.querySelector('button[aria-label="Ask"]'),
                    }
                );
                aiAvailable = results && results[0]?.result;
            }
        } catch (error) {
            console.error('Error checking AI availability:', error);
        }
    contextMenu = document.createElement('div');
    contextMenu.style.position = 'absolute';
    const menuHeight = 6 * 32; // 6 menu items, approx 32px each
    const menuWidth = 200; // Approximate width of the context menu
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    
    // Adjust position to prevent overflow
    let top = e.clientY;
    let left = e.clientX;
    
    if (top + menuHeight > windowHeight) {
      top = windowHeight - menuHeight - 10; // 10px padding
    }
    if (left + menuWidth > windowWidth) {
      left = windowWidth - menuWidth - 10; // 10px padding
    }
    if (top < 0) top = 10; // Ensure not negative
    if (left < 0) left = 10; // Ensure not negative
    
    contextMenu.style.top = `${top}px`;
    contextMenu.style.left = `${left}px`;
    contextMenu.style.background = '#1a1a1a';
    contextMenu.style.border = '1px solid #333333';
    contextMenu.style.borderRadius = '5px';
    contextMenu.style.padding = '5px';
    contextMenu.style.zIndex = '1000';
    contextMenu.style.color = '#ffffff';
    contextMenu.style.fontSize = '12px';
    contextMenu.innerHTML = `
      <div class="context-item" id="show-normal-chapters" style="padding: 5px; cursor: pointer; ${window.normalChapters?.length === 0 ? 'opacity: 0.3; pointer-events: none;' : ''}">Show Normal Chapters</div>
      <div class="context-item" id="show-auto-chapters" style="padding: 5px; cursor: pointer; ${window.autoChapters?.length === 0 ? 'opacity: 0.3; pointer-events: none;' : ''}">Show Auto-Generated Chapters</div>
      <div class="context-item" id="show-keymoments-chapters" style="padding: 5px; cursor: pointer; ${window.keyMoments?.length === 0 ? 'opacity: 0.3; pointer-events: none;' : ''}">Show Key Moments Chapters</div>
      <div class="context-item" id="show-description-chapters" style="padding: 5px; cursor: pointer; ${window.descriptionChapters?.length === 0 ? 'opacity: 0.3; pointer-events: none;' : ''}">Show Description Chapters</div>
      <div class="context-item" id="ask-ai" style="padding: 5px; cursor: pointer; ${!aiAvailable ? 'opacity: 0.3; pointer-events: none;' : ''}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" focusable="false" aria-hidden="true" style="pointer-events: none; display: inline-block; margin-right: 2px;margin-left:-1px;margin-bottom:1px; vertical-align: middle; fill: white;"><path d="M480-80q0-83-31.5-156T363-363q-54-54-127-85.5T80-480q83 0 156-31.5T363-597q54-54 85.5-127T480-880q0 83 31.5 156T597-597q54 54 127 85.5T880-480q-83 0-156 31.5T597-363q-54 54-85.5 127T480-80Z" fill="white"></path></svg>Ask AI</div>
      <div class="context-item" id="show-custom-chapters" style="padding: 5px; cursor: pointer; ${window.customChapters?.length === 0 ? 'opacity: 0.3; pointer-events: none;' : ''}">Show Custom Chapters</div>
      <div class="context-item" id="paste-chapters" style="padding: 5px; cursor: pointer;">Paste</div>
    `;
    document.body.appendChild(contextMenu);

    const menuItems = contextMenu.querySelectorAll('div');
    menuItems.forEach(item => {
      item.addEventListener('mouseover', () => {
        item.style.background = '#333333';
      });
      item.addEventListener('mouseout', () => {
        item.style.background = 'none';
      });
      item.addEventListener('mousedown', () => {
        item.style.background = '#434343';
      });
      item.addEventListener('mouseup', () => {
        item.style.background = '#333333';
      });
    });

    function showChapters(chapterType, chapters) {
      e.preventDefault();
      chrome.storage.local.get([videoUrl], (result) => {
        const videoData = result[videoUrl];
        if (!videoData) {
          const notification = document.getElementById('notification');
          if (window.notificationTimeout) {
            clearTimeout(window.notificationTimeout);
          }
          notification.textContent = 'Video data not found';
          notification.classList.add('show');
          window.notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
            notification.textContent = '';
            window.notificationTimeout = null;
          }, 2000);
        } else {
          if (chapters.length === 0) {
            const notification = document.getElementById('notification');
            if (window.notificationTimeout) {
              clearTimeout(window.notificationTimeout);
            }
            notification.textContent = 'No chapters found';
            notification.classList.add('show');
            window.notificationTimeout = setTimeout(() => {
              notification.classList.remove('show');
              notification.textContent = '';
              window.notificationTimeout = null;
            }, 2000);
          } else {
            customInput.value = chapters
              .map((ch) => `${formatTime(ch.start_time)} - ${ch.title}`)
              .join('\n');
            customInput.focus();
          }
        }
      });
      if (contextMenu) contextMenu.remove();
    }
    
    document.getElementById('show-normal-chapters')?.addEventListener('click', (e) => showChapters('normal', window.normalChapters || []));
    document.getElementById('show-auto-chapters')?.addEventListener('click', (e) => showChapters('auto', window.autoChapters || []));
    document.getElementById('show-description-chapters')?.addEventListener('click', (e) => showChapters('description', window.descriptionChapters || []));
    document.getElementById('show-custom-chapters')?.addEventListener('click', (e) => showChapters('custom', window.customChapters || []));
    document.getElementById('show-keymoments-chapters')?.addEventListener('click', (e) => showChapters('keymoments', window.keyMoments || []));
    

    document.getElementById('paste-chapters').addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        const start = customInput.selectionStart;
        const end = customInput.selectionEnd;
        const currentValue = customInput.value;
        customInput.value = currentValue.substring(0, start) + text + currentValue.substring(end);
        customInput.selectionStart = customInput.selectionEnd = start + text.length;
        customInput.focus();
      }).catch((err) => {
        console.error('Failed to paste from clipboard:', err);
      });
      if (contextMenu) contextMenu.remove();
    });

    document.getElementById('ask-ai')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const prompt = "Generate chapter timestamps for this YouTube video. Use minimalistic, short chapter titles (1-5 words max) unless the specific chapter needs big title. Include timestamps for advertisements, promotions, sponsorships, deal of the days(if it is a dod mention it as DOD and do not mention it as an ad or sponsorship mention it as '[DOD] deal name') as separate chapters ONLY when they are actual paid advertisements or sponsored segments (not casual mentions of brands/products). Real ads typically last 10-15+ seconds and use promotional language like 'sponsored by', 'brought to you by', 'check out', 'use code', etc. If unsure, don't mark as ad. Format exactly like: 0:00 Intro\n1:30 Main Topic\n2:45 [SPONSORSHIP] Ad/Sponsor\n3:00 Conclusion\netc.the time format is hh:mm:ss do not include hours as 00 if the time stamp is less than 60 mins (dont confuse and mess up the hours and minutes). Keep titles concise and descriptive. also dont just use the default video's chapters from description. give the chapters by yourself by analyzing the video. you can use the video's original chapters as guide but dont give them exactly. they usually give very few chapters";
      
      // Show loading notification
      const notification = document.getElementById('notification');
      if (window.notificationTimeout) {
        clearTimeout(window.notificationTimeout);
      }
      notification.textContent = 'Generating chapters with AI...';
      notification.classList.add('show');
      
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs.find((t) => t.active && t.url?.includes('youtube.com/watch'));
        if (!activeTab) {
          notification.textContent = 'No active YouTube tab';
          window.notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
            notification.textContent = '';
            window.notificationTimeout = null;
          }, 2000);
          return;
        }
        const results = await chrome.scripting.executeScript(
          {
            target: { tabId: activeTab.id },
            func: async (prompt) => {
              const initYTChat = async () => {
                const panelSelector = 'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"]';
                const panel = document.querySelector(panelSelector);
                const isOpen = panel?.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
                if (isOpen) {
                  console.log("✅ Chat already open");
                  return;
                }
                const askBtn = document.querySelector('button[aria-label="Ask"]');
                if (!askBtn) {
                  console.log("❌ Ask button not found");
                  return;
                }
                const style = document.createElement("style");
                style.id = "yt-stealth-hide";
                style.textContent = `${panelSelector} { opacity: 0 !important; pointer-events: none !important; }`;
                document.head.appendChild(style);
                return new Promise((resolve) => {
                  requestAnimationFrame(() => {
                    askBtn.click();
                    requestAnimationFrame(() => {
                      const closeBtn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Close' && b.offsetParent !== null);
                      closeBtn?.click();
                      document.getElementById("yt-stealth-hide")?.remove();
                      console.log("👻 Chat initialized invisibly");
                      resolve();
                    });
                  });
                });
              };
              const waitForStableText = (el, delay = 800) => new Promise((resolve) => {
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
              await initYTChat();
              // Wait briefly and poll for the chat UI elements to ensure initialization
              await new Promise((r) => setTimeout(r, 1000));
              const maxWaitMs = 8000;
              const pollInterval = 200;
              const startTime = Date.now();
              let textarea = document.querySelector('textarea.chatInputViewModelChatInput');
              let container = document.querySelector('[data-target-id="youchat_messages_section"] #contents');
              while ((!textarea || !container) && (Date.now() - startTime) < maxWaitMs) {
                await new Promise((r) => setTimeout(r, pollInterval));
                textarea = document.querySelector('textarea.chatInputViewModelChatInput');
                container = document.querySelector('[data-target-id="youchat_messages_section"] #contents');
              }
              if (!textarea || !container) {
                console.log("❌ Chat UI not ready after wait");
                return;
              }
              const initialMessages = container.querySelectorAll('you-chat-item-view-model markdown-div').length;
              textarea.focus();
              textarea.value = "";
              for (let char of prompt) {
                textarea.value += char;
                textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
              }
              textarea.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
              textarea.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
              setTimeout(() => {
                document.querySelector('button[aria-label="Send"]:not([disabled])')?.click();
              }, 200);
              console.log("📤 Prompt sent...");
              return new Promise((resolve) => {
                const observer = new MutationObserver(() => {
                  const messages = container.querySelectorAll('you-chat-item-view-model markdown-div');
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
            },
            args: [prompt],
          }
        );
        if (results && results[0]?.result) {
          customInput.value = results[0].result;
          customInput.focus();
          notification.textContent = 'Chapters generated successfully!';
          window.notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
            notification.textContent = '';
            window.notificationTimeout = null;
          }, 2000);
        } else {
          notification.textContent = 'Failed to get AI response';
          window.notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
            notification.textContent = '';
            window.notificationTimeout = null;
          }, 2000);
        }
      } catch (error) {
        console.error('Error asking AI:', error);
        notification.textContent = 'Error communicating with AI';
        window.notificationTimeout = setTimeout(() => {
          notification.classList.remove('show');
          notification.textContent = '';
          window.notificationTimeout = null;
        }, 2000);
      }
      if (contextMenu) contextMenu.remove();
    });

    const removeContextMenu = (e) => {
      if (!contextMenu) return;
      if (e.type === 'contextmenu' && e.target === customInput) return;
      contextMenu.remove();
      contextMenu = null;
      document.removeEventListener('click', removeContextMenu);
      document.removeEventListener('contextmenu', removeContextMenu);
      window.removeEventListener('blur', removeContextMenu);
    };
    document.addEventListener('click', removeContextMenu);
    document.addEventListener('contextmenu', removeContextMenu);
    window.addEventListener('blur', removeContextMenu);
  });

  customInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = customInput.value.trim();
      if (text && videoUrl && videoUrl.includes('youtube.com/watch')) {
        chrome.storage.local.get([videoUrl, 'showSavedVideos'], async (result) => {
          if (!result[videoUrl]) {
            if (!result.showSavedVideos) {
              const notification = document.getElementById('notification');
              if (window.notificationTimeout) {
                clearTimeout(window.notificationTimeout);
              }
              notification.innerHTML = 'Video data not found';
              notification.classList.add('show');
              window.notificationTimeout = setTimeout(() => {
                notification.classList.remove('show');
                notification.textContent = 'Video data deleted';
                window.notificationTimeout = null;
              }, 3000);
              const customInput = document.getElementById('custom-input');
              if (customInput) customInput.value = '';
            }
            return;
          }
          const cachedData = result[videoUrl];
          if (!cachedData.url) return;
          // console.log('Cached data before update:', cachedData);
          const thumbnail =
            cachedData.thumbnail || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGOSLit1gAAAABJRU5ErkJggg==';
          const title = cachedData.title || 'Untitled';
          window.videoDuration = cachedData.duration;
          const duration = window.videoDuration;
          let chapters;
          if (duration > 0) {
            chapters = await extractChapters(text, duration);
          } else {
            const response = await new Promise((resolve) => {
              console.log("from 6")
              chrome.runtime.sendMessage({ action: 'fetchVideoDetails', url: videoUrl }, resolve);
            });
            if (response.error) {
              console.error(response.error);
              return;
            }
            const { playerResponse } = response.details;
            const fetchedDuration = parseInt(playerResponse.videoDetails.lengthSeconds) || 36000;
            chapters = await extractChapters(text, fetchedDuration);
          }
          if (chapters.length===0){
            notification.innerHTML = `
              <div class="notification-novalidcustomchapters">No Valid Chapters Found</div>
            `;
            notification.classList.add('show');
            window.notificationTimeout = setTimeout(() => {
              notification.classList.remove('show');
              notification.textContent = '';
              window.notificationTimeout = null;
            }, 2000);
          }
          const updatedData = {
            url: videoUrl,
            title,
            thumbnail,
            duration: duration || 0,
            channel: cachedData.channel || 'Unknown',
            normalChapters: cachedData.normalChapters || window.normalChapters || [],
            autoChapters: cachedData.autoChapters || window.autoChapters || [],
            keyMoments: cachedData.keyMoments || window.keyMoments || [],
            descriptionChapters: cachedData.descriptionChapters || window.descriptionChapters || [],
            customChapters: chapters,
          };
          console.log('Saving updated data to storage:', updatedData);
          updatedData.lastActiveTab = 'custom';
          updatedData.fetchTime = cachedData.fetchTime;
          updatedData.isLive = cachedData.isLive;
          updatedData.duration = cachedData.duration;
          updatedData.lastCheckedTime = cachedData.lastCheckedTime;
          chrome.storage.local.set({ [videoUrl]: updatedData }, () => {
            // console.log('Storage updated, verifying...');
            chrome.storage.local.get([videoUrl], (verifyResult) => {
              // console.log('Stored data:', verifyResult[videoUrl]);
              window.customChapters = chapters;
              renderChapters(chapters, 'custom-content', thumbnail);
              customInput.value = '';
              if (currentTab === 'custom') {
                currentChapters = chapters;
                const currentContent = document.getElementById('custom-content');
                const chapterEls = currentContent.querySelectorAll('.chapter');
                let activeIndex = -1;
                chapters.forEach((chapter, i) => {
                  if (chapter && currentTime >= chapter.start_time && (!chapters[i + 1] || currentTime < chapters[i + 1].start_time)) {
                    activeIndex = i;
                  }
                });
                if (activeIndex >= 0 && chapterEls[activeIndex]) {
                  const headerHeight = document.querySelector('.header').offsetHeight;
                  const targetScrollPosition = chapterEls[activeIndex].offsetTop - headerHeight - 20;
                  isAutoScrolling = true;
                  currentContent.scrollTo({
                    top: targetScrollPosition,
                    behavior: 'smooth',
                  });
                  lastActiveChapterIndex = activeIndex;
                  setTimeout(() => {
                    isAutoScrolling = false;
                    highlightCurrentChapter(true);
                  }, 600);
                } else {
                  highlightCurrentChapter(true);
                }
              } else {
                highlightCurrentChapter(true);
              }
            });
          });
        });
      }
    }
  });
}

function checkOverflowAndBlurTextOnly() {
  const labels = document.querySelectorAll('.tab-label');
  labels.forEach((label) => {
    label.classList.remove('overflowing');
    if (label.scrollWidth > label.clientWidth) {
      label.classList.add('overflowing');
    }
  });
}

window.addEventListener('load', checkOverflowAndBlurTextOnly);
window.addEventListener('resize', checkOverflowAndBlurTextOnly);

window.addEventListener('resize', () => {
  const syncButton = document.getElementById('sync-button');
  if (!syncButton.classList.contains('visible') && currentTab !== 'saved') {
    highlightCurrentChapter(true);
  }
});

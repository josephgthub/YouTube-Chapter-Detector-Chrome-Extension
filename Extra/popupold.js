// popup.js
let currentTab = 'normal';
let currentChapters = [];
let currentTime = 0;
let videoUrl = '';
let lastActiveChapterIndex = -1;
let searchResults = [];
let currentSearchIndex = -1;
let isAutoScrolling = false;



function normalizeYouTubeUrl(url) {
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

function getVideoInfo(html, playerResponse) {
  let isLive = false;
  let duration = parseInt(playerResponse?.videoDetails?.lengthSeconds) || 0;

  try {
    if (playerResponse?.videoDetails?.isUpcoming === true) {
      isLive = true;
    } else if (
      playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow === true
    ) {
      isLive = true;
    } else if (
      playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow === false
    ) {
      isLive = false;
    } else {
      isLive = false;
    }
  } catch (e) {
    isLive = false;
  }

  return { isLive, duration };
}

function formatYouTubeTimestamp(url) {
  const match = url.match(/[?&]t=(\d+)s?/);
  if (!match) return "00:00"; // No timestamp found

  const seconds = parseInt(match[1], 10);

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = secs.toString().padStart(2, '0');

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
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
          document.getElementById('search-button').style.display = 'none';
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

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function renderChapters(chapters, containerId, thumbnail) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container ${containerId} not found`);
    return;
  }
  const existingInput = container.id === 'custom-content' ? container.querySelector('#custom-input') : null;
  container.innerHTML = '';
  if (existingInput && container.id === 'custom-content') {
    container.appendChild(existingInput);
  } else if (container.id === 'custom-content') {
    const newInput = document.createElement('textarea');
    newInput.className = 'custom-input';
    newInput.id = 'custom-input';
    newInput.placeholder = 'Enter chapters (e.g., 0:00 Intro\n1:30 Part 1)';
    container.appendChild(newInput);
  }
  if (chapters.length === 0) {
    const noChaptersDiv = document.createElement('div');
    noChaptersDiv.className = 'no-chapters';
    noChaptersDiv.textContent = 'No chapters found';
    noChaptersDiv.style.textAlign = 'center';
    noChaptersDiv.style.padding = '20px';
    noChaptersDiv.style.color = '#444444';
    container.appendChild(noChaptersDiv);
    return;
  }
  chapters.forEach((ch, index) => {
    const div = document.createElement('div');
    div.className = 'chapter';
    div.title = formatTime(ch.start_time) + " - " + ch.title;
    div.innerHTML = `
      <span class="chapter-number">${index + 1}</span>
      <img src="${thumbnail}" alt="thumbnail" draggable="false">
      <div class="chapter-info">
        <p class="chapter-title">${ch.title}</p>
        <p class="chapter-time">${formatTime(ch.start_time)}</p>
      </div>
      <div class="chapter-progress" title=''>
        <div class="chapter-progress-completed"></div>
        <div class="chapter-progress-thumb"></div>
      </div>
    `;
    div.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs.find((t) => t.active && t.url?.includes('youtube.com/watch'));
        if (!activeTab || !activeTab.id) {
          showError('Not on a YouTube video page');
          return;
        }
        if (!tabs[0].url.includes('youtube.com/watch')) {
          return;
        }
        const tabId = tabs[0].id;
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => {
              window.__YTChapterDetectorInjected = true;
              return true;
            },
          },
          (results) => {
            if (chrome.runtime.lastError || !results || !results[0].result) {
              showError('Failed to interact with video page');
              return;
            }
            chrome.scripting.executeScript(
              {
                target: { tabId },
                func: (time) => {
                  const video = document.querySelector('video');
                  if (video && video.readyState >= 2) {
                    video.currentTime = time;
                    return { success: true };
                  }
                  return { success: false, error: 'Video not ready or not found' };
                },
                args: [ch.start_time],
              },
              (results) => {
                if (chrome.runtime.lastError) {
                  console.log('Seek failed, ignoring:', results[0].result?.error || 'Unknown error');
                  return;
                }
                if (results && results[0].result?.success) {
                  console.log('Seek successful');
                  const content = document.getElementById(`${currentTab}-content`);
                  const chapterEls = container.querySelectorAll('.chapter');
                  const clickedChapterEl = chapterEls[index];
                  const headerHeight = document.querySelector('.header').offsetHeight;
                  const targetScrollPosition = clickedChapterEl.offsetTop - headerHeight - 20;
                  content.scrollTo({
                    top: targetScrollPosition,
                    behavior: 'smooth',
                  });
                  lastActiveChapterIndex = index;
                  document.getElementById('sync-button').classList.remove('visible');
                }
              }
            );
          }
        );
      });
    });
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (e.target.closest('.chapter-progress')) {
        return; // Skip context menu creation
      }
      // Remove existing context menus
      if (document.querySelector('.context-menu')) {
        document.querySelectorAll('.context-menu').forEach(menu => {
          menu.style.opacity = '0';
          setTimeout(() => menu.remove(), 200);
        });
      }
      const contextMenu = document.createElement('div');
      contextMenu.classList.add('context-menu');
      contextMenu.style.position = 'absolute';
      const menuHeight = 3 * 32; // 3 menu items, approx 32px each
      const menuWidth = 150; // Approximate width of the context menu
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      let top = e.clientY;
      let left = e.clientX;
      if (top + menuHeight > windowHeight) {
        contextMenu.style.bottom = `${window.innerHeight - e.clientY + 6}px`;
      }
      else{
        contextMenu.style.top = `${e.clientY}px`;
      }
      if (left + menuWidth > windowWidth) {
        contextMenu.style.right = `${window.innerWidth - e.clientX + 6}px`;
      }
      else{
        contextMenu.style.left = `${e.clientX}px`;
      }
      if (top < 0) top = 10;
      if (left < 0) left = 10;
      contextMenu.style.position = 'absolute';
      contextMenu.style.background = '#1a1a1a';
      contextMenu.style.border = '2px solid #555555';
      contextMenu.style.borderRadius = '5px';
      contextMenu.style.padding = '5px';
      contextMenu.style.zIndex = '1000';
      contextMenu.style.color = '#ffffff';
      contextMenu.style.fontSize = '12px';
      contextMenu.style.opacity = '0';
      contextMenu.style.transition = 'opacity 0.2s ease';
      contextMenu.innerHTML = `
        <div class="context-item" data-action="copy-title">Copy Title</div>
        <div class="context-item" data-action="copy-link">Copy Link</div>
        <div class="context-item" data-action="open-new-tab">Open in New Tab</div>
      `;
      document.body.appendChild(contextMenu);
      setTimeout(() => {
        contextMenu.style.opacity = '1';
      }, 10);

      const menuItems = contextMenu.querySelectorAll('.context-item');
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
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          const notification = document.getElementById('notification');
          if (window.notificationTimeout) {
            clearTimeout(window.notificationTimeout);
          }
          if (action === 'copy-title') {
            navigator.clipboard.writeText(ch.title);
            notification.innerHTML = `
              <div class="notification-titlecopy">Title copied to clipboard</div>
            `;
            notification.classList.add('show');
            window.notificationTimeout = setTimeout(() => {
              notification.classList.remove('show');
              notification.textContent = '';
              window.notificationTimeout = null;
            }, 2000);
          } else if (action === 'copy-link') {
            const videoId = new URL(videoUrl).searchParams.get('v');
            const link = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(ch.start_time)}s`;
            navigator.clipboard.writeText(link);
            notification.innerHTML = `
              <div class="notification-linkcopy">Link copied to clipboard</div>
            `;
            notification.classList.add('show');
            window.notificationTimeout = setTimeout(() => {
              notification.classList.remove('show');
              notification.textContent = '';
              window.notificationTimeout = null;
            }, 2000);
          } else if (action === 'open-new-tab') {
            const videoId = new URL(videoUrl).searchParams.get('v');
            const link = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(ch.start_time)}s`;
            chrome.tabs.create({ url: link });
          }
          contextMenu.remove();
        });
      });

      const removeContextMenu = () => {
        contextMenu.style.opacity = '0';
        setTimeout(() => {
          contextMenu.remove();
        }, 200);
        document.removeEventListener('click', removeContextMenu);
        document.removeEventListener('keydown', handleEscape);
      };

      // Handle Escape key to close menu without affecting YouTube
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          removeContextMenu();
        }
      };

      document.addEventListener('click', removeContextMenu);
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('click', removeContextMenu);
    });
    container.appendChild(div);
  });
}

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


function renderSavedVideos(videos) {
const container = document.getElementById('saved-videos-list');
  if (!container) {
    console.error('Saved videos list container not found');
    return;
  }
  container.innerHTML = '';
  if (videos.length === 0) {
    const noVideosDiv = document.createElement('div');
    noVideosDiv.className = 'no-chapters';
    noVideosDiv.textContent = 'No saved videos';
    noVideosDiv.style.textAlign = 'center';
    noVideosDiv.style.padding = '20px';
    noVideosDiv.style.color = '#444444';
    container.appendChild(noVideosDiv);
    return;
  }
  // Sort videos by fetchTime (latest first)
  videos.sort((a, b) => {
    const dateA = a.fetchTime ? new Date(a.fetchTime) : new Date(0);
    const dateB = b.fetchTime ? new Date(b.fetchTime) : new Date(0);
    return dateB - dateA; // Descending order
  });
  videos.forEach((video, index) => {
    const div = document.createElement('div');
    div.className = `video-entry${normalizeYouTubeUrl(video.url) === normalizeYouTubeUrl(videoUrl) && videoUrl.includes('youtube.com/watch') && currentTab === 'saved' && !document.querySelector('.error') ? ' active' : ''}`;
    div.title ="Title : "+video.title + "\nChannel : " + (video.channel || 'Unknown')+"\n"+formatYouTubeTimestamp(video.url)+" / "+formatTime(video.duration || 36000) + (normalizeYouTubeUrl(video.url) === normalizeYouTubeUrl(videoUrl) ? "\n\n(Current Playing)" : "");
    // div.title ="Title: "+video.title + "\n------------\nDuration: " + formatTime(video.duration || 0) + "\n------------\nChannel: " + (video.channel || 'Unknown') + (video.url === videoUrl ? "\n------------\n(Current Playing)" : "");
    div.style.cursor = 'pointer';
    div.draggable = true;
    div.innerHTML = `
      <span class="video-number">${index + 1}</span>
      <img src="${
        video.thumbnail ||
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGOSLit1gAAAABJRU5ErkJggg=='
      }" alt="thumbnail">
      <div class="video-info">
        <p class="video-title">${video.title || 'Untitled'}</p>
        <p class="video-duration">${formatTime(video.duration || 36000)} • ${video.channel || 'Unknown'}</p>
      </div>
      <button class="delete-button" data-url="${video.url}" title="Delete This Video Data">
        <svg viewBox="1 0 22 26" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M1.9 6h20.5M19 6l-1 14H6L5 6" />
          <path d="M10 10v7.5" />
          <path d="M14 10v7.5" />
        </svg>
      </button>
      <div class="video-progress">
        <div class="video-progress-completed" style="width: ${
          video.duration > 0 && video.url.includes('&t=')
            ? `${Math.min(parseInt(video.url.split('&t=')[1]) / video.duration, 1) * 100}%`
            : '0%'
        }"></div>
      </div>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.closest('.delete-button')) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.ctrlKey) {
        chrome.tabs.create({ url: video.url, active: false }, () => {
          if (chrome.runtime.lastError) {
            console.log('Tab creation failed:', chrome.runtime.lastError.message);
          }
        });
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.update(tabs[0].id, { url: video.url }, () => {
              if (chrome.runtime.lastError) {
                console.log('Tab update failed:', chrome.runtime.lastError.message);
              }
            });
          }
        });
      }
    });
    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', video.url);
      e.dataTransfer.setData('text/uri-list', video.url);
      e.dataTransfer.effectAllowed = 'copyLink';
      let displayUrl = video.url;
      if (video.url.length > 44) {
        displayUrl = `${video.url.slice(0, 22)}...${video.url.slice(-22)}`;
      }
      const dragImage = document.createElement('div');
      dragImage.style.background = '#1a1a1a';
      dragImage.style.color = '#ffffff';
      dragImage.style.padding = '5px 10px';
      dragImage.style.borderRadius = '5px';
      dragImage.style.border = '1px solid #555555';
      dragImage.style.maxWidth = '200px';
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      dragImage.style.display = 'flex';
      dragImage.style.flexDirection = 'column';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = video.title || 'Untitled';
      titleSpan.style.fontSize = '12px';
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      dragImage.appendChild(titleSpan);
      const urlSpan = document.createElement('span');
      urlSpan.textContent = displayUrl;
      urlSpan.style.fontSize = '10px';
      urlSpan.style.whiteSpace = 'nowrap';
      urlSpan.style.overflow = 'hidden';
      urlSpan.style.textOverflow = 'ellipsis';
      dragImage.appendChild(urlSpan);
      document.body.appendChild(dragImage);
      const dragImageWidth = dragImage.offsetWidth;
      e.dataTransfer.setDragImage(dragImage, (dragImageWidth * 1.85) / 5, -5);
      setTimeout(() => dragImage.remove(), 0);
    });
    container.appendChild(div);
  });

document.querySelectorAll('.delete-button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const url=normalizeYouTubeUrl(button.dataset.url)
      chrome.storage.local.get([url], (result) => {
        const data = result[url] || {};
        const title = data.title || 'Unknown';
        console.log(title);
        const notification = document.getElementById('notification');
        if (window.notificationTimeout) {
          clearTimeout(window.notificationTimeout);
          notification.classList.remove('show');
        }
        notification.innerHTML = `
          <div class="notification-head">Deleted Data</div>
          <div class="notification-title">${title}</div>
        `;
        notification.classList.add('show');
        window.notificationTimeout = setTimeout(() => {
          notification.classList.remove('show');
          notification.textContent = '';
          window.notificationTimeout = null;
        }, 2000);
      });
      e.stopPropagation();
      chrome.storage.local.get([url], (result) => {
        const data = result[url] || {};
        const title = data.title || 'Unknown';
        console.log(`Deleted video data\n${title}\n${url}`);
      });
      chrome.storage.local.remove(url, () => {
        chrome.storage.local.get(null, (result) => {
          const videos = Object.entries(result)
            .filter(([key]) => key.includes('youtube.com/watch'))
            .map(([_, value]) => value)
          window.savedVideos = videos; // Update stored videos
          renderSavedVideos(videos);
        });
      });
    });
  });
}


function showSavedStorage() {
  currentTab = 'saved';
  document.querySelectorAll('.content').forEach((c) => (c.style.display = 'none'));
  const savedContent = document.getElementById('saved-content');
  const backButton = document.getElementById('back-button');
  const searchButton = document.getElementById('search-button');
  if (savedContent) {
    savedContent.style.display = 'block';
  }
  if (backButton) {
    backButton.style.display = 'block';
  }
  if (searchButton) {
    searchButton.title = 'Search Saved Videos';
    // document.getElementById('search-input').placeholder = 'Search saved videos';
  }
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
  document.getElementById('sync-button').classList.remove('visible');
  document.getElementById('search-area').style.display = 'none';

  chrome.storage.local.get(null, (result) => {
    const videos = Object.entries(result)
      .filter(([key]) => key.includes('youtube.com/watch'))
      .map(([_, value]) => value)
    window.savedVideos = videos; // Store videos for search
    renderSavedVideos(videos);
  });
}

function highlightCurrentChapter(forceScroll = false) {
  let wasDragging = false;
  const containers = ['normal-content', 'auto-content', 'description-content', 'custom-content'];
  let activeChapterEl = null;
  let currentActiveIndex = -1;
  const syncButton = document.getElementById('sync-button');

  if (currentTab === 'saved' || (window[`${currentTab}Chapters`] || []).length === 0) {
    syncButton.classList.remove('visible');
    return;
  }

  containers.forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const chapters = window[`${containerId.replace('-content', '')}Chapters`] || [];
    const chapterEls = container.querySelectorAll('.chapter');
    chapterEls.forEach((el, i) => {
      const chapter = chapters[i];
      const progressEl = el.querySelector('.chapter-progress-completed');
      const thumbEl = el.querySelector('.chapter-progress-thumb');
      if (!progressEl || !thumbEl) return;

      let lastSeekPosition = 0;

      const updateProgress = (clientX, isDraggingOrClick = false) => {
        const rect = el.querySelector('.chapter-progress').getBoundingClientRect();
        const progressWidth = rect.width;
        const offsetX = Math.max(0, Math.min(clientX - rect.left, progressWidth));
        const progressRatio = offsetX / progressWidth;
        const nextChapterTime = chapters[i + 1]?.start_time || window.videoDuration;
        const chapterDuration = nextChapterTime - chapter.start_time;
        const seekTime = Math.min(chapter.start_time + progressRatio * chapterDuration, nextChapterTime - 1);
      
        if (isDraggingOrClick) {
          progressEl.style.transition = 'none';
          thumbEl.style.transition = 'none';
          progressEl.style.width = `${progressRatio * 100}%`;
          thumbEl.style.left = `${progressRatio * 100}%`;
          lastSeekPosition = seekTime;
        } else if (el.dataset.isDragging !== 'true' && chapter && currentTime >= chapter.start_time && (!chapters[i + 1] || currentTime < chapters[i + 1].start_time)) {
          // progressEl.style.transition = el.querySelector('.chapter-progress').matches(':hover') ? 'width 0s linear' : 'width 0.5s linear';
          // thumbEl.style.transition = 'left 0s linear';
          progressEl.style.transition = 'width 0.5s linear';
          thumbEl.style.transition = 'left 0.5s linear';
          const nextChapterTime = chapters[i + 1]?.start_time || window.videoDuration;
          const chapterDuration = nextChapterTime - chapter.start_time;
          const progress = chapterDuration > 0 ? Math.min((currentTime - chapter.start_time) / chapterDuration, 1) : 0;
          progressEl.style.width = `${progress * 100}%`;
          thumbEl.style.left = `${progress * 100}%`;
        }
      };

      const seekToPosition = (seekTime) => {
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
              args: [seekTime],
            });
          }
        });
      };

      const handleMouseDown = (e) => {
        el.dataset.isDragging = 'true';
        el.querySelector('.chapter-progress').classList.add('dragging');
        updateProgress(e.clientX, true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      };

      let lastSeekTime = 0;
      const handleMouseMove = (e) => {
        if (el.dataset.isDragging === 'true') {
          updateProgress(e.clientX, true);
          showTooltipDuringDrag(e);
          document.body.style.cursor = 'pointer';
          const currentTime = Date.now();
          if (lastSeekPosition === 0){
            lastSeekPosition = 0.08415146904894946;
          }
          if (currentTime - lastSeekTime >= 400 && lastSeekPosition) {
            seekToPosition(lastSeekPosition);
            lastSeekTime = currentTime;
          }
        }
      };

      const handleMouseUp = () => {
        el.dataset.isDragging = 'false';
        el.querySelector('.chapter-progress').classList.remove('dragging');
        tooltip.style.display = 'none';
        document.body.style.cursor = 'default';
        if (lastSeekPosition) {
          seekToPosition(lastSeekPosition);
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      thumbEl.addEventListener('mousedown', handleMouseDown);
      const progressBar = el.querySelector('.chapter-progress');
      progressBar.addEventListener('mousedown', (e) => {
        el.dataset.isDragging = 'true';
        el.querySelector('.chapter-progress').classList.add('dragging');
        updateProgress(e.clientX, true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      });
      progressBar.addEventListener('click', (e) => {
        if (el.dataset.isDragging !== 'true') {
          updateProgress(e.clientX, true);
          if (lastSeekPosition) {
            seekToPosition(lastSeekPosition);
          }
        }
      });

      if (el.dataset.isDragging !== 'true' && !wasDragging) {
        updateProgress(null, false);
      }

      if (chapter && currentTime >= chapter.start_time && (!chapters[i + 1] || currentTime < chapters[i + 1].start_time)) {
        el.classList.add('active');
        if (containerId === `${currentTab}-content`) {
          activeChapterEl = el;
          currentActiveIndex = i;
        }
      } else {
        if (!el.classList.contains('search-highlight')) {
          el.classList.remove('active');
        }
      }
      wasDragging = el.dataset.isDragging === 'true';
      let tooltip = progressBar.querySelector('.chapter-progress-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'chapter-progress-tooltip';
        progressBar.appendChild(tooltip);
      }

      // Show tooltip on hover
      progressBar.addEventListener('mousemove', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const progressRatio = offsetX / rect.width;
        const nextChapterTime = chapters[i + 1]?.start_time || window.videoDuration;
        const chapterDuration = nextChapterTime - chapter.start_time;
        //const seekTime = chapter.start_time + progressRatio * chapterDuration;
        const seekTime = Math.min(chapter.start_time + progressRatio * chapterDuration, nextChapterTime - 1);

        // Format time as HH:MM:SS or MM:SS
        const hours = Math.floor(seekTime / 3600);
        const minutes = Math.floor((seekTime % 3600) / 60);
        const seconds = Math.floor(seekTime % 60);
        tooltip.textContent = hours > 0
          ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;        
        const tooltipWidth = tooltip.offsetWidth;
        const minLeft = (tooltipWidth / 2)-10; // Keep left edge inside progress bar
        const maxLeft = rect.width - (tooltipWidth/2)+10;
        tooltip.style.left = `${Math.max(minLeft, Math.min(maxLeft, offsetX))}px`;
        tooltip.style.display = 'block';  
      });

      // Show tooltip during drag
      const showTooltipDuringDrag = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const progressRatio = offsetX / rect.width;
        const nextChapterTime = chapters[i + 1]?.start_time || window.videoDuration;
        const chapterDuration = nextChapterTime - chapter.start_time;
        //const seekTime = chapter.start_time + progressRatio * chapterDuration;
        const seekTime = Math.min(chapter.start_time + progressRatio * chapterDuration, nextChapterTime - 1);

        const hours = Math.floor(seekTime / 3600);
        const minutes = Math.floor((seekTime % 3600) / 60);
        const seconds = Math.floor(seekTime % 60);
        tooltip.textContent = hours > 0
          ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        const tooltipWidth = tooltip.offsetWidth;
        const minLeft = tooltipWidth / 2;
        const maxLeft = rect.width - tooltipWidth / 2;
        tooltip.style.left = `${Math.max(minLeft, Math.min(maxLeft, offsetX))}px`;
        tooltip.style.display = 'block';
      };

      // Hide tooltip on mouseleave
      progressBar.addEventListener('mouseleave', () => {
        if (el.dataset.isDragging !== 'true') {
          tooltip.style.display = 'none';
        }
      });
    });
  });

  if (activeChapterEl && currentTab && currentTab !== 'saved') {
    const content = document.getElementById(`${currentTab}-content`);
    const headerHeight = document.querySelector('.header').offsetHeight;
    const targetScrollPosition = activeChapterEl.offsetTop - headerHeight - 20;
    const isAtBottom = content.scrollHeight <= content.scrollTop + content.clientHeight + 10;
    const isSynced =
      Math.abs(content.scrollTop - targetScrollPosition) < 10 ||
      (isAtBottom && activeChapterEl.offsetTop + activeChapterEl.offsetHeight > content.scrollTop + headerHeight);

  if ((forceScroll && !syncButton.classList.contains('visible')) || (!isSynced && currentActiveIndex !== lastActiveChapterIndex && !isAutoScrolling && !syncButton.classList.contains('visible'))) {
    isAutoScrolling = true;
    content.scrollTo({
      top: targetScrollPosition,
      behavior: forceScroll ? 'instant' : 'smooth',
    });
    syncButton.classList.remove('visible');
    lastActiveChapterIndex = currentActiveIndex;
    setTimeout(() => {
      isAutoScrolling = false;
    }, forceScroll ? 0 : 600);
  }
  else if (!isSynced && currentActiveIndex !== lastActiveChapterIndex - 1 && !isAutoScrolling) {
  if (
    Math.abs(content.scrollTop - targetScrollPosition) >= 10 &&
    !(isAtBottom && activeChapterEl.offsetTop + activeChapterEl.offsetHeight > content.scrollTop + headerHeight)
  ) {
    if (!isAutoScrolling) {
      syncButton.classList.add('visible');
      const container = document.getElementById(`${currentTab}-content`);
      if (container) {
        const contentHeight = container.clientHeight;
        const scrollHeight = container.scrollHeight;
        const remainingSpace = scrollHeight - (activeChapterEl.offsetTop + activeChapterEl.offsetHeight);
        const canScrollToTop = remainingSpace > contentHeight - headerHeight - 20;
        if (canScrollToTop) {
          
          let emptyChapter = container.querySelector('.empty-chapter');
          if (syncButton.classList.contains('visible')) {
            if (!emptyChapter) {
              emptyChapter = document.createElement('div');
              emptyChapter.className = 'empty-chapter';
              emptyChapter.style.height = '40px';
              emptyChapter.style.backgroundColor = 'black';
              container.appendChild(emptyChapter);
            }
          } else {
            if (emptyChapter) {
              emptyChapter.remove();
            }
          }
        } else {
          let emptyChapter = container.querySelector('.empty-chapter');
          if (emptyChapter) {
            emptyChapter.remove();
          }
        }
      }
      syncButton.onclick = () => {
        isAutoScrolling = true;
        content.scrollTo({
          top: targetScrollPosition,
          behavior: 'smooth',
        });
        syncButton.classList.remove('visible');
        const container = document.getElementById(`${currentTab}-content`);
        if (container) {
          const emptyChapter = container.querySelector('.empty-chapter');
          if (emptyChapter) {
            emptyChapter.remove();
          }
        }
        lastActiveChapterIndex = currentActiveIndex;
        setTimeout(() => {
          isAutoScrolling = false;
        }, 600);
      };
    }
  } else {
    syncButton.classList.remove('visible');
    const container = document.getElementById(`${currentTab}-content`);
    if (container) {
      const emptyChapter = container.querySelector('.empty-chapter');
      if (emptyChapter) {
        emptyChapter.remove();
      }
    }
  }
} else {
  syncButton.classList.remove('visible');
  const container = document.getElementById(`${currentTab}-content`);
  if (container) {
    const emptyChapter = container.querySelector('.empty-chapter');
    if (emptyChapter) {
      emptyChapter.remove();
    }
  }
}

let isManualScrolling = false;
content.onscroll = () => {
  if (!isManualScrolling && !isAutoScrolling) {
    isManualScrolling = true;
    setTimeout(() => {
      isManualScrolling = false;
    }, 1000);
    lastActiveChapterIndex = currentActiveIndex;
  }
};
  } else {
    syncButton.classList.remove('visible');
  }
}

function switchTab(tab) {
  document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
  const validTabs = ['normal', 'auto', 'description', 'custom'];
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

function showLoading() {
  document.querySelectorAll('.content').forEach((content) => {
    if (content.id === 'custom-content') {
      if (!content.querySelector('#custom-input')) {
        content.innerHTML = '<textarea class="custom-input" id="custom-input" placeholder="Enter chapters (e.g., 0:00 Intro\n1:30 Part 1)"></textarea>';
      }
    } else if (content.id === 'saved-content') {
      content.querySelector('#saved-videos-list').innerHTML = '<div class="loading">Loading...</div>';
    } else {
      content.innerHTML = '<div class="loading">Loading...</div>';
    }
    content.style.display = 'none';
  });
  const currentContent = document.getElementById(`${currentTab}-content`);
  if (currentContent) {
    currentContent.style.display = 'block';
  }
  updateVideoInfo('', '', 0, ''); // Set default "Video Chapters" during loading
}

function showError(message) {
  document.querySelectorAll('.content').forEach((content) => {
    if (content.id === 'custom-content') {
      if (!content.querySelector('#custom-input')) {
        content.innerHTML = '<textarea class="custom-input" id="custom-input" placeholder="Enter chapters (e.g., 0:00 Intro\n1:30 Part 1)"></textarea>';
      }
    } else if (content.id === 'saved-content') {
      const savedVideosList = content.querySelector('#saved-videos-list');
      if (savedVideosList) {
        savedVideosList.innerHTML = `<div class="error">${message}</div>`;
      }
    } else {
      content.innerHTML = `<div class="error">${message}</div>`;
    }
    content.style.display = 'none';
  });
  const currentContent = document.getElementById('normal-content');
  if (currentContent) {
    currentContent.style.display = 'block';
    currentContent.innerHTML = `<div class="error">${message}</div>`;
  } else {
    const fallbackContent = document.createElement('div');
    fallbackContent.className = 'content';
    fallbackContent.id = 'normal-content';
    fallbackContent.innerHTML = `<div class="error">${message}</div>`;
    document.querySelector('.container').appendChild(fallbackContent);
  }
  updateVideoInfo('', '', 0, ''); // Ensure "Video Chapters" is set
}

function cycleTabs(direction = 'forward') {
  const tabs = ['normal', 'auto', 'description', 'custom'];
  const currentIndex = tabs.indexOf(currentTab);
  let nextIndex;
  if (direction === 'forward') {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  }
  switchTab(tabs[nextIndex]);
}

function searchContent(query) {
  document.querySelectorAll('.chapter, .video-entry').forEach(el => {
    el.classList.remove('search-selected');
    el.classList.remove('search-selected-active');
  });

  searchResults = [];
  currentSearchIndex = -1;
  const content = document.getElementById(`${currentTab}-content`);
  const searchCounter = document.getElementById('search-counter');

  // Clear previous highlights
  document.querySelectorAll('.chapter, .video-entry').forEach(el => el.classList.remove('search-selected-active'));
  document.querySelectorAll('span.search-highlight').forEach(span => span.remove());

  if (currentTab === 'saved') {
    const videos = window.savedVideos || [];
    const videoEls = content.querySelectorAll('.video-entry');
    const titleEls = content.querySelectorAll('.video-title');

    titleEls.forEach((el, index) => {
      el.innerHTML = videos[index]?.title || el.textContent;
    });
    searchCounter.textContent = '';

    if (query.trim() === '') {
      return;
    }

    videos.forEach((video, index) => {
      const lowerTitle = video.title.toLowerCase();
      const lowerQuery = query.toLowerCase();
      if (lowerTitle.includes(lowerQuery)) {
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const highlightedText = video.title.replace(regex, '<span class="search-highlight">$1</span>');
        titleEls[index].innerHTML = highlightedText;
        searchResults.push({ index, element: titleEls[index], chapterElement: videoEls[index] });
      }
    });

    if (searchResults.length > 0) {
      cycleSearchResults();
      searchCounter.title = searchResults.length + ' Videos found with the text '+"'"+query+"'";
      searchCounter.textContent = `${currentSearchIndex + 1}/${searchResults.length}`;
    } else {
      searchCounter.title = 'No Videos found with the text '+"'"+query+"'";
      searchCounter.textContent = '0/0';
    }
  } else {
    const chapters = window[`${currentTab}Chapters`] || [];
    const chapterEls = content.querySelectorAll('.chapter');
    const titleEls = content.querySelectorAll('.chapter-title');

    titleEls.forEach((el, index) => {
      el.innerHTML = chapters[index]?.title || el.textContent;
    });
    searchCounter.textContent = '';

    if (query.trim() === '') {
      return;
    }

    chapters.forEach((chapter, index) => {
      const lowerTitle = chapter.title.toLowerCase();
      const lowerQuery = query.toLowerCase();
      if (lowerTitle.includes(lowerQuery)) {
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const highlightedText = chapter.title.replace(regex, '<span class="search-highlight">$1</span>');
        titleEls[index].innerHTML = highlightedText;
        searchResults.push({ index, element: titleEls[index], chapterElement: chapterEls[index] });
      }
    });

    if (searchResults.length > 0) {
      cycleSearchResults();
      searchCounter.title = searchResults.length + ' Chapters found with the text '+"'"+query+"'";
      searchCounter.textContent = `${currentSearchIndex + 1}/${searchResults.length}`;
    } else {
      searchCounter.title = 'No Chapters found with the text '+"'"+query+"'";
      searchCounter.textContent = '0/0';
    }
  }
}

function cycleSearchResults(direction = 'forward') {
  if (searchResults.length === 0) return;

  if (currentSearchIndex >= 0) {
    const prevResult = searchResults[currentSearchIndex];
    if (prevResult && prevResult.element) {
      if (prevResult.chapterElement) {
        prevResult.chapterElement.classList.remove('search-selected');
        prevResult.chapterElement.classList.remove('search-selected-active');
      }
      const spans = prevResult.element.querySelectorAll('span.search-highlight');
      spans.forEach((span) => {
        if (span.classList.contains('search-selected')) {
          span.classList.remove('search-selected');
        }
      });
    }
  }

  if (direction === 'forward') {
    currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
  } else {
    currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
  }
  const { element, chapterElement } = searchResults[currentSearchIndex];

  const spans = element.querySelectorAll('span.search-highlight');
  spans.forEach((span) => span.classList.add('search-selected'));
  chapterElement.classList.add('search-selected');
  if (chapterElement.classList.contains('active')) {
    chapterElement.classList.add('search-selected-active');
  }

  const searchCounter = document.getElementById('search-counter');
  searchCounter.textContent = `${currentSearchIndex + 1}/${searchResults.length}`;

  const content = document.getElementById(`${currentTab}-content`);
  const headerHeight = document.querySelector('.header').offsetHeight;
  const targetScrollPosition = chapterElement.offsetTop - headerHeight - 20;
  content.scrollTo({
    top: targetScrollPosition,
    behavior: 'instant',
  });
}

function clearSearch() {
  document.querySelectorAll('.chapter, .video-entry').forEach(el => el.classList.remove('search-selected-active'));
  document.querySelectorAll('span.search-highlight').forEach(span => span.classList.remove('search-selected'));
  const searchInput = document.getElementById('search-input');
  const searchArea = document.getElementById('search-area');
  const searchCounter = document.getElementById('search-counter');
  searchInput.value = '';
  searchArea.style.display = 'none';
  document.querySelectorAll('.chapter, .video-entry').forEach(el => {
    el.classList.remove('search-selected');
    el.classList.remove('search-selected-active');
  });
  searchResults = [];
  currentSearchIndex = -1;
  searchCounter.textContent = '';
  document.body.classList.remove('search-area-active');
  const content = document.getElementById(`${currentTab}-content`);
  if (content) {
    if (currentTab === 'saved') {
      const titleEls = content.querySelectorAll('.video-title');
      const videos = window.savedVideos || [];
      titleEls.forEach((el, index) => {
        el.innerHTML = (videos[index]?.title || el.textContent).replace(/<span class="search-highlight">|<\/span>/g, '');
      });
    } else {
      const titleEls = content.querySelectorAll('.chapter-title');
      const chapters = window[`${currentTab}Chapters`] || [];
      titleEls.forEach((el, index) => {
        el.innerHTML = (chapters[index]?.title || el.textContent).replace(/<span class="search-highlight">|<\/span>/g, '');
      });
      highlightCurrentChapter(true);
    }
  }
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
      document.getElementById('search-button').style.display = 'none';
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

document.getElementById('confirm-delete-video').addEventListener('click', () => {
  chrome.storage.local.remove(videoUrl, () => {
    const notification = document.getElementById('notification');
    if (window.notificationTimeout) {
      clearTimeout(window.notificationTimeout);
      notification.classList.remove('show');
    }
    notification.textContent = 'Video data deleted';
    notification.classList.add('show');
    window.notificationTimeout = setTimeout(() => {
      notification.classList.remove('show');
      notification.textContent = '';
      window.notificationTimeout = null;
    }, 2000);
    document.getElementById('delete-video-popup').style.display = 'none';
    document.body.classList.remove('delete-popup-active');
    document.getElementById('delete-video-button').blur();
    // Clear highlight and re-render saved videos
    chrome.storage.local.get(null, (result) => {
      const videos = Object.entries(result)
        .filter(([key]) => key.includes('youtube.com/watch'))
        .map(([_, value]) => value)
      renderSavedVideos(videos);
    });
  });
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

document.getElementById('clear-search-button').addEventListener('click', clearSearch);

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
    
    // Extract chapters exactly as done for new videos
    let normalChapters = [];
    let autoChapters = [];
    const initialDataMatch = html.match(/ytInitialData\s*=\s*(\{.+?\});/);
    if (initialDataMatch) {
      const initialData = JSON.parse(initialDataMatch[1]);
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
    else if (uniqueDescriptionChapters.length > 0) initialTab = 'description';

    // Update global chapter arrays
    window.normalChapters = normalChapters;
    window.autoChapters = autoChapters;
    window.descriptionChapters = uniqueDescriptionChapters;
    window.customChapters = customChapters;

    // Get live status
    const { isLive } = getVideoInfo(html, playerResponse);
    console.log("islive:",isLive)

    // Store updated video data
    const videoData = {
      url: correctUrl,
      title,
      thumbnail,
      duration,
      channel,
      normalChapters,
      autoChapters,
      descriptionChapters,
      customChapters,
      fetchTime: new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      isLive,
      ...(isLive ? { lastCheckedTime: new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) } : {}),
      lastActiveTab: initialTab,
    };
    chrome.storage.local.set({ [correctUrl]: videoData }, () => {
      // Render chapters
      renderChapters(normalChapters, 'normal-content', thumbnail);
      renderChapters(autoChapters, 'auto-content', thumbnail);
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
    videoUrl.includes('youtube.com/watch') &&
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
    // } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && currentTab !== 'saved') {
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
              // Function to clear notification
              const clearNotification = () => {
                const notification = document.getElementById('notification');
                notification.classList.remove('show', 'seek-right', 'seek-left');
                notification.textContent = '';
                clearTimeout(window.notificationTimeout);
                window.notificationTimeout = null;
              };

              // Clear notification when switching tabs
              chrome.tabs.onActivated.addListener(() => {
                clearNotification();
              });

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
                clearNotification();
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
    if (searchButton) searchButton.style.display = 'none';
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
    if (searchButton) searchButton.style.display = 'none';
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
          console.log("from 4")
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

            const initialDataMatch = html.match(/ytInitialData\s*=\s*(\{.+?\});/);
            let normalChapters = [];
            let autoChapters = [];
            if (initialDataMatch) {
              const initialData = JSON.parse(initialDataMatch[1]);
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
            const { isLive, duration1 } = getVideoInfo(response.details.html, response.details.playerResponse);
            console.log("islive:",isLive)

            const videoData = {
              url: correctUrl,
              title,
              thumbnail,
              duration,
              channel,
              normalChapters,
              autoChapters,
              descriptionChapters,
              customChapters: [],
              fetchTime: response.details.fetchTime || new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
              isLive,
                ...(isLive ? { lastCheckedTime: new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) } : {}),
            };
            let initialTab = 'custom';
            if (normalChapters.length > 0) initialTab = 'normal';
            else if (autoChapters.length > 0) initialTab = 'auto';
            else if (uniqueDescriptionChapters.length > 0) initialTab = 'description';

            chrome.storage.local.set({ [correctUrl]: videoData }, () => {
              // console.log('Stored video data:', videoData);
              renderChapters(normalChapters, 'normal-content', thumbnail);
              renderChapters(autoChapters, 'auto-content', thumbnail);
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
                if (!storedData || storedData.isLive) return;
                const storedDuration = parseInt(storedData.duration);
                await chrome.scripting.executeScript(
                  {
                    target: { tabId: activeTab.id },
                    func: () => document.querySelector('video')?.duration,
                  },
                  (results) => {
                    if (results && results[0]?.result !== undefined) {
                      const playerDuration = Math.round(results[0].result);
                      if (Math.abs(storedDuration - playerDuration)<=1) {
                        chrome.scripting.executeScript(
                          {
                            target: { tabId: activeTab.id },
                            func: () => document.querySelector('video')?.currentTime,
                          },
                          (timeResults) => {
                            if (timeResults && timeResults[0]?.result !== undefined) {
                              currentTime = timeResults[0].result;
                              highlightCurrentChapter();
                              // Update timestamp in localStorage
                              const videoId = new URL(tempUrl).searchParams.get('v');
                              if ((currentTime > storedDuration - 3 && storedDuration > 10) || (currentTime > storedDuration - 1 && storedDuration < 10)){
                                currentTime=0;
                              }
                              const newUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(currentTime)}s`;
                              storedData.url = newUrl;
                              chrome.storage.local.set({ [tempUrl]: storedData });
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
                  if (searchButton) searchButton.style.display = 'none';
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
          // Remove context menus on click outside extension window
          window.addEventListener('blur', () => {
            document.querySelectorAll('.context-menu').forEach(menu => {
              menu.style.opacity = '0';
              setTimeout(() => menu.remove(), 200);
            });
          });

          // Remove context menus on window resize
          window.addEventListener('resize', () => {
            document.querySelectorAll('.context-menu').forEach(menu => {
              menu.style.opacity = '0';
              setTimeout(() => menu.remove(), 200);
            });
          });
          // Remove context menus on browser tab switch
          chrome.tabs.onActivated.addListener(() => {
            document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
          });

          // Remove context menus on window focus change
          chrome.windows.onFocusChanged.addListener(() => {
            document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
          });
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
    customInput.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (contextMenu) {
            contextMenu.remove(); // Remove existing context menu if it exists
            contextMenu = null;
        }
    contextMenu = document.createElement('div');
    contextMenu.style.position = 'absolute';
    const menuHeight = 5 * 32; // 5 menu items, approx 32px each
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
      <div class="context-item" id="show-description-chapters" style="padding: 5px; cursor: pointer; ${window.descriptionChapters?.length === 0 ? 'opacity: 0.3; pointer-events: none;' : ''}">Show Description Chapters</div>
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
      contextMenu.remove();
    }
    
    document.getElementById('show-normal-chapters')?.addEventListener('click', (e) => showChapters('normal', window.normalChapters || []));
    document.getElementById('show-auto-chapters')?.addEventListener('click', (e) => showChapters('auto', window.autoChapters || []));
    document.getElementById('show-description-chapters')?.addEventListener('click', (e) => showChapters('description', window.descriptionChapters || []));
    document.getElementById('show-custom-chapters')?.addEventListener('click', (e) => showChapters('custom', window.customChapters || []));
    

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
      contextMenu.remove();
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

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'urlChanged' || request.action === 'tabChanged' || request.action === 'videoChanged') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs.find((t) => t.active);
      if (!activeTab || !activeTab.url.includes('youtube.com/watch')) {
        chrome.storage.local.remove('showSavedVideos', () => {
          showError('Not a valid YouTube video page');
          document.querySelector('.tabs').style.display = 'none';
          document.getElementById('sync-button').style.display = 'none';
          document.getElementById('search-button').style.display = 'none';
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
      }
    });
  }
});
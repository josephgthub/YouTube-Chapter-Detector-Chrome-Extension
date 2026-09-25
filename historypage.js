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
  chrome.storage.local.get(['sortedOrder'], (result) => {
    let sortedOrder = result.sortedOrder || [];
    sortedOrder = sortedOrder.filter(url => videos.some(video => normalizeYouTubeUrl(video.url) === url));
    const existingUrls = new Set(sortedOrder);
    const newVideos = videos
      .filter(video => !existingUrls.has(normalizeYouTubeUrl(video.url)))
      .sort((a, b) => {
        const dateA = a.fetchTime ? new Date(a.fetchTime) : new Date(0);
        const dateB = b.fetchTime ? new Date(b.fetchTime) : new Date(0);
        return dateB - dateA;
      });
    sortedOrder = [...newVideos.map(video => normalizeYouTubeUrl(video.url)), ...sortedOrder];

    let draggingUrl = null;
    let previewSortedOrder = [...sortedOrder];

    function updateSortedOrder(url, targetIndex) {
      previewSortedOrder = previewSortedOrder.filter(item => item !== url);
      previewSortedOrder.splice(targetIndex, 0, url);
      renderVideoList();
    }

    function renderVideoList() {
      const sortedVideos = videos.slice().sort((a, b) => {
        const indexA = previewSortedOrder.indexOf(normalizeYouTubeUrl(a.url));
        const indexB = previewSortedOrder.indexOf(normalizeYouTubeUrl(b.url));
        return indexA - indexB;
      });
      container.innerHTML = '';
      sortedVideos.forEach((video, index) => {
        const div = document.createElement('div');
        div.className = `video-entry${normalizeYouTubeUrl(video.url) === normalizeYouTubeUrl(videoUrl) && videoUrl.includes('youtube.com/watch') && currentTab === 'saved' && !document.querySelector('.error') ? ' active' : ''}`;
        div.title = "Title : " + video.title + "\nChannel : " + (video.channel || 'Unknown') + "\n" + formatYouTubeTimestamp(video.url) + " / " + formatTime(video.duration || 36000) + (normalizeYouTubeUrl(video.url) === normalizeYouTubeUrl(videoUrl) ? "\n\n(Current Playing)" : "");
        div.style.cursor = 'pointer';
        div.draggable = true;
        div.dataset.url = video.url;
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
          draggingUrl = normalizeYouTubeUrl(video.url);
          previewSortedOrder = [...sortedOrder];
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
          div.classList.add('dragging');
        });
        div.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (e.ctrlKey && draggingUrl && draggingUrl !== normalizeYouTubeUrl(video.url)) {
            const rect = div.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const targetIndex = e.clientY < midpoint ? index : index + 1;
            updateSortedOrder(draggingUrl, targetIndex);
          }
        });
        div.addEventListener('dragenter', (e) => {
          e.preventDefault();
          if (draggingUrl && draggingUrl !== normalizeYouTubeUrl(video.url)) {
            div.classList.add('drag-over');
          }
        });
        div.addEventListener('dragleave', (e) => {
          div.classList.remove('drag-over');
        });
        div.addEventListener('drop', (e) => {
          e.preventDefault();
          div.classList.remove('drag-over');
          if (draggingUrl) {
            const rect = div.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const targetIndex = e.clientY < midpoint ? index : index + 1;
            sortedOrder = [...previewSortedOrder];
            chrome.storage.local.set({ sortedOrder }, () => {
              draggingUrl = null;
            });
          }
        });
        div.addEventListener('dragend', () => {
          div.classList.remove('dragging');
          document.querySelectorAll('.video-entry').forEach(entry => entry.classList.remove('drag-over'));
          if (draggingUrl && previewSortedOrder !== sortedOrder) {
            sortedOrder = [...previewSortedOrder];
            chrome.storage.local.set({ sortedOrder }, () => {
              draggingUrl = null;
            });
          }
        });
        container.appendChild(div);
      });

      document.querySelectorAll('.delete-button').forEach((button) => {
        button.addEventListener('click', (e) => {
          const url = normalizeYouTubeUrl(button.dataset.url);
          chrome.storage.local.get([url], (result) => {
            const data = result[url] || {};
            const title = data.title || 'Unknown';
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
            chrome.storage.local.get(['sortedOrder'], (result) => {
              let sortedOrder = result.sortedOrder || [];
              sortedOrder = sortedOrder.filter(item => item !== normalizeYouTubeUrl(url));
              chrome.storage.local.set({ sortedOrder }, () => {
                chrome.storage.local.get(null, (result) => {
                  const videos = Object.entries(result)
                    .filter(([key]) => key.includes('youtube.com/watch'))
                    .map(([_, value]) => value);
                  window.savedVideos = videos;
                  renderSavedVideos(videos);
                });
              });
            });
          });
        });
      });
    }

    container.ondragover = (e) => {
      e.preventDefault();
    };

    container.ondragleave = (e) => {
      if (!container.contains(e.relatedTarget)) {
        previewSortedOrder = [...sortedOrder];
        renderVideoList();
      }
    };

    renderVideoList();
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

  chrome.storage.local.get(['sortedOrder'], (result) => {
    let sortedOrder = result.sortedOrder || [];
    chrome.storage.local.get(null, (result) => {
      const videos = Object.entries(result)
        .filter(([key]) => key.includes('youtube.com/watch'))
        .map(([_, value]) => value);
      sortedOrder = sortedOrder.filter(url => videos.some(video => normalizeYouTubeUrl(video.url) === url));
      const existingUrls = new Set(sortedOrder);
      const newVideos = videos
        .filter(video => !existingUrls.has(normalizeYouTubeUrl(video.url)))
        .sort((a, b) => {
          const dateA = a.fetchTime ? new Date(a.fetchTime) : new Date(0);
          const dateB = b.fetchTime ? new Date(b.fetchTime) : new Date(0);
          return dateB - dateA;
        });
      sortedOrder = [...newVideos.map(video => normalizeYouTubeUrl(video.url)), ...sortedOrder];
      chrome.storage.local.set({ sortedOrder }, () => {
        window.savedVideos = videos;
        renderSavedVideos(videos);
      });
    });
  });
}

document.getElementById('confirm-delete-video').addEventListener('click', () => {
  chrome.storage.local.remove(videoUrl, () => {
    chrome.storage.local.get(['sortedOrder'], (result) => {
      let sortedOrder = result.sortedOrder || [];
      sortedOrder = sortedOrder.filter(item => item !== normalizeYouTubeUrl(videoUrl));
      chrome.storage.local.set({ sortedOrder }, () => {
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
        chrome.storage.local.get(null, (result) => {
          const videos = Object.entries(result)
            .filter(([key]) => key.includes('youtube.com/watch'))
            .map(([_, value]) => value);
          renderSavedVideos(videos);
        });
      });
    });
  });
});
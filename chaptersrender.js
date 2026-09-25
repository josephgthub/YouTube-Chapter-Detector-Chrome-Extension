function highlightCurrentChapter(forceScroll = false) {
  let wasDragging = false;
  const containers = ['normal-content', 'auto-content', 'keymoments-content', 'description-content', 'custom-content'];
  let activeChapterEl = null;
  let currentActiveIndex = -1;
  const syncButton = document.getElementById('sync-button');

  const chaptersKey = currentTab === 'keymoments' ? 'keyMoments' : `${currentTab}Chapters`;
  if (currentTab === 'saved' || (window[chaptersKey] || []).length === 0) {
    syncButton.classList.remove('visible');
    return;
  }

  containers.forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const chapters = containerId === 'keymoments-content' ? window.keyMoments || [] : window[`${containerId.replace('-content', '')}Chapters`] || [];
    if (!chapters || chapters.some(ch => !ch || typeof ch.start_time !== 'number')) {
      console.warn(`Invalid chapters data for ${containerId}:`, chapters);
      return;
    }
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

      const progressBar = el.querySelector('.chapter-progress');
      if (el.dataset.progressListenersBound !== 'true') {
        thumbEl.addEventListener('mousedown', handleMouseDown);
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
        el.dataset.progressListenersBound = 'true';
      }

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
      progressBar.onmousemove = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const progressRatio = offsetX / rect.width;
        const nextChapterTime = chapters[i + 1]?.start_time || window.videoDuration;
        const chapterDuration = nextChapterTime - chapter.start_time;
        const seekTime = Math.min(chapter.start_time + progressRatio * chapterDuration, nextChapterTime - 1);

        const hours = Math.floor(seekTime / 3600);
        const minutes = Math.floor((seekTime % 3600) / 60);
        const seconds = Math.floor(seekTime % 60);
        tooltip.textContent = hours > 0
          ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // ✅ Show tooltip first to allow it to render
        tooltip.style.display = 'block';

        // ✅ Now it's safe to measure
        const tooltipWidth = tooltip.offsetWidth;
        const minLeft = (tooltipWidth / 2) - 10;
        const maxLeft = rect.width - (tooltipWidth / 2) + 10;
        tooltip.style.left = `${Math.max(minLeft, Math.min(maxLeft, offsetX))}px`;
      };


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
      progressBar.onmouseleave = () => {
        if (el.dataset.isDragging !== 'true') {
          tooltip.style.display = 'none';
        }
      };
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
        lastActiveChapterIndex = currentActiveIndex;
        setTimeout(() => {
          isAutoScrolling = false;
        }, 600);
        if (container) {
          const emptyChapter = container.querySelector('.empty-chapter');
          if (emptyChapter) {
            emptyChapter.remove();
          }
        }
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

function renderChapters(chapters, containerId, thumbnail) {
  chrome.storage.local.get([videoUrl], (result) => {
    const videoData = result[videoUrl] || {};
    const storyboardUrl = videoData.storyboardUrl || '';
    const duration = videoData.duration || 36000;
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
    start_time = Math.min((ch.start_time)+1,duration)
    const { outerStyle, innerStyle } = getStoryboardStyle(storyboardUrl, start_time, duration);
    div.innerHTML = `
      <span class="chapter-number">${index + 1}</span>
      <img src="${thumbnail}" alt="thumbnail" draggable="false">
      <div class="chapter-info">
        <p class="chapter-title" title="${formatTime(ch.start_time) + " - " + ch.title}">${ch.title}</p>
        <p class="chapter-time">${formatTime(ch.start_time)}</p>
      </div>
      <div class="chapter-progress">
        <div class="chapter-progress-completed"></div>
        <div class="chapter-progress-thumb"></div>
      </div>
    `;
    // div.innerHTML = `
    //   <span class="chapter-number">${index + 1}</span>
    //   <div class="chapter-img" style='${outerStyle}'>
    //     <div style='${innerStyle}'></div>
    //   </div>
    //   <div class="chapter-info">
    //     <p class="chapter-title" title="${formatTime(ch.start_time) + " - " + ch.title}">${ch.title}</p>
    //     <p class="chapter-time">${formatTime(ch.start_time)}</p>
    //   </div>
    //   <div class="chapter-progress">
    //     <div class="chapter-progress-completed"></div>
    //     <div class="chapter-progress-thumb"></div>
    //   </div>
    // `;

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
        <div class="context-item" data-action="copy-download-command">Copy Download Command</div>
      `;
      document.body.appendChild(contextMenu);
      setTimeout(() => {
        contextMenu.style.opacity = '1';
      }, 100);

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
          } else if (action === 'copy-download-command') {
            const videoId = new URL(videoUrl).searchParams.get('v');
            const startTime = formatTime(Math.max(0, ch.start_time - 4));
            const endTime = chapters[index + 1]?.start_time ? formatTime(chapters[index + 1].start_time) : formatTime(window.videoDuration);

            // Sanitize title so it can't break shell parsing or create bad paths
            const safeTitle = ch.title.replace(/[/\\?%*:|"<>]/g, '-').trim();

            // Detect platform
            const platform = navigator.platform.toLowerCase();
            const isWindows = platform.includes('win');
            const isMac = platform.includes('mac');
            const isLinux = !isWindows && !isMac;

            const ytdlpFormat = `bestvideo[height<=480][vcodec^=avc1][protocol=https]+bestaudio[acodec^=mp4a][protocol=https]/best[height<=360][vcodec^=avc1][protocol=https]`;

            let downloadCommand;

            if (isWindows) {
              // PowerShell syntax
              const dl = `$HOME\\Downloads`;
              downloadCommand = `$DL_DIR = "${dl}"; yt-dlp -f "${ytdlpFormat}" --download-sections "*${startTime}-${endTime}" -P "$DL_DIR" -o "$DL_DIR\\${safeTitle}.%(ext)s" "https://www.youtube.com/watch?v=${videoId}"; ffmpeg -ss 4 -i "$DL_DIR\\${safeTitle}.mp4" -c copy -avoid_negative_ts make_zero "$DL_DIR\\${safeTitle}.mkv"; Remove-Item "$DL_DIR\\${safeTitle}.mp4"`;
            } else {
              // bash/zsh syntax (Linux & macOS)
              const dl = `$HOME/Downloads`;
              downloadCommand = `DL_DIR="${dl}" && yt-dlp -f "${ytdlpFormat}" --download-sections "*${startTime}-${endTime}" -P "$DL_DIR" -o "$DL_DIR/${safeTitle}.%(ext)s" "https://www.youtube.com/watch?v=${videoId}" && ffmpeg -ss 4 -i "$DL_DIR/${safeTitle}.mp4" -c copy -avoid_negative_ts make_zero "$DL_DIR/${safeTitle}.mkv" && rm "$DL_DIR/${safeTitle}.mp4"`;
            }

            navigator.clipboard.writeText(downloadCommand);
            notification.innerHTML = `
              <div class="notification-downloadcommand">Copied download command${isWindows ? ' (PowerShell)' : ' (bash/zsh)'}</div>
            `;
            notification.classList.add('show');
            window.notificationTimeout = setTimeout(() => {
              notification.classList.remove('show');
              notification.textContent = '';
              window.notificationTimeout = null;
            }, 2000);
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
    });
    container.appendChild(div);
  });
})
}

function getStoryboardStyle(storyboardUrl, time, duration) {
  const parts = storyboardUrl.split('|');
  const base = parts[0];
  const level = parts.at(-1);
  const match = level.match(/(\d+)#(\d+)#(\d+)#(\d+)#(\d+)#/);
  if (!match) return { url: '', outerStyle: '', innerStyle: '' };

  const [ , w, h, totalFrames, r, c ] = match.map(Number);
  const framesPerImg = r * c;
  const fps = totalFrames / duration;
  const frame = Math.floor(time * fps);
  const imgIndex = Math.floor(frame / framesPerImg);
  const offset = frame % framesPerImg;
  const row = Math.floor(offset / c);
  const col = offset % c;

  const sigh = level.split('#').pop();
  const levelIndex = parts.length - 2;
  const url = base.replace('$L', levelIndex).replace('$N', `M${imgIndex}`) + `&sigh=${sigh}`;

  const outerStyle = `
    width: 60px;
    height: 40px;
    overflow: hidden;
    border-radius: 3px;
    background-color: #000;
  `;

  const innerStyle = `
    width: ${c * w}px;
    height: ${r * h}px;
    background-image: url("${url}");
    background-position: ${-col * w}px ${-row * h}px;
    background-size: ${c * w}px ${r * h}px;
    transform: scale(${60 / w}, ${40 / h});
    transform-origin: top left;
    background-repeat: no-repeat;
  `;

  return { url, outerStyle, innerStyle };
}

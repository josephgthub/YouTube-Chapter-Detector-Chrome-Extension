// utils.js
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function parseDuration(s) {
  if (!s || typeof s !== 'string') return null;
  s = s.trim();
  if (!s) return null;

  let days = 0,
    hours = 0,
    mins = 0,
    secs = 0,
    ms = 0;

  const regex1 = /^(?:(?:([0-9]+):)?([0-9]{1,2}):)?([0-9]{1,2})(?:[.:]([0-9]+))?$/;
  let m = s.match(regex1);
  if (m) {
    hours = parseInt(m[1] || 0);
    mins = parseInt(m[2] || 0);
    secs = parseInt(m[3]);
    ms = parseInt(m[4] || 0) / 1000;
  } else {
    const regex2 =
      /^(?:P?(?:([0-9]+)\s*d(?:ays?)?,?\s*)?T?(?:([0-9]+)\s*h(?:ours?)?,?\s*)?(?:([0-9]+)\s*m(?:in(?:utes?)?)?,?\s*)?(?:([0-9]+)(?:\.([0-9]+))?\s*s(?:ec(?:onds?)?)?)?)?$/i;
    m = s.match(regex2);
    if (m) {
      days = parseInt(m[1] || 0);
      hours = parseInt(m[2] || 0);
      mins = parseInt(m[3] || 0);
      secs = parseInt(m[4] || 0);
      ms = parseInt(m[5] || 0) / 1000;
    } else {
      const regex3 = /^([0-9.]+)\s*(hours?|mins?\.?|minutes?)$/i;
      m = s.match(regex3);
      if (m) {
        const value = parseFloat(m[1]);
        if (m[2].toLowerCase().startsWith('h')) hours = value;
        else mins = value;
      } else {
        return null;
      }
    }
  }

  return days * 86400 + hours * 3600 + mins * 60 + secs + ms;
}

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

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
  const tabs = ['normal', 'auto', 'keymoments', 'description', 'custom'];
  const currentIndex = tabs.indexOf(currentTab);
  let nextIndex;
  if (direction === 'forward') {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  }
  switchTab(tabs[nextIndex]);
}
function updateSortedOrder(url, index) {
  chrome.storage.local.get(['sortedOrder'], (result) => {
    let sortedOrder = result.sortedOrder || [];
    const normalizedUrl = normalizeYouTubeUrl(url);
    
    // Remove the URL if it exists in sortedOrder
    sortedOrder = sortedOrder.filter(item => item !== normalizedUrl);
    
    if (index === -1) {
      // If index is -1, save the updated sortedOrder without the URL
      chrome.storage.local.set({ sortedOrder }, () => {
        console.log(`Removed ${normalizedUrl} from sortedOrder`);
      });
    } else {
      // Ensure index is not negative and cap it at the end of the list
      const maxIndex = sortedOrder.length;
      const targetIndex = Math.min(Math.max(index, 0), maxIndex);
      
      // Insert the URL at the specified index
      sortedOrder.splice(targetIndex, 0, normalizedUrl);
      
      // Save the updated sortedOrder
      chrome.storage.local.set({ sortedOrder }, () => {
        console.log(`Moved ${normalizedUrl} to index ${targetIndex} in sortedOrder`);
      });
    }
  });
}

async function extractChapters(description, duration) {
  // let description = await extractChaptersfromgemini(description1, duration)
  // console.log(description)
  // if (description === "error"){
  //   description = description1;
  // }
  if (!description || typeof description !== 'string' || !duration || typeof duration !== 'number') return [];

  const durationRe = '((?:\\d+:)?\\d{1,2}:\\d{2}(?::\\d{2})?|\\d+\\s*hours)';
  const sepRe = `^\\s*(?:\\d+#\\s*)?(?:[^\\d\\n]*?)\\s*(?:\\()?${durationRe}\\)?\\s*[\\s:-]+\\s*(.+?)(?:\\s*$|\\s*\\n)`;

  const chapterMap = new Map();
  const matches = description.match(new RegExp(sepRe, 'gm')) || [];

  for (const match of matches) {
    const subMatch = match.match(new RegExp(sepRe));
    if (subMatch) {
      const timeStr = subMatch[1].replace(/^\(|\)$/g, '');
      const title = subMatch[2].trim().replace(/\\/g, ' ');
      const startTime = await parseDuration(timeStr);
      if (startTime !== null && startTime >= 0 && startTime <= duration) {
        if (chapterMap.has(startTime)) {
          const existing = chapterMap.get(startTime);
          if (!existing.titles.includes(title)) {
            existing.titles.push(title);
          }
        } else {
          chapterMap.set(startTime, { start_time: startTime, titles: [title] });
        }
      }
    }
  }

  const chapters = Array.from(chapterMap.values()).map((ch) => ({
    title: ch.titles.join(', '),
    start_time: ch.start_time,
  }));

  chapters.sort((a, b) => a.start_time - b.start_time);

  if (chapters.length > 0 && (chapters[0].start_time > 1)) {
    chapters.unshift({
      title: 'Intro',
      start_time: 0
    });
  }

  
  return chapters;
}

function arraysAreEqual(a1, a2) {
  if (a1.length !== a2.length) return false;
  return a1.every((item, i) =>
    item.title === a2[i].title &&
    item.start_time === a2[i].start_time
  );
}

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
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs.find((t) => t.active);

  if (currentTab === 'saved') {
    chrome.storage.local.get(['sortedOrder'], (result) => {
      let videos = window.savedVideos || [];
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

      const sortedVideos = videos.slice().sort((a, b) => {
        const indexA = previewSortedOrder.indexOf(normalizeYouTubeUrl(a.url));
        const indexB = previewSortedOrder.indexOf(normalizeYouTubeUrl(b.url));
        return indexA - indexB;
      });
      videos=sortedVideos



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
   });
  } 
  else if (activeTab.url.includes('youtube.com/watch')) {
    const chapters = currentTab === 'keymoments' ? window.keyMoments || [] : window[`${currentTab}Chapters`] || [];
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
});
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
        chrome.storage.local.get(['sortedOrder'], (result) => {
          let videos = window.savedVideos || [];
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

          const sortedVideos = videos.slice().sort((a, b) => {
            const indexA = previewSortedOrder.indexOf(normalizeYouTubeUrl(a.url));
            const indexB = previewSortedOrder.indexOf(normalizeYouTubeUrl(b.url));
            return indexA - indexB;
          });
          videos=sortedVideos
          const titleEls = content.querySelectorAll('.video-title');
          titleEls.forEach((el, index) => {
            el.innerHTML = (videos[index]?.title || el.textContent).replace(/<span class="search-highlight">|<\/span>/g, '');
          });
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

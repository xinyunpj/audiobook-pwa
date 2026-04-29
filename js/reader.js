/* ============================
   Reader Module
   Reading interface + TTS integration
   ============================ */

const Reader = (() => {
  let currentBook = null;
  let sentences = [];
  let paragraphSentences = []; // maps sentence index to paragraph index
  let paragraphElements = [];
  let speed = 1;
  let voiceURI = '';
  let isDarkMode = false;
  let fontSize = 'medium';

  // DOM refs
  const readerPage = document.getElementById('reader-page');
  const readerTitle = document.getElementById('reader-title');
  const readerBack = document.getElementById('reader-back');
  const readerBody = document.getElementById('reader-body');
  const readerProgress = document.getElementById('reader-progress');
  const playBtn = document.getElementById('play-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const stopBtn = document.getElementById('stop-btn');
  const speedSlider = document.getElementById('speed-slider');
  const speedDisplay = document.getElementById('speed-display');
  const voiceSelectBtn = document.getElementById('voice-select-btn');
  const voiceModal = document.getElementById('voice-modal');
  const voiceList = document.getElementById('voice-list');
  const modalOverlay = document.getElementById('modal-overlay');
  const ttsProgressFill = document.getElementById('tts-progress-fill');
  const fontToggle = document.getElementById('font-toggle');
  const themeToggle = document.getElementById('theme-toggle');

  function init() {
    // Restore preferences
    speed = Storage.getSpeed();
    voiceURI = Storage.getVoiceURI();
    isDarkMode = Storage.getTheme() === 'dark';
    fontSize = Storage.getFontSize();

    applyTheme();
    applyFontSize();
    updateSpeedUI();

    // Events
    readerBack.addEventListener('click', goBack);
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', seekBack);
    nextBtn.addEventListener('click', seekForward);
    stopBtn.addEventListener('click', stopPlayback);
    speedSlider.addEventListener('input', onSpeedChange);
    voiceSelectBtn.addEventListener('click', showVoicePicker);
    modalOverlay.addEventListener('click', closeVoicePicker);
    fontToggle.addEventListener('click', cycleFontSize);
    themeToggle.addEventListener('click', toggleTheme);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!readerPage.classList.contains('active')) return;
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'ArrowLeft') seekBack();
      if (e.key === 'ArrowRight') seekForward();
    });

    // Prevent screen sleep during playback by playing a silent audio
    setupWakeLock();
  }

  async function open(bookId) {
    const book = await Storage.getBook(bookId);
    if (!book) {
      alert('找不到这本书');
      return;
    }
    currentBook = book;

    readerTitle.textContent = book.title;
    renderContent(book.content);

    // Restore position
    const lastPos = book.lastPosition || 0;
    if (lastPos > 0 && lastPos < sentences.length) {
      TTS.setCurrentIndex(lastPos);
      setTimeout(() => {
        const sentenceIdx = lastPos;
        const paraIdx = paragraphSentences[sentenceIdx] || 0;
        const para = paragraphElements[paraIdx];
        if (para) {
          para.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightSentence(sentenceIdx);
        }
      }, 100);
    }

    updateProgressDisplay();
    showPage();
  }

  function showPage() {
    readerPage.classList.add('active');
  }

  function goBack() {
    stopPlayback();
    readerPage.classList.remove('active');
    const app = window.App;
    if (app) app.showBookshelf();
  }

  function renderContent(text) {
    // Split into paragraphs
    const paragraphs = text.split(/\n\s*\n/);
    readerBody.innerHTML = '';

    sentences = [];
    paragraphSentences = [];
    paragraphElements = [];
    let sentenceIdx = 0;

    paragraphs.forEach((paraText) => {
      const trimmed = paraText.trim();
      if (!trimmed) return;

      const p = document.createElement('p');
      p.textContent = trimmed;
      readerBody.appendChild(p);
      paragraphElements.push(p);

      // Split paragraph into sentences
      // Handle Chinese, English, and mixed punctuation
      const rawSentences = splitSentences(trimmed);
      const startIdx = sentenceIdx;
      rawSentences.forEach(s => {
        if (s.trim()) {
          sentences.push(s.trim());
          paragraphSentences.push(paragraphElements.length - 1);
          sentenceIdx++;
        }
      });

      // If no sentences found, use the whole paragraph
      if (sentenceIdx === startIdx && trimmed) {
        sentences.push(trimmed);
        paragraphSentences.push(paragraphElements.length - 1);
        sentenceIdx++;
      }
    });

    // Setup TTS
    TTS.setSentences(
      sentences,
      onSentenceChange,
      onTTSProgress,
      onTTSEnd,
      onTTSError
    );
  }

  function splitSentences(text) {
    // Split by sentence-ending punctuation (Chinese + English)
    const parts = text.match(/[^。！？\.\!\?\n]+[。！？\.\!\?\n]?/g);
    return parts || [text];
  }

  function onSentenceChange(index) {
    highlightSentence(index);
    const paraIdx = paragraphSentences[index];
    if (paraIdx !== undefined) {
      const el = paragraphElements[paraIdx];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function highlightSentence(index) {
    // Clear all highlights
    readerBody.querySelectorAll('.current-sentence').forEach(el => {
      el.classList.remove('current-sentence');
    });

    const paraIdx = paragraphSentences[index];
    if (paraIdx !== undefined) {
      const el = paragraphElements[paraIdx];
      if (el) el.classList.add('current-sentence');
    }
  }

  function onTTSProgress(current, total) {
    const progress = total > 0 ? (current / total) * 100 : 0;
    ttsProgressFill.style.width = progress + '%';

    // Save progress periodically
    if (currentBook) {
      const pct = total > 0 ? Math.min(1, current / total) : 0;
      Storage.updateProgress(currentBook.id, current, pct);
      updateProgressDisplay();
    }
  }

  function onTTSEnd() {
    playBtn.textContent = '▶';
    if (currentBook) {
      Storage.updateProgress(currentBook.id, 0, 1);
      updateProgressDisplay();
    }
  }

  function onTTSError(err) {
    console.warn('TTS error:', err);
  }

  function togglePlay() {
    if (TTS.isActive() && !TTS.isPausedState()) {
      TTS.pause();
      playBtn.textContent = '▶';
    } else if (TTS.isActive() && TTS.isPausedState()) {
      TTS.resume();
      playBtn.textContent = '⏸';
    } else {
      // Start from current position
      const idx = TTS.getCurrentIndex();
      // iOS Safari: ensure voices are loaded before speaking
      if (typeof speechSynthesis !== 'undefined') {
        // Pre-warm: some iOS versions need a silent utterance first
        try {
          const warmup = new SpeechSynthesisUtterance(' ');
          warmup.volume = 0;
          speechSynthesis.speak(warmup);
        } catch(e) {}
      }
      TTS.speakFrom(idx, speed, voiceURI, () => {});
      playBtn.textContent = '⏸';
    }
  }

  function seekBack() {
    const currentIdx = TTS.getCurrentIndex();
    const newIdx = Math.max(0, currentIdx - 5); // ~5 sentences back ≈ 15s
    if (TTS.isActive()) {
      TTS.stop();
      TTS.speakFrom(newIdx, speed, voiceURI, () => {});
      playBtn.textContent = '⏸';
    } else {
      TTS.setCurrentIndex(newIdx);
      highlightSentence(newIdx);
    }
  }

  function seekForward() {
    const currentIdx = TTS.getCurrentIndex();
    const newIdx = Math.min(sentences.length - 1, currentIdx + 5);
    if (TTS.isActive()) {
      TTS.stop();
      TTS.speakFrom(newIdx, speed, voiceURI, () => {});
      playBtn.textContent = '⏸';
    } else {
      TTS.setCurrentIndex(newIdx);
      highlightSentence(newIdx);
    }
  }

  function stopPlayback() {
    TTS.stop();
    playBtn.textContent = '▶';
    ttsProgressFill.style.width = '0%';
  }

  function onSpeedChange() {
    speed = parseFloat(speedSlider.value);
    Storage.setSpeed(speed);
    updateSpeedUI();
  }

  function updateSpeedUI() {
    speedSlider.value = speed;
    speedDisplay.textContent = speed.toFixed(1) + 'x';
  }

  function updateProgressDisplay() {
    if (!currentBook) return;
    const pct = currentBook.progress ? Math.round(currentBook.progress * 100) : 0;
    readerProgress.textContent = pct + '%';
  }

  // Voice picker
  async function showVoicePicker() {
    const voices = await TTS.getVoices();
    voiceList.innerHTML = voices.map(v => {
      const selected = v.voiceURI === voiceURI;
      return `
        <div class="voice-option ${selected ? 'selected' : ''}" data-uri="${v.voiceURI}">
          <div class="check"></div>
          <span class="voice-name">${v.name}</span>
          <span class="voice-lang">${v.lang || ''}</span>
        </div>
      `;
    }).join('') || '<div style="padding:20px;text-align:center;color:var(--text-secondary)">暂无可用语音</div>';

    voiceModal.classList.add('active');
    modalOverlay.classList.add('active');

    // Add click events
    voiceList.querySelectorAll('.voice-option').forEach(el => {
      el.addEventListener('click', () => {
        voiceURI = el.dataset.uri;
        Storage.setVoiceURI(voiceURI);
        voiceList.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        // Don't close immediately, let user see selection
        setTimeout(closeVoicePicker, 300);
      });
    });
  }

  function closeVoicePicker() {
    voiceModal.classList.remove('active');
    modalOverlay.classList.remove('active');
  }

  // Font size cycling
  function cycleFontSize() {
    const sizes = ['small', 'medium', 'large', 'xlarge'];
    const idx = sizes.indexOf(fontSize);
    fontSize = sizes[(idx + 1) % sizes.length];
    Storage.setFontSize(fontSize);
    applyFontSize();
    updateFontToggleLabel();
  }

  function applyFontSize() {
    document.documentElement.setAttribute('data-font-size', fontSize);
    updateFontToggleLabel();
  }

  function updateFontToggleLabel() {
    const labels = { small: 'A', medium: 'A', large: 'A+', xlarge: 'A++' };
    fontToggle.textContent = labels[fontSize] || 'A';
    fontToggle.style.fontSize = fontSize === 'xlarge' ? '20px' : fontSize === 'large' ? '18px' : '16px';
  }

  // Theme toggle
  function toggleTheme() {
    isDarkMode = !isDarkMode;
    Storage.setTheme(isDarkMode ? 'dark' : 'light');
    applyTheme();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
  }

  // Wake lock to prevent screen sleep during playback
  let wakeLock = null;
  async function setupWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch {
        // Wake lock not available in this context
      }
    }
  }

  // Re-acquire wake lock when tab becomes visible
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && TTS.isActive() && 'wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    }
  });

  return { init, open };
})();

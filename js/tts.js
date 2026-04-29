/* ============================
   TTS Module
   Web Speech API SpeechSynthesis
   ============================ */

const TTS = (() => {
  let utterance = null;
  let isPlaying = false;
  let isPaused = false;
  let currentSentenceIndex = 0;
  let sentences = [];
  let onSentenceChange = null;
  let onProgress = null;
  let onEnd = null;
  let onError = null;
  let voicesList = [];

  // Get available voices
  function getVoices() {
    return new Promise((resolve) => {
      if (voicesList.length > 0) {
        resolve(voicesList);
        return;
      }
      const check = () => {
        voicesList = window.speechSynthesis.getVoices();
        if (voicesList.length > 0) {
          resolve(voicesList);
        } else {
          setTimeout(check, 100);
        }
      };
      window.speechSynthesis.onvoiceschanged = check;
      check();
    });
  }

  // Set the sentence list
  function setSentences(list, onSentenceChangeCb, onProgressCb, onEndCb, onErrorCb) {
    sentences = list;
    onSentenceChange = onSentenceChangeCb;
    onProgress = onProgressCb;
    onEnd = onEndCb;
    onError = onErrorCb;
  }

  function getCurrentIndex() {
    return currentSentenceIndex;
  }

  function setCurrentIndex(idx) {
    currentSentenceIndex = Math.max(0, Math.min(idx, sentences.length - 1));
  }

  // Speak from a given index
  function speakFrom(index, speed, voiceURI, onDone) {
    if (!sentences.length) return;
    currentSentenceIndex = Math.max(0, Math.min(index, sentences.length - 1));
    isPlaying = true;
    isPaused = false;
    speakCurrent(speed, voiceURI, onDone);
  }

  let retryCount = 0;
  const MAX_RETRIES = 3;

  // Get latest speed from localStorage for real-time speed changes
  function getLatestSpeed(defaultSpeed) {
    try {
      const stored = localStorage.getItem('audiobook_speed');
      if (stored !== null) {
        return parseFloat(stored) || defaultSpeed;
      }
    } catch(e) {}
    return defaultSpeed;
  }

  function speakCurrent(speed, voiceURI, onDone) {
    if (currentSentenceIndex >= sentences.length) {
      isPlaying = false;
      isPaused = false;
      if (onEnd) onEnd();
      if (onDone) onDone();
      return;
    }

    const text = sentences[currentSentenceIndex];
    if (!text || !text.trim()) {
      currentSentenceIndex++;
      speakCurrent(speed, voiceURI, onDone);
      return;
    }

    // iOS Safari workaround
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    // Always read latest speed from storage (user may have changed it)
    const effectiveSpeed = getLatestSpeed(speed);

    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = effectiveSpeed;
    utterance.volume = 1;

    // Try to set voice (user-selected first)
    if (voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;
    }

    // Auto-pick best Chinese voice
    if (!utterance.voice) {
      const voices = window.speechSynthesis.getVoices();
      let bestVoice = voices.find(v => v.voiceURI && v.voiceURI.includes('Tingting'));
      if (!bestVoice) bestVoice = voices.find(v => v.lang === 'zh-CN');
      if (!bestVoice) bestVoice = voices.find(v => v.lang && v.lang.startsWith('zh'));
      if (bestVoice) utterance.voice = bestVoice;
    }

    // Slight pitch for naturalness
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      retryCount = 0;
      if (onSentenceChange) onSentenceChange(currentSentenceIndex);
    };

    utterance.onend = () => {
      if (onProgress) onProgress(currentSentenceIndex + 1, sentences.length);
      currentSentenceIndex++;
      // Longer pause between sentences for natural reading flow
      // Slower speed = longer pause
      const currentSpeed = getLatestSpeed(speed);
      const pauseMs = Math.max(80, Math.round(200 / currentSpeed));
      setTimeout(() => {
        speakCurrent(speed, voiceURI, onDone);
      }, pauseMs);
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('TTS error:', e.error);
        if (onError) onError(e.error);
      }
      // Retry current sentence if still playing
      if (isPlaying && retryCount < MAX_RETRIES) {
        retryCount++;
        setTimeout(() => {
          speakCurrent(speed, voiceURI, onDone);
        }, 200);
      } else {
        retryCount = 0;
        currentSentenceIndex++;
        setTimeout(() => {
          speakCurrent(speed, voiceURI, onDone);
        }, 100);
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  function pause() {
    if (window.speechSynthesis.speaking && !isPaused) {
      window.speechSynthesis.pause();
      isPaused = true;
    }
  }

  function resume() {
    if (isPaused) {
      window.speechSynthesis.resume();
      isPaused = false;
    }
  }

  function stop() {
    window.speechSynthesis.cancel();
    isPlaying = false;
    isPaused = false;
    utterance = null;
  }

  function seek(delta, speed, voiceURI) {
    const newIndex = Math.max(0, Math.min(currentSentenceIndex + delta, sentences.length - 1));
    stop();
    currentSentenceIndex = newIndex;
    speakCurrent(speed, voiceURI, () => {});
  }

  function isActive() {
    return isPlaying;
  }

  function isPausedState() {
    return isPaused;
  }

  return {
    getVoices,
    setSentences,
    getCurrentIndex,
    setCurrentIndex,
    speakFrom,
    pause,
    resume,
    stop,
    seek,
    isActive,
    isPausedState
  };
})();

window.TTS = TTS;

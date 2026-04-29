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

    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.volume = 1;

    // Try to set voice
    if (voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;
    }

    // For Chinese content, auto-pick a Chinese voice if none selected
    if (!utterance.voice) {
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang && v.lang.startsWith('zh'));
      if (zhVoice) utterance.voice = zhVoice;
    }

    utterance.onstart = () => {
      if (onSentenceChange) onSentenceChange(currentSentenceIndex);
    };

    utterance.onend = () => {
      if (onProgress) onProgress(currentSentenceIndex + 1, sentences.length);
      currentSentenceIndex++;
      // Small delay between sentences for natural flow
      setTimeout(() => {
        speakCurrent(speed, voiceURI, onDone);
      }, 50);
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('TTS error:', e.error);
        if (onError) onError(e.error);
      }
      // Resume from next sentence
      currentSentenceIndex++;
      setTimeout(() => {
        speakCurrent(speed, voiceURI, onDone);
      }, 100);
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

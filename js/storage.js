/* ============================
   Storage Module
   localStorage + IndexedDB hybrid
   ============================ */

const Storage = (() => {
  const DB_NAME = 'AudiobookDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'books';

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('title', 'title', { unique: false });
          store.createIndex('addedAt', 'addedAt', { unique: false });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveBook(book) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(book);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllBooks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getBook(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function deleteBook(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function updateProgress(id, position, progress) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        const book = request.result;
        if (book) {
          book.lastPosition = position;
          book.progress = progress;
          book.lastReadAt = Date.now();
          store.put(book);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // Theme persistent
  function getTheme() {
    return localStorage.getItem('audiobook_theme') || 'light';
  }

  function setTheme(theme) {
    localStorage.setItem('audiobook_theme', theme);
  }

  function getFontSize() {
    return localStorage.getItem('audiobook_fontsize') || 'medium';
  }

  function setFontSize(size) {
    localStorage.setItem('audiobook_fontsize', size);
  }

  function getSpeed() {
    return parseFloat(localStorage.getItem('audiobook_speed') || '1');
  }

  function setSpeed(speed) {
    localStorage.setItem('audiobook_speed', String(speed));
  }

  function getVoiceURI() {
    return localStorage.getItem('audiobook_voice') || '';
  }

  function setVoiceURI(uri) {
    localStorage.setItem('audiobook_voice', uri);
  }

  return {
    saveBook,
    getAllBooks,
    getBook,
    deleteBook,
    updateProgress,
    getTheme, setTheme,
    getFontSize, setFontSize,
    getSpeed, setSpeed,
    getVoiceURI, setVoiceURI
  };
})();

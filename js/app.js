/* ============================
   App Entry Point
   ============================ */

const App = (() => {
  function init() {
    console.log('📚 Audiobook PWA starting...');

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }

    // Init modules
    Bookshelf.init();
    Reader.init();

    // Load books
    Bookshelf.loadBooks();
  }

  function showBookshelf() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('bookshelf-page').classList.add('active');
    Bookshelf.loadBooks();
  }

  function openReader(bookId) {
    console.log('App.openReader called with:', bookId);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    if (typeof Reader.open === 'function') {
      Reader.open(bookId);
    } else {
      console.error('Reader.open is not a function');
    }
  }

  return { init, showBookshelf, openReader };
})();

// Expose to window for other modules
window.App = App;

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}

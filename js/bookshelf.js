/* ============================
   Bookshelf Module
   Book listing, import, delete
   ============================ */

const Bookshelf = (() => {
  let books = [];
  let deleteMode = false;
  let longPressTimer = null;

  const container = document.getElementById('bookshelf-page');
  const bookGrid = document.getElementById('book-grid');
  const emptyState = document.getElementById('empty-state');
  const importBtn = document.getElementById('import-btn');
  const importEmptyBtn = document.getElementById('import-empty-btn');
  const hiddenInput = document.getElementById('file-input');

  function init() {
    importBtn.addEventListener('click', () => hiddenInput.click());
    importEmptyBtn.addEventListener('click', () => hiddenInput.click());
    hiddenInput.addEventListener('change', handleFileImport);
    document.addEventListener('touchmove', clearLongPress, { passive: true });
  }

  async function loadBooks() {
    books = await Storage.getAllBooks();
    books.sort((a, b) => (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt));
    render();
  }

  function render() {
    if (books.length === 0) {
      bookGrid.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';
    bookGrid.innerHTML = books.map(book => createCard(book)).join('');
  }

  function createCard(book) {
    const progress = book.progress || 0;
    const progressText = progress > 0 ? `${Math.round(progress * 100)}%` : '未开始';
    const prog = (Math.round(progress * 10000) / 100).toFixed(1);

    return `
      <div class="book-card" data-id="${book.id}" role="button" tabindex="0">
        <button class="delete-btn" data-id="${book.id}">✕</button>
        <div class="book-cover">📖</div>
        <div class="book-title">${escapeHtml(book.title)}</div>
        <div class="book-progress">${progressText}</div>
        <div class="book-progress-bar">
          <div class="book-progress-fill" style="width:${prog}%"></div>
        </div>
      </div>
    `;
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function handleCardClick(e) {
    const card = e.target.closest('.book-card');
    if (!card) return;

    const id = card.dataset.id;

    if (deleteMode) {
      // Confirm delete
      if (confirm('确定删除这本书吗？')) {
        deleteBookById(id);
      }
      return;
    }

    // Open reader
    const app = window.App;
    if (app) app.openReader(id);
  }

  function handleCardLongPress(e) {
    const card = e.target.closest('.book-card');
    if (!card) return;
    e.preventDefault();

    deleteMode = true;
    document.querySelectorAll('.book-card').forEach(c => c.classList.add('show-delete'));
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // Click handlers via delegation
  document.addEventListener('click', (e) => {
    if (e.target.closest('.book-card')) {
      handleCardClick(e);
    }
    if (e.target.closest('.delete-btn')) {
      const id = e.target.closest('.delete-btn').dataset.id;
      if (confirm('确定删除这本书吗？')) {
        deleteBookById(id);
      }
    }
  });

  // Long press via pointer events
  let pressStart = null;
  document.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.book-card');
    if (!card) return;
    pressStart = { x: e.clientX, y: e.clientY, card, time: Date.now() };
    longPressTimer = setTimeout(() => {
      if (pressStart) {
        deleteMode = true;
        document.querySelectorAll('.book-card').forEach(c => c.classList.add('show-delete'));
      }
    }, 500);
  });

  document.addEventListener('pointermove', (e) => {
    if (pressStart) {
      const dx = e.clientX - pressStart.x;
      const dy = e.clientY - pressStart.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearLongPress();
        pressStart = null;
      }
    }
  });

  document.addEventListener('pointerup', () => {
    clearLongPress();
    pressStart = null;
  });

  document.addEventListener('pointercancel', () => {
    clearLongPress();
    pressStart = null;
  });

  // Tap on empty area to exit delete mode
  document.addEventListener('click', (e) => {
    if (deleteMode && !e.target.closest('.book-card') && !e.target.closest('.delete-btn') && !e.target.closest('.header-btn')) {
      deleteMode = false;
      document.querySelectorAll('.book-card').forEach(c => c.classList.remove('show-delete'));
    }
  });

  async function handleFileImport(e) {
    const files = e.target.files;
    if (!files.length) return;

    for (const file of files) {
      try {
        await importBook(file);
      } catch (err) {
        console.error('Import failed:', err);
        alert(`导入失败: ${file.name}\n${err.message}`);
      }
    }
    e.target.value = '';
    await loadBooks();
  }

  async function importBook(file) {
    const name = file.name.toLowerCase();
    let title = file.name.replace(/\.[^.]+$/, '');
    let content = '';

    if (name.endsWith('.txt')) {
      content = await readFileAsText(file);
    } else if (name.endsWith('.epub')) {
      // Need to load JSZip first
      await loadJSZip();
      const result = await EpubParser.parse(file);
      title = result.title;
      content = result.content;
    } else {
      throw new Error('不支持的文件格式，请选择 .txt 或 .epub 文件');
    }

    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空');
    }

    const id = 'book_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const book = {
      id,
      title: title.trim() || '未知标题',
      content: content.trim(),
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      lastPosition: 0,
      progress: 0
    };

    await Storage.saveBook(book);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file, 'utf-8');
    });
  }

  async function loadJSZip() {
    if (window.JSZip) return;
    // Dynamic import JSZip CDN
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('无法加载JSZip库'));
      document.head.appendChild(script);
    });
  }

  async function deleteBookById(id) {
    await Storage.deleteBook(id);
    deleteMode = false;
    document.querySelectorAll('.book-card').forEach(c => c.classList.remove('show-delete'));
    await loadBooks();
  }

  return { init, loadBooks };
})();

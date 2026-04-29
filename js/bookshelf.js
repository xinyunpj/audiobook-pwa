/* ============================
   Bookshelf Module
   Book listing, import, delete
   ============================ */

const Bookshelf = (() => {
  let books = [];
  let deleteMode = false;

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
    e.preventDefault();
    
    const id = card.dataset.id;
    if (!id) return;

    if (deleteMode) {
      if (confirm('确定删除这本书吗？')) {
        deleteBookById(id);
      }
      return;
    }

    // Open reader
    const app = window.App;
    if (app) {
      app.openReader(id);
    }
  }

  function handleDeleteClick(e) {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    if (id && confirm('确定删除这本书吗？')) {
      deleteBookById(id);
    }
  }

  // Simple click delegation - works on all platforms
  document.addEventListener('click', function(e) {
    if (e.target.closest('.book-card')) {
      handleCardClick(e);
    }
    if (e.target.closest('.delete-btn')) {
      handleDeleteClick(e);
    }
    // Exit delete mode on background click
    if (deleteMode && !e.target.closest('.book-card') && !e.target.closest('.header-btn')) {
      deleteMode = false;
      document.querySelectorAll('.book-card').forEach(c => c.classList.remove('show-delete'));
    }
  });

  // Long press for delete mode (mobile)
  let longPressTimer = null;
  document.addEventListener('touchstart', function(e) {
    const card = e.target.closest('.book-card');
    if (!card || deleteMode) return;
    longPressTimer = setTimeout(() => {
      deleteMode = true;
      document.querySelectorAll('.book-card').forEach(c => c.classList.add('show-delete'));
    }, 500);
  }, { passive: true });
  
  document.addEventListener('touchend', function() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });
  
  document.addEventListener('touchmove', function() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });

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

window.Bookshelf = Bookshelf;

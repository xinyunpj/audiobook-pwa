/* ============================
   EPUB Parser Module
   Parses .epub files to extract text content
   ============================ */

const EpubParser = (() => {
  /**
   * Parse an epub file blob and return { title, content }
   * content is an array of paragraph strings
   */
  async function parse(blob) {
    const zipData = await blob.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(zipData);

    // Parse container.xml to find OPF
    const containerXml = await readXmlEntry(zip, 'META-INF/container.xml');
    if (!containerXml) throw new Error('Invalid EPUB: no container.xml');

    const rootfileEl = containerXml.querySelector('rootfile');
    if (!rootfileEl) throw new Error('Invalid EPUB: no rootfile in container');
    const opfPath = rootfileEl.getAttribute('full-path');

    // Parse OPF
    const opfXml = await readXmlEntry(zip, opfPath);
    if (!opfXml) throw new Error('Invalid EPUB: no OPF file');

    // Get title
    const title = getTitleFromOpf(opfXml);

    // Get spine item references
    const spine = opfXml.querySelectorAll('spine itemref');
    const manifest = opfXml.querySelectorAll('manifest item');

    // Build href map
    const hrefMap = {};
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1) || '';
    manifest.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) hrefMap[id] = opfDir + href;
    });

    // Get content order from spine
    const contentPages = [];
    spine.forEach(ref => {
      const idref = ref.getAttribute('idref');
      if (idref && hrefMap[idref]) contentPages.push(hrefMap[idref]);
    });

    // Extract text from each content page
    const paragraphs = [];
    for (const pagePath of contentPages) {
      const text = await extractTextFromXhtml(zip, pagePath);
      if (text) paragraphs.push(text);
    }

    return {
      title: title || '未知标题',
      content: paragraphs.join('\n\n')
    };
  }

  async function readXmlEntry(zip, path) {
    try {
      const file = zip.file(path);
      if (!file) return null;
      const content = await file.async('string');
      const parser = new DOMParser();
      return parser.parseFromString(content, 'text/xml');
    } catch {
      return null;
    }
  }

  function getTitleFromOpf(opfXml) {
    const meta = opfXml.querySelector('metadata');
    if (!meta) return null;
    const titleEl = meta.querySelector('title') || meta.querySelector('dc\\:title');
    return titleEl ? titleEl.textContent.trim() : null;
  }

  async function extractTextFromXhtml(zip, path) {
    try {
      const file = zip.file(decodeURIComponent(path));
      if (!file) return '';
      const content = await file.async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');

      // Remove script and style
      doc.querySelectorAll('script, style').forEach(el => el.remove());

      // Extract text from body
      const body = doc.body || doc.documentElement;
      const textNodes = [];
      walkTextNodes(body, textNodes);

      return textNodes.join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  function walkTextNodes(node, result) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) result.push(text);
    }
    const skipTags = new Set(['script', 'style', 'nav', 'svg']);
    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && skipTags.has(child.tagName.toLowerCase())) continue;
      walkTextNodes(child, result);
    }
  }

  return { parse };
})();

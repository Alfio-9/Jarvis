/**
 * Holographic Markdown Viewer Component
 * High-performance Markdown parser with KaTeX LaTeX math support and Mermaid diagrams.
 */

import { playSciFiChirp } from './audio-synth.js';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    darkMode: true,
    background: 'rgba(10, 15, 29, 0.9)',
    primaryColor: '#00f3ff',
    primaryBorderColor: '#00f3ff',
    primaryTextColor: '#e2e8f0',
    lineColor: '#00f3ff',
    secondaryColor: '#ff0077',
    tertiaryColor: '#1e293b'
  }
});

// Configure marked with GitHub Flavored Markdown
marked.setOptions({
  gfm: true,
  breaks: false
});

const calloutIcons = {
  note: 'ℹ️',
  info: 'ℹ️',
  abstract: '📑',
  summary: '📑',
  tldr: '📑',
  tip: '💡',
  hint: '💡',
  important: '⚡',
  warning: '⚠️',
  caution: '⚠️',
  danger: '🛑',
  bug: '🐛',
  example: '🔍',
  quote: '💬'
};

export function parseMarkdownToHTML(markdown) {
  if (!markdown) return '<p class="md-empty">Documento vuoto.</p>';

  // 1. Shield code blocks and inline code from math and callout regexes
  const codeShields = [];
  let text = markdown.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    const placeholder = `%%CODE_SHIELD_${codeShields.length}%%`;
    codeShields.push(match);
    return placeholder;
  });

  // 2. Extract Display Math: $$ ... $$ or \[ ... \]
  const displayMath = [];
  text = text.replace(/(?:\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\])/g, (match, tex1, tex2) => {
    const tex = (tex1 || tex2 || '').trim();
    const placeholder = `%%KATEX_DISP_${displayMath.length}%%`;
    displayMath.push(tex);
    return `\n\n${placeholder}\n\n`;
  });

  // 3. Extract Inline Math: $ ... $ or \( ... \)
  const inlineMath = [];
  text = text.replace(/(?:(?<!\\)\$([^\$\n]+?)\$|\\\(([\s\S]*?)\\\))/g, (match, tex1, tex2) => {
    const tex = (tex1 || tex2 || '').trim();
    const placeholder = `%%KATEX_INL_${inlineMath.length}%%`;
    inlineMath.push(tex);
    return placeholder;
  });

  // 4. Restore shielded code blocks & inline code
  text = text.replace(/%%CODE_SHIELD_(\d+)%%/g, (match, idx) => {
    return codeShields[Number(idx)] || match;
  });

  // 5. Parse core Markdown via marked
  let html = marked.parse(text);

  // 6. Post-process Obsidian/GitHub style Callouts: > [!type] Title
  html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (match, inner) => {
    const calloutRegex = /<p>\[!([a-zA-Z]+)\]\s*(.*?)(?:<br\s*\/?>|\n)?([\s\S]*?)<\/p>/i;
    const calloutMatch = inner.match(calloutRegex);
    if (!calloutMatch) return match;

    const rawType = calloutMatch[1].toLowerCase();
    const type = calloutIcons[rawType] ? rawType : 'note';
    const icon = calloutIcons[type] || '💡';
    const title = (calloutMatch[2] || type.toUpperCase()).trim();
    const restOfFirstP = calloutMatch[3] ? `<p>${calloutMatch[3]}</p>` : '';
    const remainingInner = inner.replace(calloutRegex, restOfFirstP).trim();

    return `<div class="md-callout md-callout-${type}">
      <div class="md-callout-header">
        <span class="md-callout-icon">${icon}</span>
        <span class="md-callout-title">${title}</span>
      </div>
      <div class="md-callout-body">${remainingInner}</div>
    </div>`;
  });

  // 7. Inject Rendered KaTeX Display Math
  displayMath.forEach((tex, i) => {
    const placeholder = `%%KATEX_DISP_${i}%%`;
    let rendered;
    try {
      rendered = katex.renderToString(tex, {
        displayMode: true,
        throwOnError: false,
        strict: false
      });
    } catch (e) {
      rendered = `<pre class="katex-error"><code>${tex}</code></pre>`;
    }
    const block = `<div class="katex-display-wrapper">${rendered}</div>`;
    html = html.replace(new RegExp(`<p>\\s*${placeholder}\\s*<\\/p>|${placeholder}`, 'g'), block);
  });

  // 8. Inject Rendered KaTeX Inline Math
  inlineMath.forEach((tex, i) => {
    const placeholder = `%%KATEX_INL_${i}%%`;
    let rendered;
    try {
      rendered = katex.renderToString(tex, {
        displayMode: false,
        throwOnError: false,
        strict: false
      });
    } catch (e) {
      rendered = `<code>${tex}</code>`;
    }
    html = html.replace(new RegExp(placeholder, 'g'), rendered);
  });

  return html;
}

export class MarkdownViewer {
  constructor() {
    this.modalElem = null;
    this.titleElem = null;
    this.pathElem = null;
    this.bodyElem = null;
    this.metaElem = null;
    this.isOpen = false;
  }

  init() {
    this.modalElem = document.getElementById('markdown-modal');
    this.titleElem = document.getElementById('md-modal-title');
    this.pathElem = document.getElementById('md-modal-path');
    this.bodyElem = document.getElementById('md-modal-body');
    this.metaElem = document.getElementById('md-modal-meta');

    const closeBtn = document.getElementById('md-modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.close();
      });
    }

    if (this.modalElem) {
      this.modalElem.addEventListener('click', (e) => {
        if (e.target === this.modalElem) {
          this.close();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.isOpen && (e.key === 'Escape' || e.key === 'Esc')) {
        this.close();
      }
    });
  }

  async open(filePath) {
    if (!filePath || !window.jarvisAPI || !window.jarvisAPI.readFileContent) return;

    playSciFiChirp(700, 1500, 0.18);
    const statusElem = document.getElementById('status-indicator');
    if (statusElem) statusElem.textContent = 'DECRYPTING MARKDOWN // PARSING FORMULAS';

    try {
      const res = await window.jarvisAPI.readFileContent(filePath);
      if (!res || !res.success) {
        if (statusElem) statusElem.textContent = 'ERROR READING FILE';
        return;
      }

      if (this.titleElem) this.titleElem.textContent = res.fileName || 'DOCUMENT';
      if (this.pathElem) this.pathElem.textContent = res.filePath || filePath;

      const html = parseMarkdownToHTML(res.content);
      if (this.bodyElem) {
        this.bodyElem.innerHTML = html;
        this.bodyElem.scrollTop = 0;

        // Render any Mermaid diagrams asynchronously
        const mermaidNodes = this.bodyElem.querySelectorAll('code.language-mermaid');
        if (mermaidNodes && mermaidNodes.length > 0) {
          for (let i = 0; i < mermaidNodes.length; i++) {
            const codeElem = mermaidNodes[i];
            const preElem = codeElem.closest('pre');
            const code = codeElem.textContent;
            const uniqueId = `mermaid-chart-${Date.now()}-${i}`;
            try {
              const { svg } = await mermaid.render(uniqueId, code);
              const card = document.createElement('div');
              card.className = 'mermaid-diagram-card';
              card.innerHTML = svg;
              if (preElem) {
                preElem.replaceWith(card);
              }
            } catch (err) {
              console.warn('[Jarvis] Mermaid render error:', err);
            }
          }
        }
      }

      const words = res.content.trim().split(/\s+/).filter(Boolean).length;
      const lines = res.content.split('\n').length;
      if (this.metaElem) {
        this.metaElem.textContent = `LINES: ${lines} // WORDS: ${words} // LATEX: ACTIVE // UTF-8`;
      }

      if (this.modalElem) {
        this.modalElem.style.display = 'flex';
      }
      this.isOpen = true;

      if (statusElem) {
        statusElem.textContent = `HOLOGRAPHIC VIEWER // ${res.fileName.toUpperCase()}`;
      }
    } catch (err) {
      console.error('[Jarvis] Failed to open markdown viewer:', err);
      if (statusElem) statusElem.textContent = 'MARKDOWN VIEWER FAILED';
    }
  }

  scrollBy(amount) {
    if (!this.isOpen || !this.bodyElem) return;
    this.bodyElem.scrollTop += amount;
    this.showScrollIndicator(amount < 0 ? 'up' : 'down');
  }

  showScrollIndicator(dir) {
    let indicator = document.getElementById('md-scroll-indicator');
    if (!indicator && this.modalElem) {
      indicator = document.createElement('div');
      indicator.id = 'md-scroll-indicator';
      indicator.className = 'md-scroll-indicator';
      const card = this.modalElem.querySelector('.md-modal-card');
      if (card) card.appendChild(indicator);
    }
    if (indicator) {
      indicator.innerHTML = dir === 'up'
        ? '<span class="scroll-arrow">▲</span> INDICANDO SU // SCROLL ▲'
        : '<span class="scroll-arrow">▼</span> INDICANDO GIÙ // SCROLL ▼';
      indicator.style.opacity = '1';

      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => {
        if (indicator) indicator.style.opacity = '0';
      }, 350);
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    playSciFiChirp(1100, 500, 0.14);

    if (this.modalElem) {
      this.modalElem.style.display = 'none';
    }

    const statusElem = document.getElementById('status-indicator');
    if (statusElem) {
      statusElem.textContent = 'SYSTEM ONLINE // TRACKING ACTIVE';
    }
  }
}

export const markdownViewer = new MarkdownViewer();

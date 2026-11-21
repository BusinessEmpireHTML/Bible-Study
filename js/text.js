// Text helpers: escaping, cleaning API HTML, Strong's number parsing, lexicon sanitizing.
'use strict';

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A <template> parses HTML without running scripts or loading images.
const scratchTemplate = document.createElement('template');

// HTML fragment -> text. Drops Strong's numbers (<S>), morphology (<m>) and footnotes (<sup>).
// Collapses whitespace but keeps leading/trailing spaces so fragments can be joined.
function fragmentToText(html) {
    scratchTemplate.innerHTML = String(html || '');
    scratchTemplate.content.querySelectorAll('s, m, sup').forEach(el => el.remove());
    return scratchTemplate.content.textContent.replace(/\s+/g, ' ');
}

function toPlainText(html) {
    return fragmentToText(html).trim();
}

const STRONGS_TAG = /<S>\s*([HG]?\d{1,5})\s*<\/S>/gi;

function hasStrongs(html) {
    STRONGS_TAG.lastIndex = 0;
    return STRONGS_TAG.test(String(html || ''));
}

// bolls.life marks words with Strong's numbers like: "In the beginning<S>7225</S> God<S>430</S>".
// Returns [{ text, strongs: ['H7225'] }, ...] where each number belongs to the text before it.
function parseStrongs(html, prefix) {
    const parts = String(html || '').split(/<S>\s*([HG]?\d{1,5})\s*<\/S>/i);
    const tokens = [];
    for (let i = 0; i < parts.length; i += 2) {
        const number = parts[i + 1];
        tokens.push({
            text: fragmentToText(parts[i]),
            strongs: number ? [normalizeStrongs(number, prefix)] : []
        });
    }
    return tokens;
}

function normalizeStrongs(number, prefix) {
    const m = String(number).trim().match(/^([HG]?)0*(\d+)$/i);
    if (!m) return null;
    return (m[1] || prefix).toUpperCase() + m[2];
}

// Render text with clickable Strong's words (and, optionally, e-Sword style superscript numbers).
function renderStrongsHtml(html, prefix, showNumbers) {
    return parseStrongs(html, prefix).map(token => {
        const lead = token.text.match(/^\s*/)[0];
        const body = token.text.slice(lead.length);
        let out = escapeHtml(lead);
        if (token.strongs.length && body.trim()) {
            out += `<span class="strongs-word" data-strongs="${escapeHtml(token.strongs.join(' '))}">${escapeHtml(body)}</span>`;
        } else {
            out += escapeHtml(body);
        }
        if (showNumbers) {
            out += token.strongs.map(n => `<sup class="strongs-num" data-strongs="${escapeHtml(n)}">${escapeHtml(n)}</sup>`).join('');
        }
        return out;
    }).join('');
}

// Lexicon definitions arrive as HTML. Keep only simple formatting tags and no attributes.
const ALLOWED_TAGS = new Set(['B', 'I', 'EM', 'STRONG', 'BR', 'P', 'UL', 'OL', 'LI', 'SPAN', 'DIV',
    'SUP', 'SUB', 'H1', 'H2', 'H3', 'H4', 'H5', 'BLOCKQUOTE', 'SMALL', 'U']);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'NOSCRIPT']);

function sanitizeHtmlToFragment(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    const clean = node => {
        [...node.childNodes].forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) return;
            if (child.nodeType !== Node.ELEMENT_NODE || DROP_WITH_CONTENT.has(child.tagName)) {
                child.remove();
                return;
            }
            clean(child);
            if (!ALLOWED_TAGS.has(child.tagName)) {
                child.replaceWith(...child.childNodes);
                return;
            }
            [...child.attributes].forEach(attr => child.removeAttribute(attr.name));
        });
    };
    clean(tpl.content);
    linkStrongsReferences(tpl.content);
    return tpl.content;
}

// Turn "H7225" / "G3056" mentions inside definitions into clickable cross-references.
function linkStrongsReferences(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const pattern = /\b([HG])0*(\d{1,5})\b/g;
    nodes.forEach(node => {
        const text = node.nodeValue;
        pattern.lastIndex = 0;
        if (!pattern.test(text)) return;
        pattern.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = pattern.exec(text))) {
            frag.append(text.slice(last, m.index));
            const span = document.createElement('span');
            span.className = 'strongs-ref';
            span.dataset.strongs = m[1] + m[2];
            span.textContent = m[0];
            frag.append(span);
            last = m.index + m[0].length;
        }
        frag.append(text.slice(last));
        node.replaceWith(frag);
    });
}

// Escape text, then wrap search terms in <mark>.
function highlightTerms(text, query) {
    let html = escapeHtml(text);
    const terms = String(query || '').split(/\s+/).filter(t => t.length > 1).map(escapeHtml);
    if (!terms.length) return html;
    const pattern = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    // Only replace outside of entities like &amp;
    return html.split(/(&[a-z#0-9]+;)/i).map(part => part.startsWith('&') && part.endsWith(';') ? part : part.replace(pattern, '<mark>$1</mark>')).join('');
}

function extractTags(note) {
    const tags = String(note || '').match(/#[\p{L}\p{N}_-]+/gu) || [];
    return [...new Set(tags.map(t => t.toLowerCase()))];
}

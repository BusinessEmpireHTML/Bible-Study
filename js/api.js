// Calls to the Netlify function that proxies bolls.life.
'use strict';

const API_URL = '/.netlify/functions/bible-proxy';
const apiCache = new Map();

async function apiGet(params, { cache = true } = {}) {
    const query = new URLSearchParams(params).toString();
    if (cache && apiCache.has(query)) return apiCache.get(query);
    const response = await fetch(`${API_URL}?${query}`);
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    if (cache) apiCache.set(query, data);
    return data;
}

// -> [{ verse, text }] or null
async function fetchChapter(bookId, chapter, translation) {
    try {
        const data = await apiGet({ book: bookId, chapter, version: translation });
        return Array.isArray(data.verses) && data.verses.length ? data.verses : null;
    } catch (e) {
        console.error('Chapter load failed:', e);
        return null;
    }
}

// Hebrew (WLC) for the Old Testament, Greek (TR) for the New. -> [{ verse, text }] or null
async function fetchOriginal(bookId, chapter, testament) {
    try {
        const data = await apiGet({ book: bookId, chapter, type: 'original', testament });
        return Array.isArray(data.verses) && data.verses.length ? data.verses : null;
    } catch (e) {
        console.error('Original language load failed:', e);
        return null;
    }
}

// -> { results: [{ book, chapter, verse, text }], total }
async function searchBible(translation, query, page) {
    return apiGet({ action: 'search', version: translation, q: query, page });
}

// Strong's number like "G3056" -> { topic, lexeme, transliteration, pronunciation, short_definition, definition } or null
async function defineStrongs(number) {
    try {
        const data = await apiGet({ action: 'define', q: number });
        return data.entry || null;
    } catch (e) {
        console.error('Lexicon lookup failed:', e);
        return null;
    }
}

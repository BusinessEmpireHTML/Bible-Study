// Static data: books, translations, highlight colours and reading plans.
'use strict';

// Order matches bolls.life book IDs: Genesis = 1 ... Malachi = 39, Matthew = 40 ... Revelation = 66.
const BOOK_LIST = [
    ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34],
    ['Joshua', 24], ['Judges', 21], ['Ruth', 4], ['1 Samuel', 31], ['2 Samuel', 24],
    ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10],
    ['Nehemiah', 13], ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31],
    ['Ecclesiastes', 12], ['Song of Solomon', 8], ['Isaiah', 66], ['Jeremiah', 52], ['Lamentations', 5],
    ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9],
    ['Obadiah', 1], ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3],
    ['Zephaniah', 3], ['Haggai', 2], ['Zechariah', 14], ['Malachi', 4],
    ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28],
    ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6], ['Ephesians', 6],
    ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6],
    ['2 Timothy', 4], ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5],
    ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1], ['3 John', 1],
    ['Jude', 1], ['Revelation', 22]
];

const BOOKS = BOOK_LIST.map(([name, chapters], i) => ({
    id: i + 1,
    canonical: name,          // Used in note/highlight keys - never change.
    chapters,
    testament: i < 39 ? 'ot' : 'nt',
    slug: name.replace(/ /g, '-'),
    aliases: []
}));

const TESTAMENT_NAMES = { ot: 'Old Testament', nt: 'New Testament' };

function bookById(id) { return BOOKS[Number(id) - 1] || null; }

function bookBySlug(slug) {
    const s = String(slug || '').toLowerCase();
    return BOOKS.find(b => b.slug.toLowerCase() === s) || null;
}

// Merge extra names (Hebrew, Greek, localized names, aliases) from universalBookMap.json.
function applyBookMap(map) {
    if (!map) return;
    BOOKS.forEach(book => {
        const extra = map[String(book.id)];
        if (!extra) return;
        const { canonical, ...rest } = extra;
        Object.assign(book, rest, { aliases: Array.isArray(rest.aliases) ? rest.aliases : [] });
    });
}

// Find a book from user input such as "Gen", "1 jn", "song of songs", "Rev".
function findBookByName(name) {
    const norm = s => String(s || '').toLowerCase().replace(/[\s.]/g, '');
    const n = norm(name);
    if (!n) return null;
    const exact = BOOKS.find(b =>
        norm(b.canonical) === n ||
        b.aliases.some(a => norm(a) === n) ||
        [b.kjv, b.web].some(a => a && norm(a) === n));
    if (exact) return exact;
    if (n.length < 2) return null;
    return BOOKS.find(b => norm(b.canonical).startsWith(n)) || null;
}

// "John 3:16", "jn 3", "1 Cor 13.4" -> { book, chapter, verse }
function parseReference(query) {
    const m = String(query || '').trim()
        .match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z .]*?)\.?\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?$/);
    if (!m) return null;
    const book = findBookByName(m[1]);
    if (!book) return null;
    const chapter = Number(m[2]);
    if (chapter < 1 || chapter > book.chapters) return null;
    return { book, chapter, verse: m[3] ? Number(m[3]) : null };
}

function prevChapter(book, chapter) {
    if (chapter > 1) return { book, chapter: chapter - 1 };
    const prev = bookById(book.id - 1);
    return prev ? { book: prev, chapter: prev.chapters } : null;
}

function nextChapter(book, chapter) {
    if (chapter < book.chapters) return { book, chapter: chapter + 1 };
    const next = bookById(book.id + 1);
    return next ? { book: next, chapter: 1 } : null;
}

function chapterHash(book, chapter, verse) {
    return `#/${book.slug}/${chapter}` + (verse ? `/${verse}` : '');
}

// Values are bolls.life translation codes (the proxy only accepts these).
const TRANSLATIONS = [
    { code: 'KJV', label: 'KJV - King James Version' },
    { code: 'WEB', label: 'WEB - World English Bible' },
    { code: 'BSB', label: 'BSB - Berean Standard Bible' },
    { code: 'ASV', label: 'ASV - American Standard Version' },
    { code: 'YLT', label: "YLT - Young's Literal Translation" },
    { code: 'JPKJV', label: 'JPKJV - Japanese Colloquial Bible' },
    { code: 'CUV', label: 'CUV - Chinese Union Version' },
    { code: 'BTX3', label: 'BTX3 - La Biblia Textual 3ra Edicion' },
    { code: 'VULG', label: 'VULG - Latin Vulgate' }
];

// Translation code -> field in universalBookMap.json holding the book's name in that language.
const LOCALIZED_NAME_FIELD = { JPKJV: 'japanese', CUV: 'cuv', BTX3: 'rvr', VULG: 'vul' };

const HIGHLIGHT_COLORS = {
    yellow: 'rgba(251, 191, 36, 0.4)', green: 'rgba(34, 197, 94, 0.4)', blue: 'rgba(59, 130, 246, 0.4)',
    purple: 'rgba(168, 85, 247, 0.4)', pink: 'rgba(236, 72, 153, 0.4)', red: 'rgba(239, 68, 68, 0.4)',
    orange: 'rgba(249, 115, 22, 0.4)', teal: 'rgba(20, 184, 166, 0.4)', cyan: 'rgba(6, 182, 212, 0.4)',
    lime: 'rgba(132, 204, 22, 0.4)'
};

// READING PLANS ================================================

function chaptersOfBooks(filter) {
    const out = [];
    BOOKS.filter(filter).forEach(b => {
        for (let c = 1; c <= b.chapters; c++) out.push({ bookId: b.id, chapter: c });
    });
    return out;
}

// Spread chapters as evenly as possible over the given number of days.
function splitIntoDays(chapters, days) {
    const result = [];
    for (let d = 0; d < days; d++) {
        const start = Math.round(d * chapters.length / days);
        const end = Math.round((d + 1) * chapters.length / days);
        result.push(chapters.slice(start, end));
    }
    return result;
}

const PLAN_DEFINITIONS = [
    { id: 'year', name: 'Bible in a Year', description: 'Every chapter, Genesis to Revelation, in 365 days.',
      days: 365, filter: () => true },
    { id: 'nt90', name: 'New Testament in 90 Days', description: 'Matthew to Revelation, about three chapters a day.',
      days: 90, filter: b => b.testament === 'nt' },
    { id: 'gospels30', name: 'The Gospels in 30 Days', description: 'Matthew, Mark, Luke and John in a month.',
      days: 30, filter: b => b.id >= 40 && b.id <= 43 },
    { id: 'wisdom60', name: 'Psalms & Proverbs in 60 Days', description: 'The wisdom books, about three chapters a day.',
      days: 60, filter: b => b.id === 19 || b.id === 20 }
];

const planCache = {};
function getPlan(id) {
    const def = PLAN_DEFINITIONS.find(p => p.id === id);
    if (!def) return null;
    if (!planCache[id]) planCache[id] = { ...def, schedule: splitIntoDays(chaptersOfBooks(def.filter), def.days) };
    return planCache[id];
}

// [{bookId, chapter}, ...] -> [{ book, from, to }] grouping consecutive chapters of the same book.
function groupReadings(readings) {
    const groups = [];
    readings.forEach(r => {
        const last = groups[groups.length - 1];
        if (last && last.book.id === r.bookId && last.to === r.chapter - 1) last.to = r.chapter;
        else groups.push({ book: bookById(r.bookId), from: r.chapter, to: r.chapter });
    });
    return groups;
}

function readingLabel(group) {
    return group.from === group.to
        ? `${group.book.canonical} ${group.from}`
        : `${group.book.canonical} ${group.from}–${group.to}`;
}

// Bible Study app: routing, views, study tools, plans and settings.
'use strict';

const $ = id => document.getElementById(id);

const VIEW_IDS = ['view-home', 'view-books', 'view-chapters', 'view-chapter', 'view-search', 'view-plans'];
const LAYER_IDS = ['lexicon-panel', 'notes-modal', 'highlight-modal', 'settings-modal', 'study-panel'];

const DEFAULT_SETTINGS = {
    translation: 'WEB',
    compare: '',
    showStrongs: false,
    fontSize: 18,
    fontFamily: 'sans',
    readingTheme: 'dark'
};

const CHEVRON = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
const ICONS = {
    bookmark: filled => `<svg class="w-4 h-4" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>`,
    pencil: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>',
    link: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>',
    close: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
};

const state = {
    route: { name: 'home' },
    settings: { ...DEFAULT_SETTINGS },
    notes: {},
    highlights: {},
    plans: { active: null, progress: {} },
    meta: {},
    book: null,
    chapter: null,
    currentVerses: {},       // verse number -> plain text (for the notes modal)
    noteVerse: null,
    highlightVerse: null,
    renderToken: 0,
    lexicon: { numbers: [], index: 0, history: [] },
    lexiconToken: 0,
    studyTab: 'highlights',
    noteFilter: '',
    noteTag: '',
    search: null,
    pendingImport: null
};

init();

// INIT ==========================================================

async function init() {
    loadSavedData();
    buildStaticControls();
    applyReadingSettings();
    updateStudyCount();
    bindEvents();

    showLoading();
    await loadBookMap();
    hideLoading();

    window.addEventListener('hashchange', route);
    route();
    registerServiceWorker();
}

async function loadBookMap() {
    try {
        const response = await fetch('universalBookMap.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        applyBookMap(await response.json());
    } catch (e) {
        // Not fatal: books still work, just without Hebrew/Greek/localized names and aliases.
        console.warn('Could not load universalBookMap.json; continuing without book name translations.', e);
    }
}

function loadSavedData() {
    const notes = readStorage(STORAGE_KEYS.notes, {});
    const highlights = readStorage(STORAGE_KEYS.highlights, {});
    state.notes = isPlainObject(notes) ? notes : {};
    state.highlights = isPlainObject(highlights) ? highlights : {};

    const settings = readStorage(STORAGE_KEYS.settings, {});
    state.settings = sanitizeSettings(isPlainObject(settings) ? settings : {});

    const plans = readStorage(STORAGE_KEYS.plans, null);
    state.plans = isPlainObject(plans)
        ? parseBackup({ app: 'bible-study', plans }).plans
        : { active: null, progress: {} };

    const meta = readStorage(STORAGE_KEYS.meta, {});
    state.meta = isPlainObject(meta) ? meta : {};
}

function sanitizeSettings(input) {
    const s = { ...DEFAULT_SETTINGS, ...input };
    const valid = code => TRANSLATIONS.some(t => t.code === code);
    if (!valid(s.translation)) s.translation = DEFAULT_SETTINGS.translation;
    if (!valid(s.compare) || s.compare === s.translation) s.compare = '';
    s.showStrongs = s.showStrongs === true;
    s.fontSize = Math.min(28, Math.max(14, parseInt(s.fontSize, 10) || DEFAULT_SETTINGS.fontSize));
    if (!['sans', 'serif'].includes(s.fontFamily)) s.fontFamily = DEFAULT_SETTINGS.fontFamily;
    if (!['dark', 'sepia', 'light'].includes(s.readingTheme)) s.readingTheme = DEFAULT_SETTINGS.readingTheme;
    return s;
}

function buildStaticControls() {
    const options = TRANSLATIONS.map(t => `<option value="${t.code}">${escapeHtml(t.label)}</option>`).join('');
    $('translation-select').innerHTML = options;
    $('search-translation').innerHTML = options;
    $('compare-select').innerHTML = '<option value="">None</option>' + options;

    $('highlight-colors').innerHTML = Object.entries(HIGHLIGHT_COLORS).map(([name, color]) =>
        `<button data-color="${name}" class="highlight-color" style="background-color: ${color};" title="${name}" aria-label="${name}"></button>`
    ).join('');
}

// SAVE HELPERS ===================================================

const saveNotes = () => writeStorage(STORAGE_KEYS.notes, state.notes);
const saveHighlights = () => writeStorage(STORAGE_KEYS.highlights, state.highlights);
const saveSettings = () => writeStorage(STORAGE_KEYS.settings, state.settings);
const savePlans = () => writeStorage(STORAGE_KEYS.plans, state.plans);
const saveMeta = () => writeStorage(STORAGE_KEYS.meta, state.meta);

// UI HELPERS =====================================================

function showLoading() { $('loading').classList.remove('hidden'); }
function hideLoading() { $('loading').classList.add('hidden'); }

let toastTimer = null;
function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

function openLayer(id) { $(id).classList.remove('hidden'); }

function closeLayer(id) {
    $(id).classList.add('hidden');
    if (id === 'notes-modal') state.noteVerse = null;
    if (id === 'highlight-modal') state.highlightVerse = null;
    if (id === 'settings-modal') hideImportConfirm();
}

const isOpen = id => !$(id).classList.contains('hidden');

function verseKeyFor(book, chapter, verse) { return `${book.canonical}-${chapter}-${verse}`; }

// Split "Book Name-Chapter-Verse" (book names may contain spaces or hyphens).
function parseVerseKey(key) {
    const parts = String(key).split('-');
    const verse = parseInt(parts.pop(), 10);
    const chapter = parseInt(parts.pop(), 10);
    const name = parts.join('-');
    return { book: BOOKS.find(b => b.canonical === name) || null, name, chapter, verse };
}

function sortedKeys(obj) {
    return Object.keys(obj)
        .map(key => ({ key, ...parseVerseKey(key) }))
        .sort((a, b) => ((a.book ? a.book.id : 99) - (b.book ? b.book.id : 99)) || (a.chapter - b.chapter) || (a.verse - b.verse));
}

function todayStr(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysBetween(a, b) {
    const toUtc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

function formatPlanDate(start, offset) {
    const [y, m, d] = start.split('-').map(Number);
    return new Date(y, m - 1, d + offset).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// EVENTS =========================================================

function bindEvents() {
    document.addEventListener('click', e => {
        const closer = e.target.closest('[data-close]');
        if (closer) { closeLayer(closer.dataset.close); return; }

        const strongs = e.target.closest('[data-strongs]');
        if (strongs) {
            e.preventDefault();
            const fromLexicon = !!strongs.closest('#lexicon-panel');
            openLexicon(strongs.dataset.strongs.split(' '), 0, fromLexicon);
            return;
        }

        const action = e.target.closest('[data-action]');
        if (action) handleAction(action.dataset.action, action, e);
    });

    // Clicking a modal's dark backdrop closes it.
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => { if (e.target === modal) closeLayer(modal.id); });
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const top = LAYER_IDS.find(isOpen);
            if (top) closeLayer(top);
            return;
        }
        // Left/right arrows move between chapters.
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.route.name === 'chapter' &&
            !e.altKey && !e.ctrlKey && !e.metaKey &&
            !e.target.closest('input, textarea, select') && !LAYER_IDS.some(isOpen)) {
            const link = document.querySelector(`.chapter-nav a[data-nav="${e.key === 'ArrowLeft' ? 'prev' : 'next'}"]`);
            if (link) location.hash = link.getAttribute('href');
        }
    });

    $('search-form').addEventListener('submit', e => {
        e.preventDefault();
        quickSearch($('search-input').value);
    });
    $('search-page-form').addEventListener('submit', e => {
        e.preventDefault();
        const q = $('search-page-input').value.trim();
        if (q) location.hash = `#/search?q=${encodeURIComponent(q)}&t=${$('search-translation').value}`;
    });

    $('translation-select').addEventListener('change', e => {
        state.settings.translation = e.target.value;
        if (state.settings.compare === e.target.value) state.settings.compare = '';
        saveSettings();
        renderBreadcrumb(state.route);
        renderChapter(state.route, { keepScroll: true });
    });
    $('compare-select').addEventListener('change', e => {
        state.settings.compare = e.target.value === state.settings.translation ? '' : e.target.value;
        saveSettings();
        renderChapter(state.route, { keepScroll: true });
    });
    $('strongs-toggle').addEventListener('change', e => {
        state.settings.showStrongs = e.target.checked;
        saveSettings();
        renderChapter(state.route, { keepScroll: true });
    });

    $('study-btn').addEventListener('click', () => {
        if (isOpen('study-panel')) closeLayer('study-panel');
        else { renderStudyPanel(); openLayer('study-panel'); }
    });
    document.querySelectorAll('[data-study-tab]').forEach(btn => btn.addEventListener('click', () => {
        state.studyTab = btn.dataset.studyTab;
        renderStudyPanel();
    }));

    $('note-save').addEventListener('click', saveNote);
    $('note-delete').addEventListener('click', deleteNote);
    $('highlight-colors').addEventListener('click', e => {
        const btn = e.target.closest('[data-color]');
        if (btn) setHighlight(btn.dataset.color);
    });
    $('highlight-remove').addEventListener('click', () => setHighlight(null));

    $('lexicon-back').addEventListener('click', () => {
        const prev = state.lexicon.history.pop();
        if (!prev) return;
        state.lexicon.numbers = prev.numbers;
        state.lexicon.index = prev.index;
        renderLexicon();
    });

    $('settings-btn').addEventListener('click', openSettings);
    $('setting-font-size').addEventListener('input', e => {
        state.settings.fontSize = Number(e.target.value);
        applyReadingSettings();
        saveSettings();
    });
    document.querySelectorAll('.segmented').forEach(group => group.addEventListener('click', e => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        state.settings[group.dataset.setting] = btn.dataset.value;
        applyReadingSettings();
        saveSettings();
        syncSettingsControls();
    }));

    $('export-btn').addEventListener('click', exportBackup);
    $('import-file').addEventListener('change', handleImportFile);
    $('import-merge').addEventListener('click', () => applyImport('merge'));
    $('import-replace').addEventListener('click', () => applyImport('replace'));
    $('import-cancel').addEventListener('click', hideImportConfirm);

    window.addEventListener('offline', () => showToast("You're offline. Chapters you've read before still work."));
    window.addEventListener('online', () => showToast('Back online.'));
}

function handleAction(name, el) {
    const data = el.dataset;
    switch (name) {
        case 'highlight': openHighlightModal(Number(data.verse)); break;
        case 'note': openNotesModal(Number(data.verse)); break;
        case 'copy-link': copyVerseLink(Number(data.verse)); break;
        case 'retry': renderChapter(state.route); break;
        case 'open-settings': openSettings(); break;
        case 'dismiss-backup':
            state.meta.backupReminderDismissed = new Date().toISOString();
            saveMeta();
            renderHome();
            break;
        case 'remove-highlight':
            delete state.highlights[data.key];
            saveHighlights();
            updateStudyCount();
            renderStudyPanel();
            if (state.route.name === 'chapter') renderChapter(state.route, { keepScroll: true });
            break;
        case 'note-tag':
            state.noteTag = state.noteTag === data.tag ? '' : data.tag;
            renderStudyPanel();
            break;
        case 'lexicon-tab':
            state.lexicon.index = Number(data.index);
            renderLexicon();
            break;
        case 'search-more': loadSearchPage(); break;
        case 'plan-start': startPlan(data.plan); break;
        case 'plan-stop': stopPlan(); break;
        case 'plan-restart': restartPlan(data.plan); break;
        case 'plan-toggle': togglePlanDay(data.plan, Number(data.day)); break;
    }
}

// ROUTING ========================================================
//   #/                 home            #/John        chapters of John
//   #/ot  #/nt         book lists      #/John/3      John 3
//   #/search?q=&t=     search          #/John/3/16   John 3, scrolled to verse 16
//   #/plans            reading plans

function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart = ''] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    const query = new URLSearchParams(queryPart);

    if (!parts.length) return { name: 'home' };
    if (parts[0] === 'ot' || parts[0] === 'nt') return { name: 'books', testament: parts[0] };
    if (parts[0] === 'search') return { name: 'search', q: query.get('q') || '', translation: query.get('t') || '' };
    if (parts[0] === 'plans') return { name: 'plans' };

    const book = bookBySlug(parts[0]);
    if (!book) return { name: 'home' };
    if (!parts[1]) return { name: 'chapters', book };
    const chapter = Math.min(Math.max(parseInt(parts[1], 10) || 1, 1), book.chapters);
    const verse = parseInt(parts[2], 10) || null;
    return { name: 'chapter', book, chapter, verse };
}

function route() {
    const r = parseHash();
    state.route = r;
    if (isOpen('study-panel')) closeLayer('study-panel');

    const viewId = `view-${r.name}`;
    VIEW_IDS.forEach(id => $(id).classList.toggle('hidden', id !== viewId));
    renderBreadcrumb(r);

    switch (r.name) {
        case 'home': renderHome(); break;
        case 'books': renderBooks(r.testament); break;
        case 'chapters': renderChapters(r.book); break;
        case 'chapter': renderChapter(r); break;
        case 'search': renderSearch(r); break;
        case 'plans': renderPlans(); break;
    }

    if (r.name !== 'chapter') window.scrollTo(0, 0);
    if (r.name !== 'search') $('search-input').value = '';
    document.title = pageTitle(r);
}

function pageTitle(r) {
    const suffix = 'Bible Study';
    if (r.name === 'chapter') return `${r.book.canonical} ${r.chapter} · ${suffix}`;
    if (r.name === 'chapters') return `${r.book.canonical} · ${suffix}`;
    if (r.name === 'books') return `${TESTAMENT_NAMES[r.testament]} · ${suffix}`;
    if (r.name === 'search' && r.q) return `“${r.q}” · ${suffix}`;
    if (r.name === 'plans') return `Reading Plans · ${suffix}`;
    return suffix;
}

function originalNameFor(book) { return book.testament === 'ot' ? book.wlc : book.tr; }

function bookDisplayHtml(book, withLocalized) {
    const localField = withLocalized ? LOCALIZED_NAME_FIELD[state.settings.translation] : null;
    const extras = [originalNameFor(book), localField ? book[localField] : null].filter(Boolean).map(escapeHtml);
    return extras.length
        ? `${escapeHtml(book.canonical)} <span class="text-slate-400 font-serif">(${extras.join(' · ')})</span>`
        : escapeHtml(book.canonical);
}

function renderBreadcrumb(r) {
    const items = [];
    if (r.name === 'books') items.push({ html: TESTAMENT_NAMES[r.testament] });
    if (r.name === 'chapters' || r.name === 'chapter') {
        items.push({ html: TESTAMENT_NAMES[r.book.testament], href: `#/${r.book.testament}` });
        items.push({ html: bookDisplayHtml(r.book, r.name === 'chapter'), href: r.name === 'chapter' ? `#/${r.book.slug}` : null });
        if (r.name === 'chapter') items.push({ html: `Chapter ${r.chapter}` });
    }
    if (r.name === 'search') items.push({ html: 'Search' });
    if (r.name === 'plans') items.push({ html: 'Reading Plans' });

    $('breadcrumb').innerHTML = items.map((item, i) => (i ? CHEVRON : '') + (item.href
        ? `<a href="${item.href}" class="text-amber-400 hover:text-amber-300">${item.html}</a>`
        : `<span class="text-amber-400">${item.html}</span>`)).join('');
}

// HOME ===========================================================

function renderHome() {
    const parts = [];

    const last = readStorage(STORAGE_KEYS.lastRead, null);
    const lastBook = last && bookById(last.bookId);
    if (lastBook && last.chapter >= 1 && last.chapter <= lastBook.chapters) {
        parts.push(`
            <a href="${chapterHash(lastBook, last.chapter)}" class="card flex items-center justify-between hover:border-amber-500/50 transition-colors">
                <div>
                    <div class="text-xs uppercase tracking-wide text-slate-400">Continue reading</div>
                    <div class="text-lg font-semibold text-white">${escapeHtml(lastBook.canonical)} ${last.chapter}</div>
                </div>
                <span class="text-amber-400 text-2xl">→</span>
            </a>`);
    }

    const plan = state.plans.active ? getPlan(state.plans.active) : null;
    if (plan) {
        const next = nextPlanDay(plan.id);
        const done = (state.plans.progress[plan.id] || { done: [] }).done.length;
        parts.push(`
            <div class="card">
                <div class="flex items-center justify-between gap-2 mb-1">
                    <div class="text-xs uppercase tracking-wide text-slate-400">${escapeHtml(plan.name)}</div>
                    <a href="#/plans" class="text-xs text-amber-400 hover:text-amber-300">View plan</a>
                </div>
                ${next === -1
                    ? '<div class="text-lg font-semibold text-white">You finished this plan. Well done!</div>'
                    : `<div class="text-lg font-semibold text-white mb-1">Day ${next + 1}: ${planReadingLinks(plan, next)}</div>
                       <div class="flex items-center justify-between gap-3 mt-2">
                           <div class="flex-1 progress"><div style="width:${Math.round(done / plan.days * 100)}%"></div></div>
                           <button data-action="plan-toggle" data-plan="${plan.id}" data-day="${next}" class="text-sm bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg">Mark done</button>
                       </div>`}
            </div>`);
    }

    const count = Object.keys(state.notes).length + Object.keys(state.highlights).length;
    const lastExport = state.meta.lastExport ? new Date(state.meta.lastExport) : null;
    const dismissed = state.meta.backupReminderDismissed ? new Date(state.meta.backupReminderDismissed) : null;
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    if (count > 0 && (!lastExport || lastExport < thirtyDaysAgo) && (!dismissed || dismissed < thirtyDaysAgo)) {
        parts.push(`
            <div class="card flex flex-wrap items-center justify-between gap-3 !border-amber-500/40">
                <div class="text-sm text-slate-300">You have ${count} saved highlight${count === 1 ? "" : "s"} and notes, stored only in this browser. ${lastExport ? 'Your last backup was over 30 days ago.' : 'Back them up so they are never lost.'}</div>
                <div class="flex gap-2">
                    <button data-action="open-settings" class="text-sm bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg">Back up</button>
                    <button data-action="dismiss-backup" class="text-sm text-slate-400 hover:text-white px-2">Later</button>
                </div>
            </div>`);
    }

    $('home-extras').innerHTML = parts.join('');
}

// BOOKS & CHAPTERS ===============================================

function renderBooks(testament) {
    $('books-grid').innerHTML = BOOKS.filter(b => b.testament === testament).map(book => `
        <a href="#/${book.slug}" class="block bg-slate-700/50 hover:bg-slate-600/50 text-white p-4 rounded-lg shadow transition-all border border-slate-600/50 hover:border-amber-500/50">
            <div class="font-semibold">${escapeHtml(book.canonical)}</div>
            <div class="text-xs text-amber-500/80 mt-1 font-serif">${escapeHtml(originalNameFor(book) || '')}</div>
            <div class="text-sm text-slate-400 mt-2">${book.chapters} chapters</div>
        </a>
    `).join('');
}

function renderChapters(book) {
    $('chapters-back').href = `#/${book.testament}`;
    const marked = new Set();
    [...Object.keys(state.notes), ...Object.keys(state.highlights)].forEach(key => {
        const k = parseVerseKey(key);
        if (k.book === book) marked.add(k.chapter);
    });
    $('chapters-grid').innerHTML = Array.from({ length: book.chapters }, (_, i) => i + 1).map(chapter => `
        <a href="${chapterHash(book, chapter)}" class="block text-center bg-slate-700/50 hover:bg-slate-600/50 text-white p-3 rounded-lg shadow transition-all border border-slate-600/50 hover:border-amber-500/50 font-semibold ${marked.has(chapter) ? 'has-marks' : ''}"
            ${marked.has(chapter) ? 'title="Has highlights or notes"' : ''}>${chapter}</a>
    `).join('');
}

// CHAPTER VIEW ===================================================

function renderChapterNav(book, chapter) {
    const prev = prevChapter(book, chapter);
    const next = nextChapter(book, chapter);
    const html =
        (prev ? `<a href="${chapterHash(prev.book, prev.chapter)}" data-nav="prev">← ${escapeHtml(prev.book.canonical)} ${prev.chapter}</a>` : '<span></span>') +
        (next ? `<a href="${chapterHash(next.book, next.chapter)}" data-nav="next">${escapeHtml(next.book.canonical)} ${next.chapter} →</a>` : '<span></span>');
    document.querySelectorAll('.chapter-nav').forEach(el => { el.innerHTML = html; });
}

async function renderChapter(r, { keepScroll = false } = {}) {
    if (!r || r.name !== 'chapter') return;
    const { book, chapter } = r;
    const s = state.settings;
    const token = ++state.renderToken;
    const contentArea = $('content-area');

    state.book = book;
    state.chapter = chapter;
    writeStorage(STORAGE_KEYS.lastRead, { bookId: book.id, chapter });

    $('chapter-back').href = `#/${book.slug}`;
    $('translation-select').value = s.translation;
    $('compare-select').value = s.compare;
    $('strongs-toggle').checked = s.showStrongs;
    renderChapterNav(book, chapter);

    showLoading();
    const [verses, original, compare] = await Promise.all([
        fetchChapter(book.id, chapter, s.translation),
        fetchOriginal(book.id, chapter, book.testament),
        s.compare ? fetchChapter(book.id, chapter, s.compare) : Promise.resolve(null)
    ]);
    if (token !== state.renderToken) return; // A newer navigation has started.
    hideLoading();

    if (!verses) {
        contentArea.innerHTML = `
            <div class="bg-slate-700/30 border border-slate-600/50 rounded-lg p-8 text-center text-slate-400">
                <p class="mb-1">Unable to load ${escapeHtml(book.canonical)} ${chapter}.</p>
                <p class="text-sm mb-4">${navigator.onLine ? 'The Bible service may be busy.' : "You're offline. Chapters you've read before are available offline."}</p>
                <button data-action="retry" class="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg">Try again</button>
            </div>`;
        return;
    }

    const isOT = book.testament === 'ot';
    const prefix = isOT ? 'H' : 'G';
    const mainHasStrongs = verses.some(v => hasStrongs(v.text));
    const originalByVerse = {};
    (original || []).forEach(v => { originalByVerse[v.verse] = v.text; });
    const originalHasStrongs = (original || []).some(v => hasStrongs(v.text));
    const compareByVerse = {};
    (compare || []).forEach(v => { compareByVerse[v.verse] = v.text; });

    let notice = '';
    if (s.showStrongs && !mainHasStrongs) {
        notice = `<div class="mb-3 text-sm text-slate-300 bg-sky-900/30 border border-sky-700/40 rounded-lg px-4 py-2">
            ${escapeHtml(s.translation)} doesn't include Strong's numbers. Switch to <b>KJV</b> to see them on the English text${originalHasStrongs ? `, or click any word in the ${isOT ? 'Hebrew' : 'Greek'} line` : ''}.
        </div>`;
    }
    if (s.compare && !compare) {
        notice += `<div class="mb-3 text-sm text-slate-400">Couldn't load ${escapeHtml(s.compare)} for comparison.</div>`;
    }

    state.currentVerses = {};
    const rows = verses.map(v => {
        const plain = toPlainText(v.text);
        state.currentVerses[v.verse] = plain;
        const key = verseKeyFor(book, chapter, v.verse);
        const highlight = HIGHLIGHT_COLORS[state.highlights[key]] ? state.highlights[key] : null;
        const hasNote = !!state.notes[key];
        const mainHtml = s.showStrongs && mainHasStrongs ? renderStrongsHtml(v.text, prefix, true) : escapeHtml(plain);
        const originalHtml = originalByVerse[v.verse] ? renderStrongsHtml(originalByVerse[v.verse], prefix, s.showStrongs) : '';
        const compareText = compareByVerse[v.verse];

        return `
            <div class="verse-wrapper" id="v${v.verse}">
                <div class="verse-cols">
                    <div class="verse-main">
                        <sup class="verse-number">${v.verse}</sup><span class="verse-content ${highlight ? 'verse-highlighted' : ''}" ${highlight ? `style="background-color: ${HIGHLIGHT_COLORS[highlight]}"` : ''}>${mainHtml}</span>
                        <span class="verse-actions">
                            <button class="verse-action ${highlight ? 'on' : ''}" data-action="highlight" data-verse="${v.verse}" title="Highlight" aria-label="Highlight verse ${v.verse}">${ICONS.bookmark(highlight)}</button>
                            <button class="verse-action ${hasNote ? 'on' : ''}" data-action="note" data-verse="${v.verse}" title="${hasNote ? 'Edit note' : 'Add note'}" aria-label="Note for verse ${v.verse}">${ICONS.pencil}</button>
                            <button class="verse-action" data-action="copy-link" data-verse="${v.verse}" title="Copy link to this verse" aria-label="Copy link to verse ${v.verse}">${ICONS.link}</button>
                        </span>
                    </div>
                    ${s.compare ? `<div class="verse-compare"><span class="compare-label">${escapeHtml(s.compare)}</span>${compareText ? escapeHtml(toPlainText(compareText)) : '<span style="opacity:.5">—</span>'}</div>` : ''}
                </div>
                ${originalHtml ? `
                    <div class="original-line">
                        <span class="original-label">${isOT ? 'Hebrew' : 'Greek'}:</span>
                        <span class="font-serif" dir="${isOT ? 'rtl' : 'ltr'}">${originalHtml}</span>
                    </div>` : ''}
            </div>`;
    }).join('');

    contentArea.innerHTML = `${notice}
        <div class="reading-card ${s.compare ? 'has-compare' : ''}">
            <div class="compare-header"><div>${escapeHtml(s.translation)}</div><div>${escapeHtml(s.compare)}</div></div>
            ${rows}
        </div>`;

    if (keepScroll) return;
    if (r.verse) scrollToVerse(r.verse);
    else window.scrollTo(0, 0);
}

function scrollToVerse(verse) {
    const el = $(`v${verse}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('flash');
}

function copyVerseLink(verse) {
    const url = location.href.split('#')[0] + chapterHash(state.book, state.chapter, verse);
    const ref = `${state.book.canonical} ${state.chapter}:${verse}`;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => showToast(`Link to ${ref} copied`), () => window.prompt('Copy this link:', url));
    } else {
        window.prompt('Copy this link:', url);
    }
}

// NOTES & HIGHLIGHTS =============================================

function openNotesModal(verse) {
    state.noteVerse = verse;
    const key = verseKeyFor(state.book, state.chapter, verse);
    $('notes-verse-title').textContent = `Notes - ${state.book.canonical} ${state.chapter}:${verse}`;
    $('notes-verse-text').textContent = state.currentVerses[verse] || '';
    $('note-textarea').value = state.notes[key] || '';
    $('note-delete').classList.toggle('hidden', !state.notes[key]);
    openLayer('notes-modal');
    $('note-textarea').focus();
}

function saveNote() {
    if (!state.noteVerse) return;
    const key = verseKeyFor(state.book, state.chapter, state.noteVerse);
    const value = $('note-textarea').value;
    if (value.trim()) state.notes[key] = value;
    else delete state.notes[key];
    saveNotes();
    updateStudyCount();
    closeLayer('notes-modal');
    renderChapter(state.route, { keepScroll: true });
}

function deleteNote() {
    if (!state.noteVerse) return;
    if (!window.confirm('Delete this note?')) return;
    delete state.notes[verseKeyFor(state.book, state.chapter, state.noteVerse)];
    saveNotes();
    updateStudyCount();
    closeLayer('notes-modal');
    renderChapter(state.route, { keepScroll: true });
}

function openHighlightModal(verse) {
    state.highlightVerse = verse;
    const current = state.highlights[verseKeyFor(state.book, state.chapter, verse)];
    document.querySelectorAll('#highlight-colors [data-color]').forEach(btn =>
        btn.classList.toggle('selected', btn.dataset.color === current));
    $('highlight-remove').classList.toggle('hidden', !current);
    openLayer('highlight-modal');
}

function setHighlight(color) {
    if (!state.highlightVerse) return;
    const key = verseKeyFor(state.book, state.chapter, state.highlightVerse);
    if (!color || state.highlights[key] === color) delete state.highlights[key];
    else state.highlights[key] = color;
    saveHighlights();
    updateStudyCount();
    closeLayer('highlight-modal');
    renderChapter(state.route, { keepScroll: true });
}

function updateStudyCount() {
    $('study-count').textContent = Object.keys(state.highlights).length + Object.keys(state.notes).length;
}

function renderStudyPanel() {
    document.querySelectorAll('[data-study-tab]').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.studyTab === state.studyTab));
    const content = $('study-content');

    if (state.studyTab === 'highlights') {
        const items = sortedKeys(state.highlights);
        if (!items.length) {
            content.innerHTML = '<div class="text-slate-400 text-center py-8">No highlighted verses yet.<br><span class="text-sm">Tap the bookmark icon next to any verse.</span></div>';
            return;
        }
        const groups = [];
        items.forEach(item => {
            const title = `${item.name} ${item.chapter}`;
            let group = groups[groups.length - 1];
            if (!group || group.title !== title) groups.push(group = { title, items: [] });
            group.items.push(item);
        });
        content.innerHTML = groups.map(group => `
            <div class="mb-4">
                <h4 class="font-bold text-slate-300 mb-2">${escapeHtml(group.title)}</h4>
                <div class="space-y-1">
                    ${group.items.map(item => `
                        <div class="flex items-center gap-2 group">
                            <div class="w-3 h-3 rounded flex-shrink-0" style="background-color: ${HIGHLIGHT_COLORS[state.highlights[item.key]] || 'transparent'}"></div>
                            ${item.book
                                ? `<a href="${chapterHash(item.book, item.chapter, item.verse)}" class="flex-1 text-sm text-slate-300 hover:text-white">Verse ${item.verse}</a>`
                                : `<span class="flex-1 text-sm text-slate-500">Verse ${item.verse}</span>`}
                            <button data-action="remove-highlight" data-key="${escapeHtml(item.key)}" class="text-slate-500 hover:text-red-400 sm:opacity-0 group-hover:opacity-100 transition-all" aria-label="Remove highlight">${ICONS.close}</button>
                        </div>`).join('')}
                </div>
            </div>`).join('');
        return;
    }

    // Notes tab: filter box + tag chips + list.
    const allTags = {};
    Object.values(state.notes).forEach(note => extractTags(note).forEach(tag => { allTags[tag] = (allTags[tag] || 0) + 1; }));
    content.innerHTML = `
        <input id="note-filter" type="search" placeholder="Filter notes..." value="${escapeHtml(state.noteFilter)}"
            class="w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-amber-500">
        ${Object.keys(allTags).length ? `<div class="flex flex-wrap gap-1 mb-3">${Object.entries(allTags).sort().map(([tag, n]) =>
            `<button class="chip ${state.noteTag === tag ? 'active' : ''}" data-action="note-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span class="text-slate-400">${n}</span></button>`).join('')}</div>` : ''}
        <div id="notes-list"></div>`;
    $('note-filter').addEventListener('input', e => { state.noteFilter = e.target.value; renderNotesList(); });
    renderNotesList();
}

function renderNotesList() {
    const filter = state.noteFilter.trim().toLowerCase();
    const items = sortedKeys(state.notes).filter(item => {
        const note = state.notes[item.key];
        if (state.noteTag && !extractTags(note).includes(state.noteTag)) return false;
        if (filter && !`${item.name} ${item.chapter}:${item.verse} ${note}`.toLowerCase().includes(filter)) return false;
        return true;
    });
    const list = $('notes-list');
    if (!Object.keys(state.notes).length) {
        list.innerHTML = '<div class="text-slate-400 text-center py-8">No notes yet.<br><span class="text-sm">Tap the pencil icon next to any verse.</span></div>';
        return;
    }
    if (!items.length) {
        list.innerHTML = '<div class="text-slate-400 text-center py-6 text-sm">No notes match.</div>';
        return;
    }
    list.innerHTML = items.map(item => {
        const note = state.notes[item.key];
        const excerpt = note.length > 220 ? note.slice(0, 220) + '…' : note;
        const body = excerpt.split(/(#[\p{L}\p{N}_-]+)/u).map((part, i) =>
            i % 2 ? `<span class="text-amber-400">${escapeHtml(part)}</span>` : escapeHtml(part)).join('');
        const ref = `${escapeHtml(item.name)} ${item.chapter}:${item.verse}`;
        return `
            <div class="card !p-3 mb-2">
                ${item.book ? `<a href="${chapterHash(item.book, item.chapter, item.verse)}" class="text-sm font-semibold text-amber-400 hover:text-amber-300">${ref}</a>` : `<span class="text-sm font-semibold text-slate-400">${ref}</span>`}
                <div class="text-sm text-slate-300 whitespace-pre-line mt-1">${body}</div>
            </div>`;
    }).join('');
}

// LEXICON (STRONG'S) =============================================

function openLexicon(numbers, index = 0, fromLexicon = false) {
    const clean = numbers.filter(n => /^[HG]\d+$/.test(n));
    if (!clean.length) return;
    if (fromLexicon && state.lexicon.numbers.length) {
        state.lexicon.history.push({ numbers: state.lexicon.numbers, index: state.lexicon.index });
    } else if (!fromLexicon) {
        state.lexicon.history = [];
    }
    state.lexicon.numbers = clean;
    state.lexicon.index = Math.min(index, clean.length - 1);
    openLayer('lexicon-panel');
    renderLexicon();
}

async function renderLexicon() {
    const { numbers, index, history } = state.lexicon;
    const number = numbers[index];
    const content = $('lexicon-content');
    $('lexicon-back').classList.toggle('hidden', !history.length);

    const chips = numbers.length > 1
        ? `<div class="flex flex-wrap gap-2 mb-4">${numbers.map((n, i) =>
            `<button class="chip ${i === index ? 'active' : ''}" data-action="lexicon-tab" data-index="${i}">${escapeHtml(n)}</button>`).join('')}</div>`
        : '';
    content.innerHTML = `${chips}<p class="text-slate-400">Looking up ${escapeHtml(number)}…</p>`;

    const token = ++state.lexiconToken;
    const entry = await defineStrongs(number);
    if (token !== state.lexiconToken) return;

    if (!entry) {
        content.innerHTML = `${chips}<p class="text-slate-300">No lexicon entry found for <b>${escapeHtml(number)}</b>.</p>
            ${navigator.onLine ? '' : '<p class="text-sm text-slate-500 mt-2">You appear to be offline.</p>'}`;
        return;
    }

    const isHebrew = number.startsWith('H');
    const sound = [entry.transliteration, entry.pronunciation ? `(${entry.pronunciation})` : ''].filter(Boolean).join(' ');
    content.innerHTML = `${chips}
        <div class="mb-4">
            <div class="text-sky-400 text-sm font-semibold">${escapeHtml(number)} · ${isHebrew ? 'Hebrew' : 'Greek'}</div>
            ${entry.lexeme ? `<div class="text-4xl font-serif text-white mt-2" dir="${isHebrew ? 'rtl' : 'ltr'}" style="text-align:left">${escapeHtml(entry.lexeme)}</div>` : ''}
            ${sound ? `<div class="text-slate-300 mt-1 italic">${escapeHtml(sound)}</div>` : ''}
            ${entry.short_definition ? `<div class="mt-3 text-amber-300 font-medium">${escapeHtml(entry.short_definition)}</div>` : ''}
        </div>
        <div id="lexicon-definition" class="lexicon-definition border-t border-slate-700/60 pt-4"></div>
        <p class="text-xs text-slate-500 mt-6">Source: ${isHebrew ? 'Brown-Driver-Briggs Hebrew lexicon' : "Thayer's Greek lexicon"}, via bolls.life. Blue references open related entries.</p>`;
    if (entry.definition) $('lexicon-definition').append(sanitizeHtmlToFragment(entry.definition));
}

// SEARCH =========================================================

function quickSearch(value) {
    const q = value.trim();
    if (!q) return;
    const ref = parseReference(q);
    $('search-input').blur();
    if (ref) {
        $('search-input').value = '';
        location.hash = chapterHash(ref.book, ref.chapter, ref.verse);
        return;
    }
    location.hash = `#/search?q=${encodeURIComponent(q)}&t=${state.settings.translation}`;
}

function renderSearch(r) {
    const translation = TRANSLATIONS.some(t => t.code === r.translation) ? r.translation : state.settings.translation;
    $('search-page-input').value = r.q;
    $('search-input').value = r.q;
    $('search-translation').value = translation;
    const results = $('search-results');

    if (!r.q.trim()) {
        state.search = null;
        results.innerHTML = '<p class="text-slate-400">Search for words or phrases, or type a reference like <b>John 3:16</b> or <b>Ps 23</b> to jump straight there.</p>';
        $('search-page-input').focus();
        return;
    }
    const ref = parseReference(r.q);
    if (ref) { location.replace(chapterHash(ref.book, ref.chapter, ref.verse)); return; }
    if (r.q.trim().length < 2) {
        results.innerHTML = '<p class="text-slate-400">Type at least 2 characters.</p>';
        return;
    }

    state.search = { query: r.q.trim(), translation, page: 0, results: [], total: 0, loading: false };
    results.innerHTML = '<p class="text-slate-400">Searching…</p>';
    loadSearchPage();
}

async function loadSearchPage() {
    const search = state.search;
    if (!search || search.loading) return;
    search.loading = true;
    try {
        const data = await searchBible(search.translation, search.query, search.page + 1);
        if (state.search !== search) return;
        search.page += 1;
        search.results.push(...(data.results || []));
        search.total = data.total || search.results.length;
        // Stop paging if the server returned nothing new.
        if (!(data.results || []).length) search.total = search.results.length;
    } catch (e) {
        if (state.search !== search) return;
        $('search-results').innerHTML = `<p class="text-slate-400">Search failed. ${navigator.onLine ? 'Please try again.' : 'Search needs an internet connection.'}</p>`;
        return;
    } finally {
        search.loading = false;
    }
    renderSearchResults();
}

function renderSearchResults() {
    const { query, translation, results, total } = state.search;
    if (!results.length) {
        $('search-results').innerHTML = `<p class="text-slate-400">No results for “${escapeHtml(query)}” in ${escapeHtml(translation)}.</p>`;
        return;
    }
    $('search-results').innerHTML = `
        <p class="text-sm text-slate-400 mb-3">${total} result${total === 1 ? '' : 's'} for “${escapeHtml(query)}” in ${escapeHtml(translation)}</p>
        <div class="space-y-2">
            ${results.map(r => {
                const book = bookById(r.book);
                if (!book) return '';
                return `
                    <a href="${chapterHash(book, r.chapter, r.verse)}" class="block card !p-3 hover:border-amber-500/50 transition-colors">
                        <div class="text-amber-400 text-sm font-semibold">${escapeHtml(book.canonical)} ${r.chapter}:${r.verse}</div>
                        <div class="text-slate-200 mt-1">${highlightTerms(toPlainText(r.text), query)}</div>
                    </a>`;
            }).join('')}
        </div>
        ${results.length < total ? '<button data-action="search-more" class="mt-4 w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg">Load more</button>' : ''}`;
}

// READING PLANS ==================================================

function nextPlanDay(planId) {
    const plan = getPlan(planId);
    const done = new Set((state.plans.progress[planId] || { done: [] }).done);
    for (let d = 0; d < plan.days; d++) if (!done.has(d)) return d;
    return -1;
}

function calendarDay(planId) {
    const progress = state.plans.progress[planId];
    if (!progress) return 0;
    return Math.min(Math.max(daysBetween(progress.start, todayStr()), 0), getPlan(planId).days - 1);
}

function planReadingLinks(plan, day) {
    return groupReadings(plan.schedule[day]).map(g =>
        `<a href="${chapterHash(g.book, g.from)}" class="text-amber-300 hover:underline">${escapeHtml(readingLabel(g))}</a>`).join(', ');
}

function startPlan(planId) {
    if (!getPlan(planId)) return;
    if (!state.plans.progress[planId]) state.plans.progress[planId] = { start: todayStr(), done: [] };
    state.plans.active = planId;
    savePlans();
    renderPlans();
    showToast(`${getPlan(planId).name} is now your active plan`);
}

function stopPlan() {
    state.plans.active = null;
    savePlans();
    renderPlans();
}

function restartPlan(planId) {
    if (!window.confirm('Restart this plan from today? Your progress on it will be cleared.')) return;
    state.plans.progress[planId] = { start: todayStr(), done: [] };
    state.plans.active = planId;
    savePlans();
    renderPlans();
}

function togglePlanDay(planId, day) {
    const progress = state.plans.progress[planId];
    if (!progress) return;
    const idx = progress.done.indexOf(day);
    if (idx === -1) progress.done.push(day);
    else progress.done.splice(idx, 1);
    savePlans();
    if (state.route.name === 'home') renderHome();
    if (state.route.name === 'plans') renderPlans({ keepScroll: true });
}

function renderPlans({ keepScroll = false } = {}) {
    const container = $('plans-content');
    const listScroll = keepScroll && $('plan-days') ? $('plan-days').scrollTop : null;
    const active = state.plans.active ? getPlan(state.plans.active) : null;
    let html = '<h2 class="text-2xl font-bold mb-4">Reading Plans</h2>';

    if (active) {
        const progress = state.plans.progress[active.id];
        const done = new Set(progress.done);
        const pct = Math.round(done.size / active.days * 100);
        const today = calendarDay(active.id);
        const behind = Math.max(0, today - done.size);
        html += `
            <div class="card mb-6">
                <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                        <div class="text-xs uppercase tracking-wide text-amber-400">Active plan</div>
                        <div class="text-xl font-bold">${escapeHtml(active.name)}</div>
                        <div class="text-sm text-slate-400">Started ${formatPlanDate(progress.start, 0)} · ${done.size} of ${active.days} days (${pct}%)${behind ? ` · ${behind} day${behind === 1 ? '' : 's'} behind` : ''}</div>
                    </div>
                    <div class="flex gap-2">
                        <button data-action="plan-restart" data-plan="${active.id}" class="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg">Restart</button>
                        <button data-action="plan-stop" class="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg">Stop</button>
                    </div>
                </div>
                <div class="progress mb-4"><div style="width:${pct}%"></div></div>
                <div id="plan-days" class="max-h-[55vh] overflow-y-auto -mx-2 px-2">
                    ${active.schedule.map((_, d) => `
                        <label class="plan-day ${d === today ? 'today' : ''} ${done.has(d) ? 'done' : ''}" id="plan-day-${d}">
                            <input type="checkbox" class="mt-1 accent-amber-500" data-action="plan-toggle" data-plan="${active.id}" data-day="${d}" ${done.has(d) ? 'checked' : ''}>
                            <div>
                                <div class="text-xs text-slate-400">Day ${d + 1} · ${formatPlanDate(progress.start, d)}${d === today ? ' · <span class="text-amber-400">Today</span>' : ''}</div>
                                <div class="plan-readings">${planReadingLinks(active, d)}</div>
                            </div>
                        </label>`).join('')}
                </div>
            </div>`;
    }

    html += `<h3 class="text-lg font-semibold mb-3">${active ? 'Other plans' : 'Choose a plan'}</h3><div class="grid sm:grid-cols-2 gap-3">`;
    html += PLAN_DEFINITIONS.filter(p => !active || p.id !== active.id).map(def => {
        const progress = state.plans.progress[def.id];
        return `
            <div class="card flex flex-col">
                <div class="font-semibold">${escapeHtml(def.name)}</div>
                <div class="text-sm text-slate-400 flex-1 mt-1">${escapeHtml(def.description)}</div>
                ${progress ? `<div class="text-xs text-slate-500 mt-2">${progress.done.length} of ${def.days} days done</div>` : ''}
                <button data-action="plan-start" data-plan="${def.id}" class="mt-3 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg text-sm font-medium">${progress ? 'Continue' : 'Start'} plan</button>
            </div>`;
    }).join('');
    html += '</div>';
    container.innerHTML = html;

    const list = $('plan-days');
    if (!list) return;
    if (listScroll !== null) list.scrollTop = listScroll;
    else {
        const todayEl = $(`plan-day-${calendarDay(active.id)}`);
        if (todayEl) list.scrollTop = todayEl.offsetTop - list.offsetTop - 40;
    }
}

// SETTINGS & BACKUP ==============================================

function applyReadingSettings() {
    const root = document.documentElement;
    root.style.setProperty('--reading-size', `${state.settings.fontSize}px`);
    root.classList.toggle('reading-serif', state.settings.fontFamily === 'serif');
    root.dataset.readingTheme = state.settings.readingTheme;
    $('font-size-value').textContent = `${state.settings.fontSize}px`;
}

function syncSettingsControls() {
    $('setting-font-size').value = state.settings.fontSize;
    document.querySelectorAll('.segmented').forEach(group => {
        group.querySelectorAll('[data-value]').forEach(btn =>
            btn.classList.toggle('active', state.settings[group.dataset.setting] === btn.dataset.value));
    });
    const notes = Object.keys(state.notes).length;
    const highlights = Object.keys(state.highlights).length;
    const last = state.meta.lastExport ? new Date(state.meta.lastExport).toLocaleDateString() : null;
    $('backup-status').textContent = `${notes} note${notes === 1 ? '' : 's'}, ${highlights} highlight${highlights === 1 ? '' : 's'}. ` +
        (last ? `Last backup: ${last}.` : 'No backup yet.');
}

function openSettings() {
    syncSettingsControls();
    hideImportConfirm();
    openLayer('settings-modal');
}

function exportBackup() {
    downloadJson(`bible-study-backup-${todayStr()}.json`, buildBackup(state));
    state.meta.lastExport = new Date().toISOString();
    saveMeta();
    syncSettingsControls();
    showToast('Backup downloaded');
}

function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = parseBackup(JSON.parse(reader.result));
            state.pendingImport = parsed;
            const n = Object.keys(parsed.notes).length;
            const h = Object.keys(parsed.highlights).length;
            const p = Object.keys(parsed.plans.progress).length;
            $('import-summary').textContent = `This backup has ${n} note${n === 1 ? '' : 's'}, ${h} highlight${h === 1 ? '' : 's'} and ${p} reading plan${p === 1 ? '' : 's'}. Merge it with what's here, or replace everything?`;
            $('import-confirm').classList.remove('hidden');
        } catch (err) {
            showToast(err instanceof SyntaxError ? "That file isn't valid JSON." : err.message);
        }
    };
    reader.readAsText(file);
}

function hideImportConfirm() {
    state.pendingImport = null;
    $('import-confirm').classList.add('hidden');
}

function applyImport(mode) {
    const incoming = state.pendingImport;
    if (!incoming) return;
    if (mode === 'replace' && !window.confirm('Replace all your current notes, highlights and plans with this backup?')) return;

    if (mode === 'merge') {
        Object.assign(state, mergeBackup(state, incoming));
    } else {
        state.notes = incoming.notes;
        state.highlights = incoming.highlights;
        state.plans = incoming.plans;
        if (incoming.settings) state.settings = sanitizeSettings(incoming.settings);
    }
    saveNotes();
    saveHighlights();
    savePlans();
    saveSettings();
    applyReadingSettings();
    updateStudyCount();
    hideImportConfirm();
    syncSettingsControls();
    showToast(mode === 'merge' ? 'Backup merged' : 'Backup restored');
    route();
}

// OFFLINE ========================================================

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (location.protocol !== 'https:' && !local) return;
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker registration failed', e));
}

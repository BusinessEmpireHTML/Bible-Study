// localStorage access and backup export/import.
'use strict';

const STORAGE_KEYS = {
    notes: 'bible-notes',
    highlights: 'bible-highlights',
    settings: 'bible-settings',
    plans: 'bible-plans',
    lastRead: 'bible-last-read',
    meta: 'bible-meta'
};

function readStorage(key, fallback) {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : fallback;
    } catch (e) {
        console.warn(`Could not read ${key} from localStorage`, e);
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.warn(`Could not save ${key} to localStorage`, e);
        return false;
    }
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function buildBackup({ notes, highlights, plans, settings }) {
    return {
        app: 'bible-study',
        version: 1,
        exportedAt: new Date().toISOString(),
        notes, highlights, plans, settings
    };
}

// Validate an imported backup and keep only well-formed entries. Throws on unusable files.
function parseBackup(data) {
    if (!isPlainObject(data) || data.app !== 'bible-study') {
        throw new Error("This doesn't look like a Bible Study backup file.");
    }
    const notes = {};
    if (isPlainObject(data.notes)) {
        Object.entries(data.notes).forEach(([k, v]) => { if (typeof v === 'string' && v.trim()) notes[k] = v; });
    }
    const highlights = {};
    if (isPlainObject(data.highlights)) {
        Object.entries(data.highlights).forEach(([k, v]) => { if (HIGHLIGHT_COLORS[v]) highlights[k] = v; });
    }
    const plans = { active: null, progress: {} };
    if (isPlainObject(data.plans)) {
        if (getPlan(data.plans.active)) plans.active = data.plans.active;
        if (isPlainObject(data.plans.progress)) {
            Object.entries(data.plans.progress).forEach(([id, p]) => {
                const plan = getPlan(id);
                if (!plan || !isPlainObject(p) || !/^\d{4}-\d{2}-\d{2}$/.test(p.start)) return;
                const done = Array.isArray(p.done) ? p.done.filter(d => Number.isInteger(d) && d >= 0 && d < plan.days) : [];
                plans.progress[id] = { start: p.start, done: [...new Set(done)] };
            });
        }
    }
    const settings = isPlainObject(data.settings) ? data.settings : null;
    return { notes, highlights, plans, settings };
}

// Combine an imported backup with current data. Imported highlights win; differing notes are kept together.
function mergeBackup(current, incoming) {
    const notes = { ...current.notes };
    Object.entries(incoming.notes).forEach(([k, v]) => {
        if (!notes[k] || notes[k] === v) notes[k] = v;
        else if (!notes[k].includes(v)) notes[k] = `${notes[k]}\n\n---\n\n${v}`;
    });
    const highlights = { ...current.highlights, ...incoming.highlights };
    const progress = { ...current.plans.progress };
    Object.entries(incoming.plans.progress).forEach(([id, p]) => {
        const mine = progress[id];
        progress[id] = mine
            ? { start: mine.start < p.start ? mine.start : p.start, done: [...new Set([...mine.done, ...p.done])] }
            : p;
    });
    const plans = { active: current.plans.active || incoming.plans.active, progress };
    return { notes, highlights, plans };
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

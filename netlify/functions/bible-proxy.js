// bible-proxy.js - forwards requests to bolls.life and normalizes the responses.
//
//   ?book=43&chapter=3&version=KJV               -> { verses: [{ verse, text }] }
//   ?book=43&chapter=3&type=original&testament=nt -> same, Hebrew (WLC) or Greek (TR)
//   ?action=search&version=KJV&q=love&page=1      -> { results: [{ book, chapter, verse, text }], total }
//   ?action=define&q=G3056                         -> { entry: { topic, lexeme, transliteration, ... } | null }

const BOLLS = 'https://bolls.life';

// Translations the frontend may request (values are bolls.life codes).
const ALLOWED_TRANSLATIONS = ['KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'JPKJV', 'CUV', 'BTX3', 'VULG'];
const SEARCH_PAGE_SIZE = 50;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

const reply = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { ...headers, ...extraHeaders },
  body: JSON.stringify(body)
});

async function getJson(url) {
  console.log('Fetching from Bolls:', url);
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Bolls API Error: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function getChapter({ version, book, chapter, type, testament }) {
  const bookNum = Number(book);
  const chapterNum = Number(chapter);
  if (!Number.isInteger(bookNum) || bookNum < 1 || bookNum > 66 ||
      !Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > 150) {
    return reply(400, { error: 'Missing or invalid book/chapter parameter' });
  }

  // Original language: WLC (Hebrew) for the Old Testament, TR (Greek) for the New.
  const translationCode = type === 'original'
    ? (testament === 'ot' ? 'WLC' : 'TR')
    : (ALLOWED_TRANSLATIONS.includes(version) ? version : 'KJV');

  const data = await getJson(`${BOLLS}/get-chapter/${translationCode}/${bookNum}/${chapterNum}/`);

  // Bolls returns [{ pk, verse, text }, ...]; text may contain HTML (footnotes,
  // Strong's numbers). The frontend strips and escapes it before display.
  return reply(200, {
    verses: (Array.isArray(data) ? data : []).map(v => ({
      verse: v.verse,
      text: v.text_html || v.text || ''
    }))
  }, { 'Cache-Control': 'public, max-age=86400' });
}

async function search({ version, q, page }) {
  const translationCode = ALLOWED_TRANSLATIONS.includes(version) ? version : 'KJV';
  const query = String(q || '').trim();
  const pageNum = Math.max(1, Math.min(100, parseInt(page, 10) || 1));
  if (query.length < 2 || query.length > 100) {
    return reply(400, { error: 'Search text must be 2-100 characters' });
  }

  const params = new URLSearchParams({
    search: query, match_case: 'false', match_whole: 'false',
    limit: String(SEARCH_PAGE_SIZE), page: String(pageNum)
  });

  let data;
  try {
    data = await getJson(`${BOLLS}/v2/find/${translationCode}?${params}`);
  } catch (e) {
    // Older endpoint returns a plain array of every match.
    const all = await getJson(`${BOLLS}/find/${translationCode}/?search=${encodeURIComponent(query)}&match_case=false&match_whole=false`);
    const list = Array.isArray(all) ? all : [];
    data = { results: list.slice((pageNum - 1) * SEARCH_PAGE_SIZE, pageNum * SEARCH_PAGE_SIZE), total: list.length };
  }

  const results = (Array.isArray(data) ? data : data.results || []).map(r => ({
    book: r.book, chapter: r.chapter, verse: r.verse, text: r.text || ''
  })).filter(r => r.book && r.chapter && r.verse);
  const total = Array.isArray(data) ? results.length : (Number(data.total) || results.length);

  return reply(200, { results, total, page: pageNum, pageSize: SEARCH_PAGE_SIZE });
}

async function define({ q }) {
  const number = String(q || '').trim().toUpperCase();
  if (!/^[HG]\d{1,5}$/.test(number)) {
    return reply(400, { error: "Expected a Strong's number like H7225 or G3056" });
  }
  // BDBT = Brown-Driver-Briggs (Hebrew) + Thayer (Greek), keyed by Strong's number.
  const data = await getJson(`${BOLLS}/dictionary-definition/BDBT/${number}/`);
  const list = Array.isArray(data) ? data : [];
  const entry = list.find(e => String(e.topic || '').toUpperCase() === number) || list[0] || null;
  return reply(200, { entry }, { 'Cache-Control': 'public, max-age=604800' });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return reply(405, { error: 'Method not allowed' });
  }

  const params = event.queryStringParameters || {};
  try {
    if (params.action === 'search') return await search(params);
    if (params.action === 'define') return await define(params);
    return await getChapter(params);
  } catch (error) {
    console.error('Function error:', error);
    return reply(error.status || 500, { error: error.message });
  }
};

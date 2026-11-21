// bible-proxy.js
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const { version, book, chapter, type, testament } = event.queryStringParameters || {};

  const bookNum = Number(book);
  const chapterNum = Number(chapter);
  if (!Number.isInteger(bookNum) || bookNum < 1 || bookNum > 66 ||
      !Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > 150) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing or invalid book/chapter parameter' })
    };
  }

  // Translations the frontend may request (values are bolls.life codes).
  const ALLOWED_TRANSLATIONS = ['KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'JPKJV', 'CUV', 'BTX3', 'VULG'];

  try {
    // Original language: WLC (Hebrew) for the Old Testament, TR (Greek) for the New.
    const translationCode = type === 'original'
      ? (testament === 'ot' ? 'WLC' : 'TR')
      : (ALLOWED_TRANSLATIONS.includes(version) ? version : 'KJV');

    // Format: https://bolls.life/get-chapter/{translation}/{book_id 1-66}/{chapter}/
    const url = `https://bolls.life/get-chapter/${translationCode}/${bookNum}/${chapterNum}/`;
    
    console.log('Fetching from Bolls:', url);

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Bolls API error:', response.status);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Bolls API Error: ${response.status}` })
      };
    }

    const data = await response.json();

    // Bolls returns [{ pk, verse, text }, ...]; text may contain HTML (footnotes,
    // Strong's numbers). The frontend strips and escapes it before display.
    const formattedData = {
        verses: (Array.isArray(data) ? data : []).map(v => ({
            verse: v.verse,
            text: v.text_html || v.text || ''
        }))
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(formattedData)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

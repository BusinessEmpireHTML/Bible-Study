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

  if (!book || !chapter) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing book or chapter parameter' })
    };
  }

  try {
    // 1. Determine the Translation Code
    let translationCode = 'KJV'; // Default

    if (type === 'original') {
      // WLC for Old Testament (Hebrew), TR for New Testament (Greek)
      // Bolls Life uses 'WLC' and 'TR' codes standardly
      translationCode = (testament === 'ot' || testament === 'Old Testament') ? 'WLC' : 'TR';
    } else {
      // Map frontend version names to Bolls Life codes
      const versionMap = {
        'KJV': 'KJV',
        'WEB': 'WEB',
        'BBE': 'BSB',
        'ASV': 'ASV',
        'YLT': 'YLT',
        'JPKJV': 'JPKJV',
        'CUV': 'CUV',
        'RVR': 'BTX3',
        'VUL': 'VUlG'
      };
      translationCode = versionMap[version] || 'KJV';
    }

    // 2. Construct Bolls Life URL
    // Format: https://bolls.life/get-chapter/{translation}/{book_id}/{chapter}/
    // We pass the 'book' parameter directly. The frontend must now send IDs (1-66) 
    // or valid Bolls abbreviations (GEN, EXO).
    const url = `https://bolls.life/get-chapter/${translationCode}/${book}/${chapter}/`;
    
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

    // 3. Normalize Data
    // Bolls returns an array of objects. We return it as-is or wrapped.
    // The frontend expects { verses: [...] } or just the array depending on previous logic.
    // Let's return a consistent structure matching what your frontend consumes.
    
    // Bolls structure: [{ pk: 1, verse: 1, text: "..." }, ...]
    // Your frontend expects: { verses: [ ... ] } in some places, so let's wrap it to be safe 
    // OR update frontend to handle the array. 
    // To match your existing renderVerses, let's return the object structure it expects.
    
    const formattedData = {
        verses: data.map(v => ({
            verse: v.verse,
            text: v.text_html || v.text // Bolls often sends HTML text
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

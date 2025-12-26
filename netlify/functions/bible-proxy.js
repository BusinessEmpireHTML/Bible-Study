// Using multiple Bible APIs for complete coverage
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

  const { version, book, chapter, type } = event.queryStringParameters || {};

  if (!book || !chapter) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing book or chapter parameter' })
    };
  }

  try {
    // Handle original languages (Hebrew/Greek) from Bolls Life
    if (type === 'original') {
      const testament = event.queryStringParameters.testament;
      
            // Bolls Life uses specific translation codes:
      // WLC = Westminster Leningrad Codex (Hebrew)
      // TR  = Textus Receptus (Greek) 
      const languageCode = testament === 'ot' ? 'WLC' : 'LXX';
      const url = `https://bolls.life/get-chapter/${languageCode}/${book}/${chapter}/`;
      
      console.log('Fetching original from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('Bolls API error:', response.status);
        // Return empty array instead of error so the page still works
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify([])
        };
      }

      const data = await response.json();
      console.log('Bolls API success');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // Handle English translations from Bible-API.com
    const versionMap = {
      'KJV': 'kjv',
      'WEB': 'web',
      'BBE': 'bbe',
      'ASV': 'asv',
      'YLT': 'ylt'
    };
    
    let formattedBook = book.replace(/\s+/g, '');
    formattedBook = formattedBook
      .replace(/^1/, '1%20')
      .replace(/^2/, '2%20')
      .replace(/^3/, '3%20');
    
    if (book === 'SongofSolomon') {
      formattedBook = 'Song%20of%20Solomon';
    }
    
    const apiVersion = versionMap[version] || 'kjv';
    const url = `https://bible-api.com/${formattedBook}${chapter}?translation=${apiVersion}`;
    
    console.log('Fetching English from:', url);
    
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bible API error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `API Error: ${response.status}`, details: errorText })
      };
    }

    const data = await response.json();
    console.log('Bible API success');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};

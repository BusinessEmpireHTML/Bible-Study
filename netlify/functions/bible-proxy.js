// Using Bible API - completely free, no API key needed
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

  const { version, book, chapter } = event.queryStringParameters || {};

  if (!book || !chapter) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing book or chapter parameter' })
    };
  }

  try {
    // Fetch from Bible API (supports KJV, WEB, and more)
    const versionMap = {
      'KJV': 'kjv',
      'WEB': 'web',
      'BBE': 'bbe' // Bible in Basic English as alternative
    };
    
    const apiVersion = versionMap[version] || 'kjv';
    const url = `https://bible-api.com/${book}+${chapter}?translation=${apiVersion}`;
    
    console.log('Fetching:', url);
    
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
    console.log('API Success');

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
      body: JSON.stringify({ error: error.message })
    };
  }
};

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get the API key from environment variable
  const apiKey = process.env.BIBLE_API_KEY;
  
  console.log('API Key exists:', !!apiKey);
  console.log('API Key length:', apiKey ? apiKey.length : 0);
  
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'API key not configured. Please set BIBLE_API_KEY in Netlify environment variables.',
        debug: {
          envVars: Object.keys(process.env).filter(k => k.includes('BIBLE'))
        }
      })
    };
  }

  // Get the endpoint from query parameters
  const { endpoint } = event.queryStringParameters || {};

  if (!endpoint) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing endpoint parameter' })
    };
  }

  const apiUrl = `https://api.scripture.api.bible/v1${endpoint}`;
  console.log('Fetching:', apiUrl);

  try {
    // Make the request to API.Bible
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'api-key': apiKey.trim(),
        'accept': 'application/json'
      }
    });

    console.log('API Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API.Bible error:', response.status, errorText);
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `API Error: ${response.status}`,
          details: errorText,
          url: apiUrl,
          keyLength: apiKey.length
        })
      };
    }

    const data = await response.json();
    console.log('API Success:', !!data);

    // Return the data
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
      body: JSON.stringify({ 
        error: error.message,
        stack: error.stack
      })
    };
  }
};

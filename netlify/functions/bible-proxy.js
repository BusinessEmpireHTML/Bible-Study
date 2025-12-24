exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get the API key and endpoint from query parameters
  const { apiKey, endpoint } = event.queryStringParameters;

  if (!apiKey || !endpoint) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing apiKey or endpoint parameter' })
    };
  }

  try {
    // Make the request to API.Bible
    const response = await fetch(`https://api.scripture.api.bible/v1${endpoint}`, {
      headers: {
        'api-key': apiKey
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `API Error: ${response.status}` })
      };
    }

    const data = await response.json();

    // Return the data with CORS headers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
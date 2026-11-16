export async function onRequest(context) {
  const url = new URL(context.request.url);
  const apiPath = url.pathname.replace(/^\/api/, '');
  const targetUrl = 'https://apiv2.mkgplayers.com/api' + apiPath + url.search;

  // Handle CORS preflight (OPTIONS) directly at the Cloudflare Edge
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': context.request.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Clone headers and spoof Origin to match AWS server's whitelist
  const headers = new Headers(context.request.headers);
  headers.set('Origin', 'https://mkgplayers.com');
  headers.set('Host', 'apiv2.mkgplayers.com');

  const modifiedRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    redirect: 'follow',
  });

  try {
    const response = await fetch(modifiedRequest);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', context.request.headers.get('Origin') || '*');
    newHeaders.set('Access-Control-Allow-Credentials', 'true');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

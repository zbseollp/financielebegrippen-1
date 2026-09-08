/**
 * Serve Astro dist/ assets and quietly handle legacy WordPress probes.
 *
 * Monitors still hit /wp-json and ?rest_route= after the WP → Astro move.
 * A blank Cloudflare asset 404 is reported as "REST API not found".
 */
function isWordpressRest(url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/wp-json' || path.startsWith('/wp-json/')) return true;
  if (path === '/xmlrpc.php') return true;
  if (url.searchParams.has('rest_route')) return true;
  return false;
}

function wantsJson(request) {
  const accept = (request.headers.get('accept') || '').toLowerCase();
  if (accept.includes('text/html') && !accept.includes('application/json')) return false;
  if (accept.includes('application/json')) return true;
  return true;
}

function wordpressRestStubResponse(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const body = JSON.stringify({
    name: 'FinancieleBegrippen',
    description: 'Financiële begrippen, tips en uitleg',
    url: origin,
    home: origin,
    namespaces: [],
    authentication: {},
    routes: {},
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'x-robots-tag': 'noindex',
    },
  });
}

function wordpressRestRedirectHome(request) {
  return Response.redirect(new URL('/', request.url).toString(), 301);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (isWordpressRest(url)) {
      if (path === '/xmlrpc.php') {
        return wantsJson(request)
          ? new Response('', { status: 405, headers: { allow: 'GET, HEAD' } })
          : wordpressRestRedirectHome(request);
      }
      return wantsJson(request)
        ? wordpressRestStubResponse(request)
        : wordpressRestRedirectHome(request);
    }

    // Canonical article URLs are /{slug}/ — keep old /blog/{slug}/ working.
    const blogArticle = path.match(/^\/blog\/(.+)$/);
    if (blogArticle && !/^\d+$/.test(blogArticle[1])) {
      return Response.redirect(new URL('/' + blogArticle[1] + '/', url).toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};

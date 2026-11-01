export interface IndexBucket {
  get(key: string): Promise<{ body: ReadableStream; httpEtag: string } | null>;
}

const INDEX_FILE = /^\/index\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.json\.gz$/;
const MAX_AGE_SECONDS = 60 * 60;

const CORS = { 'access-control-allow-origin': '*' };

const HEADERS = {
  'content-type': 'application/gzip',
  'cache-control': `public, max-age=${MAX_AGE_SECONDS}`,
  ...CORS
};

async function readObject(bucket: IndexBucket | undefined, key: string) {
  if (!bucket) return null;
  try {
    return await bucket.get(key);
  } catch {
    return undefined;
  }
}

export function isIndexFile(pathname: string): boolean {
  return INDEX_FILE.test(pathname);
}

export async function serveIndexFile(
  request: Request,
  bucket: IndexBucket | undefined
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: 'GET, HEAD', ...CORS }
    });
  }
  const key = new URL(request.url).pathname.slice(1);
  const object = await readObject(bucket, key);
  if (object === undefined) {
    return new Response('Storage unavailable', {
      status: 503,
      headers: { 'retry-after': '60', ...CORS }
    });
  }
  if (object === null) {
    return new Response('Not found', { status: 404, headers: CORS });
  }
  const headers = { ...HEADERS, etag: object.httpEtag };
  if (request.method === 'HEAD') {
    await object.body.cancel();
    return new Response(null, { headers });
  }
  return new Response(object.body, { headers });
}

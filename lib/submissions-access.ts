import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getSubmissionsApiConfig } from './server-config.mjs';

const hash = (value: string) => createHash('sha256').update(value).digest();

export function submissionsAccess(request: Request, method: 'GET' | 'PATCH') {
  const mode = method === 'PATCH' ? 'write' : 'read';
  const { key, origins } = getSubmissionsApiConfig(mode);
  const origin = request.headers.get('origin');
  const allowed = !origin || origin === new URL(request.url).origin || origins.includes(origin);
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin, Authorization', 'X-Content-Type-Options': 'nosniff' });
  if (origin && allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', `${method}, OPTIONS`);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  const reply = (message: string, status: number) => Response.json({ message }, { status, headers });
  const authorize = () => {
    if (!allowed) return reply('Origin not allowed.', 403);
    if (!key) return reply(`Submissions ${mode} API is not configured.`, 503);
    const supplied = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1] || '';
    if (!timingSafeEqual(hash(supplied), hash(key))) {
      headers.set('WWW-Authenticate', 'Bearer');
      return reply('Invalid or missing API key.', 401);
    }
  };
  return { headers, reply, authorize, preflight: () => new Response(null, { status: allowed ? 204 : 403, headers }) };
}

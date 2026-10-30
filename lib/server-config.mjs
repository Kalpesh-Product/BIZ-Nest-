// Server/CLI configuration only. Do not import into client components or expose
// these values through next.config.env / NEXT_PUBLIC_ variables.
function integer(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}: expected an integer between ${min} and ${max}.`);
  return value;
}

function httpUrl(name, fallback = '') {
  const value = process.env[name]?.trim() || fallback;
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url;
  } catch { throw new Error(`Invalid ${name}: expected an HTTP(S) URL without embedded credentials.`); }
}

export function getPort() { return integer('PORT', 3011, 1, 65535); }

export function getSiteUrl() {
  const url = httpUrl('SITE_URL', 'https://biznest.co.in');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid SITE_URL: use the site origin without a path, query or fragment.');
  return url.origin;
}

export function getDatabaseConfig() {
  const uri = process.env.MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017';
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/.test(uri)) throw new Error('Invalid MONGODB_URI: expected a MongoDB connection string.');
  const name = process.env.MONGODB_DB?.trim() || 'biznest';
  if (/[\/\\."$*<>:|?\s]/.test(name) || Buffer.byteLength(name) > 63) throw new Error('Invalid MONGODB_DB: expected a valid database name.');
  return { uri, name, options: {
    maxPoolSize: integer('MONGODB_MAX_POOL_SIZE', 10, 1, 100),
    serverSelectionTimeoutMS: integer('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 5000, 100, 120000),
    connectTimeoutMS: integer('MONGODB_CONNECT_TIMEOUT_MS', 5000, 100, 120000),
  } };
}

export function getInquiryConfig() {
  const resumeMaxBytes = integer('MAX_RESUME_BYTES', 5_000_000, 1, 10_000_000);
  const requestMaxBytes = integer('MAX_REQUEST_BYTES', 6_000_000, 1024, 12_000_000);
  if (requestMaxBytes < resumeMaxBytes + 65536) throw new Error('MAX_REQUEST_BYTES must allow MAX_RESUME_BYTES plus at least 65536 bytes for multipart form fields.');
  const webhook = httpUrl('INQUIRY_WEBHOOK_URL');
  return {
    resumeMaxBytes, requestMaxBytes,
    rateLimitMax: integer('INQUIRY_RATE_LIMIT_MAX', 10, 1, 10000),
    rateLimitWindowMs: integer('INQUIRY_RATE_LIMIT_WINDOW_MS', 900000, 1000, 86400000),
    webhookUrl: webhook ? webhook.href : '',
    webhookToken: process.env.INQUIRY_WEBHOOK_TOKEN || '',
    webhookTimeoutMs: integer('INQUIRY_WEBHOOK_TIMEOUT_MS', 15000, 100, 60000),
  };
}

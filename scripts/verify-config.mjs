import assert from 'node:assert/strict';
import { getPort, getSiteUrl, getDatabaseConfig, getInquiryConfig } from '../lib/server-config.mjs';

const names = ['PORT', 'SITE_URL', 'MONGODB_URI', 'MONGODB_DB', 'MONGODB_MAX_POOL_SIZE', 'MONGODB_CONNECT_TIMEOUT_MS', 'MONGODB_SERVER_SELECTION_TIMEOUT_MS', 'MAX_REQUEST_BYTES', 'MAX_RESUME_BYTES', 'INQUIRY_RATE_LIMIT_MAX', 'INQUIRY_RATE_LIMIT_WINDOW_MS', 'INQUIRY_WEBHOOK_URL', 'INQUIRY_WEBHOOK_TOKEN', 'INQUIRY_WEBHOOK_TIMEOUT_MS'];
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
try {
  for (const name of names) delete process.env[name];
  assert.equal(getPort(), 3011);
  assert.equal(getSiteUrl(), 'https://biznest.co.in');
  assert.equal(getDatabaseConfig().name, 'biznest');
  assert.equal(getInquiryConfig().requestMaxBytes, 6000000);
  process.env.PORT = '3018'; assert.equal(getPort(), 3018);
  process.env.PORT = '0'; assert.throws(getPort, /PORT/); delete process.env.PORT;
  process.env.SITE_URL = 'https://example.test/'; assert.equal(getSiteUrl(), 'https://example.test');
  process.env.SITE_URL = 'https://example.test/path'; assert.throws(getSiteUrl, /SITE_URL/); delete process.env.SITE_URL;
  process.env.MONGODB_DB = 'invalid/name'; assert.throws(getDatabaseConfig, /MONGODB_DB/); delete process.env.MONGODB_DB;
  process.env.MONGODB_MAX_POOL_SIZE = '-1'; assert.throws(getDatabaseConfig, /MONGODB_MAX_POOL_SIZE/); delete process.env.MONGODB_MAX_POOL_SIZE;
  process.env.MAX_REQUEST_BYTES = '1024'; assert.throws(getInquiryConfig, /MAX_REQUEST_BYTES/); delete process.env.MAX_REQUEST_BYTES;
  process.env.MAX_RESUME_BYTES = '2000000'; process.env.MAX_REQUEST_BYTES = '3000000';
  process.env.INQUIRY_RATE_LIMIT_MAX = '20'; process.env.INQUIRY_RATE_LIMIT_WINDOW_MS = '60000';
  assert.equal(getInquiryConfig().resumeMaxBytes, 2000000);
  assert.equal(getInquiryConfig().rateLimitMax, 20);
  assert.equal(getInquiryConfig().rateLimitWindowMs, 60000);
  process.env.INQUIRY_WEBHOOK_URL = 'https://user:private-secret@example.test';
  assert.throws(getInquiryConfig, error => error.message.includes('INQUIRY_WEBHOOK_URL') && !error.message.includes('private-secret'));
  process.env.INQUIRY_WEBHOOK_URL = ''; assert.equal(getInquiryConfig().webhookUrl, '');
  console.log('PASS: defaults, environment overrides, port/origin/database validation, operational limits, and secret-safe diagnostics.');
} finally {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}

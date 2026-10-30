import nextEnv from '@next/env';
import { createRequire } from 'node:module';
import { getPort } from '../lib/server-config.mjs';

const command = process.argv[2];
if (!['dev', 'start'].includes(command)) throw new Error('Usage: node scripts/serve.mjs dev|start [Next.js CLI options]');
process.env.NODE_ENV = command === 'dev' ? 'development' : 'production';
// Next starts listening before it normally loads .env files. Load them first so
// PORT in .env works, then invoke the installed official CLI in this process.
nextEnv.loadEnvConfig(process.cwd(), command === 'dev');
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
process.argv = [process.execPath, nextBin, command, '--port', String(getPort()), ...process.argv.slice(3)];
require(nextBin);

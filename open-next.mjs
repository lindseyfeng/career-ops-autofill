// Open the next N queued applications in Chrome (default 10; daily cap DAILY_MAX=20 in .env, --force ignores it).
// Usage: node open-next.mjs [N] [--force]
import { QUEUE, log, openBatch } from './lib.mjs';

const n = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 10);
log(`${QUEUE.load().length} in queue`);
if (!openBatch(n, { force: process.argv.includes('--force') })) log('nothing opened (daily cap reached or queue empty)');

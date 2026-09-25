import 'dotenv/config';
import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

const queue = new Queue('mail', { connection });
const ago = (ts) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

try {
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
  );
  console.log('\nmail queue counts:', counts);

  for (const [label, getter] of [
    ['Failed', (a, b) => queue.getFailed(a, b)],
    ['Waiting', (a, b) => queue.getWaiting(a, b)],
    ['Completed', (a, b) => queue.getCompleted(a, b)],
  ]) {
    const jobs = await getter(0, 5);
    if (jobs.length === 0) {
      console.log(`\nNo ${label.toLowerCase()} jobs.`);
      continue;
    }
    console.log(`\n${label} jobs (showing ${jobs.length}):`);
    for (const j of jobs) {
      const when = j.finishedOn
        ? `finished ${ago(j.finishedOn)}`
        : 'not finished';
      const extra =
        label === 'Failed' ? ` reason=${j.failedReason}` : ` ${when}`;
      console.log(
        `  - id=${j.id} name=${j.name} attempts=${j.attemptsMade} to=${j.data?.to}${extra}`,
      );
    }
  }
  console.log('');
} finally {
  await queue.close();
}

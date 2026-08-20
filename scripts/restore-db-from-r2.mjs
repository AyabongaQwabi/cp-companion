#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import { gunzipSync } from 'zlib';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * Pulls a backup created by scripts/backup-db-to-r2.mjs (or the daily cron,
 * /api/cron/db-backup) from Cloudflare R2 and restores it into MongoDB. Prompts for
 * confirmation before writing anything — this is a destructive operation by nature (it can
 * overwrite live documents), so there's no --yes flag to skip that on purpose.
 *
 * Usage:
 *   node scripts/restore-db-from-r2.mjs --list
 *     Lists available backup run timestamps, newest first.
 *
 *   node scripts/restore-db-from-r2.mjs --run <timestamp|latest> --db production
 *     Restores production from the given run (or the most recent run) by upserting every
 *     document back in by _id. Existing documents not present in the backup are left untouched
 *     (merge, not a wipe) unless --drop is also passed.
 *
 *   node scripts/restore-db-from-r2.mjs --run latest --db cp_companion --drop
 *     Drops (empties) every collection in the backup before restoring it — a true "reset to
 *     snapshot" instead of a merge.
 */
const BACKUP_PREFIX = 'db-backups/';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function parseArgs(argv) {
  const args = { list: false, run: null, db: null, drop: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--list') args.list = true;
    else if (argv[i] === '--run') args.run = argv[++i];
    else if (argv[i] === '--db') args.db = argv[++i];
    else if (argv[i] === '--drop') args.drop = true;
  }
  return args;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

for (const key of ['DATABASE_URL', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) {
  if (!process.env[key]) {
    log(`ERROR: ${key} is not set (checked process.env and .env.local)`);
    process.exit(1);
  }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const bucket = process.env.R2_BUCKET_NAME;

async function listBackupRuns() {
  const runTimestamps = new Set();
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX, ContinuationToken: token })
    );
    for (const obj of page.Contents ?? []) {
      const match = (obj.Key ?? '').slice(BACKUP_PREFIX.length).match(/^([^/]+)\//);
      if (match) runTimestamps.add(match[1]);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return Array.from(runTimestamps).sort().reverse();
}

async function listObjectsForRun(run) {
  const runPrefix = `${BACKUP_PREFIX}${run}/`;
  const keys = [];
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: runPrefix, ContinuationToken: token })
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  const runs = await listBackupRuns();
  if (runs.length === 0) {
    log('No backups found.');
  } else {
    log(`Found ${runs.length} backup run(s), newest first:`);
    runs.forEach((run) => console.log(`  ${run}`));
  }
  process.exit(0);
}

if (!args.db || (args.db !== 'production' && args.db !== 'cp_companion')) {
  log('ERROR: --db must be "production" or "cp_companion" (or use --list to see available backups)');
  process.exit(1);
}
if (!args.run) {
  log('ERROR: --run <timestamp|latest> is required');
  process.exit(1);
}

let run = args.run;
if (run === 'latest') {
  const runs = await listBackupRuns();
  if (runs.length === 0) {
    log('ERROR: no backups found');
    process.exit(1);
  }
  run = runs[0];
}

const dbPrefix = `${BACKUP_PREFIX}${run}/${args.db}/`;
const objectKeys = (await listObjectsForRun(run)).filter((key) => key.startsWith(dbPrefix));

if (objectKeys.length === 0) {
  log(`ERROR: no backup objects found for run "${run}", db "${args.db}"`);
  process.exit(1);
}

log('About to restore', {
  run,
  db: args.db,
  collections: objectKeys.map((k) => k.slice(dbPrefix.length).replace(/\.jsonl\.gz$/, '')),
  mode: args.drop ? 'DROP then restore (destroys anything not in the backup)' : 'merge (upsert by _id)',
  target: process.env.DATABASE_URL.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@'),
});

const proceed = await confirm('Continue? [y/N] ');
if (!proceed) {
  log('Aborted.');
  process.exit(1);
}

const mongoClient = await new MongoClient(process.env.DATABASE_URL).connect();
const db = mongoClient.db(args.db);

for (const objectKey of objectKeys) {
  const collectionName = objectKey.slice(dbPrefix.length).replace(/\.jsonl\.gz$/, '');
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  const gzipped = await streamToBuffer(obj.Body);
  const ndjson = gunzipSync(gzipped).toString('utf8');
  const docs = ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => EJSON.parse(line));

  const collection = db.collection(collectionName);
  if (args.drop) {
    await collection.deleteMany({});
  }

  let written = 0;
  if (docs.length > 0) {
    const ops = docs.map((doc) => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
    }));
    const result = await collection.bulkWrite(ops, { ordered: false });
    written = result.upsertedCount + result.modifiedCount;
  }

  log(`  ${collectionName}: ${docs.length} documents in backup, ${written} written`);
}

log('Restore complete.');
await mongoClient.close();

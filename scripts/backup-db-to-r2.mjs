#!/usr/bin/env node

import fs from 'fs';
import { gzipSync } from 'zlib';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

/**
 * Manually runs the same backup the daily cron does (/api/cron/db-backup, src/lib/db-backup.ts)
 * from your machine instead of Vercel — dumps production + cp_companion to gzipped EJSON and
 * uploads to Cloudflare R2, then prunes to the 3 most recent runs. Logic is duplicated here rather
 * than imported from src/lib/db-backup.ts because that file is TypeScript with `@/*` path
 * aliases, and scripts/*.mjs in this repo run as plain Node ESM with no TS/path-alias loader
 * (same constraint as every other scripts/backfill-*.mjs file).
 *
 * Usage:
 *   npm run backup:run
 */
const RETAINED_BACKUPS = 3;
const BACKUP_PREFIX = 'db-backups/';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
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

const mongoClient = await new MongoClient(process.env.DATABASE_URL).connect();

async function dumpDatabase(dbName, runPrefix) {
  const db = mongoClient.db(dbName);
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  log(`Dumping database '${dbName}'`, { collections: collections.length });

  for (const { name: collectionName } of collections) {
    const docs = await db.collection(collectionName).find({}).toArray();
    const ndjson = docs.map((doc) => EJSON.stringify(doc)).join('\n');
    const gzipped = gzipSync(Buffer.from(ndjson, 'utf8'));

    const objectKey = `${runPrefix}${dbName}/${collectionName}.jsonl.gz`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: gzipped,
        ContentType: 'application/gzip',
        ContentEncoding: 'gzip',
      })
    );
    log(`  ${collectionName}: ${docs.length} documents -> ${objectKey}`);
  }
}

async function pruneOldBackups() {
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

  const sortedRuns = Array.from(runTimestamps).sort().reverse();
  const runsToDelete = sortedRuns.slice(RETAINED_BACKUPS);

  for (const run of runsToDelete) {
    const runPrefix = `${BACKUP_PREFIX}${run}/`;
    const keysToDelete = [];
    let innerToken;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: runPrefix, ContinuationToken: innerToken })
      );
      for (const obj of page.Contents ?? []) {
        if (obj.Key) keysToDelete.push({ Key: obj.Key });
      }
      innerToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (innerToken);

    for (let i = 0; i < keysToDelete.length; i += 1000) {
      await s3.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keysToDelete.slice(i, i + 1000) } })
      );
    }
    log(`Deleted old backup run '${run}' (${keysToDelete.length} objects)`);
  }

  return { keptRuns: sortedRuns.slice(0, RETAINED_BACKUPS), deletedRuns: runsToDelete };
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runPrefix = `${BACKUP_PREFIX}${timestamp}/`;

log('Backup starting', { runPrefix });
await dumpDatabase(process.env.SELECTED_DB || 'production', runPrefix);
await dumpDatabase(process.env.COMPANION_DB || 'cp_companion', runPrefix);

const retention = await pruneOldBackups();
log('Backup complete', { runPrefix, ...retention });

await mongoClient.close();

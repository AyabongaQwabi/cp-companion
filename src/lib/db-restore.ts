import { gunzipSync } from 'zlib';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { EJSON } from 'bson';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import type { Db } from 'mongodb';

const BACKUP_PREFIX = 'db-backups/';

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not all set');
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucketName() {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error('R2_BUCKET_NAME is not set');
  }
  return bucket;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Lists available backup run timestamps, newest first. */
export async function listBackupRuns(): Promise<string[]> {
  const client = getR2Client();
  const bucket = getBucketName();
  const runTimestamps = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX, ContinuationToken: continuationToken })
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key ?? '';
      const match = key.slice(BACKUP_PREFIX.length).match(/^([^/]+)\//);
      if (match) runTimestamps.add(match[1]);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return Array.from(runTimestamps).sort().reverse();
}

/** Lists the db/collection.jsonl.gz object keys that make up one backup run. */
export async function listBackupObjects(run: string): Promise<string[]> {
  const client = getR2Client();
  const bucket = getBucketName();
  const runPrefix = `${BACKUP_PREFIX}${run}/`;
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: runPrefix, ContinuationToken: continuationToken })
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function restoreCollection(db: Db, objectKey: string, collectionName: string, drop: boolean) {
  const client = getR2Client();
  const bucket = getBucketName();

  const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  const gzipped = await streamToBuffer(obj.Body as NodeJS.ReadableStream);
  const ndjson = gunzipSync(gzipped).toString('utf8');

  const docs = ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => EJSON.parse(line));

  const collection = db.collection(collectionName);
  if (drop) {
    await collection.deleteMany({});
  }

  let restored = 0;
  if (docs.length > 0) {
    // Upserts by _id: safe to re-run, and merges cleanly when drop=false.
    const ops = docs.map((doc) => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
    }));
    const result = await collection.bulkWrite(ops, { ordered: false });
    restored = result.upsertedCount + result.modifiedCount;
  }

  return { collection: collectionName, documents: docs.length, written: restored };
}

/**
 * Restores one backup run's db/collection.jsonl.gz objects into the live database of the same
 * name. targetDb lets a caller restore production's dump into cp_companion (or vice versa) for
 * inspection, but defaults to the source db so a plain restore goes back where it came from.
 */
export async function runDbRestore(opts: {
  run: string;
  dbName: 'production' | 'cp_companion';
  drop?: boolean;
}) {
  const { run, dbName, drop = false } = opts;
  const objectKeys = await listBackupObjects(run);
  const dbPrefix = `${BACKUP_PREFIX}${run}/${dbName}/`;
  const dbObjectKeys = objectKeys.filter((key) => key.startsWith(dbPrefix));

  if (dbObjectKeys.length === 0) {
    throw new Error(`No backup objects found for run "${run}", db "${dbName}"`);
  }

  const db = dbName === 'production' ? await getProductionDb() : await getCompanionDb();

  const results = [];
  for (const objectKey of dbObjectKeys) {
    const collectionName = objectKey.slice(dbPrefix.length).replace(/\.jsonl\.gz$/, '');
    results.push(await restoreCollection(db, objectKey, collectionName, drop));
  }

  return { run, dbName, drop, collections: results };
}

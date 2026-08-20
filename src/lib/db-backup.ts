import { gzipSync } from 'zlib';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { EJSON } from 'bson';
import { getProductionDb, getCompanionDb } from '@/lib/mongodb';
import type { Db } from 'mongodb';

const RETAINED_BACKUPS = 3;
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

async function dumpDatabase(db: Db, dbName: string, runPrefix: string, client: S3Client, bucket: string) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const results: { collection: string; documents: number }[] = [];

  for (const { name: collectionName } of collections) {
    const docs = await db.collection(collectionName).find({}).toArray();
    const ndjson = docs.map((doc) => EJSON.stringify(doc)).join('\n');
    const gzipped = gzipSync(Buffer.from(ndjson, 'utf8'));

    const objectKey = `${runPrefix}${dbName}/${collectionName}.jsonl.gz`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: gzipped,
        ContentType: 'application/gzip',
        ContentEncoding: 'gzip',
      })
    );

    results.push({ collection: collectionName, documents: docs.length });
  }

  return results;
}

async function pruneOldBackups(client: S3Client, bucket: string) {
  const runTimestamps = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: BACKUP_PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key ?? '';
      const match = key.slice(BACKUP_PREFIX.length).match(/^([^/]+)\//);
      if (match) runTimestamps.add(match[1]);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  const sortedRuns = Array.from(runTimestamps).sort().reverse();
  const runsToDelete = sortedRuns.slice(RETAINED_BACKUPS);

  for (const run of runsToDelete) {
    const runPrefix = `${BACKUP_PREFIX}${run}/`;
    const keysToDelete: { Key: string }[] = [];
    let token: string | undefined;

    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: runPrefix, ContinuationToken: token })
      );
      for (const obj of page.Contents ?? []) {
        if (obj.Key) keysToDelete.push({ Key: obj.Key });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    if (keysToDelete.length > 0) {
      // S3-compatible DeleteObjects caps at 1000 keys per request.
      for (let i = 0; i < keysToDelete.length; i += 1000) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keysToDelete.slice(i, i + 1000) },
          })
        );
      }
    }
  }

  return { keptRuns: sortedRuns.slice(0, RETAINED_BACKUPS), deletedRuns: runsToDelete };
}

export async function runDbBackup() {
  const client = getR2Client();
  const bucket = getBucketName();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runPrefix = `${BACKUP_PREFIX}${timestamp}/`;

  const productionDb = await getProductionDb();
  const companionDb = await getCompanionDb();

  const production = await dumpDatabase(productionDb, 'production', runPrefix, client, bucket);
  const companion = await dumpDatabase(companionDb, 'cp_companion', runPrefix, client, bucket);

  const { keptRuns, deletedRuns } = await pruneOldBackups(client, bucket);

  return {
    runPrefix,
    databases: { production, cp_companion: companion },
    retention: { keptRuns, deletedRuns },
  };
}

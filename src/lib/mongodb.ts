import { MongoClient } from 'mongodb';

const uri = process.env.DATABASE_URL;
if (!uri) {
  throw new Error('DATABASE_URL is not set');
}

const PRODUCTION_DB = process.env.SELECTED_DB || 'production';
const COMPANION_DB = process.env.COMPANION_DB || 'cp_companion';
const ADMIN_COMPANION_DB = process.env.ADMIN_COMPANION_DB || 'clinicplus_admin_companion';

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = new MongoClient(uri).connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  clientPromise = new MongoClient(uri).connect();
}

export async function getProductionDb() {
  const client = await clientPromise;
  return client.db(PRODUCTION_DB);
}

export async function getCompanionDb() {
  const client = await clientPromise;
  return client.db(COMPANION_DB);
}

export async function getAdminCompanionDb() {
  const client = await clientPromise;
  return client.db(ADMIN_COMPANION_DB);
}

export default clientPromise;

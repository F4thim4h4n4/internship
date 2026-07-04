'use strict';

/**
 * list_dbs.js — Atlas connection verification script
 *
 * Usage:
 *   MONGODB_URI is read from the environment (via .env or CI secrets).
 *   Never hard-code credentials in this file.
 *
 *   node -r dotenv/config backend/list_dbs.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error(
      'ERROR: MONGODB_URI environment variable is not set.\n' +
        'Copy .env.example to .env and fill in your Atlas connection string.'
    );
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected successfully to MongoDB Atlas');

    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();
    console.log('Databases:');
    console.log(JSON.stringify(dbs.databases, null, 2));
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();

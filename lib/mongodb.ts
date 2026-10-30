import 'server-only';
import { MongoClient } from 'mongodb';
import { getDatabaseConfig } from './server-config.mjs';

// Reuse the pool across requests and development module reloads. A failed
// connection is cleared so starting MongoDB later does not require a restart.
const state = globalThis as typeof globalThis & { mongoConnection?: Promise<MongoClient> };
export async function database() {
  const config = getDatabaseConfig();
  if (!state.mongoConnection) {
    const client = new MongoClient(config.uri, config.options);
    state.mongoConnection = client.connect().catch(async error => {
      state.mongoConnection = undefined;
      await client.close();
      throw error;
    });
  }
  return (await state.mongoConnection).db(config.name);
}

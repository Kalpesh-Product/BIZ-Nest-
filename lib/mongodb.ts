import 'server-only';
import { MongoClient } from 'mongodb';

// Reuse the pool across requests and development module reloads. A failed
// connection is cleared so starting MongoDB later does not require a restart.
const state = globalThis as typeof globalThis & { mongoConnection?: Promise<MongoClient> };
export async function database() {
  if (!state.mongoConnection) {
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {
      maxPoolSize: 10, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
    });
    state.mongoConnection = client.connect().catch(async error => {
      state.mongoConnection = undefined;
      await client.close();
      throw error;
    });
  }
  return (await state.mongoConnection).db(process.env.MONGODB_DB || 'biznest');
}

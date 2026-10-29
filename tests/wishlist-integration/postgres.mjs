import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const IMAGE = 'postgres:16-alpine';

function docker(args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

export async function startDisposablePostgres() {
  // This runner intentionally accepts no DATABASE_URL and never reads .env.
  // It creates an unnamed-volume-free container and refuses to pull images.
  try {
    docker(['image', 'inspect', IMAGE]);
  } catch {
    throw new Error(
      `The local Docker image ${IMAGE} is required. Load it locally before running wishlist integration tests; this harness will not pull images or fall back to another database.`
    );
  }

  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const name = `evershop-wishlist-test-${suffix}`;
  const user = 'wishlist_test';
  const password = randomUUID();
  let containerId;
  let client;

  try {
    containerId = docker([
      'run',
      '--pull=never',
      '--detach',
      '--rm',
      '--name',
      name,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      `POSTGRES_USER=${user}`,
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      '--env',
      'POSTGRES_DB=wishlist_test',
      IMAGE
    ]);

    const portMapping = docker(['port', containerId, '5432/tcp']);
    const match = portMapping.match(/127\.0\.0\.1:(\d+)/);
    if (!match) {
      throw new Error('Docker did not publish PostgreSQL on loopback');
    }

    const connectionConfig = {
      host: '127.0.0.1',
      port: Number(match[1]),
      user,
      password,
      database: 'wishlist_test',
      connectionTimeoutMillis: 1000
    };

    let connected = false;
    let lastError;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidate = new pg.Client(connectionConfig);
      try {
        await candidate.connect();
        client = candidate;
        connected = true;
        break;
      } catch (error) {
        lastError = error;
        await candidate.end().catch(() => {});
        await delay(500);
      }
    }
    if (!connected) {
      throw new Error(`Disposable PostgreSQL did not become ready: ${lastError}`);
    }

    return {
      client,
      connectionConfig,
      async stop() {
        await client.end().catch(() => {});
        docker(['rm', '--force', containerId]);
      }
    };
  } catch (error) {
    await client?.end().catch(() => {});
    if (containerId) {
      try {
        docker(['rm', '--force', containerId]);
      } catch {
        // Preserve the setup error; Docker --rm also removes stopped containers.
      }
    }
    throw error;
  }
}

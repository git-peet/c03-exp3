import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { startDisposablePostgres } from './postgres.mjs';

let customerA;
let customerB;
const activeProduct = '11111111-1111-4111-8111-111111111111';
const secondActiveProduct = '44444444-4444-4444-8444-444444444444';
const disabledProduct = '22222222-2222-4222-8222-222222222222';
const deletedProduct = '33333333-3333-4333-8333-333333333333';

let database;
let service;
let handlers;

function makeRequest(customerId, { method = 'GET', body = {}, productUuid } = {}) {
  return {
    method,
    body,
    params: productUuid ? { product_uuid: productUuid } : {},
    getCurrentCustomer: () =>
      customerId === undefined ? undefined : { customer_id: customerId }
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

before(async () => {
  database = await startDisposablePostgres();
  const { client, connectionConfig } = database;
  // Ensure even accidental use of the application's global pool can only
  // reach this ephemeral container; no inherited DB URL or SSL file is used.
  process.env.DB_HOST = connectionConfig.host;
  process.env.DB_PORT = String(connectionConfig.port);
  process.env.DB_USER = connectionConfig.user;
  process.env.DB_PASSWORD = connectionConfig.password;
  process.env.DB_NAME = connectionConfig.database;
  process.env.DB_SSLMODE = 'disable';
  delete process.env.DB_SSLROOTCERT;
  delete process.env.DB_SSLCERT;
  delete process.env.DB_SSLKEY;
  delete process.env.DATABASE_URL;
  await client.query(`
    CREATE TABLE "customer" (
      "customer_id" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
    );
    CREATE TABLE "product" (
      "product_id" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "uuid" UUID NOT NULL UNIQUE,
      "status" BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE "product_description" (
      "product_description_product_id" INT PRIMARY KEY REFERENCES "product" ("product_id"),
      "name" VARCHAR NOT NULL
    );
    CREATE TABLE "url_rewrite" (
      "entity_uuid" UUID NOT NULL,
      "entity_type" VARCHAR NOT NULL,
      "request_path" VARCHAR NOT NULL
    );
  `);

  const { default: createWishlistMigration } = await import(
    '../../packages/evershop/dist/modules/customer/migration/Version-1.0.5.js'
  );
  await createWishlistMigration(client);

  const customers = await client.query(
    'INSERT INTO "customer" DEFAULT VALUES RETURNING "customer_id"'
  );
  const secondCustomer = await client.query(
    'INSERT INTO "customer" DEFAULT VALUES RETURNING "customer_id"'
  );
  customerA = customers.rows[0].customer_id;
  customerB = secondCustomer.rows[0].customer_id;
  const active = await client.query(
    'INSERT INTO "product" ("uuid", "status") VALUES ($1, TRUE) RETURNING "product_id"',
    [activeProduct]
  );
  await client.query(
    'INSERT INTO "product_description" ("product_description_product_id", "name") VALUES ($1, $2)',
    [active.rows[0].product_id, 'Saved item']
  );
  await client.query(
    'INSERT INTO "url_rewrite" ("entity_uuid", "entity_type", "request_path") VALUES ($1, $2, $3)',
    [activeProduct, 'product', '/product/saved-item']
  );
  const secondActive = await client.query(
    'INSERT INTO "product" ("uuid", "status") VALUES ($1, TRUE) RETURNING "product_id"',
    [secondActiveProduct]
  );
  await client.query(
    'INSERT INTO "product_description" ("product_description_product_id", "name") VALUES ($1, $2)',
    [secondActive.rows[0].product_id, 'Second saved item']
  );
  await client.query(
    'INSERT INTO "url_rewrite" ("entity_uuid", "entity_type", "request_path") VALUES ($1, $2, $3)',
    [secondActiveProduct, 'product', '/product/second-saved-item']
  );
  await client.query(
    'INSERT INTO "product" ("uuid", "status") VALUES ($1, FALSE)',
    [disabledProduct]
  );

  const { createWishlistService } = await import(
    '../../packages/evershop/dist/modules/customer/services/wishlist.js'
  );
  const { createWishlistHandlers } = await import(
    '../../packages/evershop/dist/modules/customer/services/wishlistApiHandlers.js'
  );
  service = createWishlistService(client);
  handlers = createWishlistHandlers(service);
});

after(async () => {
  await database?.stop();
});

test('wishlist writes persist, duplicate saves are idempotent, and reads are customer-scoped', async () => {
  await service.add(customerA, activeProduct);
  await service.add(customerA, activeProduct);
  await service.add(customerB, activeProduct);

  const customerAItems = await service.list(customerA);
  const customerBItems = await service.list(customerB);
  assert.equal(customerAItems.length, 1);
  assert.equal(customerBItems.length, 1);
  assert.equal(customerAItems[0].product.name, 'Saved item');
  assert.equal(customerAItems[0].product.urlPath, '/product/saved-item');

  const secondClient = new pg.Client(database.connectionConfig);
  await secondClient.connect();
  try {
    const { createWishlistService } = await import(
      '../../packages/evershop/dist/modules/customer/services/wishlist.js'
    );
    const secondConnectionService = createWishlistService(secondClient);
    assert.equal((await secondConnectionService.list(customerA)).length, 1);
  } finally {
    await secondClient.end();
  }
});

test('API handlers use authenticated identity and cannot remove another customer’s item', async () => {
  const addResponse = makeResponse();
  await handlers.add(
    makeRequest(customerA, {
      method: 'POST',
      body: { product_uuid: secondActiveProduct, customer_id: customerB }
    }),
    addResponse
  );
  assert.equal(addResponse.statusCode, 200);
  assert.equal(addResponse.body.data.productUuid, secondActiveProduct);
  assert.ok(
    (await service.list(customerA)).some((item) => item.productUuid === secondActiveProduct)
  );
  assert.equal(
    (await service.list(customerB)).some((item) => item.productUuid === secondActiveProduct),
    false
  );
  const customerAListResponse = makeResponse();
  await handlers.list(makeRequest(customerA), customerAListResponse);
  assert.equal(customerAListResponse.statusCode, 200);
  assert.ok(
    customerAListResponse.body.data.some(
      (item) => item.productUuid === secondActiveProduct && item.product?.name === 'Second saved item'
    )
  );
  const customerBListResponse = makeResponse();
  await handlers.list(makeRequest(customerB), customerBListResponse);
  assert.equal(customerBListResponse.body.data.length, 1);
  assert.equal(
    customerBListResponse.body.data.some((item) => item.productUuid === disabledProduct),
    false
  );

  await database.client.query(
    'INSERT INTO "customer_wishlist_item" ("customer_id", "product_uuid") VALUES ($1, $2)',
    [customerA, deletedProduct]
  );
  const removeResponse = makeResponse();
  await handlers.remove(
    makeRequest(customerB, { productUuid: deletedProduct }),
    removeResponse
  );
  assert.equal(removeResponse.statusCode, 200);
  assert.ok(
    (await service.list(customerA)).some((item) => item.productUuid === deletedProduct)
  );
  assert.equal(
    (await service.list(customerB)).some((item) => item.productUuid === deletedProduct),
    false
  );
});

test('missing and disabled products remain removable and are returned without product details', async () => {
  await database.client.query(
    'INSERT INTO "customer_wishlist_item" ("customer_id", "product_uuid") VALUES ($1, $2), ($1, $3)',
    [customerA, disabledProduct, deletedProduct]
  );
  const items = await service.list(customerA);
  const unavailable = items.filter((item) =>
    [disabledProduct, deletedProduct].includes(item.productUuid)
  );

  assert.equal(unavailable.length, 2);
  assert.ok(unavailable.every((item) => item.product === null));
  assert.equal(await service.remove(customerA, deletedProduct), true);
  assert.equal(await service.remove(customerA, deletedProduct), false);
});

test('unauthenticated API access is rejected and invalid product IDs are not written', async () => {
  const unauthenticated = makeResponse();
  await handlers.list(makeRequest(undefined), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const invalid = makeResponse();
  await handlers.add(
    makeRequest(customerA, { method: 'POST', body: { product_uuid: 'not-a-uuid' } }),
    invalid
  );
  assert.equal(invalid.statusCode, 400);
  assert.equal(
    (await service.list(customerA)).some((item) => item.productUuid === 'not-a-uuid'),
    false
  );

  const unavailable = makeResponse();
  await handlers.add(
    makeRequest(customerA, {
      method: 'POST',
      body: { product_uuid: disabledProduct }
    }),
    unavailable
  );
  assert.equal(unavailable.statusCode, 400);
  assert.equal(
    (await service.list(customerA)).some((item) => item.productUuid === disabledProduct),
    false
  );
});

test('deleting a customer cascades to that customer’s wishlist only', async () => {
  await service.add(customerA, activeProduct);
  await service.add(customerB, activeProduct);
  await database.client.query('DELETE FROM "customer" WHERE "customer_id" = $1', [customerA]);
  assert.equal((await service.list(customerA)).length, 0);
  assert.equal((await service.list(customerB)).length, 1);
});

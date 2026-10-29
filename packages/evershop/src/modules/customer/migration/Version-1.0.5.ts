import type { PoolClient } from 'pg';

export default async (connection: PoolClient) => {
  await connection.query(`
    CREATE TABLE "customer_wishlist_item" (
      "customer_wishlist_item_id" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "customer_id" INT NOT NULL,
      "product_uuid" UUID NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CUSTOMER_WISHLIST_ITEM_UNIQUE" UNIQUE ("customer_id", "product_uuid"),
      CONSTRAINT "FK_CUSTOMER_WISHLIST_ITEM_CUSTOMER"
        FOREIGN KEY ("customer_id") REFERENCES "customer" ("customer_id") ON DELETE CASCADE
    )
  `);
};

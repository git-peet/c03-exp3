import { pool } from '../../../lib/postgres/connection.js';

export interface WishlistExecutor {
  query: (
    text: string,
    values?: unknown[]
  ) => Promise<{ rows: Record<string, any>[]; rowCount?: number | null }>;
}

export interface WishlistProduct {
  uuid: string;
  name: string;
  urlPath: string | null;
}

export interface WishlistItem {
  productUuid: string;
  createdAt: Date | string;
  product: WishlistProduct | null;
}

export interface WishlistService {
  add(customerId: number, productUuid: string): Promise<boolean>;
  list(customerId: number): Promise<WishlistItem[]>;
  remove(customerId: number, productUuid: string): Promise<boolean>;
}

/**
 * Build wishlist operations over an explicit query executor. The injectable
 * executor keeps service tests on their own disposable PostgreSQL connection;
 * production routes use the application pool.
 */
export function createWishlistService(
  executor: WishlistExecutor
): WishlistService {
  return {
    async add(customerId, productUuid) {
      const product = await executor.query(
        `SELECT 1 FROM "product" WHERE "uuid" = $1 AND "status" IS TRUE`,
        [productUuid]
      );
      if (product.rows.length === 0) {
        return false;
      }
      await executor.query(
        `INSERT INTO "customer_wishlist_item" ("customer_id", "product_uuid")
         VALUES ($1, $2)
         ON CONFLICT ("customer_id", "product_uuid") DO NOTHING`,
        [customerId, productUuid]
      );
      return true;
    },

    async list(customerId) {
      const result = await executor.query(
        `SELECT
           wishlist."product_uuid" AS "product_uuid",
           wishlist."created_at" AS "created_at",
           product."uuid" AS "available_product_uuid",
           description."name" AS "product_name",
           rewrite."request_path" AS "product_url_path"
         FROM "customer_wishlist_item" AS wishlist
         LEFT JOIN "product" AS product
           ON product."uuid" = wishlist."product_uuid"
          AND product."status" IS TRUE
         LEFT JOIN "product_description" AS description
           ON description."product_description_product_id" = product."product_id"
         LEFT JOIN "url_rewrite" AS rewrite
           ON rewrite."entity_uuid" = product."uuid"
          AND rewrite."entity_type" = 'product'
         WHERE wishlist."customer_id" = $1
         ORDER BY wishlist."created_at" DESC, wishlist."product_uuid" ASC`,
        [customerId]
      );

      return result.rows.map((row) => {
        const productUuid = String(row.product_uuid);
        const product = row.available_product_uuid
          ? {
              uuid: String(row.available_product_uuid),
              name: String(row.product_name || ''),
              urlPath: row.product_url_path
                ? String(row.product_url_path)
                : null
            }
          : null;

        return {
          productUuid,
          createdAt: row.created_at,
          product
        };
      });
    },

    async remove(customerId, productUuid) {
      const result = await executor.query(
        `DELETE FROM "customer_wishlist_item"
         WHERE "customer_id" = $1 AND "product_uuid" = $2`,
        [customerId, productUuid]
      );
      return (result.rowCount || 0) > 0;
    }
  };
}

export const wishlistService = createWishlistService(
  pool as unknown as WishlistExecutor
);

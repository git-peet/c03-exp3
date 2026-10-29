import type { EvershopRequest } from '../../../types/request.js';
import type { EvershopResponse } from '../../../types/response.js';
import { localizeUrl } from '../../../lib/locale/localeContext.js';
import { buildUrl } from '../../../lib/router/buildUrl.js';
import {
  INTERNAL_SERVER_ERROR,
  INVALID_PAYLOAD,
  OK,
  UNAUTHORIZED
} from '../../../lib/util/httpStatus.js';
import { translate } from '../../../lib/locale/translate/translate.js';
import { wishlistService } from './wishlist.js';
import type { WishlistService } from './wishlist.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WishlistRequest = EvershopRequest & {
  body?: Record<string, unknown>;
  params: Record<string, string | string[]>;
};

type Handler = (
  request: WishlistRequest,
  response: EvershopResponse,
  next?: () => void
) => Promise<unknown>;

function currentCustomerId(request: WishlistRequest): number | undefined {
  const customer = request.getCurrentCustomer();
  return customer?.customer_id ? Number(customer.customer_id) : undefined;
}

function sendUnauthorized(response: EvershopResponse) {
  response.status(UNAUTHORIZED);
  return response.json({
    error: {
      status: UNAUTHORIZED,
      message: translate('You must be logged in to manage your wishlist')
    }
  });
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function createWishlistHandlers(
  service: WishlistService = wishlistService
): { list: Handler; add: Handler; remove: Handler } {
  const list: Handler = async (request, response) => {
    const customerId = currentCustomerId(request);
    if (!customerId) {
      return sendUnauthorized(response);
    }

    try {
      const items = await service.list(customerId);
      response.status(OK);
      return response.json({
        data: items.map((item) => {
          if (!item.product) {
            return {
              productUuid: item.productUuid,
              createdAt: item.createdAt,
              product: null
            };
          }
          const urlPath = item.product.urlPath;
          const url =
            urlPath && urlPath.startsWith('/') && !urlPath.startsWith('//')
              ? localizeUrl(urlPath)
              : buildUrl('productView', { uuid: item.product.uuid });
          return {
            productUuid: item.productUuid,
            createdAt: item.createdAt,
            product: {
              uuid: item.product.uuid,
              name: item.product.name,
              url
            }
          };
        })
      });
    } catch {
      response.status(INTERNAL_SERVER_ERROR);
      return response.json({
        error: {
          status: INTERNAL_SERVER_ERROR,
          message: translate('Unable to load your wishlist')
        }
      });
    }
  };

  const add: Handler = async (request, response) => {
    const customerId = currentCustomerId(request);
    if (!customerId) {
      return sendUnauthorized(response);
    }

    const productUuid = request.body?.product_uuid;
    if (!validUuid(productUuid)) {
      response.status(INVALID_PAYLOAD);
      return response.json({
        error: {
          status: INVALID_PAYLOAD,
          message: translate('Invalid product')
        }
      });
    }

    try {
      const saved = await service.add(customerId, productUuid);
      if (!saved) {
        response.status(INVALID_PAYLOAD);
        return response.json({
          error: {
            status: INVALID_PAYLOAD,
            message: translate('This product is not available to save')
          }
        });
      }
      response.status(OK);
      return response.json({
        data: { productUuid, saved: true }
      });
    } catch {
      response.status(INTERNAL_SERVER_ERROR);
      return response.json({
        error: {
          status: INTERNAL_SERVER_ERROR,
          message: translate('Unable to save this product')
        }
      });
    }
  };

  const remove: Handler = async (request, response) => {
    const customerId = currentCustomerId(request);
    if (!customerId) {
      return sendUnauthorized(response);
    }

    const productUuid = request.params.product_uuid;
    if (!validUuid(productUuid)) {
      response.status(INVALID_PAYLOAD);
      return response.json({
        error: {
          status: INVALID_PAYLOAD,
          message: translate('Invalid product')
        }
      });
    }

    try {
      await service.remove(customerId, productUuid);
      response.status(OK);
      return response.json({
        data: { productUuid, removed: true }
      });
    } catch {
      response.status(INTERNAL_SERVER_ERROR);
      return response.json({
        error: {
          status: INTERNAL_SERVER_ERROR,
          message: translate('Unable to remove this product')
        }
      });
    }
  };

  return { list, add, remove };
}

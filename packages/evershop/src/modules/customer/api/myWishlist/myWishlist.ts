import type { EvershopRequest } from '../../../../types/request.js';
import type { EvershopResponse } from '../../../../types/response.js';
import { createWishlistHandlers } from '../../services/wishlistApiHandlers.js';

const handlers = createWishlistHandlers();

export default async (
  request: EvershopRequest,
  response: EvershopResponse,
  next: () => void
) => {
  if (request.method?.toUpperCase() === 'POST') {
    return handlers.add(
      request as Parameters<typeof handlers.add>[0],
      response,
      next
    );
  }
  return handlers.list(
    request as Parameters<typeof handlers.list>[0],
    response,
    next
  );
};

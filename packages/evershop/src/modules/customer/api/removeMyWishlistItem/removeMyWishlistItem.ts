import type { EvershopRequest } from '../../../../types/request.js';
import type { EvershopResponse } from '../../../../types/response.js';
import { createWishlistHandlers } from '../../services/wishlistApiHandlers.js';

const remove = createWishlistHandlers().remove;

export default async (
  request: EvershopRequest,
  response: EvershopResponse,
  next: () => void
) =>
  remove(
    request as Parameters<typeof remove>[0],
    response,
    next
  );

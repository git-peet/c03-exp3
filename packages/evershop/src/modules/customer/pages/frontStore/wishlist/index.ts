import { translate } from '../../../../../lib/locale/translate/translate.js';
import { buildUrl } from '../../../../../lib/router/buildUrl.js';
import type { EvershopResponse } from '../../../../../types/response.js';
import { setPageMetaInfo } from '../../../../cms/services/pageMetaInfo.js';

export default (request, response: EvershopResponse, next) => {
  if (!request.isCustomerLoggedIn()) {
    response.redirect(buildUrl('login'));
    return;
  }
  setPageMetaInfo(request, {
    title: translate('Wishlist'),
    description: translate('Your saved products')
  });
  next();
};

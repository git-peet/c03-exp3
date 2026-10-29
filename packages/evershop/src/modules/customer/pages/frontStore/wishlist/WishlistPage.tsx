import { AccountHeader } from '@components/frontStore/customer/AccountHeader.js';
import { AccountNav } from '@components/frontStore/customer/AccountNav.js';
import { _ } from '@evershop/evershop/lib/locale/translate/_';
import React from 'react';

type WishlistItem = {
  productUuid: string;
  product: {
    name: string;
    url: string | null;
  } | null;
};

type ViewState = 'loading' | 'ready' | 'error';

async function fetchWishlist(): Promise<WishlistItem[]> {
  const response = await fetch('/api/customers/me/wishlist', {
    credentials: 'same-origin'
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error?.message || _('Unable to load your wishlist'));
  }
  return result.data || [];
}

export default function WishlistPage() {
  const [items, setItems] = React.useState<WishlistItem[]>([]);
  const [state, setState] = React.useState<ViewState>('loading');
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState(false);

  const load = React.useCallback(async () => {
    setState('loading');
    setActionError(false);
    try {
      setItems(await fetchWishlist());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const remove = async (productUuid: string) => {
    setRemoving(productUuid);
    setActionError(false);
    try {
      const response = await fetch(
        `/api/customers/me/wishlist/${encodeURIComponent(productUuid)}`,
        { method: 'DELETE', credentials: 'same-origin' }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || _('Unable to remove this product'));
      }
      setItems((current) =>
        current.filter((item) => item.productUuid !== productUuid)
      );
    } catch {
      setActionError(true);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="account mx-auto max-w-2xl py-10">
      <AccountHeader />
      <AccountNav active="wishlist" />
      <main className="mt-8" aria-live="polite">
        <h1 className="mb-4 h2">{_('Wishlist')}</h1>
        {state === 'loading' && (
          <p role="status" className="text-muted-foreground">
            {_('Loading your wishlist…')}
          </p>
        )}
        {state === 'ready' && actionError && (
          <p role="alert" className="text-destructive">
            {_('This product could not be removed. Please try again.')}
          </p>
        )}
        {state === 'error' && (
          <div role="alert" className="space-y-2">
            <p className="text-destructive">
              {_('Your wishlist could not be loaded. Please try again.')}
            </p>
            <button className="underline" type="button" onClick={() => void load()}>
              {_('Retry')}
            </button>
          </div>
        )}
        {state === 'ready' && items.length === 0 && (
          <p className="text-muted-foreground">
            {_('You have no saved products yet.')}
          </p>
        )}
        {state === 'ready' && items.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((item) => (
              <li
                key={item.productUuid}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  {item.product?.url ? (
                    <a
                      className="font-medium underline"
                      href={item.product.url}
                    >
                      {item.product.name || _('Saved product')}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      {_('This product is no longer available.')}
                    </span>
                  )}
                </div>
                <button
                  className="shrink-0 text-sm underline disabled:opacity-60"
                  type="button"
                  disabled={removing === item.productUuid}
                  onClick={() => void remove(item.productUuid)}
                >
                  {removing === item.productUuid
                    ? _('Removing…')
                    : _('Remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export const layout = {
  areaId: 'content',
  sortOrder: 10
};

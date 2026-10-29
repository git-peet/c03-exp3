import { useProduct } from '@components/frontStore/catalog/ProductContext.js';
import { _ } from '@evershop/evershop/lib/locale/translate/_';
import React from 'react';

type WishlistItem = {
  productUuid: string;
};

type WishlistState = 'checking' | 'saved' | 'unsaved' | 'signedOut' | 'error';

async function readWishlist(): Promise<WishlistItem[]> {
  const response = await fetch('/api/customers/me/wishlist', {
    credentials: 'same-origin'
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || _('Unable to load your wishlist'));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return result.data || [];
}

export function WishlistButton() {
  const product = useProduct();
  const [state, setState] = React.useState<WishlistState>('checking');
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setState('checking');
    try {
      const items = await readWishlist();
      setState(
        items.some((item) => item.productUuid === product.uuid)
          ? 'saved'
          : 'unsaved'
      );
    } catch (error) {
      setState(
        (error as Error & { status?: number }).status === 401
          ? 'signedOut'
          : 'error'
      );
    }
  }, [product.uuid]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = async () => {
    if (state !== 'saved' && state !== 'unsaved') {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        state === 'saved'
          ? `/api/customers/me/wishlist/${encodeURIComponent(product.uuid)}`
          : '/api/customers/me/wishlist',
        {
          method: state === 'saved' ? 'DELETE' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          ...(state === 'saved'
            ? {}
            : { body: JSON.stringify({ product_uuid: product.uuid }) })
        }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || _('Unable to update your wishlist'));
      }
      setState(state === 'saved' ? 'unsaved' : 'saved');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'signedOut') {
    return (
      <a className="mt-3 inline-block text-sm underline" href="/account/login">
        {_('Sign in to save this product')}
      </a>
    );
  }

  if (state === 'error') {
    return (
      <div className="mt-3" aria-live="polite">
        <p className="text-sm text-destructive">
          {_('Wishlist could not be loaded. Please try again.')}
        </p>
        <button
          className="mt-1 text-sm underline"
          type="button"
          onClick={() => void refresh()}
        >
          {_('Retry')}
        </button>
      </div>
    );
  }

  return (
    <button
      className="mt-3 text-sm underline disabled:cursor-not-allowed disabled:opacity-60"
      type="button"
      disabled={state === 'checking' || busy}
      aria-pressed={state === 'saved'}
      onClick={() => void toggle()}
    >
      {state === 'checking'
        ? _('Checking wishlist…')
        : busy
          ? _('Updating wishlist…')
          : state === 'saved'
            ? _('Remove from wishlist')
            : _('Save to wishlist')}
    </button>
  );
}

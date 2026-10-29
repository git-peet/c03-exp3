import { expect, test, type Page } from '@playwright/test';

const email = process.env.WISHLIST_UI_TEST_EMAIL!;
const password = process.env.WISHLIST_UI_TEST_PASSWORD!;
const productUuid = process.env.WISHLIST_UI_TEST_PRODUCT_UUID!;
const productURL = process.env.WISHLIST_UI_TEST_PRODUCT_URL!;

async function signIn(page: Page) {
  await page.goto('/account/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/account\/login/);
}

async function removeSeededWishlistItem(page: Page) {
  await page.goto('/account/wishlist');
  await page.evaluate(async (uuid) => {
    await fetch(`/api/customers/me/wishlist/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
  }, productUuid);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('signed-in customer can save, revisit, and remove a product', async ({ page }) => {
  await removeSeededWishlistItem(page);
  await page.goto(productURL);

  const saveButton = page.getByRole('button', { name: /save to wishlist/i });
  await expect(saveButton).toBeVisible();
  await saveButton.click();
  await expect(
    page.getByRole('button', { name: /remove from wishlist/i })
  ).toBeVisible();

  await page.goto('/account/wishlist');
  const savedProductLink = page.locator('main').getByRole('link').first();
  await expect(savedProductLink).toBeVisible();
  await expect(savedProductLink).toHaveAttribute('href', /^\//);

  await page.getByRole('button', { name: /^remove$/i }).click();
  await expect(page.getByText('You have no saved products yet.')).toBeVisible();
});

test('wishlist page shows loading and empty states', async ({ page }) => {
  await page.route('**/api/customers/me/wishlist', async (route) => {
    if (route.request().method() === 'GET') {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/account/wishlist');
  await expect(page.getByRole('status')).toHaveText('Loading your wishlist…');
  await expect(page.getByText('You have no saved products yet.')).toBeVisible();
});

test('wishlist page shows unavailable saved products without broken links', async ({ page }) => {
  await page.route('**/api/customers/me/wishlist', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              productUuid,
              product: null
            }
          ]
        })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/account/wishlist');
  await expect(
    page.getByText('This product is no longer available.')
  ).toBeVisible();
  await expect(page.locator('main').getByRole('link')).toHaveCount(0);
});

test('wishlist page shows a recoverable error state', async ({ page }) => {
  await page.route('**/api/customers/me/wishlist', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Wishlist unavailable' }
        })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/account/wishlist');
  await expect(page.getByRole('alert')).toContainText(
    'Your wishlist could not be loaded'
  );
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

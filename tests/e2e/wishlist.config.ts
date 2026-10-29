import { defineConfig, devices } from '@playwright/test';

const required = [
  'WISHLIST_UI_TEST_DISPOSABLE_DATABASE',
  'WISHLIST_UI_TEST_BASE_URL',
  'WISHLIST_UI_TEST_EMAIL',
  'WISHLIST_UI_TEST_PASSWORD',
  'WISHLIST_UI_TEST_PRODUCT_UUID',
  'WISHLIST_UI_TEST_PRODUCT_URL'
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(
      `${name} is required. Wishlist UI tests have no defaults and do not load .env.`
    );
  }
}

if (process.env.WISHLIST_UI_TEST_DISPOSABLE_DATABASE !== 'true') {
  throw new Error(
    'Set WISHLIST_UI_TEST_DISPOSABLE_DATABASE=true only when BASE_URL is served by an isolated disposable test database.'
  );
}

const baseURL = new URL(process.env.WISHLIST_UI_TEST_BASE_URL!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(baseURL.hostname)) {
  throw new Error('Wishlist UI tests may only target a loopback BASE_URL.');
}

const productURL = new URL(
  process.env.WISHLIST_UI_TEST_PRODUCT_URL!,
  baseURL
);
if (productURL.origin !== baseURL.origin) {
  throw new Error('The wishlist test product URL must be on the configured BASE_URL.');
}

export default defineConfig({
  testDir: './storefront/wishlist',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: baseURL.toString(),
    ...devices['Desktop Chrome']
  }
});

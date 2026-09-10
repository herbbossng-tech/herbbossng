// Deterministic unit tests for external-ingestion.ts — no network, no
// live Shopify/WooCommerce/Google account. Run locally via
// `npx tsx external-ingestion.test.ts`.
import {
  isSafeWooCommerceUrl,
  normalizeGoogleSheetsRow,
  normalizeShopifyOrder,
  normalizeWooCommerceOrder,
  verifyShopifyHmac,
} from './external-ingestion.ts'

let failures = 0
function assertEq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`FAIL ${label}: expected ${e}, got ${a}`)
    failures++
  } else {
    console.log(`OK ${label}`)
  }
}
function assertTrue(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL ${label}`)
    failures++
  } else {
    console.log(`OK ${label}`)
  }
}

async function testShopifyHmacRoundTrip() {
  const secret = 'shpss_test_secret'
  const body = JSON.stringify({ id: 1001, name: '#1001' })
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const validHmac = btoa(String.fromCharCode(...new Uint8Array(sig)))

  assertTrue(await verifyShopifyHmac(secret, body, validHmac), 'a correctly computed HMAC verifies true')
  assertTrue(!(await verifyShopifyHmac(secret, body, 'bm90LWEtcmVhbC1obWFj')), 'a wrong HMAC verifies false')
  assertTrue(!(await verifyShopifyHmac('wrong-secret', body, validHmac)), 'the wrong secret verifies false even with a validly-shaped HMAC')
  assertTrue(!(await verifyShopifyHmac(secret, body, null)), 'a missing header verifies false, never treated as valid')
}

function testNormalizeShopifyOrder() {
  const normalized = normalizeShopifyOrder({
    id: 5551234,
    name: '#1042',
    currency: 'USD',
    total_shipping_price_set: { shop_money: { amount: '5.00' } },
    total_discounts: '1.50',
    email: 'buyer@example.com',
    shipping_address: { name: 'Jane Buyer', phone: '+15551234567', country_code: 'US', province: 'CA', city: 'LA', address1: '1 Main St', zip: '90001' },
    line_items: [{ product_id: 111, variant_id: 222, sku: 'SKU-A', title: 'Widget', quantity: 2, price: '19.99' }],
  })
  assertEq(normalized.external_order_id, '5551234', 'shopify external_order_id is the numeric order id as a string')
  assertEq(normalized.external_order_number, '#1042', 'shopify external_order_number prefers name over order_number')
  assertEq(normalized.customer.phone, '+15551234567', 'shopify customer phone comes from shipping_address')
  assertEq(normalized.items.length, 1, 'one line item normalizes to one item')
  assertEq(normalized.items[0].quantity, 2, 'quantity carries through')
  assertEq(normalized.items[0].unit_price, 19.99, 'unit_price carries through as a number');
  assertEq(normalized.shipping_fee, 5, 'shipping fee reads from total_shipping_price_set.shop_money.amount');
  assertEq(normalized.discount_amount, 1.5, 'discount reads from total_discounts');
}

function testNormalizeShopifyOrderFallsBackToCustomerName() {
  const normalized = normalizeShopifyOrder({ id: 1, customer: { first_name: 'Ada', last_name: 'Lovelace' }, phone: '0800000000', line_items: [] })
  assertEq(normalized.customer.name, 'Ada Lovelace', 'falls back to customer.first_name+last_name when there is no shipping/billing address name');
  assertEq(normalized.items, [], 'an order with no line items normalizes to an empty item array, never a fabricated one');
}

function testNormalizeWooCommerceOrder() {
  const normalized = normalizeWooCommerceOrder({
    id: 99,
    number: '99',
    currency: 'NGN',
    shipping_total: '500',
    discount_total: '0',
    billing: { first_name: 'Bola', last_name: 'Ade', phone: '08010000000', email: 'bola@example.com', country: 'NG', state: 'Lagos', city: 'Ikeja', address_1: '1 Rd' },
    line_items: [{ product_id: 7, sku: 'WOO-SKU', name: 'Woo Item', quantity: 3, total: '15000' }],
  })
  assertEq(normalized.customer.name, 'Bola Ade', 'woocommerce customer name from billing first/last name')
  assertEq(normalized.items[0].unit_price, 5000, 'unit_price derived from total/quantity when price is absent')
  assertEq(normalized.shipping_fee, 500, 'woocommerce shipping_total carries through')
}

function testNormalizeGoogleSheetsRow() {
  const headers = ['Order ID', 'Full Name', 'Phone', 'Item', 'Qty', 'Price']
  const mapping = { order_id: 'Order ID', name: 'Full Name', phone: 'Phone', item_name: 'Item', quantity: 'Qty', unit_price: 'Price' }
  const row = ['ORD-1', 'Chi Chi', '08099999999', 'Blender', '1', '25000']
  const normalized = normalizeGoogleSheetsRow(headers, row, mapping, 2)
  assertTrue(normalized !== null, 'a row with a phone number normalizes successfully')
  assertEq(normalized?.external_order_id, 'ORD-1', 'sheet external_order_id comes from the mapped Order ID column')
  assertEq(normalized?.items[0].unit_price, 25000, 'sheet unit_price parses from the mapped column')

  const rowNoPhone = ['ORD-2', 'No Phone', '', 'Blender', '1', '25000']
  const skipped = normalizeGoogleSheetsRow(headers, rowNoPhone, mapping, 3)
  assertTrue(skipped === null, 'a row with no phone number is skipped (null), never guessed into a fabricated customer')
}

function testSsrfProtection() {
  assertTrue(isSafeWooCommerceUrl('https://mystore.example.com').ok, 'a normal https store URL is allowed')
  assertTrue(!isSafeWooCommerceUrl('http://mystore.example.com').ok, 'plain http is rejected — only https allowed')
  assertTrue(!isSafeWooCommerceUrl('https://localhost').ok, 'localhost is rejected')
  assertTrue(!isSafeWooCommerceUrl('https://127.0.0.1').ok, 'loopback IPv4 is rejected')
  assertTrue(!isSafeWooCommerceUrl('https://192.168.1.5').ok, 'private 192.168.x.x is rejected')
  assertTrue(!isSafeWooCommerceUrl('https://10.0.0.5').ok, 'private 10.x.x.x is rejected')
  assertTrue(!isSafeWooCommerceUrl('https://169.254.169.254').ok, 'link-local (cloud metadata endpoint) is rejected')
  assertTrue(!isSafeWooCommerceUrl('not a url').ok, 'a malformed URL is rejected, not thrown')
}

async function main() {
  await testShopifyHmacRoundTrip()
  testNormalizeShopifyOrder()
  testNormalizeShopifyOrderFallsBackToCustomerName()
  testNormalizeWooCommerceOrder()
  testNormalizeGoogleSheetsRow()
  testSsrfProtection()
  console.log(failures === 0 ? '\n=== ALL EXTERNAL-INGESTION HELPER TESTS PASSED ===' : `\n=== ${failures} TEST(S) FAILED ===`)
  if (failures > 0) throw new Error(`${failures} test(s) failed`)
}

main()

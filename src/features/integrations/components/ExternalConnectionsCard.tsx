import { CheckCircle2, ExternalLink, Unplug } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePermission } from '@/contexts/PermissionsContext'
import { externalConnectionProviderLabel } from '@/features/integrations/api'
import { useDisconnectExternalConnection, useExternalConnections, useUpsertExternalConnection } from '@/features/integrations/hooks'
import type { ExternalConnection, ExternalConnectionProvider } from '@/types/database'

/**
 * Brand-level Shopify/WooCommerce/Google Sheets order-source
 * connections, embedded in Brand Detail next to CommunicationConfigCard
 * — the same brand-scoped secret-storage pattern (0053 copies
 * brand_communication_secrets' RLS/RPC discipline exactly). Connecting
 * a source does NOT create a second order pipeline: every ingested
 * order becomes an ordinary row in Orders, visible/filterable/
 * automatable exactly like a landing-page or manual order. Sync
 * history and orders awaiting product-mapping review live on
 * Integration Health, not here — this card is connect/disconnect only.
 */
export function ExternalConnectionsCard({ brandId }: { brandId: string }) {
  const canView = usePermission('order_ingestion.view')
  const canManage = usePermission('order_ingestion.manage')
  const { data: connections } = useExternalConnections(brandId)
  const [openProvider, setOpenProvider] = React.useState<ExternalConnectionProvider | null>(null)

  if (!canView) return null

  const byProvider = (provider: ExternalConnectionProvider): ExternalConnection | undefined =>
    (connections ?? []).find((c) => c.provider === provider)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order Sources</CardTitle>
        <CardDescription>
          Connect Shopify, WooCommerce, or a Google Sheet as an external order source. Every order that comes in is created the exact same way as
          any other order in GCOS — same customer records, same inventory, same status pipeline, same automation rules. Sync history and any order
          awaiting product-mapping review are on the Integration Health page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(['shopify', 'woocommerce', 'google_sheets'] as const).map((provider) => (
          <ProviderRow
            key={provider}
            provider={provider}
            connection={byProvider(provider)}
            canManage={canManage}
            brandId={brandId}
            onConnect={() => setOpenProvider(provider)}
          />
        ))}
      </CardContent>

      {openProvider && (
        <ConnectDialog
          brandId={brandId}
          provider={openProvider}
          existing={byProvider(openProvider)}
          onClose={() => setOpenProvider(null)}
        />
      )}
    </Card>
  )
}

function ProviderRow({
  provider,
  connection,
  canManage,
  brandId,
  onConnect,
}: {
  provider: ExternalConnectionProvider
  connection: ExternalConnection | undefined
  canManage: boolean
  brandId: string
  onConnect: () => void
}) {
  const disconnect = useDisconnectExternalConnection(brandId)
  const connected = connection?.status === 'connected'
  const identity =
    provider === 'shopify'
      ? connection?.shopify_shop_domain
      : provider === 'woocommerce'
        ? connection?.woocommerce_store_url
        : connection?.google_spreadsheet_id

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{externalConnectionProviderLabel[provider]}</span>
          <Badge variant={connected ? 'success' : connection?.status === 'error' ? 'destructive' : 'secondary'}>
            {connected ? 'Connected' : connection?.status === 'error' ? 'Error' : 'Not connected'}
          </Badge>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onConnect}>
              {connection ? 'Edit' : 'Connect'}
            </Button>
            {connection && connection.status !== 'disconnected' && (
              <Button size="sm" variant="ghost" onClick={() => disconnect.mutate(connection.id)} disabled={disconnect.isPending}>
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            )}
          </div>
        )}
      </div>
      {identity && <p className="text-xs text-muted-foreground">{identity}</p>}
      {connection?.last_sync_at && <p className="text-xs text-muted-foreground">Last sync: {new Date(connection.last_sync_at).toLocaleString()}</p>}
      {connection?.status === 'error' && connection.last_error && <p className="text-xs text-destructive">{connection.last_error}</p>}
    </div>
  )
}

function ConnectDialog({
  brandId,
  provider,
  existing,
  onClose,
}: {
  brandId: string
  provider: ExternalConnectionProvider
  existing: ExternalConnection | undefined
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={provider === 'google_sheets' ? 'max-h-[85vh] max-w-lg overflow-y-auto' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${externalConnectionProviderLabel[provider]} connection` : `Connect ${externalConnectionProviderLabel[provider]}`}</DialogTitle>
          <DialogDescription>Credentials are stored server-side and never displayed again once saved.</DialogDescription>
        </DialogHeader>
        {provider === 'shopify' && <ShopifyForm brandId={brandId} existing={existing} onClose={onClose} />}
        {provider === 'woocommerce' && <WooCommerceForm brandId={brandId} existing={existing} onClose={onClose} />}
        {provider === 'google_sheets' && <GoogleSheetsForm brandId={brandId} existing={existing} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ShopifyForm({ brandId, existing, onClose }: { brandId: string; existing: ExternalConnection | undefined; onClose: () => void }) {
  const upsert = useUpsertExternalConnection(brandId)
  const [shopDomain, setShopDomain] = React.useState(existing?.shopify_shop_domain ?? '')
  const [accessToken, setAccessToken] = React.useState('')
  const [apiSecret, setApiSecret] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    setError(null)
    try {
      await upsert.mutateAsync({
        provider: 'shopify',
        shopifyShopDomain: shopDomain || null,
        shopifyAccessToken: accessToken || null,
        shopifyApiSecret: apiSecret || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Shopify connection')
    }
  }

  return (
    <div className="flex flex-col gap-3 p-6 pt-2">
      <p className="text-xs text-muted-foreground">
        Create a custom app in your Shopify Admin (Settings → Apps and sales channels → Develop apps), grant it read access to Orders/Products,
        then paste its Admin API access token and API secret key below. After saving, add a webhook for the <code>orders/create</code> and{' '}
        <code>orders/paid</code> topics pointing at your ingest-shopify-order Edge Function URL.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label>Shop domain</Label>
        <Input placeholder="your-store.myshopify.com" value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Admin API access token</Label>
        <Input type="password" placeholder="Unchanged unless filled in" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>API secret key</Label>
        <Input type="password" placeholder="Unchanged unless filled in" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
        <p className="text-xs text-muted-foreground">Used to verify that webhook deliveries genuinely came from this store.</p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}

function WooCommerceForm({ brandId, existing, onClose }: { brandId: string; existing: ExternalConnection | undefined; onClose: () => void }) {
  const upsert = useUpsertExternalConnection(brandId)
  const [storeUrl, setStoreUrl] = React.useState(existing?.woocommerce_store_url ?? '')
  const [consumerKey, setConsumerKey] = React.useState('')
  const [consumerSecret, setConsumerSecret] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    setError(null)
    try {
      await upsert.mutateAsync({
        provider: 'woocommerce',
        woocommerceStoreUrl: storeUrl || null,
        woocommerceConsumerKey: consumerKey || null,
        woocommerceConsumerSecret: consumerSecret || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save WooCommerce connection')
    }
  }

  return (
    <div className="flex flex-col gap-3 p-6 pt-2">
      <p className="text-xs text-muted-foreground">
        Generate a REST API key pair in your WordPress admin (WooCommerce → Settings → Advanced → REST API) with Read permissions, then paste it
        below. The store URL must be a plain https:// address — GCOS refuses any URL pointing at a private/internal network address.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label>Store URL</Label>
        <Input placeholder="https://your-store.com" value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Consumer key</Label>
        <Input type="password" placeholder="Unchanged unless filled in" value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Consumer secret</Label>
        <Input type="password" placeholder="Unchanged unless filled in" value={consumerSecret} onChange={(e) => setConsumerSecret(e.target.value)} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}

const GOOGLE_SHEETS_MAPPING_FIELDS = [
  ['phone', 'Phone (required)'],
  ['name', 'Full name'],
  ['email', 'Email'],
  ['address', 'Address'],
  ['city', 'City'],
  ['state', 'State/Region'],
  ['country_code', 'Country code'],
  ['order_id', 'Order ID'],
  ['item_name', 'Item name'],
  ['sku', 'SKU'],
  ['quantity', 'Quantity'],
  ['unit_price', 'Unit price'],
] as const

function GoogleSheetsForm({ brandId, existing, onClose }: { brandId: string; existing: ExternalConnection | undefined; onClose: () => void }) {
  const upsert = useUpsertExternalConnection(brandId)
  const [spreadsheetId, setSpreadsheetId] = React.useState(existing?.google_spreadsheet_id ?? '')
  const [sheetName, setSheetName] = React.useState(existing?.google_sheet_name ?? '')
  const [mapping, setMapping] = React.useState<Record<string, string>>(existing?.google_column_mapping ?? {})
  const [error, setError] = React.useState<string | null>(null)
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined

  async function saveMapping() {
    setError(null)
    try {
      await upsert.mutateAsync({
        provider: 'google_sheets',
        googleSpreadsheetId: spreadsheetId || null,
        googleSheetName: sheetName || null,
        googleColumnMapping: mapping,
        googleHeaderRow: true,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Google Sheets configuration')
    }
  }

  async function connectGoogle() {
    setError(null)
    if (!clientId) {
      setError('Google Sheets is not configured for this deployment (missing VITE_GOOGLE_OAUTH_CLIENT_ID).')
      return
    }
    try {
      const connection = await upsert.mutateAsync({ provider: 'google_sheets' })
      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth-callback`
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/spreadsheets.readonly')
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', connection.id)
      window.location.href = authUrl.toString()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google sign-in')
    }
  }

  return (
    <div className="flex flex-col gap-3 p-6 pt-2">
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {existing?.google_connected ? <CheckCircle2 className="h-4 w-4 text-success" /> : null}
            {existing?.google_connected ? 'Signed in with Google' : 'Not signed in yet'}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={connectGoogle} disabled={upsert.isPending}>
            <ExternalLink className="h-3.5 w-3.5" />
            {existing?.google_connected ? 'Re-authorize' : 'Sign in with Google'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Spreadsheet ID</Label>
        <Input placeholder="from the sheet's URL: .../d/<spreadsheet_id>/edit" value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Sheet (tab) name</Label>
        <Input placeholder="Orders" value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Column mapping — enter each column's exact header text</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GOOGLE_SHEETS_MAPPING_FIELDS.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Input
                className="h-8 text-xs"
                value={mapping[key] ?? ''}
                onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={saveMapping} disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save mapping'}</Button>
      </div>
    </div>
  )
}

import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Upload, XCircle } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseCsvToObjects } from '@/lib/csv'

import { createManualOrder } from '../api'
import { useCampaignProducts, useMyAvailableCampaigns } from '../hooks'

const TEMPLATE_HEADERS = ['quantity', 'customer_name', 'customer_phone', 'customer_address', 'customer_state', 'customer_city', 'customer_email']

interface ImportRow {
  index: number
  quantity: string
  customer_name: string
  customer_phone: string
  customer_address: string
  customer_state: string
  customer_city: string
  customer_email: string
  status: 'pending' | 'submitting' | 'success' | 'error'
  error?: string
}

function downloadTemplate() {
  const sample = [
    TEMPLATE_HEADERS.join(','),
    '2,Adebayo Benson,08011112222,"No 4 Sample Street, Ikeja",Lagos,Ikeja,customer@example.com',
  ].join('\n')
  const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'affiliate-order-import-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function AffiliateImportOrdersPage() {
  const { data: campaigns } = useMyAvailableCampaigns()
  const [campaignId, setCampaignId] = React.useState('')
  const { data: products } = useCampaignProducts(campaignId || null)
  const [productId, setProductId] = React.useState('')
  const [rows, setRows] = React.useState<ImportRow[]>([])
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setParseError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const objects = parseCsvToObjects(text)
      if (objects.length === 0) {
        setParseError('The file has no data rows.')
        return
      }
      const missing = TEMPLATE_HEADERS.filter((h) => !(h in objects[0]))
      if (missing.length > 0) {
        setParseError(`Missing required column(s): ${missing.join(', ')}`)
        return
      }
      setRows(
        objects.map((obj, i) => ({
          index: i,
          quantity: obj.quantity || '1',
          customer_name: obj.customer_name || '',
          customer_phone: obj.customer_phone || '',
          customer_address: obj.customer_address || '',
          customer_state: obj.customer_state || '',
          customer_city: obj.customer_city || '',
          customer_email: obj.customer_email || '',
          status: 'pending',
        })),
      )
    }
    reader.readAsText(file)
  }

  async function handleSubmitAll() {
    if (!campaignId || !productId) return
    setSubmitting(true)
    for (const row of rows) {
      if (row.status === 'success') continue
      setRows((prev) => prev.map((r) => (r.index === row.index ? { ...r, status: 'submitting' } : r)))
      try {
        if (!row.customer_name || !row.customer_phone || !row.customer_address || !row.customer_state || !row.customer_city) {
          throw new Error('Missing a required field')
        }
        await createManualOrder({
          campaignId,
          productId,
          quantity: Number(row.quantity) || 1,
          customerName: row.customer_name,
          customerPhone: row.customer_phone,
          customerAddress: row.customer_address,
          customerState: row.customer_state,
          customerCity: row.customer_city,
          customerEmail: row.customer_email || undefined,
          idempotencyKey: crypto.randomUUID(),
        })
        setRows((prev) => prev.map((r) => (r.index === row.index ? { ...r, status: 'success' } : r)))
      } catch (err) {
        setRows((prev) =>
          prev.map((r) => (r.index === row.index ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : r)),
        )
      }
    }
    setSubmitting(false)
  }

  const successCount = rows.filter((r) => r.status === 'success').length
  const errorCount = rows.filter((r) => r.status === 'error').length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/affiliate/orders">
            <ArrowLeft className="h-4 w-4" />
            Back to My Orders
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Import Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Upload and confirm orders before sending to the main system.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Need a template?</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Download our CSV template with sample data and field descriptions.</p>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Download Template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose campaign &amp; product</CardTitle>
          <p className="text-sm text-muted-foreground">Every row in the file will be submitted as this one product, one campaign per import.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            value={campaignId}
            onValueChange={(v) => {
              setCampaignId(v)
              setProductId('')
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a campaign" />
            </SelectTrigger>
            <SelectContent>
              {(campaigns ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={productId} onValueChange={setProductId} disabled={!campaignId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a product" />
            </SelectTrigger>
            <SelectContent>
              {(products ?? []).map((p) => (
                <SelectItem key={p.id as string} value={p.id as string}>
                  {p.name as string}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload Order File</CardTitle>
          <p className="text-sm text-muted-foreground">Select a CSV file containing order details. XLSX is not supported yet.</p>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-10 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Upload className="h-6 w-6" />
            Click to select a CSV file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          {parseError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {parseError}
            </p>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">3. Review &amp; Submit ({rows.length} rows)</CardTitle>
            <div className="flex items-center gap-2">
              {successCount > 0 && <Badge variant="success">{successCount} submitted</Badge>}
              {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
              <Button onClick={handleSubmitAll} disabled={!campaignId || !productId || submitting}>
                {submitting ? 'Submitting…' : 'Submit All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Customer</th>
                  <th className="p-3 font-medium">Phone</th>
                  <th className="p-3 font-medium">Qty</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.index}>
                    <td className="p-3">{row.customer_name || <span className="text-destructive">missing</span>}</td>
                    <td className="p-3">{row.customer_phone || <span className="text-destructive">missing</span>}</td>
                    <td className="p-3">{row.quantity}</td>
                    <td className="p-3">
                      {row.status === 'pending' && <Badge variant="secondary">Pending</Badge>}
                      {row.status === 'submitting' && <Badge variant="secondary">Submitting…</Badge>}
                      {row.status === 'success' && (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" /> Submitted
                        </Badge>
                      )}
                      {row.status === 'error' && (
                        <Badge variant="destructive" title={row.error}>
                          <XCircle className="h-3 w-3" /> Failed
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

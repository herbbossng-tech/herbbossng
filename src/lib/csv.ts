/** Minimal RFC 4180 CSV parser: handles quoted fields, escaped quotes ("") and both \n/\r\n line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Parses CSV text into an array of objects keyed by the first row's headers. */
export function parseCsvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((header, i) => {
      obj[header] = (row[i] ?? '').trim()
    })
    return obj
  })
}

function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

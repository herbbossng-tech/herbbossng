/**
 * Scrolls to a specific section by id (a section's configured ctaTarget/
 * anchor) when given and present on the page; otherwise falls back to the
 * order form, then the package selector — the pre-existing default every
 * CTA used before per-section anchors were wired up.
 */
export function scrollToOrderArea(anchorId?: string) {
  const el = (anchorId ? document.getElementById(anchorId) : null) ?? document.getElementById('order-form') ?? document.getElementById('packages')
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function getSessionId(): string {
  const key = 'gcos_lp_session'
  try {
    let id = sessionStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(key, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

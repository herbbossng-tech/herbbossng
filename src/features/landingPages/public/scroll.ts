/**
 * Scrolls to a specific section by id (a section's configured ctaTarget/
 * anchor) when given and present on the page; otherwise falls back to the
 * package selector first, then the order form — a CTA should land the
 * visitor on "choose your package" as the natural next step, not skip
 * straight past it into the order form.
 */
export function scrollToOrderArea(anchorId?: string) {
  const el = (anchorId ? document.getElementById(anchorId) : null) ?? document.getElementById('packages') ?? document.getElementById('order-form')
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

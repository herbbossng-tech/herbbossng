/**
 * Scrolls to a specific section by id (a section's configured ctaTarget/
 * anchor) when given and present on the page; otherwise falls back to the
 * package selector first, then the order form — a CTA should land the
 * visitor on "choose your package" as the natural next step, not skip
 * straight past it into the order form.
 *
 * The package selector (id "packages") is centered in the viewport rather
 * than pinned to the top — landing on it top-aligned can crop its heading
 * under a sticky header/CTA and reads as jarring; centering keeps it in
 * context with what's above and below.
 */
export function scrollToOrderArea(anchorId?: string) {
  const el = (anchorId ? document.getElementById(anchorId) : null) ?? document.getElementById('packages') ?? document.getElementById('order-form')
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: el.id === 'packages' ? 'center' : 'start' })
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

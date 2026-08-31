export function scrollToOrderArea() {
  const el = document.getElementById('order-form') ?? document.getElementById('packages')
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

/**
 * GCOS affiliate order form embed loader.
 *
 * Usage on any external page:
 *   <div data-gcos-form="FORM_ID" data-origin="https://your-gcos-app.example.com"></div>
 *   <script src="https://your-gcos-app.example.com/embed/gcos-forms.js" defer></script>
 *
 * Scans the page for [data-gcos-form] placeholders, replaces each with a
 * responsive iframe pointing at /order/:formId?embed=1, and auto-resizes
 * the iframe height using postMessage from the embedded page — the same
 * pattern used by Typeform/Google Forms embeds, so a fixed height never
 * clips a longer/shorter form on the host page.
 */
(function () {
  function mount(el) {
    var formId = el.getAttribute('data-gcos-form')
    var origin = el.getAttribute('data-origin')
    if (!formId || !origin) return

    var iframe = document.createElement('iframe')
    iframe.src = origin.replace(/\/$/, '') + '/order/' + encodeURIComponent(formId) + '?embed=1'
    iframe.style.width = '100%'
    iframe.style.border = '0'
    iframe.style.minHeight = '400px'
    iframe.setAttribute('data-gcos-frame', formId)
    iframe.setAttribute('loading', 'lazy')
    iframe.setAttribute('title', 'Order form')

    el.appendChild(iframe)

    window.addEventListener('message', function (event) {
      var data = event.data
      if (!data || data.type !== 'gcos-form-height') return
      if (event.source !== iframe.contentWindow) return
      iframe.style.height = data.height + 'px'
    })
  }

  function mountAll() {
    var placeholders = document.querySelectorAll('[data-gcos-form]:not([data-gcos-mounted])')
    for (var i = 0; i < placeholders.length; i++) {
      placeholders[i].setAttribute('data-gcos-mounted', 'true')
      mount(placeholders[i])
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll)
  } else {
    mountAll()
  }
})()

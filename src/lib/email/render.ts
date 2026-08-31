export type EmailVariables = Record<string, string>;

export function substituteVariables(template: string, vars: EmailVariables): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => vars[key] ?? '');
}

/**
 * Wraps a body (already variable-substituted HTML/text) in the shared email
 * design system: dark-green header, white rounded card, label/value rows.
 * Matches the reference "NEW ORDER RECEIVED" email structure from the brief.
 */
export function renderEmailShell(params: {
  brandName: string;
  logoUrl?: string | null;
  primaryColor: string;
  headerText?: string;
  bodyHtml: string;
  footerText?: string;
  buttonText?: string;
  buttonUrl?: string;
}): string {
  const { brandName, primaryColor, headerText, bodyHtml, footerText, buttonText, buttonUrl } = params;

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eee;">
      <tr>
        <td style="background:${primaryColor};padding:28px 24px;text-align:center;color:#ffffff;">
          <div style="font-size:18px;font-weight:700;letter-spacing:0.5px;">${brandName}</div>
          ${headerText ? `<div style="margin-top:6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.85;">${headerText}</div>` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px;color:#1a1a1a;font-size:14px;line-height:1.6;">
          ${bodyHtml}
          ${
            buttonText && buttonUrl
              ? `<div style="text-align:center;margin-top:24px;"><a href="${buttonUrl}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;">${buttonText}</a></div>`
              : ''
          }
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#faf7f0;text-align:center;font-size:12px;color:#888;">
          ${footerText ?? brandName}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function orderSummaryRows(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
    ${rows
      .map(
        (r) => `<tr>
          <td style="padding:6px 0;color:#888;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;width:40%;vertical-align:top;">${r.label}</td>
          <td style="padding:6px 0;color:#1a1a1a;font-weight:500;">${r.value}</td>
        </tr>`
      )
      .join('')}
  </table>`;
}

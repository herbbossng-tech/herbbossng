import type { EmailTemplate } from "@/app/generated/prisma/client";

export type TemplateVariables = Record<string, string | number>;

function interpolate(text: string, variables: TemplateVariables): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

/**
 * Renders a stored EmailTemplate into a final subject + responsive HTML body.
 * The header/footer chrome (brand, colors, logo, button) comes from the
 * template's own fields so admins control the whole look, not just the copy.
 */
export function renderEmailTemplate(template: EmailTemplate, variables: TemplateVariables): { subject: string; html: string } {
  const subject = interpolate(template.subject, variables);
  const body = interpolate(template.bodyHtml, variables);
  const button =
    template.buttonText && template.buttonUrl
      ? `<tr><td style="padding:24px 32px 8px;text-align:center;">
           <a href="${escapeAttr(interpolate(template.buttonUrl, variables))}"
              style="display:inline-block;background:${template.accentColor};color:#1a1a1a;font-weight:700;
                     padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;">
             ${escapeHtml(interpolate(template.buttonText, variables))}
           </a>
         </td></tr>`
      : "";

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e0;">
            <tr>
              <td style="background:${template.headerColor};padding:28px 32px;text-align:center;">
                ${template.logoUrl ? `<img src="${escapeAttr(template.logoUrl)}" alt="${escapeAttr(template.brandName)}" height="32" style="margin-bottom:8px;" />` : ""}
                <div style="color:#ffffff;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">${escapeHtml(template.brandName)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;color:#1a1a1a;font-size:14px;line-height:1.6;">
                ${body}
              </td>
            </tr>
            ${button}
            <tr>
              <td style="padding:20px 32px 28px;color:#9a9a94;font-size:12px;text-align:center;border-top:1px solid #f0f0ec;margin-top:16px;">
                ${escapeHtml(template.footerText ?? template.brandName)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}

/**
 * Renders a label/value row table used inside order-related email bodies —
 * matches the two-column layout shown in the design reference.
 */
export function renderInfoRows(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
    ${rows
      .map(
        (row) => `<tr>
          <td style="padding:6px 0;color:#8a8a84;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;width:40%;vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${escapeHtml(row.value)}</td>
        </tr>`,
      )
      .join("")}
  </table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

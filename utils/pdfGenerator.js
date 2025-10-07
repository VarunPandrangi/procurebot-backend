const { chromium } = require('playwright');

// Defensive text cleanup for chat
function formatMessage(text) {
  if (!text) return "";
  let clean = text.replace(/[\*#]+/g, "");
  clean = clean.replace(/\n{2,}/g, "<br><br>");
  clean = clean.replace(/, *\n(?=\d)/g, ",");
  clean = clean.replace(/([^\n])\n([^\n-•0-9])/g, "$1 $2");
  clean = clean.replace(/([^\n])\n([A-Za-z])/g, "$1 $2");
  clean = clean.replace(/(\n|^)(\d+\.)/g, "<br>$2");
  clean = clean.replace(/(\n|^)- /g, "<br>- ");
  clean = clean.replace(/\n/g, "<br>");
  return clean.trim();
}

function renderKeyValueTable(title, rows) {
  return `
    <div class="section-title">${title}</div>
    <table class="info-table">
      ${rows.filter(([k, v]) => v !== undefined && v !== "")
        .map(([k, v]) =>
          `<tr>
            <td class="kv-label">${k}</td>
            <td class="kv-value">${v}</td>
          </tr>`
        ).join("")}
    </table>
  `;
}

function renderItemTable(idx, item) {
  return `
    <div class="section item-section">
      <div class="item-header">
        <svg class="item-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
        <span class="item-title">Requested Item ${idx + 1}</span>
      </div>
      ${renderKeyValueTable(
        "",
        [
          ["Item Name", item.name],
          ["Quantity", item.quantity],
          ["Unit", item.unit],
          ["Target Price", item.targetPrice],
          ["Quoted Price", item.quotedPrice],
          ["Payment Terms", item.paymentTerms],
          ["Freight Terms", item.freightTerms],
          ["Delivery Schedule", item.deliverySchedule],
          ["Warranty Terms", item.warrantyTerms],
          ["LD Clause", item.ldClause],
          ["Description", item.description]
        ]
      )}
    </div>
  `;
}

function renderChatHistory(history, buyerName, supplierName) {
  return history.map(msg => {
    let sender =
      msg.sender === "supplier" ? `Supplier: ${supplierName || "Supplier"}`
      : msg.sender === "AI_bot" || msg.sender === "buyer"
        ? `${buyerName || "AI Bot"} - AI Bot`
        : msg.sender === "system"
          ? "System"
          : (msg.sender || "");
    return `
      <div class="chat-msg">
        <span class="sender">${sender}:</span> 
        <span class="msg-text">${formatMessage(msg.text)}</span>
        <div class="timestamp">${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ""}</div>
      </div>
    `;
  }).join("");
}

// Main Playwright-based PDF export function:
async function generateNegotiationPDF(negotiation, pdfPath = null) {
  const target = negotiation.target_details || {};
  const buyerRows = [
    ["Company", target.company],
    ["Buyer Name", target.buyerName],
    ["Supplier", target.supplierName],
    ["Representative", target.representative],
    ["Currency", target.currency]
  ];

  // Item tables
  let itemsHtml = "";
  if (Array.isArray(target.items)) {
    itemsHtml = target.items.map((item, idx) => renderItemTable(idx, item)).join("");
  }

  // Final agreed terms (if present)
  let finalTermsHtml = "";
  if (negotiation.final_agreement_terms && typeof negotiation.final_agreement_terms === "object") {
    finalTermsHtml += renderKeyValueTable(
      "Final Agreed Terms",
      Object.entries(negotiation.final_agreement_terms)
    );
  }

  // Compose the HTML with premium design
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Negotiation Summary - ${negotiation.name || "Negotiation"}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
        color: #1a202c;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        padding: 0;
        margin: 0;
        line-height: 1.6;
      }
      
      /* Premium Header */
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 48px 60px;
        position: relative;
        overflow: hidden;
      }
      
      .header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
        opacity: 0.3;
      }
      
      .header-content {
        position: relative;
        z-index: 1;
      }
      
      .logo-text {
        font-size: 16px;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
        opacity: 0.95;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
      }
      
      .logo-text::before {
        content: '';
        display: inline-block;
        width: 20px;
        height: 20px;
        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3zM21 9H3M21 15H3M12 3v18"/></svg>');
        background-size: contain;
        margin-right: 10px;
      }
      
      .title {
        font-size: 36px;
        font-weight: 700;
        margin-bottom: 20px;
        letter-spacing: -0.5px;
      }
      
      .subtitle {
        font-size: 18px;
        opacity: 0.9;
        font-weight: 400;
      }
      
      /* Status Badge */
      .status-badge {
        display: inline-block;
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 16px;
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(10px);
      }
      
      /* Content Container */
      .container {
        max-width: 900px;
        margin: -30px auto 0;
        padding: 0 60px 60px;
        position: relative;
        z-index: 2;
      }
      
      /* Metadata Card */
      .meta-card {
        background: white;
        border-radius: 16px;
        padding: 32px;
        margin-bottom: 32px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
        border: 1px solid rgba(102, 126, 234, 0.1);
      }
      
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
      }
      
      .meta-item {
        padding: 16px;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 10px;
        border-left: 4px solid #667eea;
      }
      
      .meta-label {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #64748b;
        margin-bottom: 6px;
      }
      
      .meta-value {
        font-size: 15px;
        font-weight: 600;
        color: #1e293b;
      }
      
      /* Section Headers */
      .section {
        background: white;
        border-radius: 16px;
        padding: 32px;
        margin-bottom: 24px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
        border: 1px solid #e2e8f0;
      }
      
      .section-title {
        font-size: 20px;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 24px;
        padding-bottom: 12px;
        border-bottom: 3px solid #667eea;
        display: flex;
        align-items: center;
      }
      
      .section-title::before {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        background: #667eea;
        border-radius: 50%;
        margin-right: 12px;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
      }
      
      /* Info Table */
      .info-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin-bottom: 16px;
      }
      
      .info-table tr:not(:last-child) td {
        border-bottom: 1px solid #f1f5f9;
      }
      
      .info-table td {
        padding: 14px 16px;
        font-size: 14px;
      }
      
      .info-table .kv-label {
        font-weight: 600;
        color: #475569;
        width: 200px;
        background: #f8fafc;
      }
      
      .info-table .kv-value {
        color: #1e293b;
        font-weight: 500;
      }
      
      /* Item Cards */
      .item-section {
        background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 20px;
        border: 2px solid #e2e8f0;
      }
      
      .item-header {
        display: flex;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 2px solid #667eea;
      }
      
      .item-icon {
        width: 24px;
        height: 24px;
        color: #667eea;
        margin-right: 12px;
      }
      
      .item-title {
        font-size: 18px;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      
      .item-section .section-title {
        display: none;
      }
      
      /* Chat Section */
      .chat-section {
        background: white;
        border-radius: 16px;
        padding: 40px;
        margin-top: 32px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
        border: 1px solid #e2e8f0;
      }
      
      .chat-history-title {
        font-size: 24px;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 32px;
        padding-bottom: 16px;
        border-bottom: 3px solid #667eea;
        display: flex;
        align-items: center;
      }
      
      .chat-history-title::before {
        content: '';
        display: inline-block;
        width: 28px;
        height: 28px;
        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>');
        background-size: contain;
        margin-right: 12px;
      }
      
      .chat-msg {
        margin-bottom: 24px;
        padding: 20px 24px;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 12px;
        border-left: 4px solid #667eea;
        position: relative;
      }
      
      .chat-msg:nth-child(even) {
        background: linear-gradient(135deg, #fef3f2 0%, #fee2e2 100%);
        border-left-color: #f97316;
      }
      
      .sender {
        font-weight: 700;
        font-size: 14px;
        color: #667eea;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        display: block;
      }
      
      .chat-msg:nth-child(even) .sender {
        color: #f97316;
      }
      
      .msg-text {
        display: block;
        color: #334155;
        font-size: 14px;
        line-height: 1.7;
        margin: 12px 0;
      }
      
      .timestamp {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 500;
        margin-top: 8px;
        display: block;
      }
      
      /* Footer */
      .footer {
        text-align: center;
        padding: 40px 60px;
        color: #64748b;
        font-size: 13px;
        border-top: 2px solid #e2e8f0;
        margin-top: 40px;
      }
      
      .footer-text {
        margin-bottom: 8px;
      }
      
      .footer-date {
        font-weight: 600;
        color: #475569;
      }
      
      /* Print Optimization */
      @media print {
        body { background: white; }
        .section { page-break-inside: avoid; }
        .chat-msg { page-break-inside: avoid; }
        .header { page-break-after: avoid; }
      }
    </style>
  </head>
  <body>
    <!-- Premium Header -->
    <div class="header">
      <div class="header-content">
        <div class="logo-text">Thermo Bot</div>
        <div class="title">Negotiation Summary</div>
        <div class="subtitle">${negotiation.name || "Untitled Negotiation"}${target.supplierName ? ` • ${target.supplierName}` : ""}</div>
        <div class="status-badge">${negotiation.status || "Active"}</div>
      </div>
    </div>
    
    <!-- Content Container -->
    <div class="container">
      <!-- Metadata Card -->
      <div class="meta-card">
        <div class="meta-grid">
          <div class="meta-item">
            <div class="meta-label">Buyer Email</div>
            <div class="meta-value">${negotiation.buyer_email || "—"}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Supplier Email</div>
            <div class="meta-value">${negotiation.supplier_email || "—"}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Created At</div>
            <div class="meta-value">${negotiation.created_at || "—"}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Last Updated</div>
            <div class="meta-value">${negotiation.updated_at || "—"}</div>
          </div>
        </div>
      </div>
      
      <!-- Buyer Details Section -->
      <div class="section">
        ${renderKeyValueTable("Buyer Target Details", buyerRows)}
      </div>
      
      <!-- Items Sections -->
      ${itemsHtml}
      
      <!-- Final Terms Section -->
      ${finalTermsHtml ? `<div class="section">${finalTermsHtml}</div>` : ""}
      
      <!-- Chat History Section -->
      <div class="chat-section">
        <div class="chat-history-title">Full Chat History</div>
        ${renderChatHistory(negotiation.chat_history || [], target.buyerName, target.supplierName)}
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <div class="footer-text">Generated by Thermo Bot Negotiation Platform</div>
        <div class="footer-date">Document created on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
    </div>
  </body>
  </html>
  `;

  // Launch Chromium and generate the PDF using Playwright:
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.emulateMedia({ media: 'print' });

  // Playwright's pdf will only work in headless Chromium
  const buffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    path: pdfPath || undefined,
  });
  await browser.close();
  return buffer;
}

module.exports = generateNegotiationPDF;

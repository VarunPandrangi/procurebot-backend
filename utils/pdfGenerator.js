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
  return renderKeyValueTable(
    `Requested Item ${idx + 1}`,
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
  );
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

  // Compose the HTML
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Negotiation Summary - ${negotiation.name || "Negotiation"}</title>
    <style>
      body { font-family: Arial, sans-serif; margin:32px; color: #20232a; }
      .title { font-size: 22px; font-weight: bold; margin-bottom: 10px; text-align:center; }
      .section-title { font-size: 15px; font-weight: bold; margin: 18px 0 6px 0; background: #f3f6fa;}
      .info-table { border-collapse: collapse; width: 100%; background: #fbfdff; margin-bottom: 18px; }
      .info-table td { border: 1px solid #e3e7ee; padding: 7px 8px; font-size: 13px; }
      .info-table .kv-label { font-weight: bold; width:170px; background: #f5f7fa;}
      .info-table .kv-value { }
      .divider { border-bottom: 1.5px solid #bcbcbc; margin:24px 0 20px 0; }
      .meta { color: #4c4c4c; margin-bottom: 16px; }
      .chat { margin-top: 16px;}
      .chat-history-title { font-weight: bold; font-size:15px; margin-bottom:7px;}
      .chat-msg { margin-bottom: 12px; padding-bottom:6px; border-bottom: 1px dotted #e5e5e5;}
      .sender { font-weight: bold; color: #1e3050;}
      .msg-text { display:block; margin:5px 0 2px 2px; white-space:pre-line; }
      .timestamp { font-size:11px; color:#888; margin-left: 1px; }
      @media print {
        .divider { page-break-after: always; border: none; }
      }
    </style>
  </head>
  <body>
    <div class="title">
      Negotiation Summary: ${negotiation.name}${target.supplierName ? ` — ${target.supplierName}` : ""}
    </div>
    <div class="meta">
      Buyer Email: ${negotiation.buyer_email || "&mdash;"}<br/>
      Supplier Email: ${negotiation.supplier_email || "&mdash;"}<br/>
      Status: ${negotiation.status || "&mdash;"}<br/>
      Created At: ${negotiation.created_at || "&mdash;"}<br/>
      Ended At: ${negotiation.updated_at || "&mdash;"}
    </div>
    ${renderKeyValueTable("Buyer Target Details", buyerRows)}
    ${itemsHtml}
    ${finalTermsHtml}
    <div class="divider"></div>
    <div class="chat">
      <div class="chat-history-title">Full Chat History:</div>
      ${renderChatHistory(negotiation.chat_history || [], target.buyerName, target.supplierName)}
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

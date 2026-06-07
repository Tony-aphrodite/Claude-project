# Sales Logger Apps Script — boilerplate for Miguel

This is the per-sede Apps Script that our `close_sale` tool calls. Miguel needs to deploy ONE per sede (or one global script if all sedes write to the same workbook with different tabs).

## Deployment steps (per sede)

1. Open `DPM_Ventas_Master` Google Sheet
2. Extensions → Apps Script
3. Paste the code below
4. Adjust `SHEET_NAME` to match the tab for this sede
5. Adjust the `COLUMN_MAP` if his sheet has different column headers
6. Deploy → New deployment → Web app
   - Execute as: **Me (Miguel)**
   - Who has access: **Anyone with the link** (so our server can hit it without auth)
7. Copy the `/exec` URL
8. Send the URL → we put it in `sede.roster_config.sales_logger_url`

## The code

```javascript
// Sales Logger Apps Script — DPM_Ventas_Master
// Receives POST from the AI server's close_sale path.
// One row written per call (the server splits multi-program bookings
// into N calls, one per program).

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG — adjust these to match your sheet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SHEET_NAME = "Ventas"; // tab name inside the workbook

// Map our payload field names → column header text in your sheet.
// If a column doesn't exist in your sheet, omit it (it will be skipped).
// Order doesn't matter — we look up columns by header.
const COLUMN_MAP = {
  ref_code: "Código de referencia",
  programa: "Programa",
  turno: "Turno",
  pax: "Pax",
  monto: "Monto",
  moneda: "Moneda",
  sede: "Sede",
  start_date: "Fecha inicio",
  cliente_nombre: "Cliente",
  cliente_telefono: "Teléfono",
  descuento: "Descuento",
  agent: "Agente",
  closed_by_ai: "Cerrado por AI",
  logged_at: "Fecha registro",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN — don't touch below unless you know what you're doing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const row = payload.row;
    if (!row) {
      return jsonOut({ ok: false, error: "missing row in body" });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonOut({ ok: false, error: "sheet '" + SHEET_NAME + "' not found" });
    }

    // Read the header row (row 1) to map column positions.
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerToIdx = {};
    for (let i = 0; i < headers.length; i++) {
      headerToIdx[headers[i]] = i;
    }

    // Build a new row array sized to the sheet's column count.
    const newRow = new Array(headers.length).fill("");
    for (const fieldName in COLUMN_MAP) {
      const header = COLUMN_MAP[fieldName];
      const colIdx = headerToIdx[header];
      if (colIdx !== undefined && row[fieldName] !== undefined && row[fieldName] !== null) {
        newRow[colIdx] = row[fieldName];
      }
    }

    sheet.appendRow(newRow);
    const rowId = sheet.getLastRow();
    return jsonOut({ ok: true, rowId: String(rowId) });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Optional: GET endpoint for sanity check ("did my deploy work?")
function doGet() {
  return jsonOut({ ok: true, service: "sales-logger", sheet: SHEET_NAME });
}
```

## How we'll use the URL

Once Miguel sends the URL (one per sede, or one global URL if all sedes share):

```sql
UPDATE sedes
SET roster_config = roster_config || '{"sales_logger_url": "https://script.google.com/.../exec"}'::jsonb
WHERE nombre = 'Koh Phi Phi';
```

Then the AI's close_sale path writes rows automatically on every OCR-validated deposit.

## Testing the script (Miguel side)

After deploying, Miguel can test with curl:

```bash
curl -X POST "https://script.google.com/macros/s/AKf.../exec" \
  -H "Content-Type: application/json" \
  -d '{
    "row": {
      "ref_code": "DPM-PP-0606-TEST00",
      "programa": "OW",
      "turno": "AM/PM",
      "pax": 1,
      "monto": 40,
      "moneda": "USD",
      "sede": "Koh Phi Phi",
      "start_date": "2026-06-23",
      "cliente_nombre": "TEST CUSTOMER",
      "cliente_telefono": "+1234567890",
      "descuento": "Sin descuento",
      "agent": "Francisco",
      "closed_by_ai": true,
      "logged_at": "2026-06-06T21:00:00.000Z"
    }
  }'
```

Expected response: `{"ok": true, "rowId": "..."}`

A new row should appear in DPM_Ventas_Master.

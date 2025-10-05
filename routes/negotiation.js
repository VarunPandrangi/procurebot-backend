const express = require('express');
const router = express.Router();
const db = require('../models/Negotiation');
const generateNegotiationPDF = require('../utils/pdfGenerator');

// Create a new negotiation
router.post('/', (req, res) => {
  const {
    name,
    buyer_email,
    supplier_email,
    target_details,
    dashboard_code,
    negotiation_mode // <-- add this!
  } = req.body;

  const stmt = db.prepare(`
    INSERT INTO negotiations 
    (name, buyer_email, supplier_email, target_details, chat_history, status, created_at, updated_at, dashboard_code, negotiation_mode)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const emptyChat = JSON.stringify([]);

  stmt.run(
    name,
    buyer_email || "",
    supplier_email || "",
    JSON.stringify(target_details),
    emptyChat,
    now,
    now,
    dashboard_code || "",
    negotiation_mode || "",
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed to create negotiation" });
      }
      res.json({ id: this.lastID });
    }
  );
  stmt.finalize();
});

// Get a negotiation by ID
router.get('/:id', (req, res) => {
  db.get(
    `SELECT * FROM negotiations WHERE id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: "Failed to fetch negotiation" });
      }
      if (!row) return res.status(404).json({ error: "Not found" });
      // Parse JSON fields before returning
      row.target_details = row.target_details ? JSON.parse(row.target_details) : {};
      row.chat_history = row.chat_history ? JSON.parse(row.chat_history) : [];
      res.json(row);
    }
  );
});

// Update negotiation (add chat message, update status)
router.put('/:id', (req, res) => {
  const { chat_history, status } = req.body;
  const now = new Date().toISOString();
  const chat_history_json = JSON.stringify(chat_history);

  db.run(
    `UPDATE negotiations
     SET chat_history = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    [chat_history_json, status, now, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed to update negotiation" });
      }
      res.json({ updated: true });
    }
  );
});

// === UPDATED PDF EXPORT ROUTE ===
router.get('/:id/export-pdf', (req, res) => {
  db.get(
    `SELECT * FROM negotiations WHERE id = ?`,
    [req.params.id],
    async (err, row) => {
      if (err || !row) {
        res.status(404).send("Negotiation not found");
        return;
      }
      try {
        // Parse stored JSON
        const negotiation = {
          ...row,
          target_details: row.target_details ? JSON.parse(row.target_details) : {},
          chat_history: row.chat_history ? JSON.parse(row.chat_history) : [],
          final_agreement_terms: row.final_agreement_terms
            ? JSON.parse(row.final_agreement_terms)
            : null
        };
        const pdfBuffer = await generateNegotiationPDF(negotiation);
        res.setHeader('Content-disposition', `inline; filename=negotiation_${negotiation.id}.pdf`);
        res.contentType("application/pdf");
        res.send(pdfBuffer);
      } catch (e) {
        res.status(500).send("Could not generate PDF: " + e.message);
      }
    }
  );
});

// Securely list all negotiations for a specific buyer (POST, requires dashboard_code)
router.post('/by-buyer', (req, res) => {
  const { email, dashboard_code } = req.body;
  db.all(
    `SELECT id, name, status, created_at, updated_at, target_details FROM negotiations WHERE buyer_email = ? AND dashboard_code = ? ORDER BY created_at DESC`,
    [email, dashboard_code],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch negotiations" });
      res.json(rows || []);
    }
  );
});


// Check if code exists for an email (to know if code must be set or checked)
router.get('/code-exists/:email', (req, res) => {
  db.get(
    `SELECT dashboard_code FROM negotiations WHERE buyer_email = ? AND dashboard_code IS NOT NULL AND dashboard_code != "" LIMIT 1`,
    [req.params.email],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Error during lookup." });
      res.json({ exists: !!row });
    }
  );
});

// Delete a negotiation (requires buyer email and dashboard code for security)
router.delete('/:id', (req, res) => {
  const { email, dashboard_code } = req.body;
  const { id } = req.params;

  // First verify the negotiation belongs to this buyer and matches the dashboard code
  db.get(
    `SELECT id FROM negotiations WHERE id = ? AND buyer_email = ? AND dashboard_code = ?`,
    [id, email, dashboard_code],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: "Failed to verify negotiation" });
      }
      if (!row) {
        return res.status(403).json({ error: "Unauthorized or negotiation not found" });
      }

      // Proceed with deletion
      db.run(
        `DELETE FROM negotiations WHERE id = ?`,
        [id],
        function (err) {
          if (err) {
            return res.status(500).json({ error: "Failed to delete negotiation" });
          }
          res.json({ deleted: true, id: id });
        }
      );
    }
  );
});

module.exports = router;

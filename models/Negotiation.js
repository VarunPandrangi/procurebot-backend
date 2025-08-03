const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./negotiations.db');

// Create table if not exists (run every time; harmless)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS negotiations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      buyer_email TEXT,
      supplier_email TEXT,
      target_details TEXT,        -- JSON string
      chat_history TEXT,          -- JSON stringified array
      status TEXT,                -- 'active', 'concluded'
      created_at TEXT,            -- ISO timestamp
      updated_at TEXT             -- ISO timestamp
    )
  `);
});

module.exports = db;

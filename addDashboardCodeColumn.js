const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./negotiations.db');

db.serialize(() => {
  db.run(`ALTER TABLE negotiations ADD COLUMN dashboard_code TEXT`, err => {
    if (err) {
      if (err.message && err.message.includes("duplicate")) {
        console.log("Column already exists.");
      } else if (err.message && err.message.includes("duplicate column name")) {
        console.log("dashboard_code column already exists.");
      } else {
        console.log("Some other error:", err.message);
      }
    } else {
      console.log("dashboard_code column added!");
    }
    db.close();
  });
});

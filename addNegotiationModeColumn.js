const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./negotiations.db');
db.run(`ALTER TABLE negotiations ADD COLUMN negotiation_mode TEXT`, err => {
  if (err && !/duplicate/i.test(err.message)) console.log(err);
  else console.log("Column added or already exists.");
  db.close();
});

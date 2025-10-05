const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'negotiations.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Add stage column if it doesn't exist
  db.run(`
    ALTER TABLE negotiations 
    ADD COLUMN stage INTEGER DEFAULT 1
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✅ Column "stage" already exists');
      } else {
        console.error('❌ Error adding stage column:', err.message);
      }
    } else {
      console.log('✅ Successfully added "stage" column to negotiations table');
    }
  });

  // Add final_agreement_terms column if it doesn't exist
  db.run(`
    ALTER TABLE negotiations 
    ADD COLUMN final_agreement_terms TEXT
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✅ Column "final_agreement_terms" already exists');
      } else {
        console.error('❌ Error adding final_agreement_terms column:', err.message);
      }
    } else {
      console.log('✅ Successfully added "final_agreement_terms" column to negotiations table');
    }
    
    db.close(() => {
      console.log('✅ Database migration complete!');
      process.exit(0);
    });
  });
});

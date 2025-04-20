const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Crear o abrir la base de datos local
const db = new sqlite3.Database(path.join(__dirname, 'playlists.db'));

// Crear tabla si no existe
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      images TEXT,
      total_tracks INTEGER,
      total_duration_ms INTEGER,
      last_added_at TEXT,
      owner_id TEXT
    )
  `);
});

module.exports = {
  insertPlaylists(playlists) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO playlists
        (id, name, description, images, total_tracks, total_duration_ms, last_added_at, owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const pl of playlists) {
        stmt.run(
          pl.id,
          pl.name,
          pl.description || '',
          JSON.stringify(pl.images || []),
          pl.total_tracks,
          pl.total_duration_ms,
          pl.last_added_at,
          pl.owner_id
        );
      }

      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  getAllPlaylists() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM playlists', [], (err, rows) => {
        if (err) reject(err);
        else {
          const playlists = rows.map(row => ({
            ...row,
            images: JSON.parse(row.images)
          }));
          resolve(playlists);
        }
      });
    });
  },

  clearPlaylists() {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM playlists', [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

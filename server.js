const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
const db = new sqlite3.Database("./database.db");

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT,
    completed BOOLEAN,
    list TEXT
  )`);
});

app.get("/todos", (req, res) => {
  db.all("SELECT * FROM todos", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/todos", (req, res) => {
  const { text, list } = req.body;
  db.run("INSERT INTO todos (text, completed, list) VALUES (?, ?, ?)", [text, false, list], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.put("/todos/:id", (req, res) => {
  const { completed } = req.body;
  db.run("UPDATE todos SET completed = ? WHERE id = ?", [completed, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

app.delete("/todos/:id", (req, res) => {
  db.run("DELETE FROM todos WHERE id = ?", req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.listen(3000, () => {
  console.log("✅ Sunucu çalışıyor: http://localhost:3000");
});
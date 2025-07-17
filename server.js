const session = require('express-session');
const bcrypt = require('bcrypt');
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
  list TEXT,
  userId INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`);
});

app.use(session({
  secret: 'gizli-bir-key',
  resave: false,
  saveUninitialized: true,
}));

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Eksik bilgi" });

  const password_hash = await bcrypt.hash(password, 10);

  db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, password_hash], function(err) {
    if (err) return res.status(500).json({ error: "Kullanıcı adı alınmış olabilir." });
    res.json({ success: true });
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Eksik bilgi" });

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Kullanıcı bulunamadı" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Şifre yanlış" });

    req.session.userId = user.id;
    res.json({ success: true });
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Çıkış başarısız" });
    res.json({ success: true });
  });
});

app.get("/todos", (req, res) => {
  const userId = req.session.userId || null;

  db.all("SELECT * FROM todos WHERE userId IS ? OR userId IS NULL", [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/todos", (req, res) => {
  const { text, list } = req.body;
  const userId = req.session.userId || null;

  if (!userId) {
    db.get("SELECT COUNT(*) AS count FROM todos WHERE userId IS NULL", (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row.count >= 10) {
        return res.status(403).json({ error: "Ziyaretçi olarak en fazla 10 todo ekleyebilirsin." });
      }

      db.run("INSERT INTO todos (text, completed, list, userId) VALUES (?, ?, ?, NULL)", [text, false, list], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      });
    });
  } else {
    db.run("INSERT INTO todos (text, completed, list, userId) VALUES (?, ?, ?, ?)", [text, false, list, userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
  }
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

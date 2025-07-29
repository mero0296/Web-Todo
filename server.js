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
    dueDate TEXT,
    createdAt TEXT,
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

function authMiddleware(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Not authorized" });
    }
    next();
}

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Eksik bilgi" });

  const password_hash = await bcrypt.hash(password, 10);

  db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, password_hash], function(err) {
    if (err) return res.status(500).json({ error: "Kullanıcı adı alınmış olabilir." });
    res.json({ success: true });
  });
});

app.post("/register-guest", async (req, res) => {
  function generateGuestUsername() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let username = '';
    for (let i = 0; i < 10; i++) {
      username += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return username;
  }

  const tryCreate = async () => {
    const guestUsername = generateGuestUsername();
    try {
      const password_hash = await bcrypt.hash("guestpass", 10);

      db.run(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        [guestUsername, password_hash],
        function (err) {
          if (err) {
            if (err.message.includes("UNIQUE constraint failed")) {
              return tryCreate(); // tekrar dene
            }
            console.error("🚨 Guest oluşturulamadı:", err);
            return res.status(500).json({ error: "Veritabanı hatası (insert)" });
          }

          req.session.userId = this.lastID;
          console.log("✅ Yeni guest oluşturuldu:", guestUsername, "ID:", this.lastID);

          return res.json({ success: true, guestUsername });
        }
      );
    } catch (error) {
      console.error("🚨 Bcrypt hash hatası:", error);
      return res.status(500).json({ error: "Şifre oluşturulamadı" });
    }
  };

  await tryCreate();
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Eksik bilgi" });

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Kullanıcı bulunamadı" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Şifre yanlış" });

    req.session.userId = user.id;
    res.json({ success: true, username: user.username });
  });
});

app.post("/logout", (req, res) => {
  const userId = req.session.userId;

  db.get("SELECT username FROM users WHERE id = ?", [userId], (err, row) => {
    if (err || !row) {
      req.session.destroy(() => {
        return res.json({ success: true });
      });
      return;
    }

    const isGuest = row.username.length === 10;
    req.session.destroy(err => {
      if (err) return res.status(500).json({ error: "Çıkış başarısız" });

      if (isGuest) {
        db.run("DELETE FROM todos WHERE userId = ?", [userId], (err) => {
          if (err) console.error("🚨 Ziyaretçi todo silme hatası:", err);
        });

        db.run("DELETE FROM users WHERE id = ?", [userId], (err) => {
          if (err) console.error("🚨 Ziyaretçi silinemedi:", err);
        });
      }

      res.json({ success: true });
    });
  });
});

app.get("/auth-status", (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });

  db.get("SELECT username FROM users WHERE id = ?", [req.session.userId], (err, row) => {
    if (err || !row) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, username: row.username });
  });
});

app.get("/todos", (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.json([]);
  }

  db.all("SELECT * FROM todos WHERE userId = ?", [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/todos", (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: "Sadece giriş yapmış kullanıcılar todo ekleyebilir." });
    }

    const { text, list, dueDate } = req.body;
    const createdAt = new Date().toISOString();

    db.run(
        `INSERT INTO todos (text, list, dueDate, createdAt, userId, completed) VALUES (?, ?, ?, ?, ?, 0)`,
        [text, list, dueDate, createdAt, userId],
        function (err) {
            if (err) return res.status(500).json({ error: "Veritabanı hatası" });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put("/todos/:id", (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { text, list, dueDate } = req.body;

    db.run(
        `UPDATE todos SET text = ?, list = ?, dueDate = ? WHERE id = ? AND userId = ?`,
        [text, list, dueDate, id, userId],
        function (err) {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json({ success: true });
        }
    );
});

app.delete("/todos/:id", (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  db.run("DELETE FROM todos WHERE id = ? AND userId = ?", [req.params.id, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.patch("/todos/:id/complete", (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { completed } = req.body;

  db.run(
    `UPDATE todos SET completed = ? WHERE id = ? AND userId = ?`,
    [completed ? 1 : 0, id, userId],
    function (err) {
      if (err) return res.status(500).json({ error: "Tamamlama güncellenemedi" });
      res.json({ success: true });
    }
  );
});

app.listen(3000, () => {
  console.log("✅ Sunucu çalışıyor: http://localhost:3000");
});

app.listen(3000, () => {
  console.log("✅ Sunucu çalışıyor: http://localhost:3000");
});

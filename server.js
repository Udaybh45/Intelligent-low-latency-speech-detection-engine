import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import session from "express-session";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

// Redirect root depending on authentication before serving static files
app.get("/", (req, res) => {
  if (req.session && req.session.userId) return res.redirect("/index.html");
  return res.redirect("/login.html");
});

app.use(express.static(path.join(__dirname, "public")));

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || process.env.PG_CONNECTION || undefined,
});

// Initialize DB tables if they don't exist
(async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        original TEXT,
        cleaned TEXT,
        created_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log("DB initialized");
  } catch (err) {
    console.error("Error initializing DB:", err);
  }
})();

function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
      [username, hashed]
    );
    req.session.userId = result.rows[0].id;
    res.json({ ok: true, user: { id: result.rows[0].id, username } });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "User exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });
  try {
    const result = await pool.query(
      "SELECT id, password FROM users WHERE username = $1",
      [username]
    );
    if (!result.rows.length)
      return res.status(401).json({ error: "Invalid credentials" });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    req.session.userId = user.id;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/save-transcript", ensureAuthenticated, async (req, res) => {
  const { original_transcript, cleaned_transcript } = req.body || {};
  try {
    const result = await pool.query(
      "INSERT INTO transcripts (user_id, original, cleaned) VALUES ($1, $2, $3) RETURNING id, created_at",
      [
        req.session.userId,
        original_transcript || null,
        cleaned_transcript || null,
      ]
    );
    res.json({
      ok: true,
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save" });
  }
});

app.get("/history", ensureAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, original, cleaned, created_at FROM transcripts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
      [req.session.userId]
    );
    res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch history" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

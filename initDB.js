// =======================
// 📌 Inicialización de la BD (Products + Categories)
// =======================
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
require("dotenv").config(); // 🔧 CORREGIDO: Busca .env automáticamente

// -----------------------
// 🔹 Detectar entorno
// -----------------------
let connectionString = process.env.DATABASE_URL;

// Si no hay DATABASE_URL, tiramos error
if (!connectionString) {
  console.error("❌ No se encontró DATABASE_URL en .env.local o .env");
  process.exit(1);
}

// Railway requiere SSL
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("railway")  // 🔧 MEJORADO: Detecta Railway mejor
    ? { rejectUnauthorized: false }
    : false
});

// -----------------------
// 🔹 Script SQL
// -----------------------
const sql = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  shortDesc TEXT,
  price NUMERIC(10,2) NOT NULL,
  category TEXT,
  discount INT,
  stock INT DEFAULT 0,
  images TEXT[]
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT NOT NULL
);
`;

// -----------------------
// 🔹 Ejecutar script
// -----------------------
async function init() {
  try {
    console.log("🚀 Inicializando base de datos...");
    await pool.query(sql);
    console.log("✅ Tablas creadas correctamente.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error inicializando la BD:", err);
    process.exit(1);
  }
}

init();
// =======================
// 📌 DEPENDENCIAS
// =======================
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config(); // Para leer variables de entorno en local

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =======================
// 📌 CONEXIÓN A POSTGRES SEGURA
// =======================
let connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" 
    ? { rejectUnauthorized: false }  // Railway producción
    : false                          // Local sin SSL
});

// =======================
// 📌 FUNCIONES HELPER SEGURAS
// =======================
async function insertOrUpdateCategory(name, label) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      'SELECT id FROM categories WHERE name = $1',
      [name]
    );

    if (existingResult.rows.length > 0) {
      const result = await client.query(`
        UPDATE categories SET label = $2 WHERE name = $1 RETURNING id
      `, [name, label]);
      await client.query('COMMIT');
      return result.rows[0];
    } else {
      const result = await client.query(`
        INSERT INTO categories (name, label) VALUES ($1, $2) RETURNING id
      `, [name, label]);
      await client.query('COMMIT');
      return result.rows[0];
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function processCategoriesBatch(categories) {
  const results = [];
  for (const category of categories) {
    if (category.name && category.label) {
      try {
        const result = await insertOrUpdateCategory(category.name, category.label);
        results.push(result);
      } catch (error) {
        console.error(`❌ Error procesando categoría ${category.name}:`, error.message);
      }
    }
  }
  return results;
}

// =======================
// 📌 CREAR TABLAS SI NO EXISTEN
// =======================
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        shortDesc TEXT,
        price DECIMAL(10, 2),
        category VARCHAR(100),
        discount INTEGER DEFAULT 0,
        stock INTEGER DEFAULT 0,
        images TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        label VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Garantizar restricción única
    try {
      const constraintCheck = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints 
        WHERE table_name = 'categories' 
        AND constraint_name = 'categories_name_unique'
      `);
      if (constraintCheck.rows.length === 0) {
        await pool.query(`
          ALTER TABLE categories ADD CONSTRAINT categories_name_unique UNIQUE (name)
        `);
        console.log("✅ Restricción única agregada a categories.name");
      }
    } catch (e) {
      console.log("ℹ️ Restricción ya existente o no necesaria");
    }

    // Insertar categorías por defecto si no hay ninguna
    const existingCategories = await pool.query('SELECT COUNT(*) FROM categories');
    if (existingCategories.rows[0].count == 0) {
      const defaultCategories = [
        { name: 'electronics', label: 'Electrónicos' },
        { name: 'clothing', label: 'Ropa' },
        { name: 'books', label: 'Libros' },
        { name: 'home', label: 'Hogar' },
        { name: 'sports', label: 'Deportes' }
      ];
      await processCategoriesBatch(defaultCategories);
      console.log("✅ Categorías por defecto insertadas");
    }

    console.log("✅ Tablas creadas/verificadas correctamente");
  } catch (err) {
    console.error("❌ Error inicializando base de datos:", err.message);
  }
};

// Probar conexión al arrancar
pool.connect()
  .then(client => {
    console.log("✅ Conectado a PostgreSQL");
    client.release();
    initDatabase();
  })
  .catch(err => {
    console.error("❌ Error conectando a PostgreSQL:", err.message);
  });

// =======================
// 📌 RUTAS ESTÁTICAS
// =======================
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin-alt', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// =======================
// 📌 API - PRODUCTOS Y CATEGORÍAS
// =======================
app.get('/api/data', async (req, res) => {
  try {
    const products = await pool.query('SELECT * FROM products ORDER BY id DESC');
    const categories = await pool.query('SELECT * FROM categories ORDER BY id ASC');
    res.json({
      products: products.rows,
      categories: categories.rows,
      discounts: [],
      config: {
        whatsapp: {
          number: "929528308",
          message: "Hola! Estoy interesado en {PRODUCT_NAME}, precio S/. {PRICE}"
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos", details: err.message });
  }
});

// =======================
// 📌 UPLOAD DE IMÁGENES
// =======================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  }
});

app.post('/api/upload', upload.array('images'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: "No se subieron imágenes" });
  }
  const urls = req.files.map(file => `/uploads/${file.filename}`);
  res.json({ success: true, urls });
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// 📌 TEST
// =======================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    message: "✅ API funcionando correctamente",
    environment: process.env.NODE_ENV || 'development'
  });
});

// =======================
// 📌 INICIO SERVIDOR
// =======================
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📱 Panel admin en: /admin`);
  console.log(`🏪 Tienda en: /`);
});

server.on('error', (err) => {
  console.error('❌ Error del servidor:', err);
});

process.on('SIGTERM', () => {
  console.log('👋 Cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

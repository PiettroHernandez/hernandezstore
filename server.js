// =======================
// 📌 DEPENDENCIAS
// =======================
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =======================
// 📌 CONEXIÓN A POSTGRES (Railway lo da con DATABASE_URL)
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =======================
// 📌 RUTAS ESTÁTICAS
// =======================
// Sirve la tienda
app.use('/', express.static(path.join(__dirname, 'public')));

// Sirve el panel de administración
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// =======================
// 📌 API - PRODUCTOS Y CATEGORÍAS
// =======================

// Obtener todo (productos + categorías)
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
    console.error("❌ Error obteniendo datos:", err);
    res.status(500).send("Error al obtener datos");
  }
});

// Agregar producto
app.post('/api/products', async (req, res) => {
  const { name, shortDesc, price, category, discount, stock, images } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, shortDesc, price, category, discount, stock, images) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, shortDesc, price, category, discount, stock, images]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error agregando producto:", err);
    res.status(500).send("Error al agregar producto");
  }
});

// Editar producto
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, shortDesc, price, category, discount, stock, images } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name=$1, shortDesc=$2, price=$3, category=$4, discount=$5, stock=$6, images=$7 WHERE id=$8 RETURNING *',
      [name, shortDesc, price, category, discount, stock, images, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error editando producto:", err);
    res.status(500).send("Error al editar producto");
  }
});

// Eliminar producto
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error eliminando producto:", err);
    res.status(500).send("Error al eliminar producto");
  }
});

// =======================
// 📌 API - CATEGORÍAS
// =======================

// Agregar categoría
app.post('/api/categories', async (req, res) => {
  const { name, label } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO categories (name, label) VALUES ($1,$2) RETURNING *',
      [name, label]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error agregando categoría:", err);
    res.status(500).send("Error al agregar categoría");
  }
});

// =======================
// 📌 INICIO SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

// =======================
// 📌 DEPENDENCIAS
// =======================
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =======================
// 📌 CONEXIÓN A SQLITE
// =======================
const dbPath = path.join(__dirname, 'tienda.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error conectando a SQLite:', err.message);
  } else {
    console.log('✅ Conectado a SQLite');
  }
});

// =======================
// 📌 CREAR TABLAS SI NO EXISTEN
// =======================
const initDatabase = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tabla productos
      db.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          shortDesc TEXT,
          price REAL,
          category TEXT,
          discount INTEGER DEFAULT 0,
          stock INTEGER DEFAULT 0,
          images TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('❌ Error creando tabla products:', err);
      });

      // Tabla categorías
      db.run(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('❌ Error creando tabla categories:', err);
      });

      // Insertar categorías por defecto
      db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
        if (!err && row.count === 0) {
          const defaultCategories = [
            ['electronics', 'Electrónicos'],
            ['clothing', 'Ropa'],
            ['books', 'Libros'],
            ['home', 'Hogar'],
            ['sports', 'Deportes']
          ];

          const stmt = db.prepare('INSERT INTO categories (name, label) VALUES (?, ?)');
          defaultCategories.forEach(cat => stmt.run(cat));
          stmt.finalize();
          console.log('✅ Categorías por defecto insertadas');
        }
      });

      console.log('✅ Base de datos SQLite inicializada');
      resolve();
    });
  });
};

// Inicializar base de datos
initDatabase();

// =======================
// 📌 FUNCIONES HELPER
// =======================
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// =======================
// 📌 RUTAS ESTÁTICAS
// =======================
app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// =======================
// 📌 API - PRODUCTOS Y CATEGORÍAS
// =======================
app.get('/api/data', async (req, res) => {
  try {
    const products = await allQuery('SELECT * FROM products ORDER BY id DESC');
    const categories = await allQuery('SELECT * FROM categories ORDER BY id ASC');
    
    // Parsear imágenes JSON
    const processedProducts = products.map(product => ({
      ...product,
      images: product.images ? JSON.parse(product.images) : []
    }));

    res.json({
      products: processedProducts,
      categories: categories,
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
// 📌 RUTAS CRUD PRODUCTOS
// =======================

// Crear producto
app.post('/api/products', async (req, res) => {
  try {
    const { name, shortDesc, price, category, discount, stock, images } = req.body;
    
    const result = await runQuery(`
      INSERT INTO products (name, shortDesc, price, category, discount, stock, images)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, shortDesc, price, category, discount || 0, stock || 0, JSON.stringify(images || [])]);
    
    const newProduct = await getQuery('SELECT * FROM products WHERE id = ?', [result.id]);
    newProduct.images = JSON.parse(newProduct.images || '[]');
    
    res.json({ success: true, product: newProduct });
  } catch (err) {
    res.status(500).json({ error: "Error creando producto", details: err.message });
  }
});

// Obtener un producto específico
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await getQuery('SELECT * FROM products WHERE id = ?', [id]);
    
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    product.images = JSON.parse(product.images || '[]');
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo producto", details: err.message });
  }
});

// Actualizar producto
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, shortDesc, price, category, discount, stock, images } = req.body;
    
    await runQuery(`
      UPDATE products 
      SET name = ?, shortDesc = ?, price = ?, category = ?, 
          discount = ?, stock = ?, images = ?
      WHERE id = ?
    `, [name, shortDesc, price, category, discount, stock, JSON.stringify(images), id]);
    
    const updatedProduct = await getQuery('SELECT * FROM products WHERE id = ?', [id]);
    if (!updatedProduct) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    updatedProduct.images = JSON.parse(updatedProduct.images || '[]');
    res.json({ success: true, product: updatedProduct });
  } catch (err) {
    res.status(500).json({ error: "Error actualizando producto", details: err.message });
  }
});

// Eliminar producto
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await runQuery('DELETE FROM products WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    res.json({ success: true, message: "Producto eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error eliminando producto", details: err.message });
  }
});

// =======================
// 📌 RUTAS DE CARRITO Y COMPRA
// =======================

// Procesar compra y redirigir a WhatsApp
app.post('/api/purchase', async (req, res) => {
  try {
    const { cart, customerData } = req.body;
    
    if (!cart || cart.length === 0) {
      return res.status(400).json({ error: "Carrito vacío" });
    }
    
    // Calcular total
    let total = 0;
    let productDetails = [];
    
    for (const item of cart) {
      const product = await getQuery('SELECT * FROM products WHERE id = ?', [item.id]);
      if (product) {
        const itemTotal = product.price * item.quantity;
        total += itemTotal;
        productDetails.push(`${product.name} x${item.quantity} - S/. ${itemTotal.toFixed(2)}`);
      }
    }
    
    // Crear mensaje para WhatsApp
    const whatsappNumber = "929528308";
    let message = `🛒 *Nueva Compra*\n\n`;
    message += `👤 *Cliente:* ${customerData.name || 'No especificado'}\n`;
    message += `📱 *Teléfono:* ${customerData.phone || 'No especificado'}\n`;
    message += `📧 *Email:* ${customerData.email || 'No especificado'}\n\n`;
    message += `🛍️ *Productos:*\n`;
    message += productDetails.join('\n') + '\n\n';
    message += `💰 *Total: S/. ${total.toFixed(2)}*`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
    
    res.json({ 
      success: true, 
      whatsappUrl,
      total,
      message: "Compra procesada. Serás redirigido a WhatsApp."
    });
    
  } catch (err) {
    res.status(500).json({ error: "Error procesando compra", details: err.message });
  }
});

// =======================
// 📌 RUTAS CATEGORÍAS CRUD
// =======================

// Crear categoría
app.post('/api/categories', async (req, res) => {
  try {
    const { name, label } = req.body;
    
    // Intentar actualizar primero
    const existing = await getQuery('SELECT id FROM categories WHERE name = ?', [name]);
    
    if (existing) {
      await runQuery('UPDATE categories SET label = ? WHERE name = ?', [label, name]);
      const updated = await getQuery('SELECT * FROM categories WHERE name = ?', [name]);
      res.json({ success: true, category: updated });
    } else {
      const result = await runQuery('INSERT INTO categories (name, label) VALUES (?, ?)', [name, label]);
      const newCategory = await getQuery('SELECT * FROM categories WHERE id = ?', [result.id]);
      res.json({ success: true, category: newCategory });
    }
  } catch (err) {
    res.status(500).json({ error: "Error creando categoría", details: err.message });
  }
});

// Eliminar categoría
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await runQuery('DELETE FROM categories WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    
    res.json({ success: true, message: "Categoría eliminada" });
  } catch (err) {
    res.status(500).json({ error: "Error eliminando categoría", details: err.message });
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
    environment: process.env.NODE_ENV || 'development',
    database: 'SQLite'
  });
});

// =======================
// 📌 INICIO SERVIDOR
// =======================
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📱 Panel admin en: http://localhost:${PORT}/admin`);
  console.log(`🏪 Tienda en: http://localhost:${PORT}/`);
});

server.on('error', (err) => {
  console.error('❌ Error del servidor:', err);
});

process.on('SIGTERM', () => {
  console.log('👋 Cerrando servidor...');
  db.close();
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});
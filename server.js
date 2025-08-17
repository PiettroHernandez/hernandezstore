// =======================
// 📌 DEPENDENCIAS
// =======================
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
require('dotenv').config(); // Para leer variables de entorno en local

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =======================
// 📌 CONEXIÓN A POSTGRES
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Railway requiere SSL
  }
});

// =======================
// 📌 CREAR TABLAS SI NO EXISTEN
// =======================
const initDatabase = async () => {
  try {
    // Crear tabla products
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

    // Crear tabla categories
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        label VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insertar categorías por defecto si no existen
    const existingCategories = await pool.query('SELECT COUNT(*) FROM categories');
    if (existingCategories.rows[0].count == 0) {
      await pool.query(`
        INSERT INTO categories (name, label) VALUES 
        ('electronics', 'Electrónicos'),
        ('clothing', 'Ropa'),
        ('books', 'Libros'),
        ('home', 'Hogar'),
        ('sports', 'Deportes')
      `);
      console.log("✅ Categorías por defecto insertadas");
    } else {
      console.log("✅ Categorías ya existen, no se insertaron duplicados");
    }

    console.log("✅ Tablas creadas/verificadas correctamente");

  } catch (err) {
    console.error("❌ Error inicializando base de datos:", err);
  }
};

// Probar conexión al arrancar e inicializar BD
pool.connect()
  .then(client => {
    console.log("✅ Conectado a PostgreSQL");
    client.release();
    // Inicializar tablas después de conectar
    initDatabase();
  })
  .catch(err => {
    console.error("❌ Error conectando a PostgreSQL:", err);
    console.log("💡 Asegúrate de que PostgreSQL esté corriendo y la configuración sea correcta");
  });

// =======================
// 📌 RUTAS ESTÁTICAS
// =======================
// Sirve la tienda pública
app.use('/', express.static(path.join(__dirname, 'public')));

// Sirve el panel de administración (CORREGIDO)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Ruta alternativa si usas admin.html directamente
app.get('/admin-alt', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// =======================
// 📌 API - PRODUCTOS Y CATEGORÍAS
// =======================

// Obtener productos y categorías
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
    res.status(500).json({ error: "Error al obtener datos" });
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
    res.status(500).json({ error: "Error al agregar producto" });
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
    res.status(500).json({ error: "Error al editar producto" });
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
    res.status(500).json({ error: "Error al eliminar producto" });
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
    res.status(500).json({ error: "Error al agregar categoría" });
  }
});

// =======================
// 📌 APIS FALTANTES PARA EL ADMIN
// =======================

// Guardar todos los datos (usado por el admin)
app.post('/api/saveAll', async (req, res) => {
  const { products, categories } = req.body;
  try {
    console.log("💾 Guardando datos en batch...");
    
    // Si hay productos, procesarlos
    if (products && Array.isArray(products)) {
      for (const product of products) {
        if (product.id && typeof product.id === 'number' && product.id > 1000000) {
          // Es un producto nuevo (ID timestamp)
          const existingProduct = await pool.query('SELECT id FROM products WHERE name = $1 AND price = $2', [product.name, product.price]);
          
          if (existingProduct.rows.length === 0) {
            // Producto nuevo, insertarlo
            await pool.query(
              'INSERT INTO products (name, shortDesc, price, category, discount, stock, images) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [product.name, product.shortDesc || '', product.price, product.category || '', product.discount || 0, product.stock || 0, product.images || []]
            );
            console.log(`➕ Producto agregado: ${product.name}`);
          }
        } else {
          // Es un producto existente, actualizarlo
          await pool.query(
            'UPDATE products SET name=$1, shortDesc=$2, price=$3, category=$4, discount=$5, stock=$6, images=$7 WHERE id=$8',
            [product.name, product.shortDesc || '', product.price, product.category || '', product.discount || 0, product.stock || 0, product.images || [], product.id]
          );
          console.log(`✏️ Producto actualizado: ${product.name}`);
        }
      }
    }
    
    // Si hay categorías nuevas, procesarlas
    if (categories && Array.isArray(categories)) {
      for (const category of categories) {
        if (category.name && category.label) {
          await pool.query(
            'INSERT INTO categories (name, label) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET label = $2',
            [category.name, category.label]
          );
        }
      }
    }
    
    res.json({ success: true, message: "Datos guardados correctamente" });
    console.log("✅ Datos guardados exitosamente");
    
  } catch (err) {
    console.error("❌ Error guardando datos en batch:", err);
    res.status(500).json({ error: "Error al guardar datos", details: err.message });
  }
});

// Upload de imágenes (simulado - devuelve las URLs enviadas)
app.post('/api/upload', (req, res) => {
  try {
    // Por ahora solo simulamos el upload
    // En un futuro puedes integrar Cloudinary, AWS S3, etc.
    console.log("📷 Upload de imágenes solicitado");
    
    // Simular URLs de respuesta
    const mockUrls = [
      'https://via.placeholder.com/300x300/6200ee/ffffff?text=Imagen+Subida'
    ];
    
    res.json({ 
      success: true, 
      urls: mockUrls,
      message: "Imágenes procesadas (simulado)"
    });
    
  } catch (err) {
    console.error("❌ Error en upload:", err);
    res.status(500).json({ error: "Error al procesar imágenes" });
  }
});

// Logout (simple)
app.post('/logout', (req, res) => {
  console.log("👋 Usuario cerró sesión");
  res.json({ success: true, message: "Sesión cerrada" });
});

// Ruta de prueba para verificar que el servidor funciona
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString()
  });
});

// =======================
// 📌 MANEJO DE ERRORES 404
// =======================
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.originalUrl 
  });
});

// =======================
// 📌 INICIO SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📱 Panel admin en: http://localhost:${PORT}/admin`);
  console.log(`🏪 Tienda en: http://localhost:${PORT}`);
});
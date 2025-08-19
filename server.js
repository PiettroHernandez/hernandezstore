// =======================
// 🔌 CARGAR VARIABLES DE ENTORNO PRIMERO
// =======================
require('dotenv').config();

// DEBUG: Verificar variables al inicio
console.log('🔍 DEBUG - Estado de variables:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME || '❌ No encontrada');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY || '❌ No encontrada');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET || '❌ No encontrada');

// =======================
// 🔌 DEPENDENCIAS
// =======================
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');

// Cloudinary (solo cargar si las variables existen)
let cloudinary = null;
let CloudinaryStorage = null;

// =======================
// 🔌 APP
// =======================
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// =======================
// 📁 CREAR DIRECTORIO UPLOADS
// =======================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Directorio uploads creado');
}

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/', express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// =======================
// 🔌 BD SQLITE
// =======================
const dbPath = path.join(__dirname, 'tienda.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Error conectando a SQLite:', err.message);
  else console.log('✅ Conectado a SQLite');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    shortDesc TEXT,
    price REAL,
    category TEXT,
    discount INTEGER DEFAULT 0,
    stock INTEGER DEFAULT 0,
    images TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Insertar categorías por defecto si no existen
  db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
    if (!err && row.count === 0) {
      const defaultCategories = [
        { name: 'electronics', label: 'Electrónicos' },
        { name: 'fashion', label: 'Moda' },
        { name: 'home', label: 'Hogar' },
        { name: 'books', label: 'Libros' },
        { name: 'sports', label: 'Deportes' }
      ];
      
      defaultCategories.forEach(cat => {
        db.run("INSERT INTO categories (name, label) VALUES (?, ?)", [cat.name, cat.label]);
      });
      console.log('✅ Categorías por defecto creadas');
    }
  });
});

// Helpers
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// =======================
// 🔌 CLOUDINARY CONFIGURACIÓN
// =======================
let useCloudinary = false;

// Verificar si Cloudinary está configurado
console.log('🔍 Verificando configuración de Cloudinary...');
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  try {
    // Solo cargar Cloudinary si las variables están presentes
    cloudinary = require('cloudinary').v2;
    const { CloudinaryStorage: CS } = require('multer-storage-cloudinary');
    CloudinaryStorage = CS;
    
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    
    useCloudinary = true;
    console.log('✅ Cloudinary configurado correctamente');
    console.log('☁️ Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.log('📁 Folder:', process.env.CLOUDINARY_FOLDER || 'hernandezstore');
  } catch (error) {
    console.log('❌ Error configurando Cloudinary:', error.message);
    console.log('⚠️ Usando almacenamiento local como respaldo');
    useCloudinary = false;
  }
} else {
  console.log('⚠️ Variables de Cloudinary faltantes:');
  console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✅' : '❌');
  console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '✅' : '❌');
  console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✅' : '❌');
  console.log('🔄 Usando almacenamiento local');
}

// Configuración de Multer
let upload;

if (useCloudinary && cloudinary && CloudinaryStorage) {
  // Usar Cloudinary
  try {
    const storage = new CloudinaryStorage({
      cloudinary,
      params: { 
        folder: process.env.CLOUDINARY_FOLDER || 'hernandezstore', 
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
      }
    });
    
    upload = multer({ 
      storage,
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Solo se permiten archivos de imagen'), false);
        }
      }
    });
    console.log('📸 Configurado para usar Cloudinary');
  } catch (error) {
    console.log('❌ Error configurando storage de Cloudinary:', error.message);
    useCloudinary = false;
  }
}

if (!useCloudinary) {
  // Usar almacenamiento local
  try {
    const localStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        // Verificar que el directorio existe
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        try {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = path.extname(file.originalname);
          const name = file.fieldname + '-' + uniqueSuffix + ext;
          console.log('📁 Guardando archivo como:', name);
          cb(null, name);
        } catch (error) {
          console.error('❌ Error generando nombre de archivo:', error);
          cb(error);
        }
      }
    });
    
    upload = multer({ 
      storage: localStorage,
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
      },
      fileFilter: (req, file, cb) => {
        console.log('🔍 Verificando archivo:', file.originalname, 'tipo:', file.mimetype);
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Solo se permiten archivos de imagen'), false);
        }
      }
    });
    console.log('📸 Configurado para almacenamiento local');
  } catch (error) {
    console.error('❌ Error configurando almacenamiento local:', error);
    throw error;
  }
}

// =======================
// 🔌 API ENDPOINTS - DATOS GENERALES
// =======================

// Obtener todos los datos
app.get('/api/data', async (req, res) => {
  try {
    console.log('📡 Petición a /api/data');
    
    const products = await allQuery('SELECT * FROM products ORDER BY id DESC');
    const categories = await allQuery('SELECT * FROM categories ORDER BY id ASC');
    
    console.log(`📦 ${products.length} productos encontrados`);
    console.log(`🏷️ ${categories.length} categorías encontradas`);
    
    const processed = products.map(p => {
      let imgs = [];
      try {
        imgs = p.images ? JSON.parse(p.images) : [];
      } catch (e) {
        console.warn('⚠️ Error parsing images for product:', p.id);
        imgs = [];
      }
      
      return { 
        ...p, 
        images: imgs, 
        image: imgs[0] || '/uploads/placeholder.jpg'
      };
    });
    
    res.json({ 
      products: processed, 
      categories: categories.map(c => c.label), 
      categoriesData: categories,
      success: true
    });
    
  } catch (e) {
    console.error('❌ Error en /api/data:', e);
    res.status(500).json({ 
      error: 'Error al obtener datos',
      message: e.message,
      success: false
    });
  }
});

// =======================
// 🔌 API ENDPOINTS - PRODUCTOS
// =======================

// Crear producto
app.post('/api/products', async (req, res) => {
  try {
    console.log('📝 Creando producto:', req.body);
    
    const { name, shortDesc, price, category, discount, stock, images } = req.body;
    
    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    }
    
    if (!price || isNaN(price) || parseFloat(price) <= 0) {
      return res.status(400).json({ success: false, message: 'El precio debe ser mayor a 0' });
    }
    
    if (stock === undefined || isNaN(stock) || parseInt(stock) < 0) {
      return res.status(400).json({ success: false, message: 'El stock no puede ser negativo' });
    }
    
    const result = await runQuery(
      `INSERT INTO products (name, shortDesc, price, category, discount, stock, images)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(), 
        shortDesc || '', 
        parseFloat(price), 
        category || '', 
        parseInt(discount) || 0, 
        parseInt(stock), 
        JSON.stringify(images || [])
      ]
    );
    
    const created = await getQuery('SELECT * FROM products WHERE id=?', [result.id]);
    if (created) {
      created.images = JSON.parse(created.images || '[]');
    }
    
    console.log('✅ Producto creado:', created);
    res.json({ success: true, product: created });
    
  } catch (e) { 
    console.error('❌ Error creando producto:', e);
    res.status(500).json({ 
      success: false, 
      message: e.message,
      error: 'Error interno del servidor'
    }); 
  }
});

// Actualizar producto
app.put('/api/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log('📝 Actualizando producto:', productId, req.body);
    
    const { name, shortDesc, price, category, discount, stock, images } = req.body;
    
    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    }
    
    if (!price || isNaN(price) || parseFloat(price) <= 0) {
      return res.status(400).json({ success: false, message: 'El precio debe ser mayor a 0' });
    }
    
    if (stock === undefined || isNaN(stock) || parseInt(stock) < 0) {
      return res.status(400).json({ success: false, message: 'El stock no puede ser negativo' });
    }
    
    const result = await runQuery(
      `UPDATE products SET name=?, shortDesc=?, price=?, category=?, discount=?, stock=?, images=?
       WHERE id=?`,
      [
        name.trim(), 
        shortDesc || '', 
        parseFloat(price), 
        category || '', 
        parseInt(discount) || 0, 
        parseInt(stock), 
        JSON.stringify(images || []),
        productId
      ]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    
    const updated = await getQuery('SELECT * FROM products WHERE id=?', [productId]);
    if (updated) {
      updated.images = JSON.parse(updated.images || '[]');
    }
    
    console.log('✅ Producto actualizado:', updated);
    res.json({ success: true, product: updated });
    
  } catch (e) { 
    console.error('❌ Error actualizando producto:', e);
    res.status(500).json({ 
      success: false, 
      message: e.message,
      error: 'Error interno del servidor'
    }); 
  }
});

// Eliminar producto
app.delete('/api/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log('🗑️ Eliminando producto:', productId);
    
    const result = await runQuery('DELETE FROM products WHERE id=?', [productId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    
    console.log('✅ Producto eliminado');
    res.json({ success: true, message: 'Producto eliminado correctamente' });
    
  } catch (e) { 
    console.error('❌ Error eliminando producto:', e);
    res.status(500).json({ 
      success: false, 
      message: e.message,
      error: 'Error interno del servidor'
    }); 
  }
});

// =======================
// 🔌 API ENDPOINTS - CATEGORÍAS
// =======================

// Crear nueva categoría
app.post('/api/categories', async (req, res) => {
  try {
    console.log('📝 Creando categoría:', req.body);
    
    const { name, label } = req.body;
    
    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre interno es requerido' });
    }
    
    if (!label || label.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre visible es requerido' });
    }
    
    // Verificar que no existe
    const existing = await getQuery('SELECT * FROM categories WHERE name = ? OR label = ?', [name.trim(), label.trim()]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Ya existe una categoría con ese nombre' });
    }
    
    const result = await runQuery(
      'INSERT INTO categories (name, label) VALUES (?, ?)',
      [name.trim().toLowerCase(), label.trim()]
    );
    
    const created = await getQuery('SELECT * FROM categories WHERE id = ?', [result.id]);
    
    console.log('✅ Categoría creada:', created);
    res.json({ success: true, category: created });
    
  } catch (e) {
    console.error('❌ Error creando categoría:', e);
    res.status(500).json({ 
      success: false, 
      message: e.message,
      error: 'Error interno del servidor'
    });
  }
});

// Actualizar categoría
app.put('/api/categories/:id', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    console.log('📝 Actualizando categoría:', categoryId, req.body);
    
    const { name, label } = req.body;
    
    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre interno es requerido' });
    }
    
    if (!label || label.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre visible es requerido' });
    }
    
    // Verificar que no existe otra con el mismo nombre
    const existing = await getQuery(
      'SELECT * FROM categories WHERE (name = ? OR label = ?) AND id != ?', 
      [name.trim(), label.trim(), categoryId]
    );
    if (existing) {
      return res.status(400).json({ success: false, message: 'Ya existe otra categoría con ese nombre' });
    }
    
    // Obtener la categoría actual para actualizar productos si cambió el label
    const currentCategory = await getQuery('SELECT * FROM categories WHERE id = ?', [categoryId]);
    if (!currentCategory) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }
    
    const result = await runQuery(
      'UPDATE categories SET name = ?, label = ? WHERE id = ?',
      [name.trim().toLowerCase(), label.trim(), categoryId]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }
    
    // Si cambió el label, actualizar productos que usan esta categoría
    if (currentCategory.label !== label.trim()) {
      await runQuery(
        'UPDATE products SET category = ? WHERE category = ?',
        [label.trim(), currentCategory.label]
      );
      console.log('✅ Productos actualizados con nueva categoría');
    }
    
    const updated = await getQuery('SELECT * FROM categories WHERE id = ?', [categoryId]);
    
    console.log('✅ Categoría actualizada:', updated);
    res.json({ success: true, category: updated });
    
  } catch (e) {
    console.error('❌ Error actualizando categoría:', e);
    res.status(500).json({ 
      success: false, 
      message: e.message,
      error: 'Error interno del servidor'
    });
  }
});

// Eliminar categoría
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    console.log('🗑️ Eliminando categoría:', categoryId);
    
    // Verificar si la categoría existe
    const category = await getQuery('SELECT * FROM categories WHERE id = ?', [categoryId]);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }
    
    // Verificar si hay productos usando esta categoría
    const productsWithCategory = await allQuery('SELECT COUNT(*) as count FROM products WHERE category = ?', [category.label]);
    const productCount = productsWithCategory[0]?.count || 0;
    
    if (productCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `No se puede eliminar la categoría porque tiene ${productCount} producto(s) asignado(s). Primero cambia la categoría de esos productos.`
      });
    }
    
    const result = await runQuery('DELETE FROM categories WHERE id = ?', [categoryId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }
    
    console.log('✅ Categoría eliminada:', category.label);
    res.json({ success: true, message: `Categoría "${category.label}" eliminada correctamente` });
    
  } catch (e) {
    console.error('❌ Error eliminando categoría:', e);
    res.status(500).json({ 
      success: false, 
      message: e.message,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener estadísticas de categorías
app.get('/api/categories/stats', async (req, res) => {
  try {
    console.log('📊 Obteniendo estadísticas de categorías');
    
    const stats = await allQuery(`
      SELECT 
        c.id,
        c.name,
        c.label,
        COUNT(p.id) as product_count,
        COALESCE(SUM(p.stock), 0) as total_stock,
        c.created_at
      FROM categories c
      LEFT JOIN products p ON p.category = c.label
      GROUP BY c.id, c.name, c.label, c.created_at
      ORDER BY product_count DESC, c.label ASC
    `);
    
    console.log('✅ Estadísticas obtenidas:', stats.length);
    res.json({ success: true, stats });
    
  } catch (e) {
    console.error('❌ Error obteniendo estadísticas:', e);
    res.status(500).json({ 
      success: false, 
      message: e.message,
      error: 'Error interno del servidor'
    });
  }
});

// =======================
// 🔌 API ENDPOINTS - UPLOADS
// =======================

// Subir imágenes
app.post('/api/upload', (req, res) => {
  console.log('📸 Iniciando subida de imágenes...');
  console.log('📸 Usando:', useCloudinary ? 'Cloudinary ☁️' : 'Local 💾');
  
  // Verificar que upload esté configurado
  if (!upload) {
    console.error('❌ Upload no configurado');
    return res.status(500).json({ 
      success: false, 
      message: 'Sistema de subida no configurado correctamente' 
    });
  }
  
  upload.array('images', 10)(req, res, (err) => {
    if (err) {
      console.error('❌ Error en multer:', err);
      console.error('❌ Stack trace:', err.stack);
      
      let errorMessage = err.message;
      if (err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = 'El archivo es muy grande. Máximo 5MB por imagen.';
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        errorMessage = 'Máximo 10 imágenes por vez.';
      }
      
      return res.status(500).json({ 
        success: false, 
        message: errorMessage,
        error: err.message
      });
    }
    
    if (!req.files || req.files.length === 0) {
      console.log('⚠️ No se recibieron archivos');
      return res.status(400).json({ 
        success: false, 
        message: 'No se recibieron archivos' 
      });
    }
    
    console.log(`📸 ${req.files.length} archivo(s) procesado(s)`);
    
    try {
      // Generar URLs
      const urls = req.files.map(file => {
        if (useCloudinary) {
          console.log('☁️ Imagen subida a Cloudinary:', file.path);
          return file.path; // Cloudinary ya provee la URL completa
        } else {
          console.log('💾 Imagen guardada localmente:', `/uploads/${file.filename}`);
          return `/uploads/${file.filename}`; // URL local
        }
      });
      
      console.log('✅ URLs generadas:', urls);
      res.json({ success: true, urls });
      
    } catch (error) {
      console.error('❌ Error procesando URLs:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error procesando las imágenes subidas',
        error: error.message
      });
    }
  });
});

// Ruta para servir el placeholder como imagen real
app.get('/uploads/placeholder.jpg', (req, res) => {
  // Generar una imagen placeholder SVG
  const placeholderSvg = `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#444" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="300" height="300" fill="#333"/>
    <rect width="300" height="300" fill="url(#grid)"/>
    <circle cx="150" cy="120" r="30" fill="#555"/>
    <rect x="120" y="160" width="60" height="40" rx="5" fill="#555"/>
    <text x="150" y="230" text-anchor="middle" fill="#999" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
      SIN IMAGEN
    </text>
    <text x="150" y="250" text-anchor="middle" fill="#666" font-family="Arial, sans-serif" font-size="12">
      300 × 300
    </text>
  </svg>`;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 1 día
  res.send(placeholderSvg);
});

// =======================
// 🚀 INICIAR SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 Tienda: http://localhost:${PORT}`);
  console.log(`⚙️ Admin: http://localhost:${PORT}/admin`);
  console.log(`📁 Uploads: ${useCloudinary ? 'Cloudinary ☁️' : 'Local 💾'}`);
  console.log('=====================================');
});
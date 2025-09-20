// =======================
// 🔌 CARGAR VARIABLES DE ENTORNO PRIMERO
// =======================
require('dotenv').config();

// DEBUG: Verificar variables al inicio
console.log('🔍 DEBUG - Estado de variables:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME || '❌ No encontrada');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY || '❌ No encontrada');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET || '❌ No encontrada');

// RAILWAY DEBUG ESPECÍFICO
console.log('🚂 RAILWAY DEBUG:', {
  NODE_ENV: process.env.NODE_ENV,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? 'PRESENTE ✅' : 'FALTANTE ❌',
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER,
  TIMESTAMP_ACTUAL: Math.round(Date.now() / 1000)
});

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
// 🔌 CLOUDINARY CONFIGURACIÓN MEJORADA
// =======================
let useCloudinary = false;

// Verificar si Cloudinary está configurado
console.log('🔍 Verificando configuración de Cloudinary...');
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  try {
    cloudinary = require('cloudinary').v2;
    
    // Limpiar configuración previa
    cloudinary.config({
      cloud_name: undefined,
      api_key: undefined,
      api_secret: undefined
    });
    
    // Configurar con parámetros específicos para Railway
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
      shorten: true,
      sign_url: true
    });
    
    // Test inmediato de configuración
    console.log('🔧 Cloudinary Config Test:', {
      cloud_name: cloudinary.config().cloud_name,
      api_key: cloudinary.config().api_key?.substring(0, 6) + '...',
      api_secret: cloudinary.config().api_secret ? 'CONFIGURADO' : 'FALTANTE'
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

// =======================
// 🔌 CONFIGURACIÓN DE MULTER MEJORADA
// =======================
let upload;

if (useCloudinary && cloudinary) {
  // Usar memoria storage en lugar de CloudinaryStorage para mejor control
  const memoryStorage = multer.memoryStorage();
  
  upload = multer({ 
    storage: memoryStorage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max
      files: 10
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
  
  console.log('📸 Configurado para usar Cloudinary con memory storage');
} else {
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
// 🔌 MIDDLEWARE DE LOGS DETALLADOS PARA UPLOADS
// =======================

// Middleware para loggear todas las peticiones de upload
app.use('/api/upload', (req, res, next) => {
  console.log('\n🚀 === NUEVA PETICIÓN DE SUBIDA ===');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('🌐 IP:', req.ip);
  console.log('📝 User-Agent:', req.get('User-Agent'));
  console.log('📦 Content-Type:', req.get('Content-Type'));
  console.log('📊 Content-Length:', req.get('Content-Length'));
  console.log('🔧 Sistema de upload:', useCloudinary ? 'Cloudinary ☁️' : 'Local 💾');
  
  // Log cuando termina la respuesta
  const originalSend = res.send;
  res.send = function(data) {
    console.log('📤 Respuesta enviada:', res.statusCode);
    console.log('🏁 === FIN DE PETICIÓN DE SUBIDA ===\n');
    return originalSend.call(this, data);
  };
  
  next();
});

// =======================
// 🔌 API ENDPOINT MEJORADO PARA UPLOAD
// =======================

app.post('/api/upload', (req, res) => {
  console.log('📸 Iniciando subida de imágenes...');
  console.log('📸 Usando:', useCloudinary ? 'Cloudinary ☁️' : 'Local 💾');
  
  if (!upload) {
    console.error('❌ Upload no configurado');
    return res.status(500).json({ 
      success: false, 
      message: 'Sistema de subida no configurado correctamente' 
    });
  }
  
  upload.array('images', 10)(req, res, async (err) => {
    if (err) {
      console.error('❌ Error en multer:', err);
      return res.status(500).json({ 
        success: false, 
        message: err.message 
      });
    }
    
    if (!req.files || req.files.length === 0) {
      console.log('⚠️ No se recibieron archivos');
      return res.status(400).json({ 
        success: false, 
        message: 'No se recibieron archivos' 
      });
    }
    
    console.log(`📸 ${req.files.length} archivo(s) recibido(s)`);
    
    try {
      if (useCloudinary) {
        // Upload manual a Cloudinary con mejor control
        const uploadPromises = req.files.map((file, index) => {
          return new Promise((resolve, reject) => {
            const timestamp = Math.round(Date.now() / 1000);
            console.log(`☁️ Subiendo archivo ${index + 1} con timestamp: ${timestamp}`);
            
            cloudinary.uploader.upload_stream({
              folder: process.env.CLOUDINARY_FOLDER || "hernandezstore",
              public_id: `img_${timestamp}_${index}`,
              resource_type: "image",
              allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
              transformation: [
                { quality: "auto:good" },
                { fetch_format: "auto" }
              ]
            }, (error, result) => {
              if (error) {
                console.error(`❌ Error subiendo archivo ${index + 1}:`, error);
                reject(error);
              } else {
                console.log(`✅ Archivo ${index + 1} subido:`, result.secure_url);
                resolve(result.secure_url);
              }
            }).end(file.buffer);
          });
        });
        
        const urls = await Promise.all(uploadPromises);
        console.log('✅ Todas las imágenes subidas a Cloudinary:', urls);
        res.json({ success: true, urls });
        
      } else {
        // Lógica local
        const urls = req.files.map(file => `/uploads/${file.filename}`);
        console.log('✅ URLs locales generadas:', urls);
        res.json({ success: true, urls });
      }
      
    } catch (error) {
      console.error('❌ Error procesando uploads:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error subiendo imágenes',
        error: error.message
      });
    }
  });
});

// =======================
// 🔌 API ENDPOINTS - PRUEBAS Y DIAGNÓSTICO
// =======================

// Test completo de Cloudinary
app.get('/api/test-cloudinary-connection', async (req, res) => {
  try {
    console.log('🧪 Test completo de Cloudinary...');
    
    if (!useCloudinary || !cloudinary) {
      return res.json({
        success: false,
        message: 'Cloudinary no configurado',
        debug: {
          useCloudinary,
          hasCloudinary: !!cloudinary,
          envVars: {
            cloud_name: !!process.env.CLOUDINARY_CLOUD_NAME,
            api_key: !!process.env.CLOUDINARY_API_KEY,
            api_secret: !!process.env.CLOUDINARY_API_SECRET
          }
        }
      });
    }
    
    // Test 1: Ping básico
    console.log('🏓 Test 1: Ping...');
    const pingResult = await cloudinary.api.ping();
    console.log('✅ Ping exitoso:', pingResult);
    
    // Test 2: Obtener uso
    console.log('📊 Test 2: Usage...');
    const usage = await cloudinary.api.usage();
    console.log('✅ Usage obtenido:', usage.credits);
    
    // Test 3: Generar timestamp
    const currentTimestamp = Math.round(Date.now() / 1000);
    console.log('🕐 Test 3: Timestamp actual:', currentTimestamp);
    
    res.json({
      success: true,
      message: 'Cloudinary funcionando correctamente',
      tests: {
        ping: pingResult,
        usage: {
          credits: usage.credits,
          last_updated: usage.last_updated
        },
        timestamp: currentTimestamp,
        config: {
          cloud_name: cloudinary.config().cloud_name,
          folder: process.env.CLOUDINARY_FOLDER || 'hernandezstore'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Test fallido:', error);
    res.status(500).json({
      success: false,
      message: 'Error en test de Cloudinary',
      error: {
        message: error.message,
        http_code: error.http_code,
        api_error: error.error
      }
    });
  }
});

// Ruta para probar la conexión con Cloudinary (legacy)
app.get('/api/test-cloudinary', async (req, res) => {
  try {
    console.log('🧪 Probando conexión con Cloudinary...');
    
    if (!useCloudinary) {
      return res.json({
        success: false,
        message: 'Cloudinary no está configurado - usando almacenamiento local',
        config: {
          useCloudinary: false,
          hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
          hasApiKey: !!process.env.CLOUDINARY_API_KEY,
          hasApiSecret: !!process.env.CLOUDINARY_API_SECRET
        }
      });
    }
    
    if (!cloudinary) {
      return res.status(500).json({
        success: false,
        message: 'Cloudinary no está disponible',
        error: 'Módulo cloudinary no cargado'
      });
    }
    
    // Test básico de conexión con Cloudinary
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary responde:', result);
    
    // Obtener información de la cuenta
    const usage = await cloudinary.api.usage();
    console.log('📊 Uso de Cloudinary:', usage);
    
    res.json({
      success: true,
      message: 'Cloudinary conectado correctamente',
      cloudinary_status: result,
      usage: {
        credits: usage.credits,
        media_limits: usage.media_limits,
        last_updated: usage.last_updated
      },
      config: {
        cloud_name: cloudinary.config().cloud_name,
        folder: process.env.CLOUDINARY_FOLDER || 'hernandezstore',
        useCloudinary: useCloudinary
      }
    });
    
  } catch (error) {
    console.error('❌ Error conectando a Cloudinary:', error);
    console.error('❌ Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Error conectando a Cloudinary',
      details: error.message,
      error_code: error.error?.code || 'UNKNOWN',
      http_code: error.error?.http_code || null
    });
  }
});

// Ruta para obtener información del sistema de uploads
app.get('/api/upload-info', (req, res) => {
  console.log('ℹ️ Obteniendo información del sistema de uploads');
  
  res.json({
    success: true,
    upload_system: {
      using_cloudinary: useCloudinary,
      cloudinary_available: !!cloudinary,
      upload_configured: !!upload,
      uploads_dir: uploadsDir,
      uploads_dir_exists: fs.existsSync(uploadsDir)
    },
    environment: {
      cloudinary_cloud_name: !!process.env.CLOUDINARY_CLOUD_NAME,
      cloudinary_api_key: !!process.env.CLOUDINARY_API_KEY,
      cloudinary_api_secret: !!process.env.CLOUDINARY_API_SECRET,
      cloudinary_folder: process.env.CLOUDINARY_FOLDER || 'hernandezstore'
    },
    limits: {
      max_file_size: '5MB',
      max_files_per_upload: 10,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
    }
  });
});

// Ruta para probar la subida con un archivo de prueba
app.post('/api/test-upload', (req, res) => {
  console.log('🧪 Probando sistema de subida...');
  
  if (!upload) {
    return res.status(500).json({ 
      success: false, 
      message: 'Sistema de subida no configurado' 
    });
  }
  
  upload.array('test_images', 1)(req, res, async (err) => {
    if (err) {
      console.error('❌ Error en test de subida:', err);
      return res.status(500).json({
        success: false,
        message: 'Error en el test de subida',
        error: err.message,
        error_code: err.code
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se enviaron archivos para el test'
      });
    }
    
    const file = req.files[0];
    console.log('✅ Test de subida exitoso:', file.filename || file.public_id);
    
    if (useCloudinary) {
      // Test con Cloudinary
      try {
        const timestamp = Math.round(Date.now() / 1000);
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({
            folder: process.env.CLOUDINARY_FOLDER || "hernandezstore",
            public_id: `test_${timestamp}`,
            resource_type: "image"
          }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }).end(file.buffer);
        });
        
        res.json({
          success: true,
          message: 'Test de subida a Cloudinary exitoso',
          file_info: {
            original_name: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            url: result.secure_url,
            public_id: result.public_id,
            storage: 'cloudinary'
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Error en test de Cloudinary',
          error: error.message
        });
      }
    } else {
      // Test local
      const url = `/uploads/${file.filename}`;
      res.json({
        success: true,
        message: 'Test de subida local exitoso',
        file_info: {
          original_name: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          url: url,
          storage: 'local'
        }
      });
    }
  });
});

// Ruta para obtener logs detallados del último error
app.get('/api/debug-logs', (req, res) => {
  console.log('🐛 Generando logs de debug...');
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    server_status: 'running',
    upload_system: {
      using_cloudinary: useCloudinary,
      cloudinary_module_loaded: !!cloudinary,
      upload_middleware_configured: !!upload
    },
    environment_vars: {
      has_cloud_name: !!process.env.CLOUDINARY_CLOUD_NAME,
      has_api_key: !!process.env.CLOUDINARY_API_KEY,
      has_api_secret: !!process.env.CLOUDINARY_API_SECRET,
      node_env: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 4000
    },
    directories: {
      uploads_dir: uploadsDir,
      uploads_exists: fs.existsSync(uploadsDir),
      current_working_dir: process.cwd()
    },
    cloudinary_config: cloudinary ? {
      cloud_name: cloudinary.config().cloud_name,
      api_key: cloudinary.config().api_key ? '✅ Configurado' : '❌ Faltante',
      api_secret: cloudinary.config().api_secret ? '✅ Configurado' : '❌ Faltante'
    } : 'No disponible'
  };
  
  console.log('📋 Debug info generado:', debugInfo);
  
  res.json({
    success: true,
    debug_info: debugInfo
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
    console.log(`🌐 Servidor corriendo en puerto ${PORT}`);
    console.log(`🛒 Tienda: http://localhost:${PORT}`);
    console.log(`⚙️ Admin: http://localhost:${PORT}/admin`);
    console.log(`📊 Upload Info: ${user}:${cloudinay_connection_string}-cloudinay:${'Local 🏠'}:`);
    console.log("=================");
    console.log(`🔧 Rutas de diagnóstico disponibles:`);
    console.log(`🐛 Debug: http://localhost:${PORT}/api/debug-logs`);
    console.log(`💚 Test Cloudinary: http://localhost:${PORT}/api/test-cloudinary-connection`);
    console.log(`🧪 Test Legacy: http://localhost:${PORT}/api/test-cloudinary`);
    console.log(`🆙 Upload Info: http://localhost:${PORT}/api/upload-info`);
    console.log(`🔬 Test Upload: http://localhost:${PORT}/api/test-upload`);
    console.log("=================");
});

// IMPORTANTE: Para que funcione en Vercel
module.exports = app;
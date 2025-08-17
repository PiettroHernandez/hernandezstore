// =======================
// 📌 DEPENDENCIAS
// =======================
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const multer = require('multer');
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
// 📌 FUNCIONES HELPER SEGURAS
// =======================
// Función segura para insertar/actualizar categorías
async function insertOrUpdateCategory(name, label) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Verificar si la categoría ya existe
    const existingResult = await client.query(
      'SELECT id FROM categories WHERE name = $1', 
      [name]
    );
    
    if (existingResult.rows.length > 0) {
      // Si existe, actualizar
      const result = await client.query(`
        UPDATE categories 
        SET label = $2 
        WHERE name = $1 
        RETURNING id
      `, [name, label]);
      
      await client.query('COMMIT');
      console.log(`✅ Categoría actualizada: ${name}`);
      return result.rows[0];
    } else {
      // Si no existe, insertar nuevo
      const result = await client.query(`
        INSERT INTO categories (name, label) 
        VALUES ($1, $2) 
        RETURNING id
      `, [name, label]);
      
      await client.query('COMMIT');
      console.log(`✅ Nueva categoría creada: ${name}`);
      return result.rows[0];
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Error con categoría ${name}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Función para procesar categorías en lote de forma segura
async function processCategoriesBatch(categories) {
  const results = [];
  for (const category of categories) {
    if (category.name && category.label) {
      try {
        const result = await insertOrUpdateCategory(category.name, category.label);
        results.push(result);
      } catch (error) {
        console.error(`❌ Error procesando categoría ${category.name}:`, error.message);
        // Continúa con las demás categorías en caso de error
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
    // Crear tabla de productos
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

    // Crear tabla de categorías con restricción única
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        label VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Agregar restricción única si no existe (para bases de datos existentes)
    try {
      await pool.query(`
        ALTER TABLE categories 
        ADD CONSTRAINT categories_name_unique 
        UNIQUE (name)
      `);
      console.log("✅ Restricción única agregada a categories.name");
    } catch (constraintError) {
      // La restricción ya existe, no es un error
      if (constraintError.code !== '42P07') {
        console.log("⚠️ Restricción única ya existe o otro error:", constraintError.message);
      }
    }

    // Insertar categorías por defecto de forma segura
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
      console.log("✅ Categorías por defecto insertadas de forma segura");
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
    initDatabase();
  })
  .catch(err => {
    console.error("❌ Error conectando a PostgreSQL:", err);
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
    console.error("❌ Error al obtener datos:", err);
    res.status(500).json({ error: "Error al obtener datos", details: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const { name, shortDesc, price, category, discount, stock, images } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, shortDesc, price, category, discount, stock, images) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, shortDesc, price, category, discount, stock, images]
    );
    console.log(`✅ Producto creado: ${name}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error al agregar producto:", err);
    res.status(500).json({ error: "Error al agregar producto", details: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, shortDesc, price, category, discount, stock, images } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name=$1, shortDesc=$2, price=$3, category=$4, discount=$5, stock=$6, images=$7 WHERE id=$8 RETURNING *',
      [name, shortDesc, price, category, discount, stock, images, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    console.log(`✅ Producto actualizado: ${name} (ID: ${id})`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`❌ Error al editar producto ID ${id}:`, err);
    res.status(500).json({ error: "Error al editar producto", details: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Verificar si el producto existe
    const existingProduct = await pool.query('SELECT name FROM products WHERE id = $1', [id]);
    
    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    // Eliminar el producto
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    
    console.log(`✅ Producto eliminado: ${existingProduct.rows[0].name} (ID: ${id})`);
    res.json({ success: true, message: "Producto eliminado correctamente" });
  } catch (err) {
    console.error(`❌ Error al eliminar producto ID ${id}:`, err);
    res.status(500).json({ error: "Error al eliminar producto", details: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const { name, label } = req.body;
  try {
    if (!name || !label) {
      return res.status(400).json({ error: "Nombre y etiqueta son requeridos" });
    }
    
    const result = await insertOrUpdateCategory(name, label);
    res.json(result);
  } catch (err) {
    console.error("❌ Error al agregar categoría:", err);
    res.status(500).json({ error: "Error al agregar categoría", details: err.message });
  }
});

// =======================
// 📌 API SAVEALL (CORREGIDA - SIN ON CONFLICT PROBLEMÁTICO)
// =======================
app.post('/api/saveAll', async (req, res) => {
  const { products, categories } = req.body;
  
  try {
    console.log("🔄 Iniciando saveAll...");
    
    // Obtener productos actuales
    const current = await pool.query('SELECT id FROM products');
    const currentIds = current.rows.map(r => r.id);
    const receivedIds = products.map(p => p.id).filter(id => id);

    // Eliminar productos que ya no están en la lista
    for (const id of currentIds) {
      if (!receivedIds.includes(id)) {
        try {
          await pool.query('DELETE FROM products WHERE id=$1', [id]);
          console.log(`🗑️ Producto eliminado id=${id}`);
        } catch (deleteErr) {
          console.error(`❌ Error eliminando producto ${id}:`, deleteErr.message);
        }
      }
    }

    // Procesar productos (insertar/actualizar)
    for (const product of products) {
      try {
        if (!product.id || !currentIds.includes(product.id)) {
          // Insertar nuevo producto
          await pool.query(
            'INSERT INTO products (name, shortDesc, price, category, discount, stock, images) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [
              product.name, 
              product.shortDesc || '', 
              product.price, 
              product.category || '', 
              product.discount || 0, 
              product.stock || 0, 
              product.images || []
            ]
          );
          console.log(`✅ Producto insertado: ${product.name}`);
        } else {
          // Actualizar producto existente
          await pool.query(
            'UPDATE products SET name=$1, shortDesc=$2, price=$3, category=$4, discount=$5, stock=$6, images=$7 WHERE id=$8',
            [
              product.name, 
              product.shortDesc || '', 
              product.price, 
              product.category || '', 
              product.discount || 0, 
              product.stock || 0, 
              product.images || [], 
              product.id
            ]
          );
          console.log(`✅ Producto actualizado: ${product.name}`);
        }
      } catch (productErr) {
        console.error(`❌ Error procesando producto ${product.name}:`, productErr.message);
        // Continúa con los demás productos
      }
    }

    // Procesar categorías de forma segura (SIN ON CONFLICT)
    if (categories && Array.isArray(categories)) {
      console.log("🔄 Procesando categorías...");
      await processCategoriesBatch(categories);
    }

    console.log("✅ saveAll completado correctamente");
    res.json({ success: true, message: "Datos guardados correctamente" });
    
  } catch (err) {
    console.error("❌ Error guardando datos en batch:", err);
    res.status(500).json({ 
      error: "Error al guardar datos", 
      details: err.message,
      code: err.code 
    });
  }
});

// =======================
// 📌 UPLOAD DE IMÁGENES (MEJORADO)
// =======================
const fs = require('fs');

// Crear directorio de uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Directorio uploads creado");
}

const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

app.post('/api/upload', upload.array('images'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No se subieron imágenes" 
      });
    }
    
    const urls = req.files.map(file => `/uploads/${file.filename}`);
    console.log(`✅ ${req.files.length} imágenes subidas correctamente`);
    res.json({ 
      success: true, 
      urls, 
      message: `${req.files.length} imágenes subidas correctamente` 
    });
  } catch (err) {
    console.error("❌ Error al procesar imágenes:", err);
    res.status(500).json({ 
      error: "Error al procesar imágenes", 
      details: err.message 
    });
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// 📌 OTROS
// =======================
app.post('/logout', (req, res) => res.json({ success: true }));

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    timestamp: new Date().toISOString(),
    message: "API funcionando correctamente"
  });
});

// =======================
// 📌 RUTAS DE DIAGNÓSTICO (VERSIÓN SIMPLIFICADA)
// =======================

// 1. TEST SIMPLE DE CONECTIVIDAD
app.get('/test-debug', (req, res) => {
  res.json({ 
    success: true, 
    message: "✅ Ruta de debug funcionando",
    timestamp: new Date().toISOString(),
    server: "Railway",
    nodeVersion: process.version,
    environment: process.env.NODE_ENV
  });
});

// 2. TEST DE via.placeholder.com (EL MÁS IMPORTANTE)
app.get('/test-placeholder-simple', (req, res) => {
  const https = require('https');
  
  console.log('🔍 Testando via.placeholder.com...');
  
  const request = https.get('https://via.placeholder.com/40', (response) => {
    let data = '';
    
    response.on('data', (chunk) => {
      data += chunk;
    });
    
    response.on('end', () => {
      console.log('✅ via.placeholder.com respondió correctamente');
      res.json({
        status: 'SUCCESS',
        message: '✅ via.placeholder.com ES ACCESIBLE desde Railway',
        statusCode: response.statusCode,
        contentLength: data.length,
        timestamp: new Date().toISOString()
      });
    });
  });

  request.on('error', (error) => {
    console.error('❌ Error conectando a via.placeholder.com:', error);
    res.json({
      status: 'ERROR', 
      message: '❌ via.placeholder.com NO ES ACCESIBLE desde Railway',
      error: error.message,
      code: error.code,
      reason: 'Este es el problema de las imágenes!',
      timestamp: new Date().toISOString()
    });
  });

  request.setTimeout(10000, () => {
    request.destroy();
    res.json({
      status: 'ERROR',
      message: '❌ TIMEOUT - via.placeholder.com muy lento',
      timestamp: new Date().toISOString()
    });
  });
});

// 3. PÁGINA DE DIAGNÓSTICO COMPLETA
app.get('/diagnostico', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  
  res.write(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>🔧 Diagnóstico Hernandez Store</title>
    <style>
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        max-width: 800px; 
        margin: 0 auto; 
        padding: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        color: white;
      }
      .container {
        background: rgba(255,255,255,0.1);
        backdrop-filter: blur(10px);
        border-radius: 15px;
        padding: 30px;
        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
      }
      .test-card { 
        background: rgba(255,255,255,0.1);
        margin: 15px 0; 
        padding: 20px; 
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.2);
      }
      .success { border-left: 4px solid #00ff88; }
      .error { border-left: 4px solid #ff6b6b; }
      .loading { border-left: 4px solid #ffd93d; }
      pre { 
        background: rgba(0,0,0,0.3); 
        padding: 15px; 
        border-radius: 8px;
        overflow-x: auto;
        font-size: 13px;
        color: #f8f9fa;
      }
      .btn {
        background: linear-gradient(45deg, #667eea, #764ba2);
        color: white;
        padding: 12px 24px;
        border: none;
        border-radius: 25px;
        cursor: pointer;
        margin: 10px 5px;
        font-size: 14px;
        box-shadow: 0 4px 15px 0 rgba(31, 38, 135, 0.4);
        transition: all 0.3s ease;
      }
      .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px 0 rgba(31, 38, 135, 0.6);
      }
      h1 { text-align: center; margin-bottom: 30px; }
      .status-ok { color: #00ff88; }
      .status-error { color: #ff6b6b; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🔧 Diagnóstico Hernandez Store</h1>
      <p><strong>🌐 URL:</strong> ${req.get('host')}</p>
      <p><strong>⏰ Hora:</strong> ${new Date().toLocaleString()}</p>
      
      <button class="btn" onclick="runBasicTest()">🧪 Test Básico</button>
      <button class="btn" onclick="runPlaceholderTest()">🖼️ Test Imágenes Placeholder</button>
      <button class="btn" onclick="runAllTests()">🚀 Ejecutar Todos</button>
      
      <div id="results"></div>
      
      <div class="test-card">
        <h3>🎯 Objetivo del Diagnóstico</h3>
        <p>Identificar por qué las imágenes de <code>via.placeholder.com</code> no cargan en Railway pero sí en localhost.</p>
        <p><strong>Errores reportados:</strong> <code>net::ERR_NAME_NOT_RESOLVED</code></p>
      </div>
    </div>
    
    <script>
      async function runTest(name, endpoint, description) {
        const resultsDiv = document.getElementById('results');
        
        const card = document.createElement('div');
        card.className = 'test-card loading';
        card.innerHTML = 
          '<h3>🔍 ' + name + '</h3>' +
          '<p>' + description + '</p>' +
          '<p>⏳ Ejecutando...</p>';
        resultsDiv.appendChild(card);
        
        try {
          const response = await fetch(endpoint);
          const data = await response.json();
          
          const isSuccess = data.status !== 'ERROR' && data.success !== false;
          card.className = 'test-card ' + (isSuccess ? 'success' : 'error');
          
          const statusIcon = isSuccess ? '✅' : '❌';
          const statusClass = isSuccess ? 'status-ok' : 'status-error';
          
          card.innerHTML = 
            '<h3>' + statusIcon + ' ' + name + '</h3>' +
            '<p>' + description + '</p>' +
            '<p class="' + statusClass + '"><strong>' + (data.message || 'Sin mensaje') + '</strong></p>' +
            '<details><summary>Ver detalles técnicos</summary><pre>' + 
            JSON.stringify(data, null, 2) + '</pre></details>';
            
        } catch (error) {
          card.className = 'test-card error';
          card.innerHTML = 
            '<h3>❌ ' + name + ' - Error de Conexión</h3>' +
            '<p>' + description + '</p>' +
            '<p class="status-error"><strong>Error: ' + error.message + '</strong></p>';
        }
      }
      
      async function runBasicTest() {
        document.getElementById('results').innerHTML = '';
        await runTest('Conectividad Básica', '/test-debug', 
          'Verifica que las rutas de diagnóstico funcionen correctamente');
      }
      
      async function runPlaceholderTest() {
        document.getElementById('results').innerHTML = '';
        await runTest('Acceso a via.placeholder.com', '/test-placeholder-simple', 
          'Prueba si Railway puede conectarse a via.placeholder.com (causa de los errores)');
      }
      
      async function runAllTests() {
        document.getElementById('results').innerHTML = '';
        await runBasicTest();
        await new Promise(r => setTimeout(r, 500));
        await runPlaceholderTest();
      }
    </script>
  </body>
  </html>
  `);
  
  res.end();
});

// =======================
// 📌 RUTAS DE DIAGNÓSTICO
// =======================
// 1. TEST BÁSICO - Verificar que las rutas funcionan
app.get('/test-basic', (req, res) => {
    res.json({
        message: '✅ Rutas de diagnóstico funcionando',
        timestamp: new Date().toISOString(),
        server: 'Railway',
        status: 'OK'
    });
});

// 2. TEST DE CONECTIVIDAD A via.placeholder.com
app.get('/test-placeholder', (req, res) => {
    const https = require('https');
    
    const options = {
        hostname: 'via.placeholder.com',
        path: '/40',
        method: 'GET',
        timeout: 10000
    };

    const request = https.request(options, (response) => {
        let data = '';
        
        response.on('data', chunk => {
            data += chunk;
        });
        
        response.on('end', () => {
            res.json({
                status: 'SUCCESS',
                message: '✅ via.placeholder.com es accesible',
                statusCode: response.statusCode,
                headers: response.headers,
                contentLength: data.length,
                timestamp: new Date().toISOString()
            });
        });
    });

    request.on('error', (error) => {
        res.json({
            status: 'ERROR',
            message: '❌ via.placeholder.com NO es accesible',
            error: error.message,
            code: error.code,
            type: error.name,
            timestamp: new Date().toISOString()
        });
    });

    request.on('timeout', () => {
        request.destroy();
        res.json({
            status: 'ERROR',
            message: '❌ Timeout conectando a via.placeholder.com',
            error: 'Request timeout (10s)',
            timestamp: new Date().toISOString()
        });
    });

    request.end();
});

// 3. TEST DE DNS
app.get('/test-dns-simple', (req, res) => {
    const dns = require('dns');
    
    dns.lookup('via.placeholder.com', (err, address, family) => {
        if (err) {
            res.json({
                status: 'ERROR',
                message: '❌ No se puede resolver via.placeholder.com',
                error: err.message,
                code: err.code,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                status: 'SUCCESS',
                message: '✅ DNS funciona correctamente',
                domain: 'via.placeholder.com',
                address: address,
                family: family,
                timestamp: new Date().toISOString()
            });
        }
    });
});

// 4. TEST DE ARCHIVOS ESTÁTICOS
app.get('/test-uploads', (req, res) => {
    try {
        const uploadsPath = path.join(__dirname, 'uploads');
        const publicPath = path.join(__dirname, 'public');
        
        const result = {
            message: '📁 Estado de archivos estáticos',
            currentDir: __dirname,
            uploadsPath: uploadsPath,
            publicPath: publicPath,
            uploadsExists: fs.existsSync(uploadsPath),
            publicExists: fs.existsSync(publicPath),
            uploadsFiles: [],
            publicFiles: [],
            timestamp: new Date().toISOString()
        };
        
        if (result.uploadsExists) {
            result.uploadsFiles = fs.readdirSync(uploadsPath).slice(0, 5);
        }
        
        if (result.publicExists) {
            result.publicFiles = fs.readdirSync(publicPath).slice(0, 5);
        }
        
        res.json(result);
        
    } catch (error) {
        res.json({
            status: 'ERROR',
            message: '❌ Error revisando archivos',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 5. RESUMEN DE TODOS LOS TESTS
app.get('/test-summary', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
    });
    
    res.write(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>🔧 Diagnóstico Hernandez Store</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                max-width: 1200px; 
                margin: 0 auto; 
                padding: 20px;
                background: #f5f5f5;
            }
            .test-card { 
                background: white;
                margin: 20px 0; 
                padding: 20px; 
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .success { border-left: 4px solid #28a745; }
            .error { border-left: 4px solid #dc3545; }
            .loading { border-left: 4px solid #ffc107; }
            pre { 
                background: #f8f9fa; 
                padding: 15px; 
                border-radius: 4px;
                overflow-x: auto;
                font-size: 12px;
            }
            .btn {
                background: #007bff;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                margin: 5px;
            }
        </style>
    </head>
    <body>
        <h1>🔧 Diagnóstico de Conectividad - Hernandez Store</h1>
        <p><strong>URL:</strong> ${req.get('host')}</p>
        
        <button class="btn" onclick="runAllTests()">🚀 Ejecutar Todos los Tests</button>
        
        <div id="results"></div>
        
        <script>
            async function runTest(name, endpoint) {
                const resultsDiv = document.getElementById('results');
                const testId = 'test-' + name.replace(/\\s+/g, '-').toLowerCase();
                
                const card = document.createElement('div');
                card.className = 'test-card loading';
                card.id = testId;
                card.innerHTML = '<h3>🔍 ' + name + ' - Ejecutando...</h3>';
                resultsDiv.appendChild(card);
                
                try {
                    const response = await fetch(endpoint);
                    const data = await response.json();
                    
                    const isSuccess = data.status !== 'ERROR' && response.ok;
                    card.className = 'test-card ' + (isSuccess ? 'success' : 'error');
                    card.innerHTML = 
                        '<h3>' + (isSuccess ? '✅' : '❌') + ' ' + name + '</h3>' +
                        '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                        
                } catch (error) {
                    card.className = 'test-card error';
                    card.innerHTML = 
                        '<h3>❌ ' + name + ' - Error de Conexión</h3>' +
                        '<pre>Error: ' + error.message + '</pre>';
                }
            }
            
            async function runAllTests() {
                document.getElementById('results').innerHTML = '';
                
                await runTest('Test Básico', '/test-basic');
                await runTest('DNS Resolution', '/test-dns-simple');
                await runTest('Conectividad HTTP', '/test-placeholder');
                await runTest('Archivos Estáticos', '/test-uploads');
            }
        </script>
    </body>
    </html>
    `);
    
    res.end();
});

// Manejo de errores 404
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
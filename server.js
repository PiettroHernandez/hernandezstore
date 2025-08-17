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
// Agrega estos endpoints a tu servidor (app.js o routes)
const dns = require('dns');
const https = require('https');
const http = require('http');

// 1. Test de conectividad a via.placeholder.com
app.get('/test-connection', async (req, res) => {
    console.log('🔍 Testando conectividad a via.placeholder.com...');
    
    try {
        // Usando fetch (si tienes node-fetch o versión Node 18+)
        const response = await fetch('https://via.placeholder.com/40', {
            method: 'GET',
            timeout: 10000 // 10 segundos timeout
        });
        
        res.json({ 
            status: 'SUCCESS',
            message: '✅ Conectividad exitosa',
            statusCode: response.status,
            statusText: response.statusText,
            url: response.url,
            headers: Object.fromEntries(response.headers.entries()),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error de conectividad:', error);
        res.json({ 
            status: 'ERROR',
            message: '❌ Falló la conectividad',
            error: error.message,
            code: error.code,
            type: error.name,
            timestamp: new Date().toISOString()
        });
    }
});

// 2. Test de DNS resolution
app.get('/test-dns', (req, res) => {
    console.log('🔍 Testando resolución DNS...');
    
    const testDomains = [
        'via.placeholder.com',
        'google.com',
        'github.com',
        'railway.app'
    ];
    
    const results = {};
    let completed = 0;
    
    testDomains.forEach(domain => {
        dns.lookup(domain, (err, address, family) => {
            if (err) {
                results[domain] = {
                    status: 'ERROR',
                    error: err.message,
                    code: err.code
                };
            } else {
                results[domain] = {
                    status: 'SUCCESS',
                    address: address,
                    family: family
                };
            }
            
            completed++;
            if (completed === testDomains.length) {
                res.json({
                    message: '🔍 Resultados de DNS',
                    results: results,
                    timestamp: new Date().toISOString()
                });
            }
        });
    });
});

// 3. Test de conectividad HTTP básica
app.get('/test-http', (req, res) => {
    console.log('🔍 Testando HTTP básico...');
    
    const testUrl = 'https://via.placeholder.com/40';
    
    https.get(testUrl, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
            data += chunk;
        });
        
        response.on('end', () => {
            res.json({
                status: 'SUCCESS',
                message: '✅ HTTP request exitoso',
                statusCode: response.statusCode,
                headers: response.headers,
                contentLength: data.length,
                timestamp: new Date().toISOString()
            });
        });
        
    }).on('error', (error) => {
        res.json({
            status: 'ERROR',
            message: '❌ HTTP request falló',
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    });
});

// 4. Test de información del entorno
app.get('/test-environment', (req, res) => {
    console.log('🔍 Información del entorno...');
    
    res.json({
        message: '🌍 Información del entorno Railway',
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            nodeEnv: process.env.NODE_ENV,
            port: process.env.PORT,
            railwayEnv: process.env.RAILWAY_ENVIRONMENT,
            railwayProject: process.env.RAILWAY_PROJECT_NAME,
            railwayService: process.env.RAILWAY_SERVICE_NAME
        },
        networkInterfaces: require('os').networkInterfaces(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// 5. Test de archivos estáticos
app.get('/test-static-files', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    console.log('🔍 Testando archivos estáticos...');
    
    const uploadsPath = path.join(__dirname, 'uploads');
    const publicPath = path.join(__dirname, 'public');
    
    const results = {
        currentDirectory: __dirname,
        uploadsPath: uploadsPath,
        publicPath: publicPath,
        uploadsExists: false,
        publicExists: false,
        uploadsFiles: [],
        publicFiles: []
    };
    
    try {
        if (fs.existsSync(uploadsPath)) {
            results.uploadsExists = true;
            results.uploadsFiles = fs.readdirSync(uploadsPath).slice(0, 10); // Primeros 10 archivos
        }
    } catch (error) {
        results.uploadsError = error.message;
    }
    
    try {
        if (fs.existsSync(publicPath)) {
            results.publicExists = true;
            results.publicFiles = fs.readdirSync(publicPath).slice(0, 10); // Primeros 10 archivos
        }
    } catch (error) {
        results.publicError = error.message;
    }
    
    res.json({
        message: '📁 Estado de archivos estáticos',
        results: results,
        timestamp: new Date().toISOString()
    });
});

// 6. Test completo - ejecuta todas las pruebas
app.get('/test-all', async (req, res) => {
    console.log('🔍 Ejecutando diagnóstico completo...');
    
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    
    res.write(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>🔧 Diagnóstico Railway - Hernandez Store</title>
        <style>
            body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #00ff00; }
            .test { margin: 20px 0; padding: 15px; border: 1px solid #333; }
            .success { border-color: #00ff00; }
            .error { border-color: #ff0000; color: #ff6666; }
            .info { border-color: #0099ff; color: #66ccff; }
            pre { background: #333; padding: 10px; overflow-x: auto; }
        </style>
    </head>
    <body>
        <h1>🔧 Diagnóstico de Conectividad Railway</h1>
        <p>Ejecutando pruebas... Por favor espera...</p>
        <div id="results"></div>
        
        <script>
            async function runTests() {
                const results = document.getElementById('results');
                const tests = [
                    { name: 'DNS Resolution', url: '/test-dns' },
                    { name: 'HTTP Connectivity', url: '/test-http' },
                    { name: 'Fetch API', url: '/test-connection' },
                    { name: 'Environment Info', url: '/test-environment' },
                    { name: 'Static Files', url: '/test-static-files' }
                ];
                
                for (const test of tests) {
                    try {
                        results.innerHTML += '<div class="test info">🔍 Ejecutando: ' + test.name + '...</div>';
                        
                        const response = await fetch(test.url);
                        const data = await response.json();
                        
                        const className = data.status === 'ERROR' ? 'error' : 'success';
                        const icon = data.status === 'ERROR' ? '❌' : '✅';
                        
                        results.innerHTML += '<div class="test ' + className + '">' +
                            '<h3>' + icon + ' ' + test.name + '</h3>' +
                            '<pre>' + JSON.stringify(data, null, 2) + '</pre>' +
                            '</div>';
                            
                    } catch (error) {
                        results.innerHTML += '<div class="test error">' +
                            '<h3>❌ ' + test.name + ' - ERROR</h3>' +
                            '<pre>' + error.message + '</pre>' +
                            '</div>';
                    }
                }
                
                results.innerHTML += '<div class="test info"><h2>✅ Diagnóstico Completado</h2></div>';
            }
            
            runTests();
        </script>
    </body>
    </html>
    `);
    
    res.end();
});
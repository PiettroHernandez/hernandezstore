// =======================
// 🔌 CARGAR VARIABLES DE ENTORNO PRIMERO
// =======================
require('dotenv').config();

// DEBUG: Verificar variables al inicio
console.log('🔍 DEBUG - Estado de variables:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME || '❌ No encontrada');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY || '❌ No encontrada');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET || '❌ No encontrada');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configurada' : '❌ No encontrada');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Configurada' : '❌ No encontrada');

// RAILWAY/VERCEL DEBUG ESPECÍFICO
console.log('🚂 DATABASE DEBUG:', {
  NODE_ENV: process.env.NODE_ENV,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? 'PRESENTE ✅' : 'FALTANTE ❌',
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER,
  SUPABASE_URL: process.env.SUPABASE_URL ? 'CONFIGURADA ✅' : 'FALTANTE ❌',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'CONFIGURADA ✅' : 'FALTANTE ❌',
  TIMESTAMP_ACTUAL: Math.round(Date.now() / 1000)
});

// =======================
// 🔌 DEPENDENCIAS
// =======================
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
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
// 🔌 BD SUPABASE
// =======================
let supabase = null;

try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  console.log('✅ Cliente Supabase inicializado');
} catch (error) {
  console.error('❌ Error inicializando Supabase:', error.message);
}

// Test de conexión
const testConnection = async () => {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('products').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    console.log('✅ Conectado a Supabase correctamente');
  } catch (err) {
    console.error('❌ Error conectando a Supabase:', err.message);
  }
};

// Estado de inicialización de la base de datos
let dbInitialized = false;

// Crear tablas y datos iniciales
const initDB = async () => {
  if (dbInitialized || !supabase) return;
  try {
    console.log('🏗️ Verificando tablas...');
    
    // Intentar crear categorías por defecto si no existen
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .limit(1);
    
    if (categoriesError && categoriesError.code === 'PGRST116') {
      console.log('ℹ️ Tabla categories no existe o está vacía');
    }
    
    if (!categoriesError && (!categories || categories.length === 0)) {
      const defaultCategories = [
        { name: 'electronics', label: 'Electrónicos' },
        { name: 'fashion', label: 'Moda' },
        { name: 'home', label: 'Hogar' },
        { name: 'books', label: 'Libros' },
        { name: 'sports', label: 'Deportes' }
      ];
      
      for (const cat of defaultCategories) {
        try {
          await supabase.from('categories').insert(cat);
        } catch (insertError) {
          console.log('⚠️ Error insertando categoría:', cat.name);
        }
      }
      console.log('✅ Categorías por defecto creadas');
    }
    
    console.log('✅ Base de datos inicializada');
    dbInitialized = true;
  } catch (error) {
    console.error('❌ Error inicializando BD:', error.message);
  }
};

// Middleware para inicializar la base de datos al recibir la primera solicitud
app.use(async (req, res, next) => {
  if (!dbInitialized && supabase) {
    await initDB();
  }
  next();
});

// Inicializar conexión
testConnection();

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
    
    // Configurar con parámetros específicos
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
      api_key: cloudinary.config().api_key ? cloudinary.config().api_key.substring(0, 6) + '...' : 'FALTANTE',
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
  // Usar memory storage para Cloudinary
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
  }
}

// =======================
// 🔌 API ENDPOINTS - DATOS GENERALES
// =======================

// Obtener todos los datos
app.get('/api/data', async (req, res) => {
  try {
    console.log('📡 Petición a /api/data');
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: false });
    
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .order('id', { ascending: true });
    
    if (productsError && productsError.code !== 'PGRST116') {
      throw productsError;
    }
    if (categoriesError && categoriesError.code !== 'PGRST116') {
      throw categoriesError;
    }
    
    console.log(`📦 ${products?.length || 0} productos encontrados`);
    console.log(`🏷️ ${categories?.length || 0} categorías encontradas`);
    
    const processed = (products || []).map(p => {
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
      categories: (categories || []).map(c => c.label), 
      categoriesData: categories || [],
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
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
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
    
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: name.trim(),
        shortdesc: shortDesc || '',
        price: parseFloat(price),
        category: category || '',
        discount: parseInt(discount) || 0,
        stock: parseInt(stock),
        images: JSON.stringify(images || [])
      })
      .select()
      .single();
    
    if (error) throw error;
    
    if (data) {
      data.images = JSON.parse(data.images || '[]');
    }
    
    console.log('✅ Producto creado:', data);
    res.json({ success: true, product: data });
    
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
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
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
    
    const { data, error } = await supabase
      .from('products')
      .update({
        name: name.trim(),
        shortdesc: shortDesc || '',
        price: parseFloat(price),
        category: category || '',
        discount: parseInt(discount) || 0,
        stock: parseInt(stock),
        images: JSON.stringify(images || [])
      })
      .eq('id', productId)
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    
    if (data) {
      data.images = JSON.parse(data.images || '[]');
    }
    
    console.log('✅ Producto actualizado:', data);
    res.json({ success: true, product: data });
    
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
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);
    
    if (error) throw error;
    
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
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
    const { name, label } = req.body;
    
    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre interno es requerido' });
    }
    
    if (!label || label.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre visible es requerido' });
    }
    
    // Verificar que no existe
    const { data: existing } = await supabase
      .from('categories')
      .select('*')
      .or(`name.eq.${name.trim()},label.eq.${label.trim()}`)
      .limit(1)
      .maybeSingle();
    
    if (existing) {
      return res.status(400).json({ success: false, message: 'Ya existe una categoría con ese nombre' });
    }
    
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: name.trim().toLowerCase(),
        label: label.trim()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    console.log('✅ Categoría creada:', data);
    res.json({ success: true, category: data });
    
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
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
    const { name, label } = req.body;
    
    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre interno es requerido' });
    }
    
    if (!label || label.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre visible es requerido' });
    }
    
    // Verificar que no existe otra con el mismo nombre
    const { data: existing } = await supabase
      .from('categories')
      .select('*')
      .or(`name.eq.${name.trim()},label.eq.${label.trim()}`)
      .neq('id', categoryId)
      .limit(1)
      .maybeSingle();
    
    if (existing) {
      return res.status(400).json({ success: false, message: 'Ya existe otra categoría con ese nombre' });
    }
    
    // Obtener la categoría actual para actualizar productos si cambió el label
    const { data: currentCategory } = await supabase
      .from('categories')
      .select('*')
      .eq('id', categoryId)
      .single();
    
    if (!currentCategory) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }
    
    const { data, error } = await supabase
      .from('categories')
      .update({
        name: name.trim().toLowerCase(),
        label: label.trim()
      })
      .eq('id', categoryId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Si cambió el label, actualizar productos que usan esta categoría
    if (currentCategory.label !== label.trim()) {
      await supabase
        .from('products')
        .update({ category: label.trim() })
        .eq('category', currentCategory.label);
      console.log('✅ Productos actualizados con nueva categoría');
    }
    
    console.log('✅ Categoría actualizada:', data);
    res.json({ success: true, category: data });
    
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
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
    // Verificar si la categoría existe
    const { data: category } = await supabase
      .from('categories')
      .select('*')
      .eq('id', categoryId)
      .single();
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }
    
    // Verificar si hay productos usando esta categoría
    const { data: productsWithCategory, error: countError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category', category.label);
    
    const productCount = productsWithCategory?.length || 0;
    
    if (productCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `No se puede eliminar la categoría porque tiene ${productCount} producto(s) asignado(s). Primero cambia la categoría de esos productos.`
      });
    }
    
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);
    
    if (error) throw error;
    
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
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
    // Obtener todas las categorías
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .order('id', { ascending: true });
    
    if (categoriesError) throw categoriesError;
    
    // Para cada categoría, contar productos y stock
    const statsPromises = (categories || []).map(async (category) => {
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('stock')
        .eq('category', category.label);
      
      const productCount = products?.length || 0;
      const totalStock = products?.reduce((sum, p) => sum + (p.stock || 0), 0) || 0;
      
      return {
        ...category,
        product_count: productCount,
        total_stock: totalStock
      };
    });
    
    const stats = await Promise.all(statsPromises);
    stats.sort((a, b) => b.product_count - a.product_count);
    
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
  console.log('📸 Sistema configurado - Cloudinary:', useCloudinary ? 'SI' : 'NO');
  
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
              resource_type: "image"
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

// Test de conexión a Supabase
app.get('/api/test-database', async (req, res) => {
  try {
    console.log('🧪 Test de conexión a Supabase...');
    
    if (!supabase) {
      throw new Error('Supabase no está inicializado');
    }
    
    // Test 1: Conexión básica
    const { data: healthCheck, error: healthError } = await supabase
      .from('products')
      .select('id')
      .limit(1);
    
    if (healthError && healthError.code !== 'PGRST116') {
      throw healthError;
    }
    
    // Test 2: Contar registros
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true });
    
    res.json({
      success: true,
      message: 'Supabase funcionando correctamente',
      database_info: {
        current_time: new Date().toISOString(),
        supabase_url: process.env.SUPABASE_URL ? 'Configurada' : 'No configurada',
        record_counts: {
          products: products?.length || 0,
          categories: categories?.length || 0
        },
        health_check: 'OK'
      }
    });
    
  } catch (error) {
    console.error('❌ Error en test de Supabase:', error);
    res.status(500).json({
      success: false,
      message: 'Error en test de Supabase',
      error: error.message
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
      supabase_url: !!process.env.SUPABASE_URL,
      supabase_anon_key: !!process.env.SUPABASE_ANON_KEY,
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
    database: {
      type: 'Supabase PostgreSQL',
      url_configured: !!process.env.SUPABASE_URL,
      anon_key_configured: !!process.env.SUPABASE_ANON_KEY,
      client_initialized: !!supabase
    },
    upload_system: {
      using_cloudinary: useCloudinary,
      cloudinary_module_loaded: !!cloudinary,
      upload_middleware_configured: !!upload
    },
    environment_vars: {
      has_supabase_url: !!process.env.SUPABASE_URL,
      has_supabase_anon_key: !!process.env.SUPABASE_ANON_KEY,
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

// Middleware de errores global
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 Tienda: http://localhost:${PORT}`);
  console.log(`👑 Admin: http://localhost:${PORT}/admin`);
});

// Manejo graceful de cierre del servidor
process.on('SIGTERM', () => {
  console.log('🔄 Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 Recibida señal SIGINT, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

// IMPORTANTE: Para que funcione en Vercel
module.exports = app;
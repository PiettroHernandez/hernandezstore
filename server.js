const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');

const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración de sesión
app.use(
  session({
    secret: 'clave_super_secreta',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

// Crear carpetas si no existen
(async () => {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
})();

// Configuración de subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage: storage });

// Leer y escribir data.json
async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { products: [], categories: [], discounts: [], config: {} };
  }
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Credenciales
const USERNAME = 'admin';
const PASSWORD = '1234';

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    req.session.user = username;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Proteger admin
app.get('/admin.html', (req, res, next) => {
  if (req.session.user === USERNAME) {
    next();
  } else {
    res.redirect('/login.html');
  }
});

// API
app.get('/api/data', async (req, res) => {
  const data = await readData();
  res.json(data);
});

app.post('/api/saveAll', async (req, res) => {
  const payload = req.body;
  if (!payload) return res.status(400).json({ error: 'No data provided' });
  await writeData(payload);
  res.json({ ok: true });
});

app.post('/api/products', async (req, res) => {
  const data = await readData();
  const product = req.body;
  product.id = product.id || uuidv4();
  data.products.push(product);
  await writeData(data);
  res.json(product);
});

app.put('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  const data = await readData();
  const idx = data.products.findIndex(p => String(p.id) === String(id));
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  data.products[idx] = { ...data.products[idx], ...req.body };
  await writeData(data);
  res.json(data.products[idx]);
});

app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  const data = await readData();
  const before = data.products.length;
  data.products = data.products.filter(p => String(p.id) !== String(id));
  await writeData(data);
  res.json({ deleted: before - data.products.length });
});

// 🆕 FUNCIONES DE STOCK AGREGADAS 🆕

// Actualizar stock de un producto específico
app.post('/api/update-stock', async (req, res) => {
  try {
    const { productId, newStock } = req.body;

    // Validar datos
    if (!productId || typeof newStock !== 'number' || newStock < 0) {
      return res.status(400).json({ 
        error: 'Datos inválidos. Se requiere productId y newStock válido' 
      });
    }

    const data = await readData();

    // Buscar producto por ID o nombre
    const productIndex = data.products.findIndex(product => 
      String(product.id) === String(productId) || 
      product.name === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({ 
        error: 'Producto no encontrado' 
      });
    }

    // Guardar stock anterior
    const oldStock = data.products[productIndex].stock || 0;
    
    // Actualizar stock
    data.products[productIndex].stock = newStock;

    // Guardar cambios
    await writeData(data);

    console.log(`📦 Stock actualizado para "${data.products[productIndex].name}": ${oldStock} → ${newStock}`);

    res.json({
      success: true,
      productId,
      productName: data.products[productIndex].name,
      oldStock,
      newStock,
      message: 'Stock actualizado correctamente'
    });

  } catch (error) {
    console.error('❌ Error actualizando stock:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// Obtener stock de un producto específico
app.get('/api/stock/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const data = await readData();
    
    const product = data.products.find(p => 
      String(p.id) === String(productId) || 
      p.name === productId
    );
    
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json({
      productId,
      productName: product.name,
      stock: product.stock || 0,
      price: product.price,
      available: (product.stock || 0) > 0
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo stock:', error);
    res.status(500).json({ error: 'Error obteniendo stock' });
  }
});

// 🆕 FIN FUNCIONES DE STOCK 🆕

app.post('/api/upload', upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'No files' });
  const urls = req.files.map(f => `/uploads/${f.filename}`);
  res.json({ urls });
});

// Archivos estáticos
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/', express.static(PUBLIC_DIR));

// Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server running on port', PORT));
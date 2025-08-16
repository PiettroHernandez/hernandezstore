const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 4000;

// ===============================
// Configuración de sesión
// ===============================
app.use(session({
  secret: 'mi_secreto_super_seguro',
  resave: false,
  saveUninitialized: true,
}));

// ===============================
// Configuración de rutas
// ===============================
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Credenciales (puedes cambiarlas si quieres)
const USERNAME = "admin";
const PASSWORD = "1234";

// ===============================
// Middleware para JSON
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// Configuración de multer (subida de imágenes)
// ===============================
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ===============================
// LOGIN
// ===============================
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    req.session.user = username;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Credenciales inválidas" });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ===============================
// Middleware de autenticación
// ===============================
function requireLogin(req, res, next) {
  if (req.session.user === USERNAME) {
    next();
  } else {
    res.redirect('/login.html');
  }
}

// ===============================
// API de productos
// ===============================
app.get('/api/data', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(data);
});

app.post('/api/products', requireLogin, upload.single('image'), (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const newProduct = {
    id: Date.now(),
    name: req.body.name,
    shortDesc: req.body.shortDesc || "",
    price: parseFloat(req.body.price),
    category: req.body.category,
    discount: req.body.discount ? parseFloat(req.body.discount) : null,
    stock: req.body.stock ? parseInt(req.body.stock) : 0,
    images: req.file ? ["/uploads/" + req.file.filename] : []
  };
  data.products.push(newProduct);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json(newProduct);
});

app.put('/api/products/:id', requireLogin, upload.single('image'), (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const productId = parseInt(req.params.id);
  const product = data.products.find(p => p.id === productId);

  if (product) {
    product.name = req.body.name || product.name;
    product.shortDesc = req.body.shortDesc || product.shortDesc;
    product.price = req.body.price ? parseFloat(req.body.price) : product.price;
    product.category = req.body.category || product.category;
    product.discount = req.body.discount ? parseFloat(req.body.discount) : product.discount;
    product.stock = req.body.stock ? parseInt(req.body.stock) : product.stock;
    if (req.file) product.images = ["/uploads/" + req.file.filename];
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json(product);
  } else {
    res.status(404).json({ error: "Producto no encontrado" });
  }
});

app.delete('/api/products/:id', requireLogin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const productId = parseInt(req.params.id);
  data.products = data.products.filter(p => p.id !== productId);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// ===============================
// Proteger carpeta admin
// ===============================
app.use('/admin', (req, res, next) => {
  if (req.session.user === USERNAME) {
    next();
  } else {
    res.redirect('/login.html');
  }
});

// ===============================
// Archivos estáticos
// ===============================
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/', express.static(PUBLIC_DIR));

// ===============================
// Servidor
// ===============================
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

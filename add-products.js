const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addProducts() {
  try {
    console.log('🛒 Agregando productos...');

    // Verificar conexión
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado a PostgreSQL');

    // Agregar productos uno por uno
    console.log('📱 Agregando iPhone...');
    await pool.query(`
      INSERT INTO products (name, shortdesc, price, category, discount, stock, images) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, ['iPhone 15 Pro', 'Smartphone premium de Apple', 1299.99, 'electronics', 0, 10, ['https://picsum.photos/300/300?random=1']]);

    console.log('📱 Agregando Samsung...');
    await pool.query(`
      INSERT INTO products (name, shortdesc, price, category, discount, stock, images) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, ['Samsung Galaxy S24', 'Android flagship', 899.99, 'electronics', 10, 8, ['https://picsum.photos/300/300?random=2']]);

    console.log('👟 Agregando Nike...');
    await pool.query(`
      INSERT INTO products (name, shortdesc, price, category, discount, stock, images) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, ['Nike Air Force 1', 'Zapatillas deportivas', 129.99, 'clothing', 15, 25, ['https://picsum.photos/300/300?random=3']]);

    // Verificar total
    const result = await pool.query('SELECT COUNT(*) as total FROM products');
    console.log(`🎉 Total productos agregados: ${result.rows[0].total}`);

    console.log('🚀 ¡Recarga http://localhost:4000 para ver los productos!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Detalle:', err);
  } finally {
    await pool.end();
  }
}

addProducts();
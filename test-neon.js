require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testNeon() {
  try {
    console.log('Conectando a Neon PostgreSQL...');
    
    const client = await pool.connect();
    console.log('✅ Conexión exitosa!');
    
    // Test básico
    const result = await client.query('SELECT NOW(), version()');
    console.log('📅 Tiempo servidor:', result.rows[0].now);
    
    client.release();
    await pool.end();
    
    console.log('🎉 Todo funciona correctamente!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testNeon();
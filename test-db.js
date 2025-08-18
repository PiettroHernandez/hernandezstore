const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL,
    ssl: { rejectUnauthorized: false } // Fuerza SSL
  });

  try {
    await client.connect();
    console.log("✅ Conexión exitosa a PostgreSQL");

    const res = await client.query('SELECT NOW() as now');
    console.log("🕒 Hora en DB:", res.rows[0].now);

  } catch (err) {
    console.error("❌ Error en conexión:", err.message);
  } finally {
    await client.end();
  }
})();

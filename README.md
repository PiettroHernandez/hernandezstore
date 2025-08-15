# Hernández Tattoo - Node API + Public/Admin

Estructura mínima para correr localmente:

- server.js        -> Servidor Express
- data.json        -> Datos (productos, categorías...)
- /public          -> Archivos públicos (admin-panel.html, tienda.html)
- /uploads         -> Imágenes subidas

## Instalación y ejecución

1. Copia la carpeta al servidor o a tu máquina.
2. Ejecuta:
   ```bash
   npm install
   npm run start
   ```
3. Abre en el navegador:
   - Admin: http://localhost:4000/admin-panel.html
   - Tienda pública: http://localhost:4000/tienda.html

## Notas

- El admin usa `/api/saveAll` para guardar el estado completo en `data.json`.
- El endpoint `/api/upload` guarda imágenes en `/uploads` y devuelve rutas como `/uploads/filename.jpg`.
- Para producción, configura un servicio como PM2, systemd, o un proveedor (Render, Railway, VPS).
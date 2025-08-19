# Hernandez Store (Cloudinary)

## Pasos
1) Copia `.env.example` a `.env` y rellena tus credenciales de Cloudinary.
2) `npm install --legacy-peer-deps`
3) `npm start`
4) Admin en: `http://localhost:4000/admin`

## Notas
- La subida de imágenes usa `/api/upload` con el campo `images` (múltiple).
- Los productos guardan un array `images` con URLs de Cloudinary.
- La tienda muestra mini-galería por producto.
# Flotilla Web

Panel Angular (admin / operaciones).

## Desarrollo local

```bash
npm start
```

Usa `src/environments/environment.development.ts` → `http://localhost:3001/api/v1`.

## Build / Vercel

En el build se ejecuta `scripts/set-env.mjs`, que escribe `environment.ts` con la URL de la API.

### Variable en Vercel

| Nombre   | Ejemplo                                      |
|----------|----------------------------------------------|
| `API_URL` | `https://tu-api.ejemplo.com/api/v1`         |

También acepta `NG_APP_API_URL` como alias.

Sin variable, cae a `http://localhost:3001/api/v1` (solo útil en local).

### Deploy

1. Sube este proyecto (`flotla-web`) a un repo.
2. En Vercel: Framework Preset **Other**, Root Directory `flotla-web` (si el repo es el monorepo).
3. Build Command: `npm run build` (ya está en `vercel.json`).
4. Output: `dist/flotla-web/browser`.
5. Define `API_URL` apuntando a tu API **pública** (HTTPS).

### API (CORS)

En la API configura orígenes permitidos, por ejemplo:

```bash
CORS_ORIGINS=http://localhost:4200,https://tu-app.vercel.app
```

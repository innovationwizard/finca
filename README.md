# Finca Danilandia — Sistema de Gestión Agrícola

> **Finca Danilandia y Anexos, S.A.** · Grupo Orión
> PWA para gestión de finca cafetalera con soporte sin conexión.

## Inicio Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno y llenar credenciales de Supabase
cp .env.example .env.local

# 3. Crear tablas en Supabase
npx prisma db push

# 4. Sembrar datos reales (lotes, actividades, trabajadores)
npm run db:seed

# 5. Crear usuarios en el dashboard de Supabase Auth:
#    - Tu cuenta (rol MASTER)
#    - Luis Castellanos (rol ADMIN)
#    - Luis Arimany (rol ADMIN)
#    - Caporal (rol FIELD)
#    Luego insertar filas en la tabla `users` via Prisma Studio:
npx prisma studio

# 6. Iniciar servidor de desarrollo
npm run dev
```

## Arquitectura

- **Next.js 15** (App Router) en **Vercel**
- **Supabase** (PostgreSQL + Auth + Storage + Realtime)
- **Prisma** ORM con tipado estricto
- **PWA** con Serwist (service worker) + Dexie.js (IndexedDB)
- **Sin conexión**: escritura a IndexedDB → cola de salida → sincronización en segundo plano

## Módulos

1. **Planilla** — Registro diario de actividades, resumen de planilla
2. **Ingreso de Café** — Registro de cosecha, seguimiento de rendimiento
3. **Plan Anual** — Planificación de actividades por lote (plan vs ejecutado)
4. **Estimaciones** — Estimaciones de producción (4 + final por año)
5. **Dashboard** — KPIs, gráficas, alertas

## Páginas de Administración (MASTER + ADMIN)

- `/admin/lotes` — Configuración de área, plantas y densidad por lote
- `/admin/actividades` — Catálogo de actividades (unidades, precios), ciclo de pago

## Año Agrícola

Marzo → Febrero. Formato de código: `2526` = Marzo 2025 → Febrero 2026.

# db/migrations/

Historial versionado de cambios de schema, aplicados con `node db/migrate.js`
desde la raíz del repo.

**`db/schema.sql` sigue siendo la única fuente de verdad** — la "foto" de
cómo se ve el schema completo hoy. Esta carpeta es el registro de *cómo* se
llegó ahí, para no volver a aplicar un `ALTER` a mano contra producción sin
dejar rastro (que es como se hizo todo hasta agosto 2026 — funcionó, pero la
operación más riesgosa del proyecto era también la que menos ceremonia
tenía).

## Cómo agregar un cambio de schema nuevo

1. Crear `db/migrations/NNN_descripcion_corta.sql` — `NNN` es el próximo
   número de 3 dígitos en orden (`001`, `002`, ...), se aplican en orden
   alfabético. Solo sentencias DDL (`CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.) — mismo estilo
   idempotente que ya usa `schema.sql`, para que correr el archivo dos
   veces por error no rompa nada.
2. Pegar el mismo contenido al final de `db/schema.sql`, con su comentario
   explicando el porqué (mismo criterio de siempre — alguien que lee
   `schema.sql` de punta a punta tiene que ver el estado completo sin
   tener que ir a buscar cada migración por separado).
3. Correr `node db/migrate.js` — aplica contra la DB real (lee
   `.env.local`) todo lo que todavía no esté en `schema_migrations`, en
   orden, cada archivo dentro de su propia transacción.

## Por qué no un framework

No hace falta uno para el tamaño de este proyecto. `db/migrate.js` es
~50 líneas, usa el mismo `sql`/`withTransaction` de siempre — es el mismo
patrón de scripts ad-hoc que ya se usaba, solo que ahora versionado y con
registro de qué se aplicó, en vez de un script de un solo uso que se tira
después de correrlo.

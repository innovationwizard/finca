-- =============================================================================
-- ActivityUnit += TAREA — "tarea" is a unit of work the finca already pays by;
-- it now needs to be selectable in the activity catalog (UdM dropdown).
--
-- APPENDED, never inserted between existing values: Postgres enum order is the
-- sort order, and reordering means recreating the type and rewriting every
-- activities.unit value. New units always go at the end.
-- =============================================================================

-- AlterEnum
ALTER TYPE "ActivityUnit" ADD VALUE 'TAREA';

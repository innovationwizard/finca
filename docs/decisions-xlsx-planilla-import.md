# Decisiones — Import de Planilla desde Workbook .xlsx

**Fecha:** 2026-06-08 · **Decididas por:** Jorge
**Plan asociado:** [plan-xlsx-planilla-import.md](plan-xlsx-planilla-import.md)

Estas son las cuatro decisiones registradas, tal como fueron confirmadas:

### 1. Parser
El formato **va a cambiar** — sin lectura por posición, sin igualdad de
encabezados estáticos. Construir un parser que **detecte la estructura
semánticamente**, **reporte el drift**, y **nunca falle** (ni en silencio ni en
ruido): no descarta nada, no salta nada, no deja nada atrás.

### 2. Precio
**Sobrescribir con el precio por defecto de la base de datos.** El precio/total
del archivo se conserva solo como **provenance (evidencia)** y para **marcar
discrepancias**.

### 3. UX
El **mismo** control "Planilla Semanal" acepta una **foto o un `.xlsx`**,
detectado automáticamente — **cero pasos extra** para el usuario.

### 4. Match de trabajadores
**Match por nombre (fuzzy) + resolución manual existente.** El **DPI no se usa**
(poco confiable en la fuente).

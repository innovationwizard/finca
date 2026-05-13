# UX Reference: Worker Resolution During Batch Import

Research-backed design decisions for the "unrecognized worker name" flow in the planilla/notebook photo import pipeline.

---

## Core Problem

When uploading a photo of a weekly schedule (or notebook page), AI extraction produces worker names that may not match any record in the database. This happens because:
- New field workers added since the last DB sync
- Slightly different name spellings across formats
- Names in the new printed format differ from names entered manually

Blocking the upload silently (or discarding unmatched rows) is unacceptable: the user loses data and gets no feedback on why.

---

## Industry Pattern: Review-Before-Commit

Leading payroll/HR/CRM import tools (Salesforce, HubSpot, Dynamics 365) use a **staged funnel**:

```
Upload → AI Extraction → Worker Resolution → Period Coverage → Review Table → Save
```

The resolution stage surfaces **all conflicts at once** before any data is written. This lets the user:
- See the full scope of the problem in one view
- Make all decisions in a single pass
- Click one "Continue" to apply everything atomically

**Key principle**: Never write partial data. If names are unresolved, the user knows exactly what's pending before committing.

---

## Two Actions Per Unrecognized Name

### 1. Agregar a base de datos (default)
Creates a new Worker record from the extracted name. Safer default because:
- No risk of accidental merge with the wrong person
- Preserves data integrity even if the name is slightly misspelled
- New worker details (DPI, bank account, etc.) can be filled in later by an admin

### 2. Vincular a persona existente
Maps the extracted name to an existing Worker record. Used when:
- The name is a variant spelling of someone already in the DB
- The name was abbreviated or rearranged in the document

---

## Default: "Agregar" Checked

Default = create new. Research finding: the conservative default reduces data loss risk. A wrong merge (mapping name A to person B) contaminates payroll records and is hard to undo. An extra new worker record is easy to merge or deactivate later.

The user actively opts in to mapping by unchecking the checkbox.

---

## Batch Resolution UI Principles

### 1. All conflicts on one screen
Show every unmatched name at once, not one at a time. Users can scan, compare, and batch-decide quickly. A "select all → keep as new" action handles the most common case in seconds.

### 2. Checkbox per row (default checked = create new)
```
[✓] Agregar "Marco Antonio Solano" a la base de datos
[✓] Agregar "Luisa Méndez Pérez" a la base de datos
[ ] Agregar "José García" → Vincular a: [José García López ▼]
```
Unchecking a row reveals the mapping dropdown inline. No modal needed.

### 3. Progress indicator
`"Resuelto 3 de 7 nombres"` — visible at all times. The Continue button is disabled (greyed) until all names are resolved. A name in "map" mode is only resolved when an existing worker is selected from the dropdown.

### 4. Candidate suggestions in the dropdown
If fuzzy matching found near-matches (score ≥ 65%), show them at the top of the dropdown with a visual separator before the full worker list. This reduces search effort for genuine name variants.

### 5. Resolved vs. pending visual hierarchy
- **Pending** (needs decision): amber left border, normal opacity
- **Resolved — create new**: neutral/white, ✓ chip
- **Resolved — mapped**: neutral/white, person icon + name chip

---

## Interaction Sequence

1. After AI extraction, the upload component detects unmatched names.
2. It transitions to a "worker-resolution" step (before the pay-period check).
3. User sees the resolution list:
   - All checkboxes checked by default → one click "Continuar" if all are truly new.
   - For any name to map: uncheck → pick from dropdown → row turns resolved.
4. User clicks "Continuar" (enabled only when all names are resolved).
5. The component calls `POST /api/workers` for all "create" entries in a batch.
6. Returns the completed `extractedName → workerId` map to the parent.
7. The parent injects these into `workerMatches` and continues to the period/review steps.

---

## Edge Cases

| Case | Handling |
|------|---------|
| Worker API create fails | Show inline error on that row, keep button disabled |
| User maps name to a worker already mapped (duplicate) | Allowed — two extracted names can map to one person |
| No candidates exist (score < 65%) | Dropdown shows all workers, no suggestions section |
| All names are new (most common case) | User clicks Continuar immediately — zero extra interaction |
| Single unmatched name | Same UI, not a special case — keeps the flow consistent |

---

## What NOT to Do

- ❌ Auto-create workers silently without user confirmation
- ❌ Skip unmatched rows without telling the user
- ❌ Block the entire upload and force the user to manually add workers before retrying
- ❌ Open a separate modal or navigate away for each name (breaks batch flow)
- ❌ Require DPI/phone/bank details at resolution time (those can be filled in later)

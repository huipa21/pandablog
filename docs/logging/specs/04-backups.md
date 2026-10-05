# Spec 04: Keep access logs out of backups

Task: **LOG-1.7** (interim until LOG-2.7 removes the `access_logs` table)

## 1. Goal

Full backups stop carrying the `access_logs` table. Backups get smaller and faster, and a restore never brings back old access rows.

Activity and error logs **stay** in backups. They are small and have audit and diagnostic value.

> If Phase 2 is planned within a couple of weeks and LOG-1.4 has already trimmed `access_logs` to 30 days, this task is optional. Record the decision in progress.md either way.

## 2. Current behaviour (for reference)

- `server/utils/backups/create.ts` → `exportSurrealDb(selection)`. A full backup passes `selection = undefined` → `tables: true` (everything).
- A partial backup passes an explicit `tables` list and stores it in `included_tables`.
- A restore (`restore.ts`) **wipes** the DB and imports the dump. The schema is re-applied at boot only when the schema hash changed (`db-init.ts → hasCurrentSchemaHash`).
- `backup settings.default_excluded_tables` exists, but only the dialog UI uses it. Full backups ignore it.

## 3. Design

New backup setting `include_access_logs: boolean` (default `false`) in the backup settings section of `server/utils/settings.ts`, `server/api/admin/backups/settings.put.ts`, and `components/admin/backups/BackupSettingsDialog.vue` (checkbox + i18n en/zh-CN).

In `runBackupWork` for `type === 'full' | 'incremental'`:

```ts
const excluded = settings.include_access_logs ? [] : ['access_logs']
const all = await listDatabaseTables()
const selection = excluded.length && all.includes('access_logs')
  ? { tables: all.filter(t => !excluded.includes(t)) }
  : undefined
```

- `included_tables` on the record stays `null` for full backups. That field means "partial subset" and drives consolidation logic, so don't overload it.
- Add a new optional manifest field: `excluded_tables: string[]` (e.g. `["access_logs"]`) for transparency. Show it in the backup details UI if one exists. If none exists, skip the UI part.

**Check the export behaviour.** With `tables: [list]`, SurrealDB exports the table definitions only for the listed tables. After a restore, the `access_logs` **definition** would be missing. Fix this in `restore.ts` after step 6 (verify): re-apply the logs schema section. The simplest option is to delete the `SCHEMA_HASH_KEY` app setting so the next boot re-applies the schema, **and** apply the schema immediately, reusing the db-init logic (export a `applySchema(db)` function from a shared util instead of duplicating it). If the table definition is missing, writes from access logging could otherwise create a schemaless table.

## 4. Tests

- Unit: the selection builder (pure function `buildFullBackupSelection(allTables, includeAccessLogs)`).
- Manual (record in progress.md): create a full backup, confirm the gzip size dropped, restore it on a dev DB, confirm `INFO FOR TABLE access_logs` exists and new access entries are written.

## 5. Acceptance criteria

- [ ] A full backup made with default settings contains no `access_logs` records (`zcat db.surql.gz | grep -c 'access_logs:'` → 0).
- [ ] Restoring that backup leaves a working, SCHEMAFULL `access_logs` table.
- [ ] Setting `include_access_logs = true` restores the old behaviour.

/**
 * Helpers for the Import History feature.
 *
 * An import batch remembers exactly which customer records it created
 * (created_customer_ids, computed by the database when the import was saved).
 * Deleting a batch may only ever target those ids — never older records,
 * manual customers, or vehicles that were skipped as duplicates at import
 * time (those pre-existing customers were never "created" by the batch).
 */

/** A customer counts as "edited since import" when its updatedAt is later than the batch's importedAt. */
export function isCustomerEditedSince(customer, importedAt) {
  const updated = Date.parse(customer?.updatedAt || '')
  const imported = Date.parse(importedAt || '')
  if (Number.isNaN(updated) || Number.isNaN(imported)) return false
  return updated > imported
}

/**
 * Work out what deleting a batch would do, against the current customer list.
 *
 * Returns:
 *  - targetIds:     customer ids that will be deleted (unedited, plus edited
 *                   ones only when includeEdited is set)
 *  - editedIds:     ids of records edited after the import (kept by default)
 *  - missingIds:    ids from the batch whose customers no longer exist
 *  - linkedReminders: reminders that point at the target customers (kept for
 *                   audit — pending ones are auto-cancelled, like any delete)
 *  - deletable:     true when there is at least one record to delete
 */
export function planBatchDeletion(customers, reminders, batch, { includeEdited = false } = {}) {
  const byId = new Map((customers || []).map((customer) => [customer.id, customer]))
  const createdIds = batch?.createdCustomerIds || []

  const presentIds = []
  const editedIds = []
  const missingIds = []
  for (const id of createdIds) {
    const customer = byId.get(id)
    if (!customer) {
      missingIds.push(id)
      continue
    }
    presentIds.push(id)
    if (isCustomerEditedSince(customer, batch.importedAt)) editedIds.push(id)
  }

  const editedSet = new Set(editedIds)
  const targetIds = presentIds.filter((id) => includeEdited || !editedSet.has(id))
  const targetSet = new Set(targetIds)
  const linkedReminders = (reminders || []).filter((reminder) => targetSet.has(reminder.customerId)).length

  return {
    targetIds,
    editedIds,
    missingIds,
    linkedReminders,
    deletable: targetIds.length > 0,
  }
}

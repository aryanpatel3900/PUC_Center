import { diffCustomerFields, vehicleKey } from './excelUtils'

/**
 * Merge parsed spreadsheet records into the customer list.
 *
 * The NORMALIZED vehicle number (upper-case, punctuation/spaces removed — the
 * same normalization as the database unique index in supabase/schema.sql) is
 * the only duplicate key. Phone numbers are NEVER used to identify duplicates:
 * different vehicles may share a phone, and one vehicle may change phones.
 *
 * Predictable rules:
 *  - Rows with a missing/meaningless vehicle number are counted as invalid and
 *    never merged — blank keys must not collide with each other.
 *  - The first valid row for a vehicle always wins. Later rows for the same
 *    vehicle are never applied on top of it: identical rows count as
 *    duplicates, rows with different details are flagged as conflicts for
 *    review — even in "update" mode.
 *  - A vehicle that already exists in the cloud database is never duplicated:
 *      'skip'   → identical rows skipped; different rows flagged as conflicts.
 *      'update' → identical rows skipped; different rows update the existing
 *                 record (an explicit user choice, never silent).
 */
export function mergeImportedCustomers(existingCustomers, records, mode, createId, now = new Date().toISOString()) {
  const customers = [...existingCustomers]
  const byKey = new Map()
  for (const customer of customers) {
    const key = vehicleKey(customer.vehicleNumber)
    if (key) byKey.set(key, customer) // blank vehicle numbers never deduplicate
  }
  const seenInFile = new Set()

  let imported = 0
  let updated = 0
  let skipped = 0
  let conflicts = 0
  let invalid = 0
  const conflictList = []

  const addConflict = (record, keptFrom, fields) => {
    conflicts += 1
    conflictList.push({
      rowNum: record.rowNum ?? null,
      vehicleNumber: record.vehicleNumber,
      fields,
      keptFrom,
    })
  }

  for (const record of records) {
    const key = vehicleKey(record.vehicleNumber)
    if (!record.valid || !key) {
      invalid += 1
      continue
    }

    const inFile = seenInFile.has(key)
    const existing = byKey.get(key)

    if (inFile) {
      // Same vehicle appeared earlier in this file: the first valid row wins.
      // Later rows are never merged on top of it, whatever mode was chosen.
      const fields = existing ? diffCustomerFields(existing, record) : []
      if (fields.length) addConflict(record, 'earlier row in this file', fields)
      else skipped += 1
      continue
    }
    seenInFile.add(key)

    if (existing) {
      const fields = diffCustomerFields(existing, record)
      if (!fields.length) {
        skipped += 1 // nothing to change
        continue
      }
      if (mode === 'update') {
        const index = customers.findIndex((customer) => customer.id === existing.id)
        customers[index] = {
          ...customers[index],
          name: record.name,
          mobile: record.mobile,
          vehicleNumber: record.vehicleNumber,
          vehicleType: record.vehicleType,
          pucExpiryDate: record.pucExpiryDate,
          email: record.email || customers[index].email,
          address: record.address || customers[index].address,
          isSample: false,
          updatedAt: now,
        }
        byKey.set(key, customers[index])
        updated += 1
      } else {
        // Keep the existing record and flag the row for review.
        addConflict(record, 'existing record', fields)
      }
      continue
    }

    const customer = {
      id: createId(),
      name: record.name,
      mobile: record.mobile,
      vehicleNumber: record.vehicleNumber,
      vehicleType: record.vehicleType,
      pucExpiryDate: record.pucExpiryDate,
      email: record.email || '',
      address: record.address || '',
      isSample: false,
      createdAt: now,
      updatedAt: now,
    }
    customers.push(customer)
    byKey.set(key, customer)
    imported += 1
  }

  return {
    customers,
    summary: {
      total: records.length,
      imported,
      updated,
      skipped,
      conflicts,
      invalid,
      needsCorrection: invalid,
      conflictList,
    },
  }
}

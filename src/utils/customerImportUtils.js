import { vehicleKey } from './excelUtils'

export function mergeImportedCustomers(existingCustomers, records, mode, createId, now = new Date().toISOString()) {
  const byKey = new Map(existingCustomers.map((customer) => [vehicleKey(customer.vehicleNumber), customer]))
  const customers = [...existingCustomers]
  let imported = 0
  let updated = 0
  let skipped = 0
  let invalid = 0

  for (const record of records) {
    if (!record.valid) {
      invalid += 1
      continue
    }

    const key = vehicleKey(record.vehicleNumber)
    const existing = byKey.get(key)
    if (existing) {
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
        skipped += 1
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
    summary: { total: records.length, imported, updated, skipped, invalid, needsCorrection: invalid },
  }
}

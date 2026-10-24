// Optional sample records so the owner can see how everything works.
// They are flagged with isSample so they can be removed without touching
// real customer records.

import { addDaysISO, todayISO } from './dateUtils'

export function buildSampleData() {
  const today = todayISO()
  const mk = (i, name, mobile, vehicleNumber, vehicleType, expiryOffsetDays) => ({
    id: `sample_${i}`,
    name,
    mobile,
    vehicleNumber,
    vehicleType,
    pucExpiryDate: addDaysISO(today, expiryOffsetDays),
    email: '',
    address: 'Ahmedabad, Gujarat',
    isSample: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  return [
    mk(1, 'Rahul Patel', '9876543210', 'GJ01AB1234', 'Car', -20), // already expired
    mk(2, 'Amit Shah', '9123456780', 'GJ01CD5678', 'Bike', 5), // 7-day reminder due
    mk(3, 'Priya Desai', '9825012345', 'GJ01EF9012', 'Car', 12), // 15-day reminder due
    mk(4, 'Kiran Joshi', '9909123456', 'GJ02GH3456', 'Auto', 28), // 30-day reminder due
    mk(5, 'Sneha Mehta', '9714567890', 'GJ03IJ7890', 'Bike', 45), // scheduled only
    mk(6, 'Manish Patel', '9898011223', 'GJ05KL2345', 'Truck', -5), // expired + missed
    mk(7, 'Harsh Vora', '9727334455', 'GJ01MN6789', 'Jeep', 15), // 15-day today
    mk(8, 'Nisha Trivedi', '9879123456', 'GJ07OP1122', 'Bus', 90), // far future
  ]
}

import { useEffect, useState } from 'react'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { VEHICLE_TYPES } from '../utils/excelUtils'
import { formatDate } from '../utils/dateUtils'
import { mobileError } from '../utils/phoneUtils'
import { AlertCircle } from 'lucide-react'

const EMPTY = {
  name: '',
  mobile: '',
  vehicleNumber: '',
  vehicleType: 'Car',
  pucExpiryDate: '',
  email: '',
  address: '',
}

/** Add / edit customer dialog with validation and duplicate handling. */
export default function CustomerForm({ open, onClose, customer = null, onSaved }) {
  const { addCustomer, updateCustomer } = useData()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [pendingDuplicate, setPendingDuplicate] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? {
              name: customer.name,
              mobile: customer.mobile,
              vehicleNumber: customer.vehicleNumber,
              vehicleType: customer.vehicleType || 'Other',
              pucExpiryDate: customer.pucExpiryDate,
              email: customer.email || '',
              address: customer.address || '',
            }
          : { ...EMPTY }
      )
      setErrors({})
      setPendingDuplicate(null)
    }
  }, [open, customer])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Customer name is required'
    const mErr = mobileError(form.mobile)
    if (mErr) errs.mobile = mErr
    if (!form.vehicleNumber.trim()) errs.vehicleNumber = 'Vehicle number is required'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.pucExpiryDate)) errs.pucExpiryDate = 'Select a valid PUC expiry date'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Email address looks invalid'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const attemptSave = (allowDuplicate = false) => {
    if (!validate()) return
    const result = customer
      ? updateCustomer(customer.id, form, { allowDuplicate })
      : addCustomer(form, { allowDuplicate })

    if (result.ok) {
      toast.success(customer ? 'Customer updated successfully.' : result.updated ? 'Existing vehicle updated.' : 'Customer added successfully.')
      onSaved?.(result)
      onClose()
    } else if (result.duplicateOf) {
      setPendingDuplicate(result.duplicateOf)
    } else if (result.errors) {
      setErrors(result.errors)
    }
  }

  const field = (key, label, props = {}, required = false) => (
    <div>
      <label htmlFor={`cf-${key}`} className="mb-1 block text-sm font-medium text-navy-800">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        id={`cf-${key}`}
        value={form[key]}
        onChange={set(key)}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `cf-${key}-err` : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-navy-800 focus:outline-none focus:ring-2 ${
          errors[key] ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
        {...props}
      />
      {errors[key] ? (
        <p id={`cf-${key}-err`} className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> {errors[key]}
        </p>
      ) : null}
    </div>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={customer ? `Edit ${customer.name || 'Customer'}` : 'Add Customer'}
        size="lg"
        footer={
          <>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => attemptSave(false)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {customer ? 'Save Changes' : 'Add Customer'}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Customer Name', { placeholder: 'e.g. Rahul Patel', autoComplete: 'off' }, true)}
          {field('mobile', 'Mobile Number', { placeholder: 'e.g. 98765 43210', inputMode: 'tel', autoComplete: 'off' }, true)}
          {field('vehicleNumber', 'Vehicle Number', { placeholder: 'e.g. GJ01AB1234', autoComplete: 'off' }, true)}
          <div>
            <label htmlFor="cf-vehicleType" className="mb-1 block text-sm font-medium text-navy-800">
              Vehicle Type
            </label>
            <select
              id="cf-vehicleType"
              value={form.vehicleType}
              onChange={set('vehicleType')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {field('pucExpiryDate', 'PUC Expiry Date', { type: 'date' }, true)}
          <div className="flex items-end pb-1">
            {/^\d{4}-\d{2}-\d{2}$/.test(form.pucExpiryDate) ? (
              <p className="text-xs text-slate-500">Shown as {formatDate(form.pucExpiryDate)}</p>
            ) : null}
          </div>
          {field('email', 'Email (optional)', { placeholder: 'email@example.com', type: 'email' })}
          {field('address', 'Address (optional)', { placeholder: 'City, Gujarat' })}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Reminder dates (30, 15 and 7 days before expiry) are calculated automatically after saving.
        </p>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDuplicate)}
        onClose={() => setPendingDuplicate(null)}
        onConfirm={() => {
          setPendingDuplicate(null)
          attemptSave(true)
        }}
        title="Vehicle number already exists"
        message={
          pendingDuplicate ? (
            <p>
              <span className="font-semibold text-navy-800">{pendingDuplicate.vehicleNumber}</span> is already registered to{' '}
              <span className="font-semibold text-navy-800">{pendingDuplicate.name}</span> (PUC expires{' '}
              {formatDate(pendingDuplicate.pucExpiryDate)}). Update that record with the new details?
            </p>
          ) : null
        }
        confirmLabel="Update Existing Record"
      />
    </>
  )
}

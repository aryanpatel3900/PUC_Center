# PUC Center Manager

A complete, professional web application for running a **PUC (Pollution Under Control) center** in India.
It manages customers and vehicles, calculates PUC reminder dates automatically, generates **Gujarati WhatsApp
reminder messages**, and opens each customer's WhatsApp chat with one click — **manually and safely**.

> **No paid APIs. No API keys. No subscriptions. No internet required.**
> Everything runs locally on your Windows computer and your data stays in your browser.

---

## ✨ Features

| Area | What it does |
| --- | --- |
| **Dashboard** | Real statistics: total customers, vehicles, reminders due today, 30/15/7-day due counts, expired PUCs, sent today, pending and missed reminders. Every card links to the matching list. |
| **Customers** | Add, edit, delete, search (name / mobile / vehicle), filter by expiry status and vehicle type, sort, paginate. Duplicate vehicle numbers are detected (case-insensitive) and you choose skip or update. |
| **Excel Import** | Upload `.xlsx`, `.xls` or `.csv`. Automatic column matching (Customer Name / Name / Owner Name, Mobile / Phone, Vehicle Number / Reg No, PUC Expiry Date / Valid Until…), column-mapping screen for unknown headers, preview with validation, duplicate handling, and a full import summary. Downloads a ready-made sample template. |
| **Automatic Reminders** | Every vehicle gets exactly three reminders: **30, 15 and 7 days** before PUC expiry (e.g. expiry 30/12/2026 → 30/11/2026, 15/12/2026, 23/12/2026). Date-only math — no timezone bugs. |
| **Reminder Center** | Tabs for 30-day, 15-day, 7-day, Today's Due, Missed, Sent History and All Reminders, with filters, sorting, search and a **"Prepare Today's Reminders"** action that only builds a list — it never auto-sends anything. |
| **Gujarati Messages** | Natural, polite Gujarati templates for each interval. Fully editable (greeting, body, closing, center name, contact, address) with a live preview. |
| **WhatsApp (manual)** | Uses the **official wa.me click-to-chat** links only. You review the message in WhatsApp and press Send yourself. The app tracks *"WhatsApp opened"* separately from *"Sent — Confirmed by Owner"*. |
| **History & Audit** | Every reminder is uniquely identified by **vehicle + expiry cycle + interval**, so duplicates are impossible. Changing an expiry date cancels pending old-cycle reminders, creates a new cycle, and keeps sent history forever. |
| **Backup & Export** | Export customers / filtered list / reminders / history to **Excel and CSV**, download a full **JSON backup**, and restore it later. |
| **Reports** | Charts for expiry distribution, reminders by interval & status, reminders confirmed per day, and vehicle types — all from real data. |
| **Settings** | Center name, contact, address, opening hours, Gujarati templates, missed-reminder options, date format, rows per page, default tab, sample data management, and a confirmed "clear all data" danger zone. |

---

## 🖥️ Windows Setup (Step by Step — for beginners)

### 1. Install Node.js (only once)

1. Go to **https://nodejs.org**
2. Download the **LTS** version for Windows.
3. Run the installer and click **Next → Next → Finish** (all defaults are fine).

To check it worked: press **Windows + R**, type `cmd`, press Enter, then type:

```
node --version
```

You should see something like `v22.x.x`. If yes, Node.js is installed.

### 2. Open the project

1. Install **VS Code** from https://code.visualstudio.com (if you don't have it).
2. Open VS Code → **File → Open Folder…** → choose this project folder (`vishva_puc`).

### 3. Open the terminal

In VS Code press **Ctrl + ``** (the backtick key, next to the `1` key).
At the bottom a terminal panel opens with a `>` prompt.

### 4. Install the dependencies (only once)

Type this in the terminal and press Enter:

```
npm install
```

Wait until it finishes (a minute or two the first time).

### 5. Start the application

```
npm run dev
```

You will see something like:

```
  VITE v5.x.x  ready in 500 ms
  ➜  Local:   http://localhost:5173/
```

### 6. Open it in your browser

Open **Chrome / Edge** and go to:

```
http://localhost:5173
```

The **PUC Center Manager** dashboard opens. 🎉

> Keep the terminal running while you use the app. To stop it later, click in the terminal and press **Ctrl + C**.

---

## 📖 How to use the app

### Import your customers from Excel

1. Click **Import Excel** in the left sidebar.
2. *(Optional)* Click **"Download the sample Excel template"** to get the correct format:

   | Customer Name | Mobile Number | Vehicle Number | Vehicle Type | PUC Expiry Date |
   | --- | --- | --- | --- | --- |
   | Rahul Patel | 9876543210 | GJ01AB1234 | Car | 30/12/2026 |
   | Amit Shah | 9123456780 | GJ01CD5678 | Bike | 15/12/2026 |

3. Fill in your real customers, save the file, then **drag & drop** it into the app (or click **Choose File**).
4. Check the **column matching** screen (common names are detected automatically).
5. Review the **preview** — errors and duplicates are highlighted.
6. Choose **skip** or **update** for duplicate vehicles, then **Import**.
7. Read the **import summary** (total rows, imported, updated, skipped, invalid).

Dates are read as **DD/MM/YYYY** (Indian format). Excel date cells are handled automatically. Ambiguous dates
(like 05/04/2026) are shown with the interpretation so *you* can verify them.

### Set your PUC center name

1. Open **Settings → Center**.
2. Enter your **center name**, **contact number**, **address** and (optionally) opening hours.
3. Click **Save Settings**.

The center name appears in the app and inside every WhatsApp message.

### Send a Gujarati WhatsApp reminder

1. Open **Reminder Center** (or click a dashboard card).
2. Pick a tab — **Today's Due**, **30-Day**, **15-Day**, **7-Day** or **Missed**.
3. On any row, click the green **WhatsApp** button.
4. A preview opens with the full Gujarati message — **you can edit the text** if you like.
5. Click **Open WhatsApp** — WhatsApp Web or WhatsApp Desktop opens with the message prefilled.
6. **Press Send inside WhatsApp yourself.**
7. Come back to the app and click **Mark as Sent** → **Yes, I sent it**.

The reminder is now recorded as **Sent — Confirmed by Owner** with the date and time.

> ⚠️ **Important:** opening WhatsApp does **not** mark a reminder as sent. Only your explicit
> "Mark as Sent" click does. The app cannot verify delivery or reading — that is a WhatsApp
> privacy limitation, and the app is honest about it.

### Handle missed reminders

1. Open **Reminder Center → Missed**.
2. Missed reminders (scheduled date passed, never confirmed) are listed separately.
3. Click **Prepare again** (the circular-arrow icon) and confirm — the reminder becomes pending again so
   you can send it late. Or click **Skip** if you don't want to send it at all.

### Export and back up your data

- **Excel export:** Customers page → *Export Filtered*, or Reminder Center / History → *Export Excel*.
- **JSON backup:** **Settings → Data → Download JSON Backup**. Keep this file safe (pen drive, email to yourself).
- **Restore:** **Settings → Data → Restore from Backup** → choose your `.json` file → confirm.

> ⚠️ Your data lives in **this browser on this computer** (localStorage). It does **not** appear on
> another computer, and it is lost if browser storage is cleared. **Take a JSON backup regularly.**

---

## 🧪 Tests

Automated tests (Vitest) cover the reminder engine, date handling, phone validation, Gujarati message
building and WhatsApp URL encoding — including all acceptance tests from the specification
(30/15/7-day date calculation, due-today vs missed classification, independent reminder statuses,
expiry-change cycle handling, Gujarati URL encoding, invalid-number blocking, …).

Run them with:

```
npm test
```

---

## 🏗️ Production build

To create an optimized production version:

```
npm run build
```

This creates a `dist` folder. To view it locally:

```
npm run preview
```

Then open the printed `http://localhost:4173` address. You can copy the `dist` folder to any
static web host (or keep using `npm run dev` on your own computer — it works fully offline).

---

## 📁 Project structure

```
src/
  components/     Sidebar, Header, tables, forms, modals, import wizard
  pages/          Dashboard, Customers, Import, Reminder Center, History, Reports, Settings
  context/        DataContext (records + actions), ToastContext (notifications)
  utils/          dateUtils, phoneUtils, excelUtils, messageTemplates,
                  whatsappUtils, reminderUtils, storageUtils, sampleData
  utils/__tests__/ Automated tests
```

## 🔒 Privacy & safety guarantees

- Customer data **never leaves your computer** — no server, no analytics, no tracking.
- Only the **official WhatsApp click-to-chat** links are used — no bots, no bulk sending, no unofficial APIs.
- **You** decide for every single message whether it is sent.
- Deleting or importing never silently destroys data — destructive actions ask for confirmation.

---

## ❓ Troubleshooting

| Problem | Solution |
| --- | --- |
| `npm` is not recognized | Node.js is not installed, or you opened a new terminal before installing. Install Node.js from nodejs.org, close VS Code and open it again. |
| Port 5173 is already in use | Another program uses that port. Run `npm run dev -- --port 5178` and open `http://localhost:5178`. |
| WhatsApp does not open | Allow pop-ups for the page, or install WhatsApp Desktop. You can also click **Copy Text** and paste the message into WhatsApp manually. |
| Data disappeared | Browser storage was cleared. Restore your JSON backup from **Settings → Data**. |
| Excel file not read | Make sure the first sheet has a header row and the file is `.xlsx`, `.xls` or `.csv`. |

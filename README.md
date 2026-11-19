# 💸 Expense Tracker — Google Sheets + Dashboard + iPhone Shortcut

A free, personal expense tracker that lives entirely in **your own Google account**:

- **Google Sheet** stores every expense (Transactions, Lists, Card Settings, Card Statements).
- **Apps Script web app** (attached to the sheet) serves a live dashboard and receives entries.
- **iPhone Shortcut** logs an expense in seconds from your Home Screen.
- **Google Drive** keeps your bill / invoice photos (folder: *Expense Bills*).

No servers, no subscriptions, no coding — just copy and paste.

> 🎬 **Video tutorial:** _add your YouTube link here_

---

## ✨ Features

| | |
|---|---|
| **Dashboard** | Total spend, transaction count, average, largest expense, activity trend, payment modes, recent transactions |
| **Smart insights** | Category analytics, “heads-up” alerts, column highlights for every field, combinations (e.g. category × payment mode) |
| **Add Expense** | Category chips, sub-category, payment mode, card, platform; type-ahead search for **Merchant** and **Location** (or use GPS); attach **multiple bill photos/PDFs** |
| **Transactions** | Search, filter, sort, edit, delete, bill thumbnails & preview |
| **Card Bills** | Per-card statement day & due day, current cycle spend, next bill & due date, “does my bill match what I logged?” check, add new cards |
| **No double counting** | Credit-card bill payments are excluded from spend automatically (configurable) |
| **Explore** | Chart builder with 19 chart types (bar, line, heatmap, treemap, running total, pivot table…) |
| **Analytics / Settings** | Category drill-down, dark mode, auto-refresh, swipe actions, phone-friendly layout |
| **iPhone Shortcut** | Log on the go; dropdowns come from your own Lists tab |

---

## 📁 What’s in this repo

```
apps-script/
  Code.gs                      ← paste into Apps Script → Code.gs
  Index.html                   ← paste into Apps Script → Index (HTML file)
sheet/
  Expense_Tracker_Template.xlsx  ← ready-made sheet (import into Google Sheets)
  1_Transactions_headers.tsv     ← the 12 column headers (copy → paste into A1)
  2_Lists.tsv                    ← dropdown values (copy → paste into Lists!A1)
  3_Card_Settings.tsv            ← optional sample card cycles
  4_Sample_Transactions.tsv      ← optional sample data (paste into A2)
docs/
  iphone-shortcut.md           ← build the two Shortcuts, action by action
```

> **Tip:** open a `.tsv` file on GitHub, click **Raw**, select all, copy, and paste into cell **A1** of the right tab — Google Sheets splits it into columns automatically.

---

## 🚀 Setup (about 10 minutes)

### Step 1 — Create the sheet

**Option A – import the template (fastest)**
1. Download [`sheet/Expense_Tracker_Template.xlsx`](sheet/Expense_Tracker_Template.xlsx).
2. Go to [sheets.new](https://sheets.new) → **File → Import → Upload** → choose the file → **Replace spreadsheet**.
3. Rename the spreadsheet to **Expense Tracker**. Skip to Step 2.

**Option B – build it by copy-paste (what the video shows)**
1. Open [sheets.new](https://sheets.new) and name it **Expense Tracker**.
2. Rename the first tab to **`Transactions`** (exact name — the script looks for it).
3. Click **A1** and paste [`1_Transactions_headers.tsv`](sheet/1_Transactions_headers.tsv):
   `Date | Category | Sub-Category | Amount | Payment Mode | Remarks | Location | Purchase Mode | Platform | Bank / Card | Merchant | Bill`
4. **Format → Convert to table**.
5. Add a tab named **`Lists`**, click **A1** and paste [`2_Lists.tsv`](sheet/2_Lists.tsv).
   Edit it to match your life — every dropdown in the app (and on the iPhone) comes from here:

   | Columns | Meaning |
   |---|---|
   | A–B | Category → Sub-Category (one row per pair) |
   | D–E | Payment Mode → type (Bank / Credit Card / Cash / Wallet) |
   | G–H | Bank / Card → type (Bank / Credit Card / Wallet) |
   | J | Purchase Mode (Offline / Online) |
   | L–M | Platform → Online / Offline |
   | O | Merchant (new merchants are added automatically) |

6. *(Optional)* Paste [`4_Sample_Transactions.tsv`](sheet/4_Sample_Transactions.tsv) into **Transactions!A2** to try the dashboard with demo data.
   If dates show as `2026-10-01`, select column A → **Format → Number → Custom number format** → `dd/mm/yyyy`.

> `Card Settings` and `Card Statements` tabs are created automatically the first time you use the **Card Bills** page.

### Step 2 — Add the dashboard code

1. In the sheet: **Extensions → Apps Script**. Name the project **Expense Dashboard**.
2. Open **Code.gs**, select everything, and replace it with [`apps-script/Code.gs`](apps-script/Code.gs). **Save** (Ctrl/⌘ + S).
3. Click **+ → HTML**, name it **`Index`** (exactly), replace its content with [`apps-script/Index.html`](apps-script/Index.html). **Save**.

### Step 3 — Deploy

1. **Deploy → New deployment** → ⚙️ **Web app**.
2. Description: `Dashboard` · **Execute as: Me** · **Who has access: Only myself** → **Deploy**.
3. **Authorize access** → choose your account → *“Google hasn’t verified this app”* → **Advanced → Go to Expense Dashboard (unsafe) → Allow**.
   (This warning is normal for scripts you write yourself.)
4. Copy the **Web app URL**.
5. Back in **Code.gs**, paste it on line 7 between the quotes and save:
   ```js
   const WEB_APP_URL = 'https://script.google.com/macros/s/XXXX/exec';
   ```
6. Reload the sheet → a **Dashboard** menu appears → **Dashboard → Open Expense Dashboard**.
   The first time you attach a bill, Google asks once more for Drive access — allow it.

### Step 4 — Log an expense

Open the dashboard → **＋ Add Expense** → amount, category, payment mode, card, merchant (type to search), location (or *Current location*), remarks, bills → **Save Expense**. It lands in the Transactions table instantly.

### Step 5 — Card bills

**Card Bills** tab → set each card’s **statement day** and **due day** → **Save**. When a statement arrives, type the bill amount: it tells you if it matches your logged spends for that cycle (tap *entries* to see them). Add new cards from the same page.

### Step 6 — iPhone

- **Dashboard as an app:** open your Dashboard URL in Safari → **Share → Add to Home Screen**.
- **Quick logging Shortcut:** follow [`docs/iphone-shortcut.md`](docs/iphone-shortcut.md).
  The Shortcut needs its **own deployment** with **Who has access: Anyone** (iPhone Shortcuts can’t sign in to Google).

---

## 🔄 Updating the code later

Paste the new code → **Save** → **Deploy → Manage deployments** → ✏️ edit **each** deployment (Dashboard *and* iPhone Shortcut) → **Version: New version** → **Deploy**. The URLs stay the same.

## 🔒 Privacy

- Your data never leaves your Google account (Sheet + Drive).
- Keep the **Shortcut deployment URL secret** — anyone who has it can add entries or read your lists. If it leaks, archive that deployment and create a new one.
- Back up regularly: **File → Make a copy**.

## License

MIT — free to use, modify and share.

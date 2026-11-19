# 📱 iPhone Shortcut setup

You’ll build **two shortcuts** in the Shortcuts app:

| Shortcut | What it does | When to run |
|---|---|---|
| **Update Expense Lists** | Downloads your Lists tab (categories, payment modes, cards, platforms…) and saves it as `lists.json` | Once now, and again whenever you edit the **Lists** tab |
| **Expense Tracker** | Asks for the expense details and sends them to your sheet | Every time you spend |

---

## 0. Create a deployment for the Shortcut

The Shortcut can’t sign in to Google, so it needs a web-app deployment that doesn’t require sign-in:

1. Apps Script → **Deploy → New deployment** → ⚙️ **Web app**.
2. Description: `iPhone Shortcut` · **Execute as: Me** · **Who has access: Anyone** → **Deploy**.
3. Copy this **Web app URL** — below it’s called **`YOUR_URL`**. Keep it private.

> When you update the code later, edit this deployment too (**Manage deployments → ✏️ → New version**).

---

## 1. Shortcut “Update Expense Lists”

| # | Action | Settings |
|---|---|---|
| 1 | **Get Contents of URL** | `YOUR_URL?action=lists` · Method **GET** |
| 2 | **Set Name** | of *Contents of URL* → `lists.json` |
| 3 | **Save File** | *Renamed Item* → **Shortcuts** folder, subpath `expense_tracker/` · *Ask Where to Save* **off** · *Overwrite* **on** |
| 4 | **Show Alert** | `Updated ✅` |

Run it once. The JSON contains: `categories` (category → sub-categories), `paymentModes`, `banks`, `banksFor` (payment mode → cards/banks), `purchaseModes`, `platforms`, `platformsFor` (purchase mode → platforms), `merchants`.

Other read-only endpoints you can use: `?action=categories`, `?action=subcategories&category=Food`, `?action=paymentmodes`, `?action=purchasemodes`, `?action=banks&paymentMode=UPI Credit Card`, `?action=platforms&purchaseMode=Online`, `?action=merchants`.

---

## 2. Shortcut “Expense Tracker”

**Load your lists**
1. **Get File** from **Shortcuts** at path `expense_tracker/lists.json`
2. **Get Dictionary from** *File* → **Set Variable** `lists`

**Amount**
3. **Ask for Input** – Number – “Enter the Amount 💵” → **Set Variable** `amount`

**Category & sub-category**
4. **Get Dictionary Value** `categories` in `lists` → **Set Variable** `catMap`
5. **Get Dictionary Value** – *All Keys* in `catMap` → **Choose from List** → **Set Variable** `category`
6. **Get Dictionary Value** `category` in `catMap` → **Choose from List** → **Set Variable** `subcategory`

**Payment mode & card**
7. **Get Dictionary Value** `paymentModes` in `lists` → **Choose from List** (“Choose Payment Mode”) → **Set Variable** `paymentMode`
8. **Get Dictionary Value** `banksFor` in `lists` → **Get Dictionary Value** `paymentMode` in it → **Set Variable** `bankOptions`
9. **Count** items in `bankOptions` → **If** count > 0 → **Choose from List** `bankOptions` → **Set Variable** `bankCard` · *Otherwise* → **Text** (empty) → **Set Variable** `bankCard` → **End If**

**Purchase mode & platform**
10. **Get Dictionary Value** `purchaseModes` in `lists` → **Choose from List** → **Set Variable** `purchaseMode`
11. **Get Dictionary Value** `platformsFor` in `lists` → **Get Dictionary Value** `purchaseMode` in it → **Choose from List** (“Choose Platform”) → **Set Variable** `platform`

**Location**
12. **Choose from Menu** “Where was this transaction made?”
    - *Current Location* → **Get Current Location** → **Get Latitude / Longitude** → **Text** `Latitude,Longitude` → **Set Variable** `location`
    - *Another Location* → **Ask for Input** – Text – “Enter the location (Area, City)” → **Set Variable** `location`

**Date**
13. **Choose from Menu** “Is this transaction made today?”
    - *Yes ✅* → **Current Date** → **Format Date** (Custom `dd/MM/yyyy`) → **Set Variable** `date`
    - *No ❌* → **Ask for Input** – Date – “Select the transaction date” → **Format Date** (Custom `dd/MM/yyyy`) → **Set Variable** `date`

**Merchant & remarks**
14. **Ask for Input** – Text – “Enter Merchant/Shop/Store Name…” → **Set Variable** `merchant`
15. **Ask for Input** – Text – “Enter Remarks if any” → **Set Variable** `remarks`

**Send it**
16. **Get Contents of URL** → `YOUR_URL`
    - Method: **POST** · Request Body: **JSON**
    - Fields (Text): `date`, `category`, `subCategory`, `amount`, `paymentMode`, `remarks`, `location`, `purchaseMode`, `bankCard`, `platform`, `merchant`
17. **Show Notification** → “Transaction saved: *Contents of URL*”

✅ The reply is `Success` when the row is added.
Required: `date`, `category`, `subCategory`, `amount`, `paymentMode`, `location`, `purchaseMode`. Optional: `remarks`, `platform`, `bankCard`, `merchant`, `bill`.

### Optional: attach bill photos
Before step 16 add **Select Photos** (or **Take Photo**) → **Base64 Encode** → **Set Variable** `bill`, and add a JSON field **`bill`** (Text) = `bill`. Several photos work too — they’re saved to Drive › *Expense Bills* and linked in the **Bill** column.

---

## 3. Add to Home Screen
Long-press **Expense Tracker** → **Share → Add to Home Screen**. Tap it any time to log an expense.

## Troubleshooting
| Problem | Fix |
|---|---|
| Notification shows an HTML page / “Sign in” | The Shortcut deployment must be **Who has access: Anyone**. |
| `Error: missing …` | A required field was empty — check the field names in the JSON body. |
| New categories don’t show | Run **Update Expense Lists** again. |
| Changes in code don’t apply | Edit the deployment → **New version** (both deployments). |

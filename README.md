# Ladderater

Ladderater is a lightweight, self-contained web application designed to support leadership annual appraisals and calibration panels. It allows a panel of assessors to visually arrange candidates into strict rating bands via an elegant drag-and-drop interface.

To make sharing as easy as possible, the application is compiled into a **single, zero-dependency `.html` file** that works completely offline in any modern web browser.

---

## Features

- **Strict Laddering**: Candidates are ranked in a strict sequence. No two candidates can occupy the same rank.
- **Cascading Overflow**: If a candidate is dropped into a slot-limited band that is full, the candidate at the bottom of that band is automatically pushed down to the next band (e.g. *Strategic Impact* -> *Differentiating* -> *Progressing*).
- **Contiguous Sorting**: Candidates snap to the next available position within a band, preventing gaps and keeping the calibration clean.
- **Configurable Promotion Board**: Toggle between the Performance Board and an Appraisal Promotion Board tailored to your organization's calibration workflow:
  - **Default Two-Tier Mode**: Features **Expected Promotions** (capped capacity, gold themed) and **Potential Promotions** (uncapped, slate/silver themed), with bidirectional cascading, plus the **Golden Transition** when Expected capacity is set to `0`.
  - **Multi-Bucket Mode (e.g. 3 Buckets)**: Full support for custom buckets such as **Promote Now**, **Promote Soon**, and **Promote Later**, complete with customized colors, slot capacities, descriptions, and automatic downward cascading.
  - **Starred Promotion Flags**: Star or unstar candidates to immediately allocate them into promotion ladders, preserved across view switches.
  - **Candidate Pool**: Displays unstarred candidates in the right sidebar with drag-and-drop support, quick-star actions, and Auto-Fill.
- **Discuss Next Queue**: Sequentially loads unranked candidates in alphabetical order into a dedicated discussion widget with quick-placement buttons, speeding up calibrations.
- **Large "Under Discussion" Dashboard**: A prominent, vertical profile card with a large photo/avatar, candidate name, counselor, email address, and optional appraisal comments/notes, centered at the top of the sidebar to keep the spotlight on the candidate currently being calibrated.
- **Counsellor Breakdown**: Real-time aggregation of how many candidates each counselor has placed in each band, helping the panel spot distribution imbalances.
- **LocalStorage State Preservation**: Automatically saves the board's state in your browser cache so progress is never lost on page refresh. The state is keyed to your candidate database, resetting automatically only if the input candidate list changes.
- **100% Offline-Capable**: Generates beautiful initials-based profile pictures using linear gradients on the fly, eliminating external network requests.
- **Entra ID Profile Photos (Optional)**: Automatically fetches profile photos from Entra ID (Microsoft Graph) during compilation when an access token is provided, embedding them as base64 data URLs to maintain offline-first design.
- **Export to Clipboard**: Copies the ordered list of candidates from the active view (Performance Board or Promotion Board) to the clipboard. The output is formatted with global 1-to-n indexing and includes counselor names, providing visual confirmation ("Copied!") on click.

---

## File Structure

- `candidates.csv`: The input database containing candidate names and their counsellors.
- `generate.ps1`: The PowerShell compilation script.
- `ladderater.html`: The generated standalone web application.

---

## How to Use

### 1. Configure Candidates
Open `candidates.csv` in Excel or any text editor and populate it with your candidates. Optionally, you can add an `Email` column to dynamically fetch profile pictures from Entra ID (Microsoft Graph) during compilation, and a `Comment` column to display notes, calibration feedback, or achievements directly in the "Under Discussion" panel:
```csv
Name,Counsellor,Email,Comment
Alice Vance,Marcus Vance,alice.vance@company.com,"Top candidate for Staff promotion; exceptional cross-team technical leadership."
Bob Miller,Sarah Jenkins,bob.miller@company.com,"Consistent high deliverer; key contributor to backend performance improvements."
```

### 2. Generate the Application
Open a standard PowerShell window on a Windows 11 machine (no administrator permissions required) and run:
```powershell
powershell -ExecutionPolicy Bypass -File .\generate.ps1
```

If you wish to pull profile photos from Entra ID, pass your Entra ID (Microsoft Graph) access token via the `-Token` parameter:
```powershell
powershell -ExecutionPolicy Bypass -File .\generate.ps1 -Token "YOUR_ACCESS_TOKEN"
```
This will retrieve the profile photos for candidates with email addresses, convert them to base64, and embed them directly inside the compiled HTML so the application remains 100% self-contained and offline-capable!

### 3. Open the App
Double-click the generated `ladderater.html` file to open it in **Google Chrome**, **Microsoft Edge**, or **Firefox**.

### 4. Configure Promotion Board

The promotion board is enabled when `"enablePromotions": true` is set in `config.json`. You can customize the promotion board structure via the `"promotionBuckets"` array.

#### Default Mode: Two-Tier (Expected & Potential)
By default, `config.json` is set up with two tiers:
- **Expected Promotions**: Capped capacity with interactive stepper controls, gold styling (`#ca8a04`), and cascading overflow. Setting capacity to `0` triggers the "Golden Transition" where the Expected row is hidden and Potential becomes the sole golden promotions board.
- **Potential Promotions**: Uncapped pool, slate/silver styling (`#64748b`), receiving overflow from Expected slots.

```json
{
  "enablePromotions": true,
  "defaultExpectedSpaces": 3,
  "maxExpectedSpaces": 10,
  "promotionBuckets": [
    {
      "id": "expected",
      "name": "Expected Promotions",
      "shortName": "Expected",
      "description": "Highest priority candidates recommended for promotion. Set space to 0 to disable this row and manage all promotions in the uncapped row below.",
      "hasLimit": true,
      "defaultCapacity": 3,
      "maxCapacity": 10,
      "color": "#ca8a04",
      "colorLight": "#fffbeb",
      "colorBorder": "#f59e0b"
    },
    {
      "id": "potential",
      "name": "Potential Promotions",
      "shortName": "Potential",
      "description": "Candidates recommended for potential promotion space (uncapped). Excess candidates cascade here if Expected slots are full.",
      "hasLimit": false,
      "color": "#64748b",
      "colorLight": "#f8fafc",
      "colorBorder": "#94a3b8"
    }
  ]
}
```

#### Three-Bucket Mode: Promote Now / Soon / Later
You can also configure three readiness buckets (or use `"promotionMode": "three-buckets"`):
- **Promote Now**: Readiness for promotion in the current cycle (capped, green theme).
- **Promote Soon**: Readiness for promotion in the next cycle (uncapped, amber theme).
- **Promote Later**: Readiness for promotion in a future cycle (uncapped, slate theme).

```json
{
  "enablePromotions": true,
  "promotionBuckets": [
    {
      "id": "promote-now",
      "name": "Promote Now",
      "shortName": "Now",
      "description": "Readiness for promotion in the current cycle",
      "hasLimit": true,
      "defaultCapacity": 3,
      "maxCapacity": 10,
      "color": "#16a34a",
      "colorLight": "#f0fdf4",
      "colorBorder": "#22c55e"
    },
    {
      "id": "promote-soon",
      "name": "Promote Soon",
      "shortName": "Soon",
      "description": "Readiness for promotion in the next cycle",
      "hasLimit": false,
      "color": "#ca8a04",
      "colorLight": "#fefce8",
      "colorBorder": "#f59e0b"
    },
    {
      "id": "promote-later",
      "name": "Promote Later",
      "shortName": "Later",
      "description": "Readiness for promotion in a future cycle",
      "hasLimit": false,
      "color": "#475569",
      "colorLight": "#f8fafc",
      "colorBorder": "#94a3b8"
    }
  ]
}
```

Each bucket can be tailored with:
- `id`: Unique identifier (e.g. `promote-now`).
- `name`: Display title in the ladder row header.
- `shortName`: Abbreviated label for header stats and counselor breakdown pills.
- `description`: Explanatory subtitle shown beneath the ladder title.
- `hasLimit`: Boolean indicating whether the bucket has fixed slot capacity (`true`) or is uncapped (`false`).
- `defaultCapacity` & `maxCapacity`: Starting slot count and upper limit for steppers (for limited buckets).
- `color`, `colorLight`, `colorBorder`: Custom hex color palette for borders, badges, cards, and drop zones.

### 5. Export Calibration Lists
Click the **Export List** button in the header at any time. This will copy the ordered list of candidates from the current view directly to your clipboard, allowing you to easily paste it into emails, spreadsheets, or documents. The export includes:
- Global 1-to-n indexing across the entire board/ladders.
- Categorization by Band (for Performance) or Row (for Promotions).
- Candidate name and counselor information.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
Copyright © 2026 Charles Dickinson.

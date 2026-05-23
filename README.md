# Ladderater

Ladderater is a lightweight, self-contained web application designed to support leadership annual appraisals and calibration panels. It allows a panel of assessors to visually arrange candidates into strict rating bands via an elegant drag-and-drop interface.

To make sharing as easy as possible, the application is compiled into a **single, zero-dependency `.html` file** that works completely offline in any modern web browser.

---

## Features

- **Strict Laddering**: Candidates are ranked in a strict sequence. No two candidates can occupy the same rank.
- **Cascading Overflow**: If a candidate is dropped into a slot-limited band that is full, the candidate at the bottom of that band is automatically pushed down to the next band (e.g. *Strategic Impact* -> *Differentiating* -> *Progressing*).
- **Contiguous Sorting**: Candidates snap to the next available position within a band, preventing gaps and keeping the calibration clean.
- **Promotion Board View**: Toggle to a dual-row promotion board with **Expected Promotions** (capped capacity, gold themed) and **Potential Promotions** (uncapped, silver themed):
  - **Double-Row Sequential Cascade**: Adjusting Expected spaces or starring/unstarring candidates cascades them down (Expected -> Potential) or pulls them up (Potential -> Expected).
  - **Golden Transition**: Set Expected capacity to `0` to hide the Expected row and automatically transition Potential Promotions into a gold-themed uncapped promotions board.
  - **Candidate Pool**: Shows all unstarred candidates in the right sidebar, letting you promote them via drag-and-drop or star toggles, or demote them by removing stars.
- **Discuss Next Queue**: Sequentially loads unranked candidates in alphabetical order into a dedicated discussion widget with quick-placement buttons, speeding up calibrations.
- **Large "Under Discussion" Dashboard**: A prominent, vertical profile card with a large photo/avatar, candidate name, counselor, and email address, centered at the top of the sidebar to keep the spotlight on the candidate currently being calibrated.
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
Open `candidates.csv` in Excel or any text editor and populate it with your candidates. Optionally, you can add an `Email` column to dynamically fetch profile pictures from Entra ID (Microsoft Graph) during compilation:
```csv
Name,Counsellor,Email
Alice Vance,Marcus Vance,alice.vance@company.com
Bob Miller,Sarah Jenkins,bob.miller@company.com
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

### 4. Configure Promotions (Optional)
To use the optional double-row promotion board:
- Open `config.json` and set `"enablePromotions": true`.
- Customize the gold row's default and maximum capacity using `"defaultExpectedSpaces"` and `"maxExpectedSpaces"`.
- Set `"defaultExpectedSpaces"` to `0` if you want only a single, uncapped golden promotions row.

### 5. Export Calibration Lists
Click the **Export List** button in the header at any time. This will copy the ordered list of candidates from the current view directly to your clipboard, allowing you to easily paste it into emails, spreadsheets, or documents. The export includes:
- Global 1-to-n indexing across the entire board/ladders.
- Categorization by Band (for Performance) or Row (for Promotions).
- Candidate name and counselor information.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
Copyright © 2026 Charles Dickinson.

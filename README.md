# Ladderater

Ladderater is a lightweight, self-contained web application designed to support leadership annual appraisals and calibration panels. It allows a panel of assessors to visually arrange candidates into strict rating bands via an elegant drag-and-drop interface.

To make sharing as easy as possible, the application is compiled into a **single, zero-dependency `.html` file** that works completely offline in any modern web browser.

---

## Features

- **Strict Laddering**: Candidates are ranked in a strict sequence. No two candidates can occupy the same rank.
- **Cascading Overflow**: If a candidate is dropped into a slot-limited band that is full, the candidate at the bottom of that band is automatically pushed down to the next band (e.g. *Strategic Impact* -> *Differentiating* -> *Progressing*).
- **Contiguous Sorting**: Candidates snap to the next available position within a band, preventing gaps and keeping the calibration clean.
- **Promotion Calibration View**: Toggle to a dual-row promotion board with **Expected Promotions** (capped capacity, gold themed) and **Potential Promotions** (uncapped, silver themed):
  - **Double-Row Sequential Cascade**: Adjusting Expected spaces or starring/unstarring candidates cascades them down (Expected -> Potential) or pulls them up (Potential -> Expected).
  - **Golden Transition**: Set Expected capacity to `0` to hide the Expected row and automatically transition Potential Promotions into a gold-themed uncapped promotions board.
  - **Candidate Pool**: Shows all unstarred candidates in the right sidebar, letting you promote them via drag-and-drop or star toggles, or demote them by removing stars.
- **Discuss Next Queue**: Sequentially loads unranked candidates in alphabetical order into a dedicated discussion widget with quick-placement buttons, speeding up calibrations.
- **Counsellor Breakdown**: Real-time aggregation of how many candidates each counselor has placed in each band, helping the panel spot distribution imbalances.
- **LocalStorage State Preservation**: Automatically saves the board's state in your browser cache so progress is never lost on page refresh. The state is keyed to your candidate database, resetting automatically only if the input candidate list changes.
- **100% Offline-Capable**: Generates beautiful initials-based profile pictures using linear gradients on the fly, eliminating external network requests.

---

## File Structure

- `candidates.csv`: The input database containing candidate names and their counsellors.
- `generate.ps1`: The PowerShell compilation script.
- `ladderater.html`: The generated standalone web application.

---

## How to Use

### 1. Configure Candidates
Open `candidates.csv` in Excel or any text editor and populate it with your candidates:
```csv
Name,Counsellor
Alice Vance,Marcus Vance
Bob Miller,Sarah Jenkins
```

### 2. Generate the Application
Open a standard PowerShell window on a Windows 11 machine (no administrator permissions required) and run:
```powershell
powershell -ExecutionPolicy Bypass -File .\generate.ps1
```

### 3. Open the App
Double-click the generated `ladderater.html` file to open it in **Google Chrome**, **Microsoft Edge**, or **Firefox**.

### 4. Configure Promotions (Optional)
To use the optional double-row promotion calibration board:
- Open `config.json` and set `"enablePromotions": true`.
- Customize the gold row's default and maximum capacity using `"defaultExpectedSpaces"` and `"maxExpectedSpaces"`.
- Set `"defaultExpectedSpaces"` to `0` if you want only a single, uncapped golden promotions row.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
Copyright © 2026 Charles Dickinson.

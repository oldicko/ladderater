# PowerShell Script to generate the Ladderater Web Application
# Run this on a standard Windows 11 machine without admin permissions:
# powershell -ExecutionPolicy Bypass -File .\generate.ps1

$csvPath = Join-Path $PSScriptRoot "candidates.csv"

# 1. Create a default candidates.csv if it does not exist
if (-not (Test-Path $csvPath)) {
    $defaultCsv = @"
Name,Counsellor
Alice Vance,Marcus Vance
Bob Miller,Sarah Jenkins
Catherine de Medici,Thomas Wolsey
David Hume,Adam Smith
Elizabeth Bennet,Jane Austen
Franklin Roosevelt,Winston Churchill
George Washington,Alexander Hamilton
Harriet Tubman,Frederick Douglass
Isaac Newton,Robert Hooke
Jane Eyre,Charlotte Bronte
Jane Eyre,Charlotte Bronte
Katherine Johnson,Dorothy Vaughan
Leonardo da Vinci,Lorenzo de' Medici
Marie Curie,Pierre Curie
Nikola Tesla,Thomas Edison
Oscar Wilde,Robert Ross
"@
    # Set encoding to UTF8 so characters compile cleanly
    Set-Content -Path $csvPath -Value $defaultCsv -Encoding utf8
    Write-Host "Created default candidates.csv file in project root." -ForegroundColor Yellow
}

# 2. Read candidates from CSV
Write-Host "Reading candidate data from candidates.csv..." -ForegroundColor Cyan
try {
    $candidates = Import-Csv -Path $csvPath
    Write-Host "Successfully loaded $($candidates.Count) candidates." -ForegroundColor Green
} catch {
    Write-Error "Failed to parse candidates.csv. Please ensure it is in valid CSV format with Name and Counsellor columns."
    exit 1
}

# 3. Convert candidates to JSON string to inject into the HTML template
$jsonCandidates = ConvertTo-Json @($candidates) -Compress

# 4. Read config.json
$configPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $configPath)) {
    $defaultConfig = @"
{
  "title": "LADDERATER",
  "subtitle": "Calibration Session",
  "enablePromotions": true,
  "defaultExpectedSpaces": 3,
  "maxExpectedSpaces": 10,
  "bands": [
    {
      "id": "top-talent",
      "name": "Top Talent",
      "shortName": "Top",
      "description": "Exceptional impact, sets new standards, and elevates peers.",
      "hasLimit": true,
      "defaultCapacity": 3,
      "maxCapacity": 10,
      "color": "#be185d",
      "colorLight": "#fdf2f8",
      "colorBorder": "#ec4899"
    },
    {
      "id": "strong-performer",
      "name": "Strong Performer",
      "shortName": "Strong",
      "description": "Consistently delivers high-quality outcomes and exceeds expectations.",
      "hasLimit": true,
      "defaultCapacity": 5,
      "maxCapacity": 15,
      "color": "#1d4ed8",
      "colorLight": "#eff6ff",
      "colorBorder": "#3b82f6"
    },
    {
      "id": "core-performer",
      "name": "Core Performer",
      "shortName": "Core",
      "description": "Solid, reliable contributor meeting all core expectations.",
      "hasLimit": false,
      "color": "#047857",
      "colorLight": "#ecfdf5",
      "colorBorder": "#10b981"
    },
    {
      "id": "needs-support",
      "name": "Needs Support",
      "shortName": "Needs Supp",
      "description": "Performance or developmental gaps identified; structured guidance required.",
      "hasLimit": false,
      "color": "#b91c1c",
      "colorLight": "#fef2f2",
      "colorBorder": "#ef4444"
    }
  ]
}
"@
    Set-Content -Path $configPath -Value $defaultConfig -Encoding utf8
    Write-Host "Created default config.json file in project root." -ForegroundColor Yellow
}

Write-Host "Reading configuration from config.json..." -ForegroundColor Cyan
try {
    $configJsonText = Get-Content -Raw -Path $configPath -Encoding utf8
    # Validate by parsing
    $null = ConvertFrom-Json -InputObject $configJsonText
    Write-Host "Successfully loaded and validated config.json." -ForegroundColor Green
} catch {
    Write-Error "Failed to parse config.json. Please ensure it is in valid JSON format."
    exit 1
}

# 5. Define HTML Template (Single-file, self-contained)
$htmlTemplate = @'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ladderater - Calibration Panel</title>
    <!-- Premium Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
    
    <style>
        :root {
            --bg-main: #f8fafc;
            --bg-card: #ffffff;
            --border-color: #e2e8f0;
            --text-primary: #0f172a;
            --text-secondary: #475569;
            --text-muted: #94a3b8;
            
            --sidebar-width: 290px;
            --unranked-width: 360px;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-main);
            color: var(--text-primary);
            overflow: hidden;
            height: 100vh;
        }

        h1, h2, h3, h4 {
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
        }

        /* Scrollbars styling */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.02);
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.15);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.3);
        }

        /* App Layout Grid */
        .app-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* Header styling */
        .app-header {
            background: #ffffff;
            border-bottom: 1px solid var(--border-color);
            padding: 0 24px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
            box-shadow: 0 1px 2px 0 rgba(0,0,0,0.03);
            z-index: 10;
        }
        
        .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .logo-icon {
            width: 28px;
            height: 28px;
            color: #4f46e5;
        }
        
        .header-left h1 {
            font-size: 20px;
            letter-spacing: -0.02em;
            color: #0f172a;
            font-weight: 700;
            text-transform: uppercase;
        }
        
        .status-badge {
            background-color: #f0fdf4;
            border: 1px solid #bbf7d0;
            color: #166534;
            font-size: 11px;
            padding: 4px 10px;
            border-radius: 9999px;
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
        }
        
        .pulse-dot {
            width: 6px;
            height: 6px;
            background-color: #22c55e;
            border-radius: 50%;
            display: inline-block;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 4px rgba(34, 197, 94, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }

        /* View Switcher segment control */
        .view-switcher {
            display: flex;
            background: #f1f5f9;
            padding: 4px;
            border-radius: 10px;
            border: 1px solid var(--border-color);
        }
        .switcher-btn {
            background: none;
            border: none;
            padding: 6px 14px;
            border-radius: 8px;
            cursor: pointer;
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            font-size: 13px;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.15s ease;
        }
        .switcher-btn svg {
            width: 14px;
            height: 14px;
            stroke-width: 2.5;
        }
        .switcher-btn.active {
            background: #ffffff;
            color: #4f46e5;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .switcher-btn:hover:not(.active) {
            background: rgba(0, 0, 0, 0.03);
            color: var(--text-primary);
        }

        .header-stats {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .stat-item {
            font-size: 13px;
            font-weight: 500;
            color: var(--text-secondary);
        }
        
        .stat-val {
            font-weight: 700;
            color: var(--text-primary);
            background: #f1f5f9;
            padding: 3px 8px;
            border-radius: 6px;
            margin-left: 4px;
            border: 1px solid #e2e8f0;
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .btn {
            background: #ffffff;
            border: 1px solid var(--border-color);
            padding: 8px 14px;
            border-radius: 8px;
            cursor: pointer;
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .btn:hover {
            background: #f8fafc;
            border-color: #cbd5e1;
        }
        
        .btn-export {
            color: #4f46e5;
            border-color: #c7d2fe;
            background-color: #f5f3ff;
        }
        
        .btn-export:hover {
            background-color: #e0e7ff;
            border-color: #818cf8;
            box-shadow: 0 2px 4px rgba(79, 70, 229, 0.05);
        }

        .btn-reset {
            color: #e11d48;
            border-color: #fca5a5;
            background-color: #fff1f2;
        }
        
        .btn-reset:hover {
            background-color: #ffe4e6;
            border-color: #f43f5e;
            box-shadow: 0 2px 4px rgba(225, 29, 72, 0.05);
        }

        /* App Workspace Content */
        .app-body {
            display: flex;
            height: calc(100vh - 64px); /* 64px header */
            overflow: hidden;
        }

        /* Left Column: Calibration Panel */
        .sidebar-left {
            width: var(--sidebar-width);
            background: #ffffff;
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
            overflow: hidden;
            transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-right-width 0.25s;
        }
        
        .sidebar-left.collapsed {
            width: 0;
            border-right-width: 0;
            border-right-color: transparent;
        }
        
        .sidebar-left-scroll {
            flex-grow: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* Sidebar Section Header (Minimize button container) */
        .sidebar-section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 6px;
            margin-bottom: 16px;
            flex-shrink: 0;
        }
        .sidebar-section-header h3 {
            margin-bottom: 0 !important;
            border-bottom: none !important;
            padding-bottom: 0 !important;
        }
        
        .btn-close-sidebar {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--text-muted);
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.15s ease;
        }
        .btn-close-sidebar:hover {
            background: #f1f5f9;
            color: #ef4444;
        }
        .btn-close-sidebar svg {
            width: 14px;
            height: 14px;
        }

        /* Sidebar Footer */
        .sidebar-footer {
            padding: 12px 20px;
            border-top: 1px solid var(--border-color);
            font-size: 9.5px;
            color: var(--text-muted);
            font-family: 'Inter', sans-serif;
            font-weight: 500;
            text-align: center;
            background: #ffffff;
            flex-shrink: 0;
            line-height: 1.4;
        }

        /* Sidebar Toggle Button in Header */
        .btn-toggle-sidebar {
            background: none;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text-secondary);
            transition: all 0.15s ease;
            flex-shrink: 0;
            margin-right: 8px;
        }
        .btn-toggle-sidebar:hover {
            background: #f1f5f9;
            color: var(--text-primary);
            border-color: #cbd5e1;
        }
        .btn-toggle-sidebar svg {
            width: 16px;
            height: 16px;
        }
        
        .sidebar-section h3 {
            font-size: 12px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 16px;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 6px;
        }
        
        .config-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        
        .config-row label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
            padding-right: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .input-number-wrapper {
            display: flex;
            align-items: center;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            background: #f8fafc;
            box-shadow: 0 1px 2px rgba(0,0,0,0.02);
            flex-shrink: 0;
        }
        
        .input-number-wrapper button {
            background: none;
            border: none;
            width: 30px;
            height: 30px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 700;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.1s ease;
        }
        
        .input-number-wrapper button:hover {
            background: #e2e8f0;
            color: var(--text-primary);
        }
        
        .input-number-wrapper input {
            width: 38px;
            border: none;
            border-left: 1px solid var(--border-color);
            border-right: 1px solid var(--border-color);
            text-align: center;
            font-size: 13px;
            font-weight: 700;
            background: #ffffff;
            outline: none;
            height: 30px;
        }

        /* Counsellor Analytics */
        .counsellor-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .counsellor-stat-item {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px 12px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.01);
            transition: border-color 0.15s ease;
        }
        .counsellor-stat-item:hover {
            border-color: #cbd5e1;
        }
        
        .counsellor-name {
            font-size: 13px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 6px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .counsellor-bands {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        
        .counsellor-pill {
            font-size: 9px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            color: #ffffff;
            text-transform: uppercase;
        }

        /* Middle Column: The Laddering Board */
        .board-container {
            flex-grow: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            background-color: #f1f5f9;
        }

        .band-section {
            background: #ffffff;
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 18px;
            display: flex;
            gap: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 4px 6px -2px rgba(0,0,0,0.01);
            min-height: 116px;
            position: relative;
        }
        
        .band-info {
            width: 200px;
            min-width: 200px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding-right: 12px;
            border-right: 1px solid #f1f5f9;
        }
        
        .band-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        
        .band-badge {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', sans-serif;
            font-weight: 700;
            font-size: 11px;
            color: #ffffff;
            flex-shrink: 0;
        }

        .band-header h2 {
            font-size: 15px;
            color: var(--text-primary);
            font-weight: 700;
        }
        .band-desc {
            font-size: 11px;
            color: var(--text-secondary);
            line-height: 1.35;
            margin-bottom: 8px;
        }
        .band-counter {
            font-size: 12px;
            font-weight: 700;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .band-counter-val {
            background: #f1f5f9;
            padding: 1px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            border: 1px solid #e2e8f0;
        }

        .band-slots {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-content: flex-start;
            flex-grow: 1;
        }
        
        .band-slots-unlimited {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-content: flex-start;
            flex-grow: 1;
            min-height: 80px;
        }

        /* Slots Placeholders */
        .slot-box {
            width: 228px;
            height: 74px;
            border: 2px dashed #cbd5e1;
            background-color: #f8fafc;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', sans-serif;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }
        .slot-box.drag-over {
            transform: scale(1.02);
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        .slot-rank-indicator {
            position: absolute;
            top: 5px;
            left: 8px;
            font-size: 10px;
            font-weight: 700;
            color: var(--text-muted);
            opacity: 0.7;
            text-transform: uppercase;
        }

        /* Plus Slot for Unlimited lists */
        .plus-slot {
            width: 228px;
            height: 74px;
            border: 2px dashed #cbd5e1;
            background-color: #f8fafc;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', sans-serif;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .plus-slot svg {
            width: 18px;
            height: 18px;
            margin-bottom: 3px;
            color: var(--text-muted);
        }
        .plus-slot:hover {
            border-color: #94a3b8;
            background-color: #f1f5f9;
            color: var(--text-secondary);
        }

        /* Candidate Note Element (Card) */
        .candidate-card {
            width: 228px;
            height: 74px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 10px 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: grab;
            user-select: none;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
            transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease, border-color 0.15s ease;
            position: relative;
        }
        
        .candidate-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px -4px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04);
            border-color: #cbd5e1;
        }
        
        .candidate-card:active {
            cursor: grabbing;
        }
        
        .candidate-card.dragging {
            opacity: 0.3;
            border: 2px dashed #94a3b8;
            background: #f1f5f9;
            box-shadow: none;
            transform: none;
        }

        /* Card highlight indicators when dragging onto another card */
        .candidate-card.drag-over {
            border-left: 4px solid #4f46e5;
            background-color: #f5f3ff;
            transform: scale(0.98);
        }

        /* Starred Card styling */
        .candidate-card.starred {
            border-color: #f59e0b;
            background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
            box-shadow: 0 2px 4px rgba(245, 158, 11, 0.05);
        }
        
        .candidate-card.promo-expected {
            border-color: #f59e0b;
            background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
            box-shadow: 0 2px 4px rgba(245, 158, 11, 0.05);
        }

        .candidate-card.promo-potential {
            border-color: #94a3b8;
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
            box-shadow: 0 2px 4px rgba(148, 163, 184, 0.05);
        }

        /* Vector initals avatar */
        .candidate-avatar {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            flex-shrink: 0;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
        }

        .candidate-details {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex-grow: 1;
            padding-right: 12px;
            margin-right: 16px;
        }
        
        .candidate-name {
            font-size: 13.5px;
            font-weight: 700;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .candidate-counsellor {
            font-size: 10.5px;
            color: var(--text-secondary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 1px;
        }

        /* Card Actions panel in Card */
        .card-star-btn {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: none;
            border: none;
            cursor: pointer;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: transform 0.1s ease;
        }
        .card-star-btn:hover {
            transform: scale(1.2);
        }
        .card-star-btn svg {
            width: 14px;
            height: 14px;
        }

        /* Card remove button */
        .card-unrank-btn {
            position: absolute;
            top: -6px;
            right: -6px;
            width: 18px;
            height: 18px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.1s ease, background 0.1s ease;
            color: var(--text-secondary);
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .candidate-card:hover .card-unrank-btn {
            opacity: 1;
        }
        
        .card-unrank-btn:hover {
            background: #fee2e2;
            color: #ef4444;
            border-color: #fca5a5;
        }
        
        .card-unrank-btn svg {
            width: 10px;
            height: 10px;
        }

        /* Right Column: Unranked Candidates pool */
        .sidebar-right {
            width: var(--unranked-width);
            flex-shrink: 0;
            background: #ffffff;
            border-left: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .sidebar-header-right {
            padding: 20px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            gap: 12px;
            flex-shrink: 0;
        }
        
        .sidebar-header-right h2 {
            font-size: 15px;
            color: #0f172a;
            font-weight: 700;
        }
        
        .search-box-wrapper {
            display: flex;
            align-items: center;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 8px 12px;
            gap: 8px;
            background: #f8fafc;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
            transition: border-color 0.15s ease, background-color 0.15s ease;
        }
        .search-box-wrapper:focus-within {
            border-color: #6366f1;
            background-color: #ffffff;
        }
        
        .search-box-wrapper input {
            border: none;
            background: none;
            outline: none;
            font-size: 13px;
            color: var(--text-primary);
            width: 100%;
        }
        
        .search-icon {
            width: 15px;
            height: 15px;
            color: var(--text-muted);
            flex-shrink: 0;
            box-shadow: none !important;
        }

        /* Discuss Next Section at top of right column */
        .discuss-next-container {
            background: linear-gradient(135deg, #e0e7ff 0%, #f5f3ff 100%);
            border: 1px solid #c7d2fe;
            border-radius: 12px;
            padding: 12px;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.04);
        }
        
        .discuss-next-title {
            font-size: 10px;
            font-weight: 800;
            color: #4f46e5;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .discuss-next-title span {
            width: 5px;
            height: 5px;
            background: #4f46e5;
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
        }
        
        .discuss-active-card {
            display: flex;
            align-items: center;
            gap: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        
        .discuss-active-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-top: 8px;
        }
        
        .discuss-btn {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px;
            font-size: 10px;
            font-weight: 700;
            cursor: pointer;
            font-family: 'Outfit', sans-serif;
            text-align: center;
            background: #ffffff;
            transition: all 0.15s ease;
        }
        .discuss-btn:hover {
            transform: translateY(-1px);
        }

        .discuss-skip-btn {
            grid-column: span 2;
            background: #f8fafc;
            border-color: #e2e8f0;
            color: var(--text-secondary);
        }
        .discuss-skip-btn:hover {
            background: #e2e8f0;
            color: var(--text-primary);
        }

        .unranked-list-scroll {
            flex-grow: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: #fafafa;
        }
        
        .unranked-list-scroll .candidate-card {
            width: 100%;
        }
        
        .unranked-list-scroll .candidate-card.active-discussion {
            border-color: #6366f1;
            background: #f5f3ff;
            box-shadow: 0 0 0 2.5px rgba(99, 102, 241, 0.15);
            animation: discuss-pulse 2s infinite alternate;
        }
        
        @keyframes discuss-pulse {
            from { border-color: #6366f1; }
            to { border-color: #a78bfa; }
        }

        .sidebar-right.drag-over {
            background-color: #f1f5f9;
            border-left: 2px dashed #6366f1;
        }

        /* Empty State messages styling */
        .empty-state {
            text-align: center;
            color: var(--text-muted);
            font-size: 12px;
            padding: 24px;
            border: 1px dashed var(--border-color);
            border-radius: 12px;
            background: #ffffff;
            font-weight: 500;
        }
    </style>
</head>
<body>

    <div class="app-container">
        <!-- Header -->
        <header class="app-header">
            <div class="header-left">
                <button class="btn-toggle-sidebar" onclick="toggleSidebar()" title="Toggle Configurations">
                    <!-- Inline Sidebar layout toggle SVG -->
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                </button>
                <!-- Inline steps/ladder logo SVG -->
                <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="6" y1="3" x2="6" y2="21"></line>
                    <line x1="18" y1="3" x2="18" y2="21"></line>
                    <line x1="6" y1="7" x2="18" y2="7"></line>
                    <line x1="6" y1="12" x2="18" y2="12"></line>
                    <line x1="6" y1="17" x2="18" y2="17"></line>
                </svg>
                <h1 id="app-title">LADDERATER</h1>
                <span class="status-badge" id="app-status-badge"><span class="pulse-dot"></span>Appraisal Panel Active</span>
            </div>
            
            <!-- View Switcher (Only if enabled in config) -->
            <div class="view-switcher" id="view-switcher" style="display: none;">
                <button class="switcher-btn active" id="btn-view-performance" onclick="switchView('performance')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                    Performance Board
                </button>
                <button class="switcher-btn" id="btn-view-promotion" onclick="switchView('promotion')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    Promotion Board
                </button>
            </div>
            
            <div class="header-stats" id="header-stats">
                <!-- Updated dynamically -->
            </div>
            
            <div class="header-right" style="display: flex; gap: 8px;">
                <button class="btn btn-export" id="btn-export-list" onclick="exportToClipboard()" title="Copy ordered list to clipboard">
                    <!-- Inline Clipboard SVG -->
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Export List
                </button>
                <button class="btn btn-reset" onclick="resetBoard()" title="Reset all calibrations">
                    <!-- Inline Reset SVG -->
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                    </svg>
                    Reset Board
                </button>
            </div>
        </header>
        
        <!-- Main Layout Split -->
        <div class="app-body">
            
            <!-- Left Sidebar: Configurations and stats -->
            <aside class="sidebar-left" id="sidebar-left">
                <div class="sidebar-left-scroll">
                    <!-- Skeletons rendered dynamically -->
                </div>
                <footer class="sidebar-footer">
                    Ladderater &copy; 2026 Charles Dickinson.<br>Licensed under the MIT License.
                </footer>
            </aside>
            
            <!-- Center Board: Calibration Grid -->
            <main class="board-container" id="board-container">
                <!-- Dynamic bands rendered here -->
            </main>
            
            <!-- Right Sidebar: Unranked Candidates pool -->
            <aside class="sidebar-right" 
                   ondragover="handleDragOver(event)" 
                   ondragenter="handleDragEnter(event, this)" 
                   ondragleave="handleDragLeave(event, this)" 
                   ondrop="handleDropUnranked(event)">
                <!-- Skeleton rendered dynamically -->
            </aside>
            
        </div>
    </div>

    <script>
        // Data injected by compile script
        const INITIAL_CANDIDATES = {{CANDIDATES_JSON}};
        const CONFIG = {{CONFIG_JSON}};
        
        let allCandidates = [];
        let state = {};
        let draggedCandidateId = null;
        let currentView = 'performance';

        // Initialize App
        window.addEventListener('DOMContentLoaded', () => {
            init();
        });

        function init() {
            // Generate dynamic CSS variables and classes for each band
            const styleEl = document.createElement('style');
            let css = ':root {\n';
            CONFIG.bands.forEach(b => {
                css += `  --color-${b.id}: ${b.color};\n`;
                css += `  --color-${b.id}-light: ${b.colorLight};\n`;
                css += `  --color-${b.id}-border: ${b.colorBorder};\n`;
            });
            css += '}\n';
            
            CONFIG.bands.forEach(b => {
                css += `
                .band-${b.id} .slot-box.drag-over,
                .band-${b.id} .plus-slot.drag-over {
                    border-color: var(--color-${b.id}) !important;
                    background-color: var(--color-${b.id}-light) !important;
                    color: var(--color-${b.id}) !important;
                }
                .badge-${b.id} {
                    background: var(--color-${b.id}) !important;
                }
                .pill-${b.id} {
                    background-color: var(--color-${b.id}) !important;
                    color: #ffffff !important;
                }
                .btn-promote-${b.id} {
                    border-color: var(--color-${b.id}-border) !important;
                    color: var(--color-${b.id}) !important;
                    background-color: var(--color-${b.id}-light) !important;
                }
                .btn-promote-${b.id}:hover {
                    background-color: var(--color-${b.id}-border) !important;
                    color: #ffffff !important;
                }
                `;
            });
            styleEl.innerHTML = css;
            document.head.appendChild(styleEl);

            // Set titles and metadata
            document.getElementById('app-title').innerText = CONFIG.title || 'LADDERATER';
            const statusBadge = document.getElementById('app-status-badge');
            statusBadge.innerHTML = `<span class="pulse-dot"></span>${CONFIG.subtitle || 'Appraisal Panel Active'}`;
            document.title = `${CONFIG.title || 'Ladderater'} - Calibration Panel`;

            // Enable view switcher if promotions are enabled
            if (CONFIG.enablePromotions) {
                document.getElementById('view-switcher').style.display = 'flex';
            }

            allCandidates = INITIAL_CANDIDATES.map((c, index) => ({
                id: `cand-${index}`,
                name: c.Name,
                counsellor: c.Counsellor
            }));
            
            state = loadState(allCandidates);
            
            // Render skeletons
            renderLeftSidebarSkeleton();
            renderBoardSkeleton();
            renderRightSidebarSkeleton();
            
            // Restore sidebar collapsed state
            if (localStorage.getItem('ladderater_sidebar_collapsed') === 'true') {
                document.getElementById('sidebar-left').classList.add('collapsed');
            }
            
            renderApp();
        }

        // State Caching Hash incorporating candidates and band configurations
        function getCandidatesHash(candidates, config) {
            let candStr = candidates.map(c => c.name + '|' + c.counsellor).sort().join(';');
            let configStr = config.bands.map(b => `${b.id}:${b.hasLimit}:${b.defaultCapacity}`).join(';');
            let promoStr = `${config.enablePromotions || false}:${config.defaultExpectedSpaces || 3}:${config.maxExpectedSpaces || 10}`;
            let str = candStr + '||' + configStr + '||' + promoStr;
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = (hash << 5) - hash + str.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString();
        }

        function loadState(initialList) {
            const currentHash = getCandidatesHash(initialList, CONFIG);
            const saved = localStorage.getItem('ladderater_state');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.hash === currentHash) {
                        // Ensure all structures are backwards-compatible
                        if (!parsed.state.starredCandidateIds) parsed.state.starredCandidateIds = [];
                        if (!parsed.state.promotionLadderExpected) parsed.state.promotionLadderExpected = [];
                        if (!parsed.state.promotionLadderPotential) parsed.state.promotionLadderPotential = [];
                        if (parsed.state.promotionCapacityExpected === undefined) parsed.state.promotionCapacityExpected = (CONFIG.defaultExpectedSpaces !== undefined ? CONFIG.defaultExpectedSpaces : 3);
                        return parsed.state;
                    }
                } catch (e) {
                    console.error("Failed to restore cached calibration state", e);
                }
            }
            
            // Default initial state
            const sortedList = [...initialList].sort((a, b) => a.name.localeCompare(b.name));
            const bandsState = {};
            const capacities = {};
            CONFIG.bands.forEach(b => {
                bandsState[b.id] = [];
                if (b.hasLimit) {
                    capacities[b.id] = b.defaultCapacity;
                }
            });

            return {
                unranked: sortedList,
                bands: bandsState,
                capacities: capacities,
                discussingCandidateId: sortedList.length > 0 ? sortedList[0].id : null,
                starredCandidateIds: [],
                promotionLadderExpected: [],
                promotionLadderPotential: [],
                promotionCapacityExpected: (CONFIG.defaultExpectedSpaces !== undefined ? CONFIG.defaultExpectedSpaces : 3)
            };
        }

        function saveState() {
            const payload = {
                hash: getCandidatesHash(allCandidates, CONFIG),
                state: state
            };
            localStorage.setItem('ladderater_state', JSON.stringify(payload));
        }

        // SVG Avatar Generator
        function getAvatarSvg(name, id) {
            const gradients = [
                ['#4f46e5', '#818cf8'], // Indigo
                ['#0891b2', '#22d3ee'], // Cyan
                ['#0d9488', '#2dd4bf'], // Teal
                ['#db2777', '#f472b6'], // Pink
                ['#7c3aed', '#a78bfa'], // Purple
                ['#ea580c', '#fb923c'], // Orange
                ['#e11d48', '#fb7185'], // Rose
                ['#2563eb', '#60a5fa'], // Blue
            ];
            
            let hash = 0;
            for (let i = 0; i < name.length; i++) {
                hash = name.charCodeAt(i) + ((hash << 5) - hash);
            }
            const index = Math.abs(hash) % gradients.length;
            const grad = gradients[index];
            
            const initials = name.split(' ')
                                 .map(n => n[0])
                                 .filter(c => c)
                                 .join('')
                                 .slice(0, 2)
                                 .toUpperCase();
            
            return `
                <svg viewBox="0 0 40 40" class="candidate-avatar">
                    <defs>
                        <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="${grad[0]}" />
                            <stop offset="100%" stop-color="${grad[1]}" />
                        </linearGradient>
                    </defs>
                    <circle cx="20" cy="20" r="20" fill="url(#grad-${id})" />
                    <text x="50%" y="54%" font-size="13" font-family="'Outfit', 'Inter', sans-serif" font-weight="700" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initials}</text>
                </svg>
            `;
        }

        // View Switching
        function switchView(viewName) {
            if (!CONFIG.enablePromotions) return;
            currentView = viewName;
            
            document.getElementById('btn-view-performance').classList.toggle('active', viewName === 'performance');
            document.getElementById('btn-view-promotion').classList.toggle('active', viewName === 'promotion');
            
            renderLeftSidebarSkeleton();
            renderBoardSkeleton();
            renderRightSidebarSkeleton();
            
            renderApp();
        }

        // Drag & Drop Handlers
        function handleDragStart(e, candidateId) {
            draggedCandidateId = candidateId;
            e.dataTransfer.setData('text/plain', candidateId);
            e.dataTransfer.effectAllowed = 'move';
            
            setTimeout(() => {
                const el = document.getElementById(candidateId);
                if (el) el.classList.add('dragging');
            }, 0);
        }

        function handleDragEnd(e, candidateId) {
            const el = document.getElementById(candidateId);
            if (el) el.classList.remove('dragging');
            draggedCandidateId = null;
            
            // Clean up highlights
            document.querySelectorAll('.slot-box, .plus-slot, .sidebar-right, .candidate-card').forEach(box => {
                box.classList.remove('drag-over');
            });
        }

        function handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }

        function handleDragEnter(e, targetEl) {
            e.preventDefault();
            targetEl.classList.add('drag-over');
        }

        function handleDragLeave(e, targetEl) {
            targetEl.classList.remove('drag-over');
        }

        function handleDrop(e, targetBandId, targetIndex) {
            e.preventDefault();
            const candidateId = e.dataTransfer.getData('text/plain') || draggedCandidateId;
            if (!candidateId) return;
            
            moveCandidate(candidateId, targetBandId, targetIndex);
        }

        function handleDropUnranked(e) {
            e.preventDefault();
            const candidateId = e.dataTransfer.getData('text/plain') || draggedCandidateId;
            if (!candidateId) return;
            
            if (currentView === 'promotion') {
                unrankCandidatePromotion(candidateId);
            } else {
                unrankCandidate(candidateId);
            }
        }

        // Core Calibration Operations
        function moveCandidate(candidateId, targetBandId, targetIndex) {
            if (targetBandId === 'promotion-expected' || targetBandId === 'promotion-potential') {
                moveCandidatePromotion(candidateId, targetBandId, targetIndex);
                return;
            }
            
            if (!targetBandId) {
                unrankCandidate(candidateId);
                return;
            }
            let candidate = null;
            
            // Find and extract candidate from unranked
            const unrankedIdx = state.unranked.findIndex(c => c.id === candidateId);
            if (unrankedIdx !== -1) {
                candidate = state.unranked.splice(unrankedIdx, 1)[0];
            } else {
                // Find and extract candidate from existing bands
                for (const bandId in state.bands) {
                    const idx = state.bands[bandId].findIndex(c => c.id === candidateId);
                    if (idx !== -1) {
                        candidate = state.bands[bandId].splice(idx, 1)[0];
                        break;
                    }
                }
            }
            
            if (!candidate) return;
            
            // Insert candidate in new target
            const band = state.bands[targetBandId];
            let actualIndex = targetIndex;
            if (actualIndex > band.length || actualIndex === -1) {
                actualIndex = band.length;
            }
            
            band.splice(actualIndex, 0, candidate);
            
            // Apply overflow cascades
            cascadeOverflow();
            
            // Advance sequential discussion pointer if the candidate under discussion was the one moved
            if (state.discussingCandidateId === candidateId) {
                autoAdvanceDiscussion();
            }
            
            saveState();
            renderApp();
        }

        function unrankCandidate(candidateId) {
            let candidate = null;
            
            // Find and extract candidate from bands
            for (const bandId in state.bands) {
                const idx = state.bands[bandId].findIndex(c => c.id === candidateId);
                if (idx !== -1) {
                    candidate = state.bands[bandId].splice(idx, 1)[0];
                    break;
                }
            }
            
            if (!candidate) return;
            
            // Place back in unranked pool (maintain alphabetic order)
            state.unranked.push(candidate);
            state.unranked.sort((a, b) => a.name.localeCompare(b.name));
            
            // Reset focus to this unranked candidate to discuss them again
            state.discussingCandidateId = candidate.id;
            
            saveState();
            renderApp();
        }

        // Cascades sequentially top-down until it hits an unlimited band
        function cascadeOverflow() {
            for (let i = 0; i < CONFIG.bands.length - 1; i++) {
                const currentBand = CONFIG.bands[i];
                const nextBand = CONFIG.bands[i + 1];
                if (currentBand.hasLimit) {
                    const currentCap = state.capacities[currentBand.id];
                    while (state.bands[currentBand.id].length > currentCap) {
                        const popped = state.bands[currentBand.id].pop();
                        state.bands[nextBand.id].unshift(popped);
                    }
                }
            }
        }

        function changeSlots(bandId, delta) {
            const bandConfig = CONFIG.bands.find(b => b.id === bandId);
            const maxCap = (bandConfig && bandConfig.maxCapacity) ? bandConfig.maxCapacity : 20;
            const newVal = state.capacities[bandId] + delta;
            if (newVal < 1 || newVal > maxCap) return;
            
            state.capacities[bandId] = newVal;
            document.getElementById(`input-${bandId}-slots`).value = newVal;
            
            cascadeOverflow();
            saveState();
            renderApp();
        }

        function resetBoard() {
            if (!confirm("Are you sure you want to reset all rankings? This will return all candidates to their default starting states.")) return;
            
            const all = [];
            state.unranked.forEach(c => all.push(c));
            for (const bandId in state.bands) {
                state.bands[bandId].forEach(c => all.push(c));
                state.bands[bandId] = [];
            }
            
            // Re-sort alphabetically
            state.unranked = all.sort((a, b) => a.name.localeCompare(b.name));
            state.discussingCandidateId = state.unranked.length > 0 ? state.unranked[0].id : null;
            
            // Reset promotion structures
            state.starredCandidateIds = [];
            state.promotionLadderExpected = [];
            state.promotionLadderPotential = [];
            
            saveState();
            renderApp();
        }

        function setDiscussingCandidate(candidateId) {
            state.discussingCandidateId = candidateId;
            saveState();
            renderApp();
        }

        function skipDiscussingCandidate() {
            if (state.unranked.length <= 1) return;
            
            const currentIdx = state.unranked.findIndex(c => c.id === state.discussingCandidateId);
            let nextIdx = currentIdx + 1;
            if (nextIdx >= state.unranked.length) {
                nextIdx = 0;
            }
            state.discussingCandidateId = state.unranked[nextIdx].id;
            saveState();
            renderApp();
        }
        
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar-left');
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('ladderater_sidebar_collapsed', sidebar.classList.contains('collapsed'));
        }
        
        function autoAdvanceDiscussion() {
            if (state.unranked.length > 0) {
                state.discussingCandidateId = state.unranked[0].id;
            } else {
                state.discussingCandidateId = null;
            }
        }

        function promoteDiscussing(targetBandId) {
            if (!state.discussingCandidateId) return;
            moveCandidate(state.discussingCandidateId, targetBandId, 0); // Insert at position 1 (index 0) of that band
        }

        function handleSearch() {
            if (currentView === 'performance') {
                renderUnrankedList();
            } else {
                renderCandidatePool();
            }
        }

        // Dynamic Layout Skeletal Renderers
        function renderLeftSidebarSkeleton() {
            const scrollContainer = document.querySelector('.sidebar-left-scroll');
            
            if (currentView === 'performance') {
                scrollContainer.innerHTML = `
                    <div class="sidebar-section">
                        <div class="sidebar-section-header">
                            <h3>Band Allocations</h3>
                            <button class="btn-close-sidebar" onclick="toggleSidebar()" title="Hide panel">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
                            </button>
                        </div>
                        <div id="band-allocations-container"></div>
                    </div>
                    
                    <div class="sidebar-section">
                        <h3>Counsellor Breakdown</h3>
                        <div class="counsellor-list" id="counsellor-breakdown"></div>
                    </div>
                `;
                renderBandAllocationsConfig();
            } else {
                scrollContainer.innerHTML = `
                    <div class="sidebar-section">
                        <div class="sidebar-section-header">
                            <h3>Promotion Config</h3>
                            <button class="btn-close-sidebar" onclick="toggleSidebar()" title="Hide panel">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
                            </button>
                        </div>
                        <div class="config-row">
                            <label for="input-promotion-expected-slots">Expected Spaces:</label>
                            <div class="input-number-wrapper">
                                <button onclick="changePromotionCapacity('expected', -1)">-</button>
                                <input type="number" id="input-promotion-expected-slots" min="0" max="${CONFIG.maxExpectedSpaces || 10}" value="${state.promotionCapacityExpected}" readonly>
                                <button onclick="changePromotionCapacity('expected', 1)">+</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="sidebar-section">
                        <h3>Counsellor Promo Stats</h3>
                        <div class="counsellor-list" id="counsellor-breakdown"></div>
                    </div>
                `;
            }
        }

        function renderBandAllocationsConfig() {
            const container = document.getElementById('band-allocations-container');
            let html = '';
            CONFIG.bands.forEach(b => {
                if (b.hasLimit) {
                    html += `
                        <div class="config-row">
                            <label for="input-${b.id}-slots" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}:</label>
                            <div class="input-number-wrapper">
                                <button onclick="changeSlots('${b.id}', -1)">-</button>
                                <input type="number" id="input-${b.id}-slots" min="1" max="${b.maxCapacity || 20}" value="${state.capacities[b.id]}" readonly>
                                <button onclick="changeSlots('${b.id}', 1)">+</button>
                            </div>
                        </div>
                    `;
                }
            });
            container.innerHTML = html;
        }

        function renderBoardSkeleton() {
            const container = document.getElementById('board-container');
            let html = '';
            
            if (currentView === 'performance') {
                CONFIG.bands.forEach((b, idx) => {
                    const badgeNum = idx + 1;
                    const counterId = `count-${b.id}`;
                    const slotsId = `slots-${b.id}`;
                    
                    html += `
                        <section class="band-section band-${b.id}" data-band-id="${b.id}">
                            <div class="band-info">
                                <div>
                                    <div class="band-header">
                                        <span class="band-badge badge-${b.id}">${badgeNum}</span>
                                        <h2>${escapeHtml(b.name)}</h2>
                                    </div>
                                    <p class="band-desc">${escapeHtml(b.description)}</p>
                                </div>
                                <div class="band-counter">
                                    ${b.hasLimit ? 'Slots' : 'Ranked'}: <span class="band-counter-val" id="${counterId}">0</span>
                                </div>
                            </div>
                            <div class="${b.hasLimit ? 'band-slots' : 'band-slots-unlimited'}" id="${slotsId}">
                                <!-- Slots injected dynamically -->
                            </div>
                        </section>
                    `;
                });
            } else {
                const showExpected = (state.promotionCapacityExpected > 0);
                if (showExpected) {
                    html += `
                        <section class="band-section band-promotion-expected" data-band-id="promotion-expected" style="border-color: #f59e0b; background-color: #fffbeb;">
                            <div class="band-info" style="border-right-color: #fef08a;">
                                <div>
                                    <div class="band-header">
                                        <span class="band-badge badge-promotion-expected" style="background: #eab308; color: #ffffff;">&#9733;</span>
                                        <h2>Expected Promotions</h2>
                                    </div>
                                    <p class="band-desc">Highest priority candidates recommended for promotion. Set space to 0 to disable this row and manage all promotions in the uncapped row below.</p>
                                </div>
                                <div class="band-counter">
                                    Allocated: <span class="band-counter-val" id="count-promotion-expected" style="background: #fef08a; border-color: #f59e0b;">0 / 3</span>
                                </div>
                            </div>
                            <div class="band-slots" id="slots-promotion-expected">
                                <!-- Slots injected dynamically -->
                            </div>
                        </section>
                    `;
                }

                const potStyle = showExpected 
                    ? 'border-color: #94a3b8; background-color: #f8fafc;' 
                    : 'border-color: #f59e0b; background-color: #fffbeb;';
                const potBadgeStyle = showExpected 
                    ? 'background: #94a3b8; color: #ffffff;' 
                    : 'background: #eab308; color: #ffffff;';
                const potBadgeIcon = showExpected ? '&#9734;' : '&#9733;';
                const potBorderRightColor = showExpected ? '#e2e8f0' : '#fef08a';
                const potCounterBackground = showExpected ? '#e2e8f0; border-color: #94a3b8;' : '#fef08a; border-color: #f59e0b;';
                
                const potDesc = showExpected 
                    ? 'Candidates recommended for potential promotion space (uncapped). Excess candidates cascade here if Expected slots are full.' 
                    : 'Candidates recommended for potential promotion space (uncapped). Expected promotions row is currently disabled.';

                html += `
                    <section class="band-section band-promotion-potential" data-band-id="promotion-potential" style="${potStyle}">
                        <div class="band-info" style="border-right-color: ${potBorderRightColor};">
                            <div>
                                <div class="band-header">
                                    <span class="band-badge badge-promotion-potential" style="${potBadgeStyle}">${potBadgeIcon}</span>
                                    <h2>Potential Promotions</h2>
                                </div>
                                <p class="band-desc">${potDesc}</p>
                            </div>
                            <div class="band-counter">
                                Allocated: <span class="band-counter-val" id="count-promotion-potential" style="background: ${potCounterBackground}">0</span>
                            </div>
                        </div>
                        <div class="band-slots-unlimited" id="slots-promotion-potential">
                            <!-- Slots injected dynamically -->
                        </div>
                    </section>
                `;
            }
            
            container.innerHTML = html;
        }

        function renderRightSidebarSkeleton() {
            const sidebar = document.querySelector('.sidebar-right');
            
            if (currentView === 'performance') {
                sidebar.innerHTML = `
                    <div class="sidebar-header-right">
                        <h2>Unranked Candidates</h2>
                        <div class="discuss-next-container" id="discuss-next-container"></div>
                        <div class="search-box-wrapper">
                            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input type="text" id="search-input" placeholder="Search candidates or counsellors..." oninput="handleSearch()">
                        </div>
                    </div>
                    <div class="unranked-list-scroll" id="unranked-list"></div>
                `;
            } else {
                const showAutoFill = (state.promotionCapacityExpected > 0);
                const gridCols = showAutoFill ? '1fr 1fr' : '1fr';
                const autoFillBtn = showAutoFill ? `<button class="discuss-btn" onclick="autoFillPromotion()" title="Auto-fill empty Expected slots with top-performing candidates" style="border-color: #ca8a04; color: #ca8a04; background: #ffffff;">Auto-Fill</button>` : '';
                
                sidebar.innerHTML = `
                    <div class="sidebar-header-right">
                        <h2>Candidate Pool</h2>
                        
                        <!-- Quick Promo Actions -->
                        <div class="discuss-next-container" style="background: linear-gradient(135deg, #fef08a 0%, #fffbeb 100%); border-color: #fef08a; box-shadow: none;">
                            <div class="discuss-next-title" style="color: #ca8a04;">
                                <span></span>Promotion Actions
                            </div>
                            <div class="discuss-active-actions" style="grid-template-columns: ${gridCols};">
                                ${autoFillBtn}
                                <button class="discuss-btn" onclick="clearPromotionLadder()" title="Remove all candidates from promotion" style="border-color: #ef4444; color: #ef4444; background: #ffffff; ${!showAutoFill ? 'grid-column: span 1;' : ''}">Clear Ladder</button>
                            </div>
                        </div>
                        
                        <div class="search-box-wrapper">
                            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input type="text" id="search-input" placeholder="Search available candidates..." oninput="handleSearch()">
                        </div>
                    </div>
                    <div class="unranked-list-scroll" id="unranked-list"></div>
                `;
            }
        }

        // Render Functions
        function renderApp() {
            if (currentView === 'performance') {
                CONFIG.bands.forEach(b => {
                    if (b.hasLimit) {
                        renderLimitedBand(b.id);
                    } else {
                        renderUnlimitedBand(b.id);
                    }
                });
                renderUnrankedList();
                renderDiscussNext();
            } else {
                renderPromotionLadder();
                renderCandidatePool();
            }
            renderCounsellorBreakdown();
            renderHeaderStats();
        }

        function renderCard(candidate, bandId, index) {
            const avatar = getAvatarSvg(candidate.name, candidate.id);
            const isStarred = state.starredCandidateIds.includes(candidate.id);
            let starredClass = isStarred ? 'starred' : '';
            if (isStarred && bandId === 'promotion-expected') {
                starredClass = 'starred promo-expected';
            } else if (isStarred && bandId === 'promotion-potential') {
                starredClass = (state.promotionCapacityExpected === 0) ? 'starred promo-expected' : 'starred promo-potential';
            }
            
            // Build star button (only if enabled)
            let starBtn = '';
            if (CONFIG.enablePromotions) {
                const starSvg = isStarred ? `
                    <svg viewBox="0 0 24 24" fill="#eab308" stroke="#d97706" stroke-width="2" class="star-icon">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                ` : `
                    <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" class="star-icon">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                `;
                starBtn = `
                    <button class="card-star-btn ${isStarred ? 'starred' : ''}" onclick="event.stopPropagation(); toggleStar('${candidate.id}', event)" title="${isStarred ? 'Remove from promotion consideration' : 'Consider for promotion'}">
                        ${starSvg}
                    </button>
                `;
            }

            const isPromotionView = (currentView === 'promotion');
            const showUnrank = isPromotionView ? (bandId === 'promotion-expected' || bandId === 'promotion-potential') : !!bandId;
            const clickUnrank = isPromotionView ? `unrankCandidatePromotion('${candidate.id}')` : `unrankCandidate('${candidate.id}')`;
            
            const unrankBtn = !showUnrank ? '' : `
                <button class="card-unrank-btn" onclick="event.stopPropagation(); ${clickUnrank}" title="Remove from ladder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            
            const isActiveDiscuss = (!isPromotionView && !bandId && state.discussingCandidateId === candidate.id) ? 'active-discussion' : '';
            const clickAction = (!isPromotionView && !bandId) ? `onclick="setDiscussingCandidate('${candidate.id}')"` : '';
            const dropTargetBand = isPromotionView ? (bandId || '') : (bandId || '');
            
            return `
                <div class="candidate-card ${starredClass} ${isActiveDiscuss}" 
                     id="${candidate.id}" 
                     draggable="true" 
                     ondragstart="handleDragStart(event, '${candidate.id}')" 
                     ondragend="handleDragEnd(event, '${candidate.id}')"
                     ondragover="handleDragOver(event)"
                     ondragenter="handleDragEnter(event, this)"
                     ondragleave="handleDragLeave(event, this)"
                     ondrop="handleDrop(event, '${dropTargetBand}', ${index})"
                     ${clickAction}>
                    ${avatar}
                    <div class="candidate-details">
                        <div class="candidate-name" title="${escapeHtml(candidate.name)}">${escapeHtml(candidate.name)}</div>
                        <div class="candidate-counsellor" title="Counsellor: ${escapeHtml(candidate.counsellor)}">
                            Counsellor: ${escapeHtml(candidate.counsellor)}
                        </div>
                    </div>
                    ${starBtn}
                    ${unrankBtn}
                </div>
            `;
        }

        function renderLimitedBand(bandId) {
            const band = state.bands[bandId];
            const capacity = state.capacities[bandId];
            const container = document.getElementById(`slots-${bandId}`);
            let html = '';
            
            for (let i = 0; i < capacity; i++) {
                if (i < band.length) {
                    html += renderCard(band[i], bandId, i);
                } else {
                    html += `
                        <div class="slot-box" 
                             ondragover="handleDragOver(event)" 
                             ondragenter="handleDragEnter(event, this)"
                             ondragleave="handleDragLeave(event, this)"
                             ondrop="handleDrop(event, '${bandId}', ${i})">
                            <span class="slot-rank-indicator">#${i + 1}</span>
                            Drop to Rank
                        </div>
                    `;
                }
            }
            container.innerHTML = html;
            
            // Render counters
            document.getElementById(`count-${bandId}`).innerText = `${band.length} / ${capacity}`;
        }

        function renderUnlimitedBand(bandId) {
            const band = state.bands[bandId];
            const container = document.getElementById(`slots-${bandId}`);
            let html = '';
            
            band.forEach((candidate, idx) => {
                html += renderCard(candidate, bandId, idx);
            });
            
            // Append trailing "Add to end" slot dropzone
            html += `
                <div class="plus-slot" 
                     ondragover="handleDragOver(event)" 
                     ondragenter="handleDragEnter(event, this)"
                     ondragleave="handleDragLeave(event, this)"
                     ondrop="handleDrop(event, '${bandId}', ${band.length})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Drop to Add (#${band.length + 1})
                </div>
            `;
            
            container.innerHTML = html;
            document.getElementById(`count-${bandId}`).innerText = `${band.length}`;
        }

        function renderUnrankedList() {
            const container = document.getElementById('unranked-list');
            const searchVal = document.getElementById('search-input').value.toLowerCase();
            
            const filtered = state.unranked.filter(c => 
                c.name.toLowerCase().includes(searchVal) || 
                c.counsellor.toLowerCase().includes(searchVal)
            );
            
            if (filtered.length === 0) {
                if (state.unranked.length === 0) {
                    container.innerHTML = `<div class="empty-state">All candidates have been ranked! \u{1F389}</div>`;
                } else {
                    container.innerHTML = `<div class="empty-state">No candidates match search criteria</div>`;
                }
                return;
            }
            
            let html = '';
            filtered.forEach(candidate => {
                html += renderCard(candidate, null, -1);
            });
            container.innerHTML = html;
        }

        function renderDiscussNext() {
            const container = document.getElementById('discuss-next-container');
            
            let currentCandidate = state.unranked.find(c => c.id === state.discussingCandidateId);
            if (!currentCandidate && state.unranked.length > 0) {
                currentCandidate = state.unranked[0];
                state.discussingCandidateId = currentCandidate.id;
            }
            
            if (!currentCandidate) {
                container.innerHTML = `
                    <div class="discuss-next-title">
                        <span></span>Discussion Complete
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 12px 0; font-weight: 500;">
                        All candidates are successfully calibrated on the ladder board!
                    </div>
                `;
                return;
            }
            
            const avatar = getAvatarSvg(currentCandidate.name, 'discuss-' + currentCandidate.id);
            
            let actionButtonsHtml = '';
            CONFIG.bands.forEach(b => {
                const titleText = b.hasLimit ? `Rank 1st in ${b.name}` : `Add to ${b.name}`;
                actionButtonsHtml += `
                    <button class="discuss-btn btn-promote-${b.id}" onclick="promoteDiscussing('${b.id}')" title="${escapeHtml(titleText)}">
                        ${escapeHtml(b.shortName || b.name)}
                    </button>
                `;
            });
            actionButtonsHtml += `<button class="discuss-btn discuss-skip-btn" onclick="skipDiscussingCandidate()">Skip / Discuss Next</button>`;

            container.innerHTML = `
                <div class="discuss-next-title">
                    <span></span>Under Discussion
                </div>
                <div class="discuss-active-card">
                    ${avatar}
                    <div class="candidate-details">
                        <div class="candidate-name" style="font-size: 14px;">${escapeHtml(currentCandidate.name)}</div>
                        <div class="candidate-counsellor" style="font-size: 11px;">Counsellor: ${escapeHtml(currentCandidate.counsellor)}</div>
                    </div>
                </div>
                <div class="discuss-active-actions">
                    ${actionButtonsHtml}
                </div>
            `;
            
            // Also ensure active-discussion highlight is synced in the scrollable list
            document.querySelectorAll('.unranked-list-scroll .candidate-card').forEach(card => {
                if (card.id === currentCandidate.id) {
                    card.classList.add('active-discussion');
                } else {
                    card.classList.remove('active-discussion');
                }
            });
        }

        // Star toggling and pool sync
        function toggleStar(candidateId, event) {
            if (event) event.stopPropagation();
            
            const index = state.starredCandidateIds.indexOf(candidateId);
            const candidate = allCandidates.find(c => c.id === candidateId);
            if (!candidate) return;
            
            const expectedCap = state.promotionCapacityExpected;

            if (index !== -1) {
                // Unstar (remove star)
                state.starredCandidateIds.splice(index, 1);
                
                // Remove from promotionLadderExpected if present
                const expIdx = state.promotionLadderExpected.findIndex(c => c.id === candidateId);
                if (expIdx !== -1) {
                    state.promotionLadderExpected.splice(expIdx, 1);
                } else {
                    // Remove from promotionLadderPotential if present
                    const potIdx = state.promotionLadderPotential.findIndex(c => c.id === candidateId);
                    if (potIdx !== -1) {
                        state.promotionLadderPotential.splice(potIdx, 1);
                    }
                }
                // Cascade to fill the Expected gaps from Potential
                cascadeOverflowPromotion();
            } else {
                // Star
                state.starredCandidateIds.push(candidateId);
                
                const newGrade = getPerformanceGrade(candidate);
                
                // Insert into Expected?
                if (state.promotionLadderExpected.length < expectedCap) {
                    let insertIdx = state.promotionLadderExpected.findIndex(c => newGrade < getPerformanceGrade(c));
                    if (insertIdx === -1) insertIdx = state.promotionLadderExpected.length;
                    state.promotionLadderExpected.splice(insertIdx, 0, candidate);
                } else {
                    // Expected is full (or capacity is 0), so it goes straight to Potential (uncapped)
                    let insertIdx = state.promotionLadderPotential.findIndex(c => newGrade < getPerformanceGrade(c));
                    if (insertIdx === -1) insertIdx = state.promotionLadderPotential.length;
                    state.promotionLadderPotential.splice(insertIdx, 0, candidate);
                }
                
                // Cascade in case Expected overflow is needed
                cascadeOverflowPromotion();
            }
            
            saveState();
            renderApp();
        }

        // Promotion view renderers
        function renderPromotionLadder() {
            // Render Expected (if capacity > 0)
            const expCapacity = state.promotionCapacityExpected;
            const expContainer = document.getElementById('slots-promotion-expected');
            const showExpected = (expCapacity > 0);
            
            if (expContainer) {
                if (showExpected) {
                    let html = '';
                    for (let i = 0; i < expCapacity; i++) {
                        if (i < state.promotionLadderExpected.length) {
                            html += renderCard(state.promotionLadderExpected[i], 'promotion-expected', i);
                        } else {
                            html += `
                                <div class="slot-box" 
                                     style="border-color: #fcd34d; background-color: #fffbeb;"
                                     ondragover="handleDragOver(event)" 
                                     ondragenter="handleDragEnter(event, this)"
                                     ondragleave="handleDragLeave(event, this)"
                                     ondrop="handleDrop(event, 'promotion-expected', ${i})">
                                    <span class="slot-rank-indicator" style="color: #ca8a04;">#${i + 1}</span>
                                    Drop to Rank
                                </div>
                            `;
                        }
                    }
                    expContainer.innerHTML = html;
                    document.getElementById('count-promotion-expected').innerText = `${state.promotionLadderExpected.length} / ${expCapacity}`;
                } else {
                    expContainer.innerHTML = '';
                }
            }

            // Render Potential (uncapped list style)
            const potContainer = document.getElementById('slots-promotion-potential');
            if (potContainer) {
                let html = '';
                state.promotionLadderPotential.forEach((candidate, idx) => {
                    html += renderCard(candidate, 'promotion-potential', idx);
                });
                
                const boxBorderColor = showExpected ? '#cbd5e1' : '#fcd34d';
                const boxBgColor = showExpected ? '#f8fafc' : '#fffbeb';
                const textCol = showExpected ? '#64748b' : '#ca8a04';
                
                // Append trailing plus-slot dropzone
                html += `
                    <div class="plus-slot" 
                         style="border-color: ${boxBorderColor}; background-color: ${boxBgColor}; color: ${textCol};"
                         ondragover="handleDragOver(event)" 
                         ondragenter="handleDragEnter(event, this)"
                         ondragleave="handleDragLeave(event, this)"
                         ondrop="handleDrop(event, 'promotion-potential', ${state.promotionLadderPotential.length})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${textCol};">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Drop to Add (#${state.promotionLadderPotential.length + 1})
                    </div>
                `;
                potContainer.innerHTML = html;
                document.getElementById('count-promotion-potential').innerText = `${state.promotionLadderPotential.length}`;
            }
        }

        function renderCandidatePool() {
            const container = document.getElementById('unranked-list');
            const searchVal = document.getElementById('search-input').value.toLowerCase();
            
            // Get all candidates that are NOT starred (not in state.starredCandidateIds)
            const available = allCandidates.filter(c => !state.starredCandidateIds.includes(c.id));
            
            // Sort available candidates alphabetically by name for easy searching
            available.sort((a, b) => a.name.localeCompare(b.name));
            
            const filtered = available.filter(c => 
                c.name.toLowerCase().includes(searchVal) || 
                c.counsellor.toLowerCase().includes(searchVal)
            );
            
            if (filtered.length === 0) {
                if (available.length === 0) {
                    container.innerHTML = `<div class="empty-state">All candidates are starred/promoted!</div>`;
                } else {
                    container.innerHTML = `<div class="empty-state">No candidates match search criteria</div>`;
                }
                return;
            }
            
            let html = '';
            filtered.forEach(candidate => {
                html += renderCard(candidate, null, -1);
            });
            container.innerHTML = html;
        }

        // Helper to sort candidates based on performance band and rank
        function getPerformanceGrade(candidate) {
            if (!candidate) return 999999;
            for (let bandIdx = 0; bandIdx < CONFIG.bands.length; bandIdx++) {
                const bandId = CONFIG.bands[bandIdx].id;
                const candIdx = state.bands[bandId].findIndex(c => c.id === candidate.id);
                if (candIdx !== -1) {
                    return bandIdx * 1000 + candIdx;
                }
            }
            return 999999;
        }

        // Promotion Board specific state adjusters
        function changePromotionCapacity(type, delta) {
            if (type === 'expected') {
                const maxCap = CONFIG.maxExpectedSpaces || 10;
                const newVal = state.promotionCapacityExpected + delta;
                if (newVal < 0 || newVal > maxCap) return;
                
                state.promotionCapacityExpected = newVal;
                const inputEl = document.getElementById('input-promotion-expected-slots');
                if (inputEl) inputEl.value = newVal;
                
                // Re-render skeletons to hide/show Expected row or update styles
                renderBoardSkeleton();
                renderRightSidebarSkeleton();
            }
            
            cascadeOverflowPromotion();
            saveState();
            renderApp();
        }

        function cascadeOverflowPromotion() {
            const expectedCap = state.promotionCapacityExpected;

            // 1. Downward cascade: Expected -> Potential
            while (state.promotionLadderExpected.length > expectedCap) {
                const popped = state.promotionLadderExpected.pop();
                state.promotionLadderPotential.unshift(popped);
            }

            // 2. Upward cascade: Potential -> Expected
            while (state.promotionLadderExpected.length < expectedCap && state.promotionLadderPotential.length > 0) {
                const pulled = state.promotionLadderPotential.shift();
                state.promotionLadderExpected.push(pulled);
            }
        }

        function moveCandidatePromotion(candidateId, targetBandId, targetIndex) {
            let candidate = null;
            
            const expIdx = state.promotionLadderExpected.findIndex(c => c.id === candidateId);
            if (expIdx !== -1) {
                candidate = state.promotionLadderExpected.splice(expIdx, 1)[0];
            } else {
                const potIdx = state.promotionLadderPotential.findIndex(c => c.id === candidateId);
                if (potIdx !== -1) {
                    candidate = state.promotionLadderPotential.splice(potIdx, 1)[0];
                } else {
                    // Dragged from Candidate Pool (not starred yet)
                    candidate = allCandidates.find(c => c.id === candidateId);
                    if (candidate && !state.starredCandidateIds.includes(candidateId)) {
                        state.starredCandidateIds.push(candidateId);
                    }
                }
            }
            
            if (!candidate) return;
            
            if (targetBandId === 'promotion-expected') {
                let actualIndex = targetIndex;
                if (actualIndex > state.promotionLadderExpected.length || actualIndex === -1) {
                    actualIndex = state.promotionLadderExpected.length;
                }
                state.promotionLadderExpected.splice(actualIndex, 0, candidate);
            } else if (targetBandId === 'promotion-potential') {
                let actualIndex = targetIndex;
                if (actualIndex > state.promotionLadderPotential.length || actualIndex === -1) {
                    actualIndex = state.promotionLadderPotential.length;
                }
                state.promotionLadderPotential.splice(actualIndex, 0, candidate);
            }
            
            cascadeOverflowPromotion();
            
            saveState();
            renderApp();
        }

        function unrankCandidatePromotion(candidateId) {
            const expIdx = state.promotionLadderExpected.findIndex(c => c.id === candidateId);
            if (expIdx !== -1) {
                state.promotionLadderExpected.splice(expIdx, 1);
            } else {
                const potIdx = state.promotionLadderPotential.findIndex(c => c.id === candidateId);
                if (potIdx !== -1) {
                    state.promotionLadderPotential.splice(potIdx, 1);
                }
            }
            
            // Remove star
            const idx = state.starredCandidateIds.indexOf(candidateId);
            if (idx !== -1) {
                state.starredCandidateIds.splice(idx, 1);
            }
            
            cascadeOverflowPromotion();
            saveState();
            renderApp();
        }

        function autoFillPromotion() {
            const expectedCap = state.promotionCapacityExpected;
            if (expectedCap <= 0) return;
            
            // Get unstarred candidates
            const available = allCandidates.filter(c => !state.starredCandidateIds.includes(c.id));
            available.sort((a, b) => getPerformanceGrade(a) - getPerformanceGrade(b));
            
            while (state.promotionLadderExpected.length < expectedCap && available.length > 0) {
                const candidate = available.shift();
                state.starredCandidateIds.push(candidate.id);
                state.promotionLadderExpected.push(candidate);
            }
            
            state.promotionLadderExpected.sort((a, b) => getPerformanceGrade(a) - getPerformanceGrade(b));
            saveState();
            renderApp();
        }

        function clearPromotionLadder() {
            if (state.promotionLadderExpected.length === 0 && state.promotionLadderPotential.length === 0) return;
            if (!confirm("Are you sure you want to clear the promotion ladders? Candidates will lose their starred promotion status.")) return;
            
            state.promotionLadderExpected = [];
            state.promotionLadderPotential = [];
            state.starredCandidateIds = [];
            
            saveState();
            renderApp();
        }

        function renderCounsellorBreakdown() {
            const container = document.getElementById('counsellor-breakdown');
            const counts = {};
            
            function getCounsellorBucket(counsellor) {
                if (!counts[counsellor]) {
                    counts[counsellor] = { 
                        performance: {}, 
                        unranked: 0,
                        expected: 0,
                        potential: 0
                    };
                    CONFIG.bands.forEach(b => {
                        counts[counsellor].performance[b.id] = 0;
                    });
                }
                return counts[counsellor];
            }
            
            state.unranked.forEach(c => {
                getCounsellorBucket(c.counsellor).unranked++;
            });
            CONFIG.bands.forEach(b => {
                state.bands[b.id].forEach(c => {
                    getCounsellorBucket(c.counsellor).performance[b.id]++;
                });
            });
            
            state.promotionLadderExpected.forEach(c => {
                getCounsellorBucket(c.counsellor).expected++;
            });
            state.promotionLadderPotential.forEach(c => {
                getCounsellorBucket(c.counsellor).potential++;
            });
            
            const sortedCounsellors = Object.keys(counts).sort();
            
            if (sortedCounsellors.length === 0) {
                container.innerHTML = `<div class="empty-state" style="padding: 12px; border-radius: 8px;">No counsellor data</div>`;
                return;
            }
            
            let html = '';
            sortedCounsellors.forEach(counsellor => {
                const data = counts[counsellor];
                
                if (currentView === 'performance') {
                    let bandPills = '';
                    CONFIG.bands.forEach(b => {
                        const count = data.performance[b.id];
                        if (count > 0) {
                            bandPills += `<span class="counsellor-pill pill-${b.id}" title="${escapeHtml(b.name)}: ${count}">${count} ${escapeHtml(b.shortName || b.name)}</span> `;
                        }
                    });
                    
                    const remainingText = data.unranked > 0 ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 3px; font-weight: 500;">${data.unranked} remaining unranked</div>` : '';
                    
                    html += `
                        <div class="counsellor-stat-item">
                            <div class="counsellor-name">${escapeHtml(counsellor)}</div>
                            <div class="counsellor-bands">
                                ${bandPills || '<span style="font-size:10px; color:var(--text-muted); font-weight: 500;">None ranked</span>'}
                            </div>
                            ${remainingText}
                        </div>
                    `;
                } else {
                    let pills = '';
                    const showExpected = (state.promotionCapacityExpected > 0);
                    if (data.expected > 0 && showExpected) {
                        pills += `<span class="counsellor-pill" style="background-color: #ca8a04; color: #ffffff;" title="Expected Promotions: ${data.expected}">${data.expected} Expected</span> `;
                    }
                    if (data.potential > 0) {
                        const potColor = showExpected ? '#94a3b8' : '#ca8a04';
                        const potLabel = showExpected ? 'Potential' : 'Promoted';
                        pills += `<span class="counsellor-pill" style="background-color: ${potColor}; color: #ffffff;" title="Potential Promotions: ${data.potential}">${data.potential} ${potLabel}</span> `;
                    }
                    
                    html += `
                        <div class="counsellor-stat-item">
                            <div class="counsellor-name">${escapeHtml(counsellor)}</div>
                            <div class="counsellor-bands">
                                ${pills || '<span style="font-size:10px; color:var(--text-muted); font-weight: 500;">None starred</span>'}
                            </div>
                        </div>
                    `;
                }
            });
            container.innerHTML = html;
        }

        // Header statistics
        function renderHeaderStats() {
            const container = document.getElementById('header-stats');
            const total = allCandidates.length;
            
            if (currentView === 'performance') {
                const rankedCount = total - state.unranked.length;
                const pct = total > 0 ? Math.round((rankedCount / total) * 100) : 0;
                
                container.innerHTML = `
                    <div class="stat-item">Appraisal Progress: <span class="stat-val">${rankedCount} / ${total} (${pct}%)</span></div>
                    <div class="stat-item">Unranked Remaining: <span class="stat-val">${state.unranked.length}</span></div>
                `;
            } else {
                const expectedCount = state.promotionLadderExpected.length;
                const potentialCount = state.promotionLadderPotential.length;
                const showExpected = (state.promotionCapacityExpected > 0);
                
                if (showExpected) {
                    container.innerHTML = `
                        <div class="stat-item">Expected: <span class="stat-val" style="background: #fef08a; border-color: #f59e0b; color: #ca8a04;">${expectedCount} / ${state.promotionCapacityExpected}</span></div>
                        <div class="stat-item">Potential: <span class="stat-val" style="background: #f1f5f9; border-color: #cbd5e1; color: #475569;">${potentialCount}</span></div>
                    `;
                } else {
                    container.innerHTML = `
                        <div class="stat-item">Promoted: <span class="stat-val" style="background: #fef08a; border-color: #f59e0b; color: #ca8a04;">${potentialCount}</span></div>
                    `;
                }
            }
        }

        // HTML escaping helper
        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;")
                      .replace(/"/g, "&quot;")
                      .replace(/'/g, "&#039;");
        }

        function exportToClipboard() {
            let text = '';
            
            if (currentView === 'performance') {
                text += `${CONFIG.title || 'LADDERATER'} - Performance Board\n`;
                text += `===================================\n\n`;
                
                let globalIdx = 1;
                CONFIG.bands.forEach((b, idx) => {
                    text += `${idx + 1}. ${b.name.toUpperCase()}\n`;
                    text += `-`.repeat(b.name.length + 3) + `\n`;
                    const bandList = state.bands[b.id] || [];
                    if (bandList.length === 0) {
                        text += `  (No candidates ranked)\n`;
                    } else {
                        bandList.forEach((c) => {
                            text += `  ${globalIdx}. ${c.name} (Counsellor: ${c.counsellor})\n`;
                            globalIdx++;
                        });
                    }
                    text += `\n`;
                });
            } else {
                text += `${CONFIG.title || 'LADDERATER'} - Promotion Board\n`;
                text += `=================================\n\n`;
                
                let globalIdx = 1;
                const showExpected = (state.promotionCapacityExpected > 0);
                if (showExpected) {
                    text += `EXPECTED PROMOTIONS\n`;
                    text += `-------------------\n`;
                    if (state.promotionLadderExpected.length === 0) {
                        text += `  (No candidates allocated)\n`;
                    } else {
                        state.promotionLadderExpected.forEach((c) => {
                            text += `  ${globalIdx}. ${c.name} (Counsellor: ${c.counsellor})\n`;
                            globalIdx++;
                        });
                    }
                    text += `\n`;
                    
                    text += `POTENTIAL PROMOTIONS\n`;
                    text += `--------------------\n`;
                    if (state.promotionLadderPotential.length === 0) {
                        text += `  (No candidates allocated)\n`;
                    } else {
                        state.promotionLadderPotential.forEach((c) => {
                            text += `  ${globalIdx}. ${c.name} (Counsellor: ${c.counsellor})\n`;
                            globalIdx++;
                        });
                    }
                } else {
                    text += `PROMOTIONS (UNCAPPED)\n`;
                    text += `---------------------\n`;
                    if (state.promotionLadderPotential.length === 0) {
                        text += `  (No candidates allocated)\n`;
                    } else {
                        state.promotionLadderPotential.forEach((c) => {
                            text += `  ${globalIdx}. ${c.name} (Counsellor: ${c.counsellor})\n`;
                            globalIdx++;
                        });
                    }
                }
            }
            
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('btn-export-list');
                if (btn) {
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Copied!
                    `;
                    btn.style.color = '#166534';
                    btn.style.backgroundColor = '#f0fdf4';
                    btn.style.borderColor = '#bbf7d0';
                    
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        btn.style.color = '';
                        btn.style.backgroundColor = '';
                        btn.style.borderColor = '';
                    }, 2000);
                }
            }).catch(err => {
                console.error('Failed to copy text to clipboard: ', err);
                alert('Failed to copy ordered list to clipboard.');
            });
        }
    </script>
</body>
</html>
'@

# 5. Compile the final HTML by injecting JSON
Write-Host "Compiling HTML and injecting candidate and config data..." -ForegroundColor Cyan
$finalHtml = $htmlTemplate.Replace('{{CANDIDATES_JSON}}', $jsonCandidates).Replace('{{CONFIG_JSON}}', $configJsonText)

$outputPath = Join-Path $PSScriptRoot "ladderater.html"

# Output with UTF8 encoding so that special characters are fully supported
Set-Content -Path $outputPath -Value $finalHtml -Encoding utf8

Write-Host ""
Write-Host "Success! Single-file web application successfully created." -ForegroundColor Green
Write-Host "Application path: $outputPath" -ForegroundColor Green
Write-Host "Open this file in Google Chrome, Microsoft Edge, or Firefox to start the appraisal." -ForegroundColor Cyan

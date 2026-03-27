# Billing + Stock Management App (3 Shops + Main Dashboard)

This version works across **multiple computers** using one central server database.

## What you get
- Separate shop operations for `Shop 1`, `Shop 2`, `Shop 3`
- Main dashboard (from any computer) showing all shops
- Click `Sales` in dashboard to see **today full sales details** per shop
- Click `Stock Left` in dashboard to see items by SKU order

## Setup (Main computer)
1. Open terminal in:
   - `C:\Users\abusi\OneDrive\Documents\ractical\billing-stock-app`
2. Start server:
```powershell
python server.py --host 0.0.0.0 --port 8080
```
3. Keep this terminal running.

## Access from shop computers
1. Find main computer LAN IP (example `192.168.1.20`).
2. On each shop computer open browser:
   - `http://192.168.1.20:8080`
3. Select shop from `Shop View` dropdown:
   - Shop 1 computer -> `Shop 1`
   - Shop 2 computer -> `Shop 2`
   - Shop 3 computer -> `Shop 3`

## Main dashboard computer
- Open same URL: `http://<main-computer-ip>:8080`
- Select `Main Dashboard`
- You can monitor all shops live.

## Files
- Frontend: `index.html`, `styles.css`, `app.js`
- Server/API: `server.py`
- Database: `billing_stock.db` (auto-created)

## Cloud deploy (for different Wi-Fi/networks)
Use this when your 3 shops are in different locations.

### 1) Push project to GitHub
- Create a new GitHub repo.
- Upload this folder: `C:\Users\abusi\OneDrive\Documents\ractical\billing-stock-app`

### 2) Deploy on Render
- Open `https://render.com`
- New -> `Blueprint`
- Connect your GitHub repo
- Render will read `render.yaml` and deploy

### 3) Use the public URL
- Render gives URL like: `https://billing-stock-app.onrender.com`
- Open this URL from all shop computers and main dashboard computer

### 4) Important note
- SQLite on free web services can reset on redeploy/restart.
- For production use, move data to managed database (PostgreSQL/MySQL). This is the next recommended step.

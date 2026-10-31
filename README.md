# GardenPlan
Planning and monitoring garden – plánování a správa zahrady (CZ / EN).

## Spuštění / How to run
Nothing to install. Either:

- **Double-click `index.html`** – opens in your browser, or
- run the small local server (recommended – same address every time):
  ```
  powershell -ExecutionPolicy Bypass -File serve.ps1
  ```
  then open http://localhost:8080

Data is stored **in the browser** (IndexedDB) on this computer. `index.html` opened from disk and `http://localhost:8080`
are different storage places – pick one. Use **Data → Download backup** regularly; the JSON backup can be restored in any browser.

## What's in version 1
- **Gardens** (several): location + GPS, altitude, area, aspect, soil type and pH, lowest winter temperature, frost dates,
  rainfall, water source, surroundings.
- **Grid plan** per garden: configurable size (cells × metres), background image (map / aerial photo), zones painted with
  mouse or finger, per-cell light and moisture.
  - 🌱 *Plants* mode: pick a plant and click cells (or drag & drop), click a cell for details, move ↔ / remove ✕.
  - 🎨 *Zones* mode: paint zones.
  - 🌸 *Season* mode: month slider (▶ plays the year) colouring cells by flower colour.
  - Warnings: light / moisture mismatch, frost hardiness vs. garden minimum, bad neighbours in adjacent cells.
- **Plant catalog** shared by all gardens, names in **CZ / SK / EN / Latin**, fields split into
  **0 Basics**, **1 Before planting** (size, light, water, hardiness, flowering…), **2 Care through the year**
  (fertilising, watering, pruning 1+2, winter protection, pests – each with months). Completeness bar + filter
  "missing: …", web search links, photo.
- **CSV import** from Excel (`;` or `,`, UTF-8 or Windows-1250), Czech / Slovak / English headers recognised automatically,
  mapping adjustable, merge with existing plants (fill empty fields only), optional "add to garden" with position / planted / count.
  Examples in `sample/`.
- **Calendar**: monthly reminders generated from care months, equipment tasks and custom tasks; tick off per year;
  whole-year overview (flowering bars + care icons).
- **Technology**: equipment register (watering, mowing, lighting, cameras, sensors, tools) with instructions / automation
  settings, price, warranty, supplier and seasonal task templates feeding the calendar.
- **CZ / EN** switch for the whole interface.

## Files
- `index.html`, `css/style.css`
- `js/store.js` – storage · `js/schema.js` – field definitions (add plant fields here) · `js/csv.js` – CSV
- `js/view-*.js` – screens · `js/app.js` – router
- `serve.ps1` – local web server

## Ideas for next versions
Costs & budget per year, contacts DB (gardeners, architects, technicians), harvest log & reports, photo diary,
crop rotation history, weather forecast & frost alerts, sync between devices (phone in the garden), device control
(irrigation, robot mower, lights, cameras) on the grid map.

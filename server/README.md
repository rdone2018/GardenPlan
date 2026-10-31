# GardenPlan server (Raspberry Pi / Linux + MariaDB)

Server zobrazuje aplikaci a ukládá data do databáze MariaDB `gardenplan`.
Aplikace pak běží na `http://<adresa-pi>:8080` – z počítače i z mobilu v domácí síti, všude se stejnými daty.

## 1. Uživatel databáze
Databáze `gardenplan` už existuje. Serveru stačí uživatel s právy jen k ní (v `sudo mariadb` / `mysql -u root -p`):

```sql
CREATE USER 'gardenplan'@'localhost' IDENTIFIED BY 'zvolte-heslo';
GRANT ALL PRIVILEGES ON gardenplan.* TO 'gardenplan'@'localhost';
FLUSH PRIVILEGES;
```
Běží-li MariaDB na jiném stroji než server, použijte místo `'localhost'` adresu serveru (nebo `'%'`).

Tabulky (`gardens`, `plants`, `placements`, `equipment`, `tasks`, `meta`) vytvoří `initDatabase()` v `database.js`
sám při prvním spuštění (a při každém dalším jen ověří, že existují) – viz `schema.sql`. Každý řádek má čitelné sloupce (název, latinský název, zahrada…) a celý záznam v JSON ve sloupci `data`.

## 2. Instalace na Pi
```bash
git clone https://github.com/rdone2018/GardenPlan.git
cd GardenPlan/server
npm install
sudo mkdir -p /etc/gardenplan
sudo cp .env.example /etc/gardenplan/gardenplan.env
sudo nano /etc/gardenplan/gardenplan.env      # doplňte DB_PASSWORD (případně DB_USER, DB_HOST)
sudo chown root:pi /etc/gardenplan/gardenplan.env && sudo chmod 640 /etc/gardenplan/gardenplan.env
node server.js   # zkušební spuštění
```
Konfiguraci načítá `database.js` v tomto pořadí: soubor z proměnné `GARDENPLAN_ENV_FILE`,
pak `/etc/gardenplan/gardenplan.env`, nakonec `server/.env` (pro vývoj). Hodnota nastavená v prostředí má vždy přednost.
Má se vypsat `GardenPlan: http://localhost:8080 (database gardenplan @ localhost)`.
Pak na počítači nebo mobilu otevřete `http://<adresa-pi>:8080` (adresu zjistíte na Pi příkazem `hostname -I`).
Vpravo nahoře se ukáže „✓ Připojeno k databázi“, na stránce **Data** je „Data se ukládají do databáze MariaDB“.

Potřeba je Node.js 18 nebo novější (`node -v`).

## 3. Automatické spouštění
```bash
sudo cp gardenplan.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gardenplan
systemctl status gardenplan      # kontrola, logy: journalctl -u gardenplan -f
```
(Upravte v souboru `User=` a cesty, pokud repozitář není v `/home/pi/GardenPlan`.)

## 4. Aktualizace
```bash
cd ~/GardenPlan && git pull && cd server && npm install && sudo systemctl restart gardenplan
```

## Přenos dat z prohlížeče do databáze
Data zadaná dříve v prohlížeči (otevřením `index.html`) jsou jen v tom prohlížeči. Přenos:
1. ve staré verzi **Data → Stáhnout zálohu (JSON)**,
2. v aplikaci otevřené z Pi **Data → Obnovit ze zálohy**.

## Bezpečnost
Server nemá přihlašování – je určen pro domácí síť. Nevystavujte port 8080 do internetu
(přístup zvenku řešte přes VPN, např. WireGuard / Tailscale). Soubor s heslem je mimo repozitář (`/etc/gardenplan`),
případný `server/.env` git ignoruje.

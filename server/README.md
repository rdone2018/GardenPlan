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

## Zahradníci a přihlašování
Všechna data patří **zahradníkovi** (tabulka `gardeners`: jméno, kontakt, e-mail, země). Každá datová tabulka
(`gardens`, `plants`, `placements`, `equipment`, `tasks`, `photos`, `meta`) má sloupec `gardener_id`, první v primárním
klíči. Uživatelé (`users`) se přihlašují e-mailem a heslem a vidí a mění jen data svého zahradníka.

- **První spuštění po aktualizaci:** server přidá sloupce `gardener_id` a všechna dosavadní data přesune k prvnímu
  zahradníkovi. Aplikace pak ukáže **„Nastavení – první spuštění“**: tam se zahradník pojmenuje a založí se první
  uživatel, který je zároveň **administrátor**. Do té doby nejsou vidět žádná data.
  ⚠ **Před prvním spuštěním zazálohujte databázi** – mění se struktura všech tabulek:
  `mysqldump -u root -p gardenplan > ~/gardenplan-zaloha-$(date +%F).sql`
  ⚠ Nastavení udělejte hned po aktualizaci, ještě než aplikaci zpřístupníte zvenku – kdo ho udělá první, je administrátor.
- **Nový zahradník:** kdokoli, kdo aplikaci otevře, si může na přihlašovací obrazovce založit vlastního zahradníka
  (prázdného). Formulář je chráněný stejně jako v DoggyFeedu: skryté pole pro roboty (honeypot), podepsaný token
  s kontrolou času (odeslání do 3 s nebo po hodině se odmítne), obsazený e-mail dostane stejnou obecnou odpověď jako
  jiné neplatné údaje a pevné limity na adresu (5 pokusů za hodinu, 20 za den, 3 noví zahradníci za den, celkem 50 za den).
- **Přihlášení:** stejný honeypot a token (min. 1 s); špatný e-mail i špatné heslo dostanou stejnou odpověď po stejně
  dlouhém hashování. Limity neúspěšných pokusů: 5 pro jeden e-mail z jedné adresy (pak minuta čekání), 10 z adresy
  za 15 minut, 50 z adresy za den, 20 pro jeden e-mail za hodinu ze všech adres. Limity jsou v paměti (restart je smaže).
- **Za nginxem:** všechny požadavky přicházejí z adresy nginxu, proto v `/etc/gardenplan/gardenplan.env` nastavte
  `GARDENPLAN_TRUST_PROXY=1` (limity pak berou adresu z `X-Forwarded-For`) – jen když nginx tu hlavičku vždy nastavuje
  (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). Cookie přihlášení je `Secure`, když nginx posílá
  `X-Forwarded-Proto: https`.
- **Profil** (👤 v menu): údaje zahradníka a kdo se může přihlásit – přidat přihlášení (může upravovat / host jen pro
  čtení), nastavit heslo (odhlásí dotyčného jinde), změnit roli, odebrat. Host jen prohlíží; server odmítne každou
  změnu, kterou pošle (HTTP 403).
- **Bezpečnost:** hesla jen jako scrypt hash, přihlášení platí 30 dní od posledního použití (HttpOnly cookie,
  v databázi jen hash tokenu). Odhlášení smaže i kopii dat v prohlížeči.

Soubor s heslem k databázi je mimo repozitář (`/etc/gardenplan`), případný `server/.env` git ignoruje.

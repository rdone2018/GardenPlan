// Backup / restore of all data and CSV export.
(function (GP) {
  const L = GP.L;

  GP.views.data = {
    render() {
      const size = Math.round(JSON.stringify(GP.state).length / 1024);
      return '<div class="head"><h1>' + L('Data a zálohy', 'Data & backups') + '</h1></div>' +
        '<div class="panel"><p>' + (GP.storageMode === 'server'
          ? '🗄️ ' + L('Data se ukládají do databáze <b>MariaDB</b> na serveru – stejná data vidíte z každého zařízení. Záloha do souboru se přesto hodí.', 'Data is stored in the <b>MariaDB</b> database on the server – every device sees the same data. A file backup is still useful.')
          : '💻 ' + L('Data se ukládají jen <b>v tomto prohlížeči</b> (aplikace neběží přes server s databází). Pravidelně si stáhněte zálohu. Do databáze je přenesete tak, že zálohu nahrajete v aplikaci otevřené ze serveru.', 'Data is stored only <b>in this browser</b> (the app is not running through the database server). Download backups regularly. To move them into the database, restore the backup in the app opened from the server.')) + '</p>' +
        '<p class="muted small">' + L('Velikost dat', 'Data size') + ': ' + size + ' kB · ' + GP.state.plants.length + ' ' + L('rostlin', 'plants') + ' · ' + GP.state.gardens.length + ' ' + L('zahrad', 'gardens') + '</p>' +
        '<div class="row gap"><button class="btn primary" data-act="backup">⬇ ' + L('Stáhnout zálohu (JSON)', 'Download backup (JSON)') + '</button>' +
        '<label class="btn">⬆ ' + L('Obnovit ze zálohy', 'Restore from backup') + '<input type="file" accept=".json,application/json" data-act="restore" hidden></label>' +
        '<button class="btn" data-act="csv">⬇ ' + L('Rostliny jako CSV (Excel)', 'Plants as CSV (Excel)') + '</button></div></div>' +
        '<div class="panel"><h3>' + L('Import rostlin', 'Import plants') + '</h3><a class="btn" href="#/import">⬆ ' + L('Import CSV', 'Import CSV') + '</a></div>' +
        '<div class="panel"><h3 class="danger-text">' + L('Smazat vše', 'Delete everything') + '</h3><p class="muted small">' + L('Nejprve si stáhněte zálohu.', 'Download a backup first.') + '</p><button class="btn danger" data-act="wipe">' + L('Smazat všechna data', 'Delete all data') + '</button></div>';
    },
    mount(root) {
      const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      root.querySelector('[data-act=backup]').onclick = () => GP.ui.download('gardenplan-zaloha-' + stamp() + '.json', JSON.stringify(GP.state, null, 1), 'application/json');
      root.querySelector('[data-act=csv]').onclick = () => GP.ui.download('rostliny-' + stamp() + '.csv', GP.csv.exportPlants(), 'text/csv;charset=utf-8');
      root.querySelector('[data-act=restore]').onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        let data;
        try { data = JSON.parse(await f.text()); } catch (err) { return GP.ui.toast(L('Soubor není platná záloha', 'Not a valid backup file')); }
        if (!data || !Array.isArray(data.plants) || !Array.isArray(data.gardens)) return GP.ui.toast(L('Soubor není záloha GardenPlan', 'Not a GardenPlan backup'));
        if (!confirm(L('Nahradit všechna současná data obsahem zálohy?', 'Replace all current data with the backup?'))) return;
        try {
          await GP.replaceState(data);
          GP.ui.toast(L('Záloha obnovena', 'Backup restored'));
        } catch (err) { alert(err.message); }
        GP.go('');
        GP.render();
      };
      root.querySelector('[data-act=wipe]').onclick = async () => {
        if (!confirm(L('Opravdu smazat všechny zahrady, rostliny a úkoly?', 'Really delete all gardens, plants and tasks?'))) return;
        try { await GP.replaceState({ settings: GP.state.settings }); } catch (err) { alert(err.message); }
        if (GP.resetImport) GP.resetImport();
        GP.go('');
        GP.render();
      };
    }
  };
})(window.GP);

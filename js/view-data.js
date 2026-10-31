// Backup / restore of all data and CSV export.
(function (GP) {
  const L = GP.L;

  GP.views.data = {
    render() {
      const size = Math.round(JSON.stringify(GP.state).length / 1024);
      return '<div class="head"><h1>' + L('Data a zálohy', 'Data & backups') + '</h1></div>' +
        '<div class="panel"><p>' + L('Data se ukládají v tomto prohlížeči na tomto počítači. Pravidelně si stáhněte zálohu – soubor můžete nahrát zpět nebo přenést do jiného prohlížeče či počítače.', 'Data is stored in this browser on this computer. Download a backup regularly – you can restore it later or move it to another browser or computer.') + '</p>' +
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
        GP.replaceState(data);
        GP.ui.toast(L('Záloha obnovena', 'Backup restored'));
        GP.go('');
      };
      root.querySelector('[data-act=wipe]').onclick = () => {
        if (!confirm(L('Opravdu smazat všechny zahrady, rostliny a úkoly?', 'Really delete all gardens, plants and tasks?'))) return;
        GP.replaceState({ settings: GP.state.settings });
        if (GP.resetImport) GP.resetImport();
        GP.go('');
      };
    }
  };
})(window.GP);

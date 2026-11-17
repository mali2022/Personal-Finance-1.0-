import json,pathlib,subprocess,shutil,time
base=pathlib.Path('/srv/personal-finance')
files=sorted((base/'backups').glob('pf-*.bak'),key=lambda x:x.stat().st_mtime)
cron=subprocess.run(['crontab','-l'],capture_output=True,text=True).stdout
for folder in ['/etc/cron.d','/etc/cron.daily','/etc/cron.hourly']:
    for f in pathlib.Path(folder).glob('*'):
        if f.is_file():
            try: cron+='\n'+f.read_text(errors='ignore')
            except PermissionError: pass
settings=dict(line.split('=',1) for line in (base/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
print(json.dumps({'backupCount':len(files),'latestBackupAgeHours':round((time.time()-files[-1].stat().st_mtime)/3600,2) if files else None,'cronBackupConfigured':any('backup.sh' in line and not line.strip().startswith('#') for line in cron.splitlines()),'offsiteConfigured':bool(settings.get('OSS_BUCKET','').strip()),'freeGiB':round(shutil.disk_usage(base).free/1024**3,2),'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}))

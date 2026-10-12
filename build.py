from pathlib import Path
import json,zipfile
root=Path(__file__).resolve().parent
source=root
manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
version=manifest['version']
(root/'dist').mkdir(exist_ok=True)
for browser in ['edge','chrome']:
    config=dict(manifest)
    config['name']='SUPER DIAMOND NO HAND ('+browser.title()+')'
    with zipfile.ZipFile(root/'dist'/f'SUPER-DIAMOND-NO-HAND-{browser}-{version}.zip','w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('manifest.json',json.dumps(config,ensure_ascii=False,indent=2))
        for path in sorted(source.glob('*.js')):archive.write(path,path.name)
        archive.write(root/'README.md','README.md')

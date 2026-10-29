#!/usr/bin/env python3
"""Prepare the shared local payload, or assemble a universal ZIP with built launchers."""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
NAME='Goosnav Animation Assistant'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--payload-only',action='store_true')
    parser.add_argument('--stage',type=Path,default=ROOT/'release/staging')
    parser.add_argument('--launchers',type=Path,default=ROOT/'release/launchers')
    parser.add_argument('--uv-version',default='0.12.19')
    parser.add_argument('--fetch-tools',action='store_true')
    args=parser.parse_args();stage=args.stage.resolve();app=stage/'app'
    if not (ROOT/'dist/index.html').exists():raise SystemExit('Run npm run build first')
    for folder in ['src','static','launcher']:(app/folder).mkdir(parents=True,exist_ok=True)
    shutil.rmtree(app/'src')
    (app/'src').mkdir()
    shutil.copyfile(ROOT/'app/src/local_server.py',app/'src/local_server.py')
    for name in ['.python-version','pyproject.toml','uv.lock']:shutil.copyfile(ROOT/'app'/name,app/name)
    for name in ['bootstrap.py','manifest.json']:shutil.copyfile(ROOT/'app/launcher'/name,app/'launcher'/name)
    # Only allowlisted static output belongs in a release.
    shutil.rmtree(app/'static')
    shutil.copytree(ROOT/'dist',app/'static')
    shutil.copyfile(ROOT/'LICENSE.txt',stage/'LICENSE.txt')
    shutil.copyfile(ROOT/'tools/LOCAL_README.txt',stage/'README.txt')
    if args.fetch_tools:subprocess.run([sys.executable,str(ROOT/'tools/native/fetch_uv.py'),'--version',args.uv_version,'--app-root',str(app)],check=True)
    if args.payload_only:print(f'Local payload prepared: {stage} (not a universal release)');return
    suffixes=['macOS.app','Windows x64.exe','Windows ARM64.exe','Linux x86_64.AppImage','Linux ARM64.AppImage']
    for suffix in suffixes:
        name=f'Open {NAME} — {suffix}';source=args.launchers/name
        if not source.exists():raise SystemExit(f'Missing native image: {source}. Payload preserved; universal ZIP not produced.')
        if source.is_dir():shutil.copytree(source,stage/name,dirs_exist_ok=True)
        else:shutil.copy2(source,stage/name)
    subprocess.run([sys.executable,str(ROOT/'tools/native/package_universal.py'),'--root',str(stage),'--name',NAME,'--output',str(ROOT/'release/GoosnavAnimationAssistant-universal.zip')],check=True)

if __name__=='__main__':main()

#!/usr/bin/env python3
"""Cross-build the five launcher images; this does not run native acceptance tests."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]

def run(*args):subprocess.run([str(x) for x in args],cwd=ROOT,check=True)
def main():
    lipo=os.environ.get('LIPO') or shutil.which('lipo') or shutil.which('llvm-lipo')
    if not lipo:
        candidates=list(Path('/usr/lib').glob('llvm-*/bin/llvm-lipo'))
        lipo=str(candidates[-1]) if candidates else None
    for tool in ['go','go-winres']:
        if not shutil.which(tool):raise SystemExit(f'Install build prerequisite {tool}; see tools/LOCAL_BUILD.md')
    if not lipo:raise SystemExit('Set LIPO to lipo or llvm-lipo')
    os.environ['LIPO']=lipo
    work=ROOT/'.work/native';work.mkdir(parents=True,exist_ok=True)
    run('go-winres','simply','--arch','amd64,arm64','--out',work/'animation','--icon',ROOT/'tools/native/icons/AppIcon.ico','--manifest','gui','--product-name','Goosnav Animation Assistant','--file-description','Open Goosnav Animation Assistant','--product-version','1.0.0','--file-version','1.0.0')
    for target in ['macos','windows-x64','windows-arm64','linux-x64','linux-arm64']:
        args=[sys.executable,ROOT/'tools/native/build.py','--target',target,'--name','Goosnav Animation Assistant','--bundle-id','shop.goosnav.animation','--icons',ROOT/'tools/native/icons','--output',ROOT/'release/launchers']
        if target.startswith('windows'):args+=['--windows-resource',work/f"animation_windows_{'amd64' if target.endswith('x64') else 'arm64'}.syso"]
        run(*args)

if __name__=='__main__':main()

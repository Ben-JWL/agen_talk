# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec: onedir, windowed. Run from the repo root:
#   AR_VERSION=1.2.3 pyinstaller packaging/agent_room.spec --noconfirm --distpath build/dist --workpath build/work
# Result: build/dist/AgentRoom/AgentRoom.exe (+ _internal/ with agent_room.py and index.html as data).
import os, re, sys
from pathlib import Path

ROOT = Path(SPECPATH).resolve().parent          # SPECPATH = this file's directory
VERSION = os.environ.get("AR_VERSION", "0.0.0")  # from the git tag, set by the release workflow
NAME = "AgentRoom"

# Windows "Details" tab: numeric 4-tuple from the leading digits of the version.
nums = [int(x) for x in re.match(r"\d+(?:\.\d+)*", VERSION).group(0).split(".")][:4] if re.match(r"\d", VERSION) else [0]
nums += [0] * (4 - len(nums))
version_file = None
if sys.platform == "win32":
    version_file = str(ROOT / "packaging" / "version_info.txt")
    Path(version_file).write_text(
        "VSVersionInfo(\n"
        "  ffi=FixedFileInfo(filevers=%r, prodvers=%r, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),\n"
        "  kids=[StringFileInfo([StringTable('040904B0', [\n"
        "    StringStruct('CompanyName', 'Agent Room contributors'),\n"
        "    StringStruct('FileDescription', 'Agent Room'),\n"
        "    StringStruct('FileVersion', %r),\n"
        "    StringStruct('InternalName', 'AgentRoom'),\n"
        "    StringStruct('OriginalFilename', 'AgentRoom.exe'),\n"
        "    StringStruct('ProductName', 'Agent Room'),\n"
        "    StringStruct('ProductVersion', %r)])]),\n"
        "  VarFileInfo([VarStruct('Translation', [1033, 1200])])])\n"
        % (tuple(nums), tuple(nums), VERSION, VERSION), encoding="utf-8")

icon = ROOT / "packaging" / "agent_room.ico"   # made by packaging/make_icon.py
datas = [(str(ROOT / "agent_room.py"), "."), (str(ROOT / "index.html"), ".")]   # SRC_PATH / index.html live in sys._MEIPASS
version_path = ROOT / "build" / "VERSION"
version_path.parent.mkdir(parents=True, exist_ok=True)
version_path.write_text(VERSION + "\n", encoding="utf-8")
datas.append((str(version_path), "."))
datas += [(str(ROOT / name), ".") for name in ("LICENSE", "THIRD_PARTY_NOTICES.md")]
if (Path(sys.base_prefix) / "LICENSE.txt").is_file():
    datas.append((str(Path(sys.base_prefix) / "LICENSE.txt"), "licenses/Python"))

# pywebview ships platform backends that are imported lazily; absent on a Linux dry run.
try:
    from PyInstaller.utils.hooks import collect_all
    wv_datas, wv_bins, wv_hidden = collect_all("webview")
except Exception:
    wv_datas, wv_bins, wv_hidden = [], [], []

# Keep the license texts with the binaries; metadata paths differ across build platforms.
import sysconfig
site = Path(sysconfig.get_paths()["purelib"])
for info in site.glob("*.dist-info"):
    if info.name.split("-", 1)[0].lower().replace("_", "-") in {"paramiko", "cryptography", "bcrypt", "pynacl", "cffi", "pycparser", "invoke", "pywebview", "pythonnet", "proxy-tools", "bottle", "typing-extensions", "clr-loader"}:
        for license_file in list((info / "licenses").glob("**/*")) + list(info.glob("LICENSE*")):
            if license_file.is_file():
                datas.append((str(license_file), "licenses/" + info.name))

a = Analysis(
    [str(ROOT / "app.py")],
    pathex=[str(ROOT)],
    binaries=wv_bins,
    datas=datas + wv_datas,
    hiddenimports=["agent_room", "paramiko", "cryptography", "bcrypt", "nacl", "nacl.bindings"] + wv_hidden,   # in-app SSH is imported lazily by agent_room
    module_collection_mode={"paramiko": "py"},
    excludes=["tkinter", "_tkinter", "turtle", "turtledemo", "idlelib", "lib2to3", "unittest", "test", "tests",
              "setuptools", "pip", "pydoc_data", "xmlrpc", "PIL", "numpy"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name=NAME,
    console=False,          # windowed: no cmd window
    icon=str(icon) if icon.exists() else None,
    version=version_file,
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name=NAME, upx=False)

# Third-party notices

Agen Talk itself is MIT-licensed (see `LICENSE`). The installer and the portable
zip additionally contain or were produced with the components below. Each keeps
its own license; this file is a summary, not a replacement for their texts.

| Component | Where | License |
|---|---|---|
| UI snippets from [uiverse.io](https://uiverse.io) | `ui/src/*.css` (a few copied and adapted CSS effects) | MIT (uiverse.io content is published under the MIT license by its authors) |
| [pywebview](https://github.com/r0x0r/pywebview) | bundled in the Windows app | BSD-3-Clause |
| [Python](https://www.python.org/) runtime | bundled in the Windows app | PSF License Version 2 |
| [PyInstaller](https://pyinstaller.org/) bootloader | `AgenTalk.exe` is built on it | GPL-2.0-or-later **with a special exception** that permits distributing the bootloader inside programs under any license; PyInstaller itself is not bundled |
| pywebview's Windows dependencies (pythonnet, proxy_tools, bottle, typing_extensions, ...) | bundled in the Windows app | MIT / BSD-style; license texts are in `_internal/licenses/` |
| [paramiko](https://www.paramiko.org/) | bundled as replaceable Python source files in `_internal/paramiko` | LGPL-2.1-or-later; source is at https://github.com/paramiko/paramiko |
| [cryptography](https://cryptography.io/) | bundled (paramiko dependency) | Apache-2.0 OR BSD-3-Clause |
| [bcrypt](https://github.com/pyca/bcrypt) | bundled (paramiko dependency) | Apache-2.0 |
| [PyNaCl](https://github.com/pyca/pynacl) (with libsodium) | bundled (paramiko dependency) | Apache-2.0 (libsodium: ISC) |
| cffi, pycparser, invoke | bundled (paramiko / cryptography dependencies) | MIT / BSD-3-Clause; license texts are in `_internal/licenses/` |
| [Pillow](https://python-pillow.org/) | build time only (draws the icon); not shipped | MIT-CMU (HPND) |
| [Inno Setup](https://jrsoftware.org/isinfo.php) | build time only; the installer carries its stub | Inno Setup License (free to use and to distribute installers it produces; Inno Setup's own copyright notice applies to the installer stub) |
| Microsoft Edge WebView2 runtime | not bundled; used from the system | Microsoft Software License Terms |

The build bundles the applicable dependency license texts under `_internal/licenses/`. If you redistribute the binaries, keep this file, `LICENSE`, and that directory with them.

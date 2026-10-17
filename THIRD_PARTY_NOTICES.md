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
| pywebview's Windows dependencies (pythonnet, clr_loader, proxy_tools, bottle, typing_extensions) | bundled in the Windows app | MIT (pythonnet, clr_loader, proxy_tools, bottle) / PSF-2.0 (typing_extensions). proxy_tools ships no license file; its MIT text is in `packaging/licenses/proxy_tools.txt` |
| [Microsoft Edge WebView2 SDK](https://www.nuget.org/packages/Microsoft.Web.WebView2) (`Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll`, `WebView2Loader.dll`) | bundled in the Windows app (shipped inside pywebview, `_internal/webview/lib`) | BSD-3-Clause (WebView2 SDK license); text in `packaging/licenses/Microsoft.Web.WebView2.txt` |
| [paramiko](https://www.paramiko.org/) | bundled as replaceable Python source files in `_internal/paramiko` | LGPL-2.1-or-later; source is at https://github.com/paramiko/paramiko |
| [cryptography](https://cryptography.io/) | bundled (paramiko dependency) | Apache-2.0 OR BSD-3-Clause |
| [bcrypt](https://github.com/pyca/bcrypt) | bundled (paramiko dependency) | Apache-2.0 |
| [PyNaCl](https://github.com/pyca/pynacl) (with libsodium) | bundled (paramiko dependency) | Apache-2.0 (libsodium: ISC) |
| cffi, pycparser, invoke | bundled (paramiko / cryptography dependencies) | MIT-0 (cffi) / BSD-3-Clause (pycparser) / BSD-2-Clause (invoke) |
| [Pillow](https://python-pillow.org/) | build time only (draws the icon); not shipped | MIT-CMU (HPND) |
| [Inno Setup](https://jrsoftware.org/isinfo.php) | build time only; the installer carries its stub | Inno Setup License (free to use and to distribute installers it produces; Inno Setup's own copyright notice applies to the installer stub) |
| Microsoft Edge WebView2 runtime | not bundled; used from the system (only the SDK DLLs above ship with the app) | Microsoft Software License Terms |

The build (`packaging/agen_talk.spec`) copies the license files found in each bundled Python package's metadata
(`*.dist-info`) to `_internal/licenses/<package>.dist-info/`, the Python runtime's license to `_internal/licenses/Python/`,
and the texts kept in `packaging/licenses/` (for proxy_tools, whose wheel has none, and the WebView2 SDK) to
`_internal/licenses/proxy_tools/` and `_internal/licenses/Microsoft.Web.WebView2/`. The build prints a warning for any
bundled package whose metadata carries no license file. If you redistribute the binaries, keep this file, `LICENSE`, and
that directory with them.

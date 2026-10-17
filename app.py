#!/usr/bin/env python3
"""상황실 (Agent Room) desktop app: the hub in-process + a native window (pywebview / WebView2).

  app.py                 start (or raise the running instance)
  app.py --selftest      agent_room selftest + bundled files + lifecycle with a mocked window; exit 0 = ok
  app.py keyinstall ...  internal: the password console the hub opens (the frozen exe is its own keyinstall)

Windowed PyInstaller build (--onedir): there is no console, so stdout/stderr go to the rotating log in the state folder.
pywebview is optional at import time (guarded); without it, or without WebView2, the app falls back to a Chrome/Edge --app
window and shuts down after 120 s without any /api request. Python 3.8+.
"""
import json, logging, logging.handlers, os, sys, threading, time
from pathlib import Path

try:   # not installed on Linux / in tests; the fallback path covers it
    import webview
except Exception:   # ImportError, or a GUI backend that fails to load
    webview = None

if not getattr(sys, "frozen", False):   # python -I does not put the script folder on sys.path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
import agent_room as ar

TITLE = "상황실"
IDLE_SECONDS = 120   # fallback mode: no /api request for this long -> exit


# ---------- small pieces (all testable without a display) ----------
def write_private(path, data):
    """Atomic write, user-only (0600; on Windows the folder is already per-user)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".%d.tmp" % os.getpid())
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def read_json(path, default=None):
    try:
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else default
    except (OSError, ValueError):
        return default


def setup_logging(state):
    """Rotating log (~1 MB x 3); stdout/stderr (None in a windowed exe) are sent to it too."""
    state = Path(state)
    state.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger("agent-room")
    log.setLevel(logging.INFO)
    if not log.handlers:
        h = logging.handlers.RotatingFileHandler(str(state / "agent-room.log"), maxBytes=1 << 20, backupCount=3, encoding="utf-8")
        h.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
        log.addHandler(h)

    class Tee:   # file-like for print()
        def write(self, s):
            if s.strip():
                log.info(s.rstrip())
            return len(s)

        def flush(self):
            pass
    if sys.stdout is None:
        sys.stdout = Tee()
    if sys.stderr is None:
        sys.stderr = Tee()
    return log


def other_instance(state, timeout=2):
    """If a live instance answers, ask it to show its window and return True."""
    from urllib.request import Request, urlopen
    run = read_json(Path(state) / "run.json")
    if not run or not all(k in run for k in ("port", "secret", "token")):
        return False
    base = "http://127.0.0.1:%s/%s/api/" % (run["port"], run["secret"])
    try:
        d = json.load(urlopen(base + "channels", timeout=timeout))
        if not isinstance(d, list):
            return False
        r = urlopen(Request(base + "show", data=b"{}", method="POST", headers={"Content-Type": "application/json", "X-AR-Token": run["token"]}), timeout=timeout)
        return r.status == 200 and json.load(r).get("ok") is True   # only OUR hub (secret + token) answers like this: a stranger on a reused port does not
    except (OSError, ValueError, AttributeError):
        return False   # stale run.json: the old process is gone (or the port now belongs to someone else)


def rect_intersects(x, y, width, height, areas):
    return any(x < right and x + width > left and y < bottom and y + height > top for left, top, right, bottom in areas)


def monitor_areas():
    import ctypes
    from ctypes import wintypes
    class RECT(ctypes.Structure):
        _fields_ = [(n, wintypes.LONG) for n in ("left", "top", "right", "bottom")]
    class INFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", RECT), ("rcWork", RECT), ("dwFlags", wintypes.DWORD)]
    user32, areas = ctypes.windll.user32, []
    user32.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(INFO)]
    user32.GetMonitorInfoW.restype = wintypes.BOOL
    user32.EnumDisplayMonitors.argtypes = [wintypes.HDC, ctypes.POINTER(RECT), ctypes.c_void_p, wintypes.LPARAM]
    user32.EnumDisplayMonitors.restype = wintypes.BOOL
    callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HMONITOR, wintypes.HDC, ctypes.POINTER(RECT), wintypes.LPARAM)
    def add(handle, dc, rect, data):
        info = INFO()
        info.cbSize = ctypes.sizeof(info)
        if user32.GetMonitorInfoW(handle, ctypes.byref(info)):
            r = info.rcWork
            areas.append((r.left, r.top, r.right, r.bottom))
        return True
    user32.EnumDisplayMonitors(None, None, callback(add), 0)
    return areas


def load_geometry(cfg, areas=None):
    g = read_json(Path(cfg) / "ui.json", {})
    ok = lambda k, lo, hi: g[k] if isinstance(g.get(k), int) and lo <= g[k] <= hi else None
    out = {"width": ok("width", 760, 10000) or 1280, "height": ok("height", 560, 10000) or 820, "x": ok("x", -10000, 10000), "y": ok("y", -10000, 10000)}
    if out["x"] is not None and out["y"] is not None and ar.WIN:
        try:
            monitors = monitor_areas() if areas is None else areas
        except Exception:
            monitors = None
        if monitors is not None and not rect_intersects(out["x"], out["y"], out["width"], out["height"], monitors):
            out.update(x=None, y=None)
    return out


def save_geometry(cfg, win):
    try:
        write_private(Path(cfg) / "ui.json", {"width": int(win.width), "height": int(win.height), "x": int(win.x), "y": int(win.y)})
    except Exception as e:   # a closing window may already be gone
        logging.getLogger("agent-room").info("ui.json not saved: %s", e)


def notice_once(state, name, text):
    """One-time Windows message box (WebView2 missing); a marker file remembers it was shown."""
    marker = Path(state) / name
    if marker.exists():
        return
    try:
        marker.write_text("1")
    except OSError:
        pass
    if ar.WIN:
        import ctypes
        threading.Thread(target=lambda: ctypes.windll.user32.MessageBoxW(0, text, TITLE, 0x40), daemon=True).start()
    else:
        print(text, flush=True)


def acquire_single(state):
    """Only one hub may start. POSIX: flock on a lock file (released when the process dies, so never stale). Windows: a named mutex.
    Returns a handle to keep alive, or None when another instance holds it."""
    if ar.WIN:
        import ctypes
        h = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\AgentRoomHub")
        if ctypes.windll.kernel32.GetLastError() == 183:   # ERROR_ALREADY_EXISTS
            return None
        return h
    import fcntl
    Path(state).mkdir(parents=True, exist_ok=True)
    f = open(str(Path(state) / "app.lock"), "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def webview2_installed(winreg=None):
    """True when the Edge WebView2 runtime is installed (EdgeUpdate client key with a real version). pywebview 6 silently falls back to the old
    MSHTML engine without it, so the app must decide first. Non-Windows: True (nothing to check)."""
    if winreg is None:
        if not ar.WIN:
            return True
        import winreg
    guid = r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    for root, sub in ((winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node" + guid[8:]), (winreg.HKEY_LOCAL_MACHINE, "SOFTWARE" + guid[8:]), (winreg.HKEY_CURRENT_USER, guid)):
        try:
            with winreg.OpenKey(root, sub) as k:
                v = str(winreg.QueryValueEx(k, "pv")[0])
            if v and v != "0.0.0.0":
                return True
        except OSError:
            pass
    return False


def light_theme(winreg=None):
    """Windows 'apps use light theme' (default True); decides the window's background colour before the page paints."""
    try:
        if winreg is None:
            if not ar.WIN:
                return True
            import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as k:
            return winreg.QueryValueEx(k, "AppsUseLightTheme")[0] != 0
    except OSError:
        return True


class Api:
    """js_api exposed to the page: window.pywebview.api.title(t) mirrors the page title into the native title bar."""

    def __init__(self, holder):
        self.holder = holder

    def title(self, t):
        t = "".join(c for c in str(t)[:120] if c >= " " and c != "\x7f") or TITLE
        w = self.holder.get("win")
        if w is not None:
            try:
                w.set_title(t)
            except Exception as e:
                logging.getLogger("agent-room").info("title: %s", e)


# ---------- the app ----------
def run_app(cfg_dir=None, state_dir=None, port=None, win_mod="default", idle=IDLE_SECONDS, smoke_gui=False):
    """Start everything and block until the window is closed (or, in fallback mode, until idle). Returns the exit code."""
    cfg_dir = Path(cfg_dir or ar.conf_dir())
    state = Path(state_dir or ar.state_dir())
    log = setup_logging(state)
    lock = acquire_single(state)   # held until this function returns
    if lock is None:   # a near-simultaneous launch: the other one is starting its hub; wait for its run.json, then ask it to show
        end = time.time() + 8
        while time.time() < end and not other_instance(state):
            time.sleep(0.2)
        log.info("another instance holds the lock: %s", "asked it to show" if time.time() < end else "it did not answer")
        return 1 if smoke_gui or time.time() >= end else 0
    if other_instance(state):
        log.info("already running: asked it to show its window")
        return 1 if smoke_gui else 0
    import secrets
    secret, token = secrets.token_urlsafe(18), secrets.token_urlsafe(24)
    wv = webview if win_mod == "default" else win_mod
    holder = {}

    def on_show():   # POST /api/show from a second launch
        w = holder.get("win")
        if w is not None:
            for f in ("restore", "show"):
                try:
                    getattr(w, f)()
                except Exception as e:
                    log.info("show: %s", e)

    try:
        srv, url, stop = ar.hub_start(cfg_dir / "channels.json", port=port, secret=secret, on_show=on_show, token=token)
    except SystemExit as e:   # a broken channels.json: say so instead of dying silently in a windowed exe
        log.info("hub_start: %s", e)
        if ar.WIN:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, str(e), TITLE, 0x10)
        return 1
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    run_json = state / "run.json"
    write_private(run_json, {"port": srv.server_address[1], "secret": secret, "token": token, "pid": os.getpid()})
    ar.HUB_SEEN[0] = time.time()
    log.info("hub at %s", url.replace(secret, "<secret>"))
    code = 0
    try:
        shown = False
        smoke = {"ok": False}
        if smoke_gui and (wv is None or not ar.WIN or not webview2_installed()):
            log.error("GUI smoke requires the real Windows Edge WebView2 backend")
            return 1
        if wv is not None and not (win_mod == "default" and ar.WIN and not webview2_installed()):
            try:
                g = load_geometry(cfg_dir)
                kw = {k: g[k] for k in ("x", "y") if g[k] is not None}
                win = holder["win"] = wv.create_window(TITLE, url, width=g["width"], height=g["height"], min_size=(760, 560), js_api=Api(holder),
                                                       background_color="#F2F2F5" if light_theme() else "#1C1C1E", **kw)
                win.events.closing += lambda *a: save_geometry(cfg_dir, win)
                if smoke_gui:
                    def page_loaded(*args):
                        try:
                            smoke["ok"] = getattr(wv, "renderer", None) == "edgechromium" and win.evaluate_js("document.readyState === 'complete' && /^(\\(\\d+\\) )?상황실/.test(document.title) && typeof window.pywebview.api.title === 'function'") is True
                        except Exception as e:
                            log.error("GUI smoke JavaScript failed: %s", e)
                        win.destroy()
                    win.events.loaded += page_loaded
                    timer = threading.Timer(45, win.destroy)
                    timer.daemon = True
                    timer.start()
                ar.APP_INFO["mode"] = "webview"
                wv.start(**dict({"private_mode": False, "storage_path": str(state / "webview")},
                                **({"gui": "edgechromium"} if ar.WIN and win_mod == "default" else {})))   # blocks until the window is closed
                if smoke_gui:
                    timer.cancel()
                shown = True
            except Exception as e:   # WebView2 missing / backend error
                log.info("window failed: %s", e)
                if smoke_gui:
                    code = 1
        if smoke_gui:
            code = 0 if shown and smoke["ok"] else 1
        elif not shown:
            ar.APP_INFO["mode"] = "browser"
            notice_once(state, "webview2-notice", "상황실 창을 띄우려면 Microsoft Edge WebView2 런타임이 필요합니다. 지금은 브라우저 창으로 열었습니다 "
                        "(https://developer.microsoft.com/microsoft-edge/webview2 에서 설치).")
            ar.open_app(url, quiet=True)   # quiet: the printed URL would put the secret in the log
            while time.time() - ar.HUB_SEEN[0] < idle:   # the browser window cannot tell us it closed: no /api request = gone
                time.sleep(min(2, idle / 4))
            log.info("idle for %ss: exiting", idle)
    finally:
        try:
            stop()   # channel threads, ssh transports' stdin, a keyinstall in progress, the server
        finally:
            run = read_json(run_json, {})
            if run.get("pid") == os.getpid():   # never remove a newer instance's file
                try:
                    run_json.unlink()
                except OSError:
                    pass
            log.info("stopped")
    return code


def selftest():
    import tempfile
    ar.selftest()   # the collector/hub selftest (prints ok)
    for n in ("agent_room.py", "index.html"):
        assert ar.bundle(n).is_file(), "missing bundled file: " + n
    assert b"__AR_TOKEN__" in ar.bundle("index.html").read_bytes()
    if getattr(sys, "frozen", False):   # the installed app must carry paramiko (in-app SSH); a source run without it uses OpenSSH
        assert ar.pm_mod() is not None, "paramiko is not bundled"
        if ar.WIN:
            assert webview is not None, "pywebview is not bundled"
        want = os.environ.get("AR_VERSION")
        assert not want or ar.APP_VERSION == want, (ar.APP_VERSION, want)
    if getattr(sys, "frozen", False) and not ar.WIN:
        print("app lifecycle selftest skipped on non-Windows frozen build")
        return
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        write_private(t / "r.json", {"port": 1, "secret": "s", "token": "t", "pid": 2})
        assert read_json(t / "r.json")["secret"] == "s" and (os.name == "nt" or (t / "r.json").stat().st_mode & 0o777 == 0o600)
        assert not other_instance(t) and load_geometry(t)["width"] == 1280
        write_private(t / "ui.json", {"width": 900, "height": 5, "x": -3})
        assert load_geometry(t) == {"width": 900, "height": 820, "x": -3, "y": None}
        write_private(t / "ui.json", {"width": 900, "height": 700, "x": 5000, "y": 5000})
        old_win = ar.WIN
        try:
            ar.WIN = True
            assert load_geometry(t, [(0, 0, 1920, 1080)]) == {"width": 900, "height": 700, "x": None, "y": None}
            assert rect_intersects(-800, 20, 900, 700, [(0, 0, 1920, 1080)])
        finally:
            ar.WIN = old_win
        # lifecycle with a mocked window: start -> a second launch asks to show -> close -> hub stopped, transports closed, run.json gone
        (t / "cfg").mkdir()
        write_private(t / "cfg" / "channels.json", {"port": 8765, "presets": [], "channels": [{"id": "pc", "name": "pc", "kind": "local"}]})
        res = mock_lifecycle(t / "cfg", t / "state")
        assert res["second_launch_showed"] and res["run_json_gone"] and res["server_closed"], res
        assert res["start_kw"] == {"private_mode": False, "storage_path": str(Path(t) / "state" / "webview")}
    print("app ok")


class FakeWindow:
    width, height, x, y = 1000, 700, 10, 20

    def __init__(self):
        self.shown = 0
        self.events = type("E", (), {"closing": type("H", (), {"__iadd__": lambda s, f: s})()})()

    def restore(self):
        self.shown += 1

    def show(self):
        self.shown += 1


def mock_lifecycle(cfg, state, poke=None):
    """run_app with a fake webview whose start() 'runs the window', pokes the hub, then returns (= the user closed the window)."""
    from urllib.request import urlopen
    out = {}
    win = FakeWindow()

    class FakeWV:
        def create_window(self, title, url, **kw):
            out["url"], out["kw"] = url, kw
            return win

        def start(self, **kw):
            out["start_kw"] = kw
            run = read_json(Path(state) / "run.json")
            out["run"] = dict(run)
            out["second_launch_showed"] = other_instance(state) and _wait(lambda: win.shown >= 1)
            out["page_ok"] = b"ar-token" in urlopen(out["url"], timeout=3).read()
            if poke:
                poke(out, run)
    code = run_app(cfg, state, port=0, win_mod=FakeWV())
    out["code"] = code
    out["run_json_gone"] = not (Path(state) / "run.json").exists()
    try:
        urlopen("http://127.0.0.1:%s/" % out["run"]["port"], timeout=1)
        out["server_closed"] = False
    except OSError:
        out["server_closed"] = True
    return out


def _wait(cond, t=3):
    end = time.time() + t
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def main(argv):
    if argv[1:2] == ["keyinstall"]:   # the hub starts "<this exe> keyinstall ..." in its own console
        return ar.keyinstall(*argv[2:])
    if "--selftest" in argv:   # a windowed exe has no stdout: the result also goes to the log file
        log = setup_logging(ar.state_dir())
        try:
            selftest()
        except BaseException:
            log.exception("selftest FAILED")
            raise
        log.info("selftest ok")
        return 0
    if "--smoke-gui" in argv:
        return run_app(smoke_gui=True)
    return run_app()


if __name__ == "__main__":
    sys.exit(main(sys.argv))

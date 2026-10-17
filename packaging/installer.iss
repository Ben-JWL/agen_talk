; Inno Setup 6 script. MUST stay UTF-8 with BOM (non-ASCII app name). Build from the repo root or anywhere:
;   iscc /DAppVersion=1.2.3 packaging\installer.iss
; Expects the PyInstaller onedir at build\dist\AgentRoom and packaging\agent_room.ico (python packaging\make_icon.py).
; Per-user install, no admin rights. Uninstall keeps %APPDATA%\AgentRoom (your servers and settings).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName      "상황실 (Agent Room)"
#define AppExe       "AgentRoom.exe"
#define AppDirName   "AgentRoom"
#define AppPublisher "Agent Room contributors"

[Setup]
; Stable forever: changing it makes upgrades install side by side instead of over the old version.
AppId={{4FC199D7-0773-43A4-B703-A5E6568B8CA9}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#AppDirName}
DisableProgramGroupPage=yes
DisableDirPage=auto
ShowLanguageDialog=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=agent_room.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
LicenseFile=..\LICENSE
OutputDir=..\release
OutputBaseFilename=AgentRoom-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
; Korean.isl is an unofficial translation: only use it if this Inno Setup install has it.
#define KoreanIsl AddBackslash(CompilerPath) + "Languages\Korean.isl"
#if FileExists(KoreanIsl)
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
#endif

[CustomMessages]
english.DesktopIcon=Create a &desktop shortcut
english.LaunchApp=Start {#AppName}
#if FileExists(KoreanIsl)
korean.DesktopIcon=바탕 화면에 바로 가기 만들기(&D)
korean.LaunchApp={#AppName} 시작
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; Flags: unchecked

[Files]
Source: "..\build\dist\{#AppDirName}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent

; No [UninstallDelete] for %APPDATA%\AgentRoom or %LOCALAPPDATA%\AgentRoom: user data is kept on purpose.

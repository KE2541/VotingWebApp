; ============================================================================
;  Voting System - Windows NSIS Installer
;  Compile with: makensis installer.nsi
;  Download NSIS: https://nsis.sourceforge.io/Download
; ============================================================================

; --- Application metadata ---------------------------------------------------
!define PRODUCT_NAME "Voting System"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "VotingApp"
!define PRODUCT_WEB_SITE "http://localhost:8080"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\start-voting-system.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

; --- Compression & output ---------------------------------------------------
SetCompressor lzma
SetCompressorDictSize 32
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\output\VotingSystem-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES\${PRODUCT_NAME}"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
RequestExecutionLevel admin

; --- Modern UI --------------------------------------------------------------
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Interface settings
!define MUI_ABORTWARNING
!define MUI_ICON "..\assets\icon.ico"
!define MUI_UNICON "..\assets\icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "..\assets\installer-welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "..\assets\installer-header.bmp"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; --- Install Types ----------------------------------------------------------
InstType "Full (XAMPP + App)"
InstType "App Only (requires XAMPP)"

; --- Sections ---------------------------------------------------------------
Section "Voting System Application" SEC_APP
    SectionIn 1 2 RO
    SetOutPath "$INSTDIR"
    SetOverwrite on

    ; Core application files
    File /r "..\..\admin"
    File /r "..\..\api"
    File /r "..\..\assets"
    File /r "..\..\config"
    File /r "..\..\database"
    File /r "..\..\uploads"
    File "..\..\index.php"
    File "..\..\results.php"
    File "..\..\.htaccess"
    File "..\..\favicon.ico"

    ; Create writable directories
    CreateDirectory "$INSTDIR\uploads\faces"
    CreateDirectory "$INSTDIR\uploads\photos"
    AccessControl::GrantOnFile "$INSTDIR\uploads" "(BU)" "FullAccess"
    AccessControl::GrantOnFile "$INSTDIR\config" "(BU)" "FullAccess"

    ; Launcher shortcuts
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Start Voting System.lnk" "$INSTDIR\start-voting-system.exe"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Voting Portal.lnk" "http://127.0.0.1:8080"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Admin Panel.lnk" "http://127.0.0.1:8080/admin"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Results.lnk" "http://127.0.0.1:8080/results.php"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\uninstall.exe"
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\start-voting-system.exe" "" "$INSTDIR\start-voting-system.exe" 0

    ; Registry
    WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\start-voting-system.exe"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\start-voting-system.exe"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoModify" 1
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoRepair" 1
    WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "XAMPP Portable (Apache + PHP + MySQL)" SEC_XAMPP
    SectionIn 1
    SetOutPath "$INSTDIR\xampp"
    SetOverwrite on

    ; Requires a XAMPP portable zip in the build directory
    ; Download from: https://sourceforge.net/projects/xampp/files/XAMPP%20Windows/
    File /ifnewer "xampp-portable.zip"

    ; Extract XAMPP
    nsisunz::UnzipToLog "$INSTDIR\xampp\xampp-portable.zip" "$INSTDIR\xampp"
    Pop $0
    ${If} $0 != "success"
        DetailPrint "XAMPP extraction failed / skipped (error: $0)"
        DetailPrint "Please install XAMPP manually from https://www.apachefriends.org/"
    ${EndIf}

    ; Configure XAMPP paths
    File "setup-xampp.bat"
SectionEnd

; --- Post-install -----------------------------------------------------------
Section - "Additional Configuration"
    SectionIn 1 2

    ; Generate the launcher
    SetOutPath "$INSTDIR"
    File "..\..\installer\windows\start-voting-system.bat"

    ; Convert .bat to .exe using iexpress (built into Windows)
    ; Or just ship the .bat directly
SectionEnd

; --- Uninstaller ------------------------------------------------------------
Section "Uninstall"
    RMDir /r "$INSTDIR"
    RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
    DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
SectionEnd

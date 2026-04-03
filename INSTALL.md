# Installing Loom

Loom supports **Windows**, **macOS**, and **Linux (Ubuntu)**.

## Quick Install

### macOS (Intel & Apple Silicon)

```bash
# Download latest release
curl -L -o loom-macos.dmg https://github.com/candicetinamartins/loom/releases/latest/download/loom-macos-arm64.dmg

# Or for Intel Macs:
# curl -L -o loom-macos.dmg https://github.com/candicetinamartins/loom/releases/latest/download/loom-macos-x64.dmg

# Install
open loom-macos.dmg
# Drag Loom to Applications folder
```

### Windows

```powershell
# Download latest release
Invoke-WebRequest -Uri "https://github.com/candicetinamartins/loom/releases/latest/download/loom-windows-x64.exe" -OutFile "loom-setup.exe"

# Run installer
.\loom-setup.exe
```

Or download `.msi` for enterprise deployment:
```powershell
Invoke-WebRequest -Uri "https://github.com/candicetinamartins/loom/releases/latest/download/loom-windows-x64.msi" -OutFile "loom.msi"
msiexec /i loom.msi /quiet
```

### Linux (Ubuntu/Debian)

```bash
# Download latest release
wget https://github.com/candicetinamartins/loom/releases/latest/download/loom-linux-x64.deb

# Install
sudo dpkg -i loom-linux-x64.deb
sudo apt-get install -f  # Fix any missing dependencies

# Or use AppImage (portable, no install needed):
wget https://github.com/candicetinamartins/loom/releases/latest/download/loom-linux-x64.AppImage
chmod +x loom-linux-x64.AppImage
./loom-linux-x64.AppImage
```

### Linux (RPM-based: Fedora, RHEL, CentOS)

```bash
wget https://github.com/candicetinamartins/loom/releases/latest/download/loom-linux-x64.rpm
sudo rpm -i loom-linux-x64.rpm
```

---

## Build from Source

### Prerequisites

- **Node.js 20+**
- **npm** or **yarn**
- **Git**

### All Platforms

```bash
# Clone repository
git clone https://github.com/candicetinamartins/loom.git
cd loom

# Install dependencies
npm ci

# Build all packages
npm run build --workspaces

# Build Electron app
cd packages/loom-electron
npm run package
```

### Platform-Specific Builds

#### macOS

```bash
./scripts/build.sh darwin arm64  # Apple Silicon
./scripts/build.sh darwin x64    # Intel
```

#### Windows

```batch
scripts\build.bat win32 x64
```

#### Linux

```bash
./scripts/build.sh linux x64
```

---

## Post-Installation

### First Launch

1. Launch Loom from your applications menu or dock
2. On first launch, Loom will create a `.loom` directory in your home folder
3. Configure your LLM API keys in **Settings → LLM Providers**

### Supported LLM Providers

- **Anthropic** (Claude) - API key from https://console.anthropic.com
- **OpenAI** (GPT) - API key from https://platform.openai.com
- **Ollama** (local models) - Install from https://ollama.com
- **SAIA** (GWDG Academic Cloud) - API key from https://kisski.gwdg.de

### Configuration File

Edit `~/.loom/settings.toml`:

```toml
[models]
default = "claude-sonnet-4-5"

[models.anthropic]
# API key stored in OS keychain

[models.openai]
# API key stored in OS keychain

[models.ollama]
baseUrl = "http://localhost:11434"

[models.saia]
baseUrl = "https://chat-ai.academiccloud.de/v1"
```

---

## Troubleshooting

### macOS: "App can't be opened because it is from an unidentified developer"

1. Right-click the Loom app
2. Select **Open**
3. Click **Open** in the dialog

Or via terminal:
```bash
xattr -cr /Applications/Loom.app
```

### Windows: SmartScreen Warning

Click **More info** → **Run anyway**

For enterprise deployment, the `.msi` installer is signed.

### Linux: Missing Dependencies

```bash
# Ubuntu/Debian
sudo apt-get install -f

# Or manually install required libraries
sudo apt-get install libgtk-3-0 libnss3 libasound2
```

### All Platforms: Native Module Errors

If you see errors about `@vela-engineering/kuzu` or `keytar`:

```bash
# Rebuild native modules for your platform
npm run rebuild:native
```

---

## Uninstall

### macOS

```bash
rm -rf /Applications/Loom.app
rm -rf ~/.loom
```

### Windows

Use **Add or Remove Programs** in Windows Settings, or:
```powershell
& "C:\Program Files\Loom\uninstall.exe"
```

### Linux

```bash
# Debian/Ubuntu
sudo dpkg -r loom

# RPM
sudo rpm -e loom

# Remove config
rm -rf ~/.loom
```

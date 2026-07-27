# 4U2CtheUVC

An experimental macOS control panel and monitoring view for UVC webcams, developed primarily for the Razer Kiyo Pro Ultra. It provides direct camera controls without requiring Razer Synapse, plus a live preview, waveform, vectorscope, false color, and a configurable skin-tone qualifier.

> **Status: early alpha.** The Razer Kiyo Pro Ultra is the primary tested camera. Other UVC cameras may expose a useful subset of controls, but compatibility varies by device and firmware.

## Features

- Manual UVC controls for exposure, gain, focus, white balance, image adjustments, zoom, pan, and tilt when supported by the camera
- Kiyo Pro Ultra exposure control through a native macOS IOKit helper
- Camera-verified Kiyo shutter stops rather than ineffective intermediate values
- Live preview with a selectable requested frame rate
- Waveform and vectorscope
- False-color exposure view with a practical skin-luma guide
- Skin-tone qualification with qualified pixels routed to the scopes
- Camera presets stored locally
- Local-only server bound to `127.0.0.1`

## Compatibility

| Platform or camera | Status |
| --- | --- |
| macOS 12 or newer | Supported target |
| Apple Silicon Mac | Tested |
| Intel Mac | Installer attempts a universal native build; needs real-world testing |
| Razer Kiyo Pro Ultra (`1532:0e08`) | Primary supported camera |
| Other standard UVC cameras | Experimental; available controls depend on the device |
| Windows or Linux | Not supported by the current native helper and installer |

The native Kiyo workaround is deliberately enabled only for the Kiyo Pro Ultra USB vendor/product ID. Other cameras continue to use the standard `uvcc` path.

## Requirements

- macOS 12 or newer
- Node.js 20 or newer, including `npm`
- Apple Command Line Tools for compiling the native helper
- A browser with camera permission for `http://localhost:3847`

Install the Apple Command Line Tools, if needed, with:

```sh
xcode-select --install
```

## Install from source

Download or clone this repository, open Terminal in the project folder, and run:

```sh
./scripts/install.sh
```

The installer:

1. Installs the locked Node dependencies.
2. Copies the runtime to `~/Library/Application Support/4U2CtheUVC/app`.
3. Compiles the native UVC helper locally, preferring a universal Apple Silicon/Intel binary.
4. Creates a user launch agent—no administrator password required.
5. Creates `~/Applications/4U2CtheUVC.app` and opens it.

Presets are stored separately in `~/Library/Application Support/4U2CtheUVC/data`, so reinstalling does not overwrite them.

The first preview launch should prompt for camera permission. If the preview does not appear, allow camera access for the browser in **System Settings → Privacy & Security → Camera**, then refresh the page.

## Uninstall

From the project folder:

```sh
./scripts/uninstall.sh
```

This preserves presets and saved data. To remove those as well:

```sh
./scripts/uninstall.sh --purge-data
```

## Development

Install dependencies and run the local server:

```sh
npm ci
npm start
```

Then open `http://localhost:3847`. Generic UVC controls work without the native helper. For Kiyo exposure testing, use `./scripts/install.sh`, which builds and installs the helper in the expected runtime location.

Basic checks:

```sh
npm run check
bash -n scripts/install.sh scripts/uninstall.sh scripts/app-launcher
plutil -lint packaging/Info.plist scripts/io.github.4u2ctheuvc.server.plist
```

## Known limitations

- The generated app is currently unsigned and not notarized. It is intended for source installs, not yet as a polished downloadable application.
- Exposure values reported as continuous by the Kiyo are internally quantized. The UI therefore exposes only the shutter stops observed to affect the image.
- Requested preview frame rates are subject to the formats and frame rates negotiated by macOS and the browser.
- Other camera applications can change settings behind 4U2CtheUVC. Quit competing camera-control utilities when diagnosing inconsistent behavior.
- USB terminal and control behavior can differ between camera models; please include the camera model and USB vendor/product ID with compatibility reports.

## Privacy and security

4U2CtheUVC does not upload video or settings. The preview remains in the browser, and the control server listens only on the local loopback interface. Presets and logs remain under your macOS user Library folder.

## Why the native helper exists

On the Kiyo Pro Ultra, ordinary libusb writes can report a successful exposure value without changing the active macOS video stream. The small IOKit helper sends the standard UVC class request through the macOS USB interface used by the live camera stack. See [Technical Notes](docs/TECHNICAL_NOTES.md) for the implementation details and current hardware findings.

## License

MIT. See [LICENSE](LICENSE).

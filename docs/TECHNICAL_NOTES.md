# Technical Notes

## Architecture

4U2CtheUVC has three small layers:

1. `public/index.html` owns the browser preview, controls UI, scopes, and view filters.
2. `server.js` exposes a localhost-only JSON API and serializes camera-control operations.
3. `native/uvc_iokit.cpp` provides the macOS exposure-write path needed by the Razer Kiyo Pro Ultra.

Generic controls use the `uvcc` package. The native helper is selected only for `absolute_exposure_time` when the connected device has Razer vendor ID `0x1532` and Kiyo Pro Ultra product ID `0x0e08`.

## Kiyo exposure behavior

UVC absolute exposure time is represented in 100-microsecond units. For example:

| Native value | Nominal shutter time |
| ---: | ---: |
| 78 | 1/128 second |
| 156 | 1/64 second |
| 312 | 1/32 second |
| 625 | 1/16 second |
| 1250 | 1/8 second |

The Kiyo reports a nominal range of 3–2047 with a resolution of 1 and reads arbitrary writes back successfully. Testing showed that most intermediate values do not produce a corresponding image change. The camera behaves as though exposure is selected from an internal shutter table. Logi Tune presents the same behavior as hard stops at base-two shutter intervals.

Native value 208, nominally about 1/48 second (a "film-like" shutter speed for 24 fps motion picture film), was tested but produced the same image exposure as 156. It is therefore intentionally not exposed as a distinct stop.

## Native request

The helper enumerates the camera's `IOUSBHostInterface` VideoControl interface and sends standard UVC Camera Terminal requests on control pipe zero:

- Auto Exposure Mode Control, selector `0x02`, set to manual mode `1`
- Exposure Time (Absolute) Control, selector `0x04`, four-byte little-endian value
- Camera terminal unit ID `1` for the tested Kiyo Pro Ultra

The helper reads the exposure value back after writing it. The server also performs a delayed readback and logs the selected transport and resulting value.

## Portability boundaries

- The native helper uses macOS IOKit and is not portable to Windows or Linux as written.
- Camera terminal unit ID `1` is verified for the tested Kiyo but must not be assumed for unrelated cameras.
- The installer builds the helper on the destination Mac to avoid depending solely on a checked-in machine-specific binary.
- Browser camera permission and preview-format negotiation remain browser/macOS responsibilities.

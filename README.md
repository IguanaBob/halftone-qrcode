# halftone-qrcode

A browser-based generator for **halftone QR codes**: QR codes that show an image while still scanning like a normal code.

Drop in a picture, crop it, tune a few settings, and download the result as a PNG. Everything runs in your browser. Nothing is uploaded, and no external resources are loaded, so it works fully offline.

## Usage

1. Open `index.html` in a browser. It forwards to `public/index.html`, where the app lives. No build step or server is needed.
2. Drag an image onto the page, or use the file picker (which also works on phones).
3. Crop and zoom the image in the crop box.
4. Enter the text or URL to encode, then adjust the options. The preview updates as you go.
5. Click the generated QR code to download it as `qr.png`.

### Options

| Option | What it does |
| --- | --- |
| Redundancy | QR error-correction level, from Low (7%) to High (30%). Higher levels leave more room for the image and still scan reliably. |
| QR size | QR version, from 1 to 40, or 0 to pick the smallest size that fits the text. Larger versions hold more data and give more detail. |
| Quality | Pixels per sub-module, from 1 to 20. Higher values give a bigger, more detailed output. |
| Block size | Sub-modules per side of each QR module, from 1 to 9. **3 is recommended** for reliable scanning. |
| Rotation | The Left and Right buttons turn the QR pattern 90° at a time while the image stays upright; the current angle is shown beside them. Use it to choose which three corners get the large finder squares, for example to keep them off a face. Codes scan at any rotation. |
| Background type | What shows where the image is transparent: nothing, fine noise, or large noise. |
| White border | Adds the 4-module blank margin (quiet zone) that the QR standard requires. Leave it on unless you add your own margin. |
| Pixelation | Pixelates the image before it is combined with the code. |
| Greyscale | Desaturates the image by an adjustable amount. |
| Dithering | Atkinson dithering on the sub-module grid, with an adjustable threshold. Turn off Black and white to see its effect. |
| Black and white | Converts the image to pure black and white at an adjustable threshold. |

Effects are applied in the order listed. If a setting can't work (for example, the text is too long for the chosen QR size), the page shows a message explaining what to change.

Always test the result with a phone or two before using it. Aggressive settings can make a code unscannable.

## Project layout

```
index.html              Forwards to public/index.html
public/                 The app (also the Firebase Hosting root)
  index.html            The app page
  halftoneqr2.js        Image processing and halftone rendering
  style.css             Page styles
  sample-image.js       Startup sample image, embedded as a data URL
  qrcodenew.js          QR encoder (Kazuhiko Arase, MIT, lightly modified)
  croppie.min.js/.css   Croppie 2.6.4 image cropper (bundled, see below)
  mona-lisa.webp        The sample image as a file (public domain)
```

The sample image is embedded in `sample-image.js` rather than loaded from `mona-lisa.webp` because browsers block downloading canvases that contain images loaded from `file://` pages.

## Changes in this fork

- **Fully offline.** Croppie used to load from a CDN; it is now bundled (see below).
- **Removed `qrcode_disney.jpg`.** This unused sample image was a photo of Disney advertising posters with Disney's logos and characters, and its photographer is unknown. It was removed to keep only material that is clearly safe to redistribute. It remains in the git history.
- **Bug fixes.** Greyscale now works; dithering now spreads error to the right neighbours; Pixelation at 100 no longer stops rendering; block sizes other than 3 now place the data dot correctly; dropping something that isn't an image shows a message instead of failing.
- **Standard orientation and rotation.** Codes used to be drawn mirrored (rows and columns swapped), which most phone scanners tolerate but the QR standard doesn't allow. They are now drawn the standard way, with a Rotation option to move the finder squares.
- **Quiet zone.** Codes get the standard white border by default, so they scan on dark or busy backgrounds.
- **Clear errors.** Invalid settings, text too long for the QR size, and oversized output now show a message instead of silently freezing the preview.
- **Usability.** File picker for phones, faster updates (rendered shortly after the last change instead of every 500 ms), number fields, labelled controls, and a layout that fits narrow screens.
- **Cleanup.** One copy of the app page instead of two that had drifted apart, removed the old generator version and Firebase placeholder pages, and removed unused code.
- **No jQuery.** The app uses plain browser APIs; the 247KB jQuery 2.1.1 file is gone.

## Third-party code

All dependencies are included in this repository, so the app makes no network requests.

- **[Croppie](https://github.com/Foliotek/Croppie) 2.6.4**: an image cropping library from Foliotek Inc., used for the crop and zoom box. It used to load from a CDN; it is now bundled as `public/croppie.min.js` and `public/croppie.min.css`. The JS is byte-identical to the npm release. MIT licensed; see [`public/croppie.LICENSE`](public/croppie.LICENSE).
- **QR Code Generator for JavaScript** by Kazuhiko Arase. MIT licensed; the notice is in the file header.

## Background

Halftone QR codes come from the SIGGRAPH Asia 2013 paper *[Halftone QR Codes](http://vecg.cs.ucl.ac.uk/Projects/SmartGeometry/halftone_QR/halftoneQR_sigga13.html)* by Chu et al. Each QR module is split into a grid of sub-modules. Only the center sub-module has to match the QR data; the rest can follow the image.

## Credits

- [Original version](https://jsfiddle.net/lachlan/r8qWV/) by [Lachlan Arthur](http://lach.la)
- Extended by [Jason Butler](https://github.com/nythrox) (live version: <https://nythrox.github.io/halftone-qrcode/>)
- This fork, including the offline bundling of Croppie: Jonathan Hull, with help from [Claude](https://claude.com/claude-code) (Anthropic's AI assistant)

## License

MIT. See [LICENSE](LICENSE).

# halftone-qrcode

A browser-based generator for **halftone QR codes**: QR codes that show an image while still scanning like a normal code.

Drop in a picture, crop it, tune a few settings, and download the result as a PNG. Everything runs in your browser. Nothing is uploaded, and no external resources are loaded, so it works fully offline.

**Try it online:** <https://iguanabob.github.io/halftone-qrcode/>

> **Note:** This tool runs entirely locally in your browser. Your images and text are never uploaded. You are responsible for making sure you have the rights to use any image you put in a QR code.

## Usage

1. Open `index.html` in a browser. It forwards to `public/index.html`, where the app lives. No build step or server is needed.
2. Drag an image onto the page, or use the file picker (which also works on phones).
3. Crop the image in the crop box: drag to move it, and zoom with the slider, mouse wheel or a pinch. Zooming out past the edges leaves the uncovered area transparent. With the crop box selected, the arrow keys move the image, + and - zoom, and 0 resets the crop.
4. Enter the text or URL to encode, then adjust the options. The preview updates as you go.
5. Click the generated QR code to download it as `qr.png`.

### Options

| Option | What it does |
| --- | --- |
| Redundancy | QR error-correction level, from Low (7%) to High (30%). Higher levels leave more room for the image and still scan reliably. |
| QR size | QR version, from 1 to 40. Larger versions hold more data and give more detail. The slider grows automatically when the text needs a bigger code and shrinks back as the text gets shorter, but never below the size you chose. Drag it fully left to always use the smallest size that fits. |
| Quality | Pixels per sub-module, from 1 to 20. Higher values give a bigger, more detailed output. |
| Block size | Sub-modules per side of each QR module, from 1 to 9. **3 is recommended** for reliable scanning. |
| Dot size | Size of the data dot in the center of each module, from 10% to 100% of the module. Bigger dots scan more reliably; smaller dots let more of the image show. The default, 33%, is one sub-module at block size 3. The corner and timing patterns are always solid. |
| Rotation | The Left and Right buttons turn the QR pattern 90° at a time while the image stays upright; the current angle is shown beside them. Use it to choose which three corners get the large finder squares, for example to keep them off a face. Codes scan at any rotation. |
| Background type | What shows where the image is transparent: nothing, fine noise, or large noise. |
| White border | Adds the 4-module blank margin (quiet zone) that the QR standard requires. Leave it on unless you add your own margin. |
| Pixelation | Pixelates the image before it is combined with the code. |
| Grayscale | Desaturates the image by an adjustable amount. |
| Dithering | Atkinson dithering on the sub-module grid, with an adjustable threshold. Turn off Black and white to see its effect. |
| Black and white | Converts the image to pure black and white at an adjustable threshold. |

**Reset options to defaults** puts every option above back to its starting value. Your text and image are kept, except that an empty text box goes back to the default text (the project link). The same happens when the page is reloaded.

Effects are applied in the order listed. If a setting can't work (for example, the text is too long for the chosen QR size), the page shows a message explaining what to change.

Under the preview, a **simulated scan** estimates whether a phone could read the code. It shrinks and slightly blurs the image as a camera would, converts it to black and white the way scanner apps do, reads every module, and checks whether error correction could fix the mistakes. It reports how much of the error correction was needed, or which blocks would fail. It can't model lighting, glare, angle, distance or print quality, so always test the result with a phone or two before using it. Aggressive settings can make a code unscannable.

## Project layout

```
index.html              Forwards to public/index.html
public/                 The app
  index.html            The app page
  app.js                Image processing and halftone rendering
  png-encoder.js        PNG export that picks the smallest correct format
  cropper.js            Crop box: drag, zoom, pinch and keyboard
  scan-check.js         Simulated scan shown under the preview
  style.css             Page styles
  sample-image.js       Startup sample image, embedded as a data URL
  qrcode.js             QR encoder (Kazuhiko Arase, MIT, lightly modified)
  mona-lisa.webp        The sample image as a file (public domain)
```

The sample image is embedded in `sample-image.js` rather than loaded from `mona-lisa.webp` because browsers block downloading canvases that contain images loaded from `file://` pages.

## Changes in this fork

- **Fully offline, with a built-in cropper.** The app used the Croppie library, loaded from a CDN, for cropping. It was first bundled locally and has now been replaced by a small cropper written for this app (`cropper.js`), so there are no third-party files besides the QR encoder. The new cropper supports drag, wheel and pinch zoom, and keyboard control.
- **Removed `qrcode_disney.jpg`.** This unused sample image was a photo of Disney advertising posters with Disney's logos and characters, and its photographer is unknown. It was removed to keep only material that is clearly safe to redistribute. It remains in the git history.
- **Bug fixes.** Grayscale now works; dithering now spreads error to the right neighbors; Pixelation at 100 no longer stops rendering; block sizes other than 3 now place the data dot correctly; dropping something that isn't an image shows a message instead of failing.
- **Standard orientation and rotation.** Codes used to be drawn mirrored (rows and columns swapped), which most phone scanners tolerate but the QR standard doesn't allow. They are now drawn the standard way, with a Rotation option to move the finder squares.
- **Quiet zone.** Codes get the standard white border by default, so they scan on dark or busy backgrounds.
- **Clear errors.** Invalid settings, text too long for the QR size, and oversized output now show a message instead of silently freezing the preview.
- **Usability.** File picker for phones, faster updates (rendered shortly after the last change instead of every 500 ms), sliders with their values shown, a QR size that grows and shrinks to fit the text, labeled controls, and a layout that fits narrow screens.
- **Cleanup.** One copy of the app page instead of two that had drifted apart, removed the old generator version, the Firebase placeholder pages and Firebase Hosting config, and removed unused code.
- **Right-sized PNGs.** Downloads are saved in the smallest correct PNG format for their content: a 1-bit bitmap for opaque black and white, an indexed palette for few colors (black, white and transparent fit in 2 bits), grayscale for gray images, and full color only when needed. With default settings this cuts the file from about 16 KB to about 2 KB. The Black and white and Dithering effects now also make each pixel fully opaque or fully transparent, so their output really is two-tone. The format and size are shown under the code. Browsers without `CompressionStream` fall back to a standard full-color PNG.
- **PNG metadata.** Downloaded PNGs include `Software` and `Comment` text fields linking back to this project.
- **Adjustable dot size.** A Dot size slider sets how big the data dots are, trading scan reliability against how much of the image shows.
- **Reset button.** One click puts every option back to its default, keeping your text and image.
- **Any language.** Text is encoded as UTF-8, so accented letters, non-Latin scripts and emoji scan correctly. They used to come out garbled.
- **Clearer file names.** `halftoneqr2.js` is now `app.js` and `qrcodenew.js` is now `qrcode.js`.
- **Simulated scan.** The page estimates whether the code will scan and warns about settings that break it, with no extra library.
- **No jQuery.** The app uses plain browser APIs; the 247 KB jQuery 2.1.1 file is gone.

## Third-party code

The only dependency is included in this repository, so the app makes no network requests.

- **QR Code Generator for JavaScript** by Kazuhiko Arase. MIT licensed; the notice is in the file header.

## Background

Halftone QR codes come from the SIGGRAPH Asia 2013 paper *[Halftone QR Codes](https://doi.org/10.1145/2508363.2508408)* by Chu et al. (the project page is gone, but there are archived copies of the [project page](https://web.archive.org/web/20250630204225/http://vecg.cs.ucl.ac.uk/Projects/SmartGeometry/halftone_QR/halftoneQR_sigga13.html) and the [PDF](https://web.archive.org/web/20260514163259/http://vecg.cs.ucl.ac.uk/Projects/SmartGeometry/halftone_QR/paper_docs/halftoneQR_sigga13.pdf)). Each QR module is split into a grid of sub-modules. Only the center sub-module has to match the QR data; the rest can follow the image.

Further reading: [如何优雅地让人给你打钱](https://zhuanlan.zhihu.com/p/20728355) ("How to elegantly get people to pay you"), a Chinese article on Zhihu about making halftone QR codes ([archived copy](https://web.archive.org/web/20221224191612/https://zhuanlan.zhihu.com/p/20728355)).

## Credits

- [Original version](https://jsfiddle.net/lachlan/r8qWV/) by [Lachlan Arthur](http://lach.la)
- Extended by [Jason Butler](https://github.com/nythrox) (live version: <https://nythrox.github.io/halftone-qrcode/>)
- This fork: Jonathan Hull, with help from [Claude](https://claude.com/claude-code) (Anthropic's AI assistant)

## License

MIT. See [LICENSE](LICENSE). Lachlan Arthur's [original version](https://jsfiddle.net/lachlan/r8qWV/) was also released under the MIT license, so his copyright notice is included alongside Jason Butler's and Jonathan Hull's.

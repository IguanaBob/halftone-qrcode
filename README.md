# halftone-qrcode

A browser-based generator for **halftone QR codes**: QR codes that show an image while still scanning like a normal code.

Drop in a picture, crop it, tune a few settings, and download the result as a PNG. Everything runs in your browser. Nothing is uploaded, and no external resources are loaded, so it works fully offline.

## Usage

1. Open `index.html` in a browser. No build step or server is needed.
2. Drag an image onto the page.
3. Crop and zoom the image in the crop box.
4. Enter the text or URL to encode, then adjust the options. The preview updates as you go.
5. Click the generated QR code to download it as `qr.png`.

### Options

| Option | What it does |
| --- | --- |
| Redundancy | QR error-correction level, from Low (7%) to High (30%). Higher levels leave more room for the image and still scan reliably. |
| QR size | QR version, from 1 to 40. Larger versions hold more data and give more detail. |
| Quality | Pixels per sub-module. Higher values give a bigger, more detailed output. |
| Block size | Sub-modules per QR module. **3 is recommended** for reliable scanning. |
| Background type | What fills the space around the image: transparent, fine noise, or large noise. |
| Pixelation | Pixelates the image before it is combined with the code. |
| Dithering | Applies threshold dithering. |
| Black and white | Converts the image to black and white at an adjustable threshold. |
| Greyscale | Desaturates the image by an adjustable amount. |

Always test the result with a phone or two before using it. Aggressive settings can make a code unscannable.

## Project layout

```
index.html              Main app; open this locally
public/                 Static assets (also the Firebase Hosting root)
  index.html            Copy of the app with paths relative to public/
  halftoneqr2.js        Image processing and halftone rendering
  qrcodenew.js          QR encoder (Kazuhiko Arase, MIT)
  croppie.min.js/.css   Croppie 2.6.4 image cropper (bundled, see below)
  jquery-2.1.1.js       jQuery (MIT)
  halftoneQR.html       Older version of the generator, kept for reference
  mona-lisa.webp        Sample image to try the generator with (public domain)
```

## Changes in this fork

- **Fully offline.** Croppie used to load from a CDN; it is now bundled (see below).
- **Removed `qrcode_disney.jpg`.** This unused sample image was a photo of Disney advertising posters with Disney's logos and characters, and its photographer is unknown. It was removed to keep only material that is clearly safe to redistribute. It remains in the git history.

## Third-party code

All dependencies are included in this repository, so the app makes no network requests.

- **[Croppie](https://github.com/Foliotek/Croppie) 2.6.4**: an image cropping library from Foliotek Inc., used for the crop and zoom box. It used to load from a CDN; it is now bundled as `public/croppie.min.js` and `public/croppie.min.css`. The JS is byte-identical to the npm release. MIT licensed; see [`public/croppie.LICENSE`](public/croppie.LICENSE).
- **QR Code Generator for JavaScript** by Kazuhiko Arase. MIT licensed; the notice is in the file header.
- **jQuery 2.1.1**. MIT licensed; the notice is in the file header.

## Background

Halftone QR codes come from the SIGGRAPH Asia 2013 paper *[Halftone QR Codes](http://vecg.cs.ucl.ac.uk/Projects/SmartGeometry/halftone_QR/halftoneQR_sigga13.html)* by Chu et al. Each QR module is split into a grid of sub-modules. Only the center sub-module has to match the QR data; the rest can follow the image.

## Credits

- [Original version](https://jsfiddle.net/lachlan/r8qWV/) by [Lachlan Arthur](http://lach.la)
- Extended by [Jason Butler](https://github.com/nythrox) (live version: <https://nythrox.github.io/halftone-qrcode/>)
- This fork, including the offline bundling of Croppie: Jonathan Hull, with help from [Claude](https://claude.com/claude-code) (Anthropic's AI assistant)

## License

MIT. See [LICENSE](LICENSE).

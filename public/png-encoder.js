// PNG encoder that picks the smallest correct format for a canvas:
//
//   only black and white, opaque   -> 1-bit grayscale (a true bitmap)
//   up to 16 colors                -> 1/2/4-bit indexed palette (+ tRNS)
//   only grays, opaque             -> 8-bit grayscale
//   up to 256 colors               -> 8-bit indexed palette (+ tRNS)
//   only grays, with transparency  -> 8-bit grayscale + alpha
//   anything else                  -> 8-bit RGB or RGBA
//
// Browsers always export canvases as 8-bit RGBA, which wastes space for the
// mostly two-tone images this app makes. Compression uses the built-in
// CompressionStream; where that is missing, the browser's own PNG export is
// used instead. Both paths add tEXt metadata chunks.

var PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

var CRC_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  var crc = 0xffffffff;
  for (var i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Latin-1 string to bytes (PNG chunk types and tEXt are Latin-1).
function latin1Bytes(text) {
  var bytes = new Uint8Array(text.length);
  for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function pngChunk(type, data) {
  var chunk = new Uint8Array(12 + data.length);
  var view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(latin1Bytes(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function textChunks(metadata) {
  return Object.keys(metadata || {}).map(function (key) {
    return pngChunk("tEXt", latin1Bytes(key + "\0" + metadata[key]));
  });
}

// Looks at every pixel and decides the PNG color type and bit depth.
function choosePngFormat(data) {
  var opaque = true;
  var gray = true;
  var colors = new Map(); // key -> [r, g, b, a]
  var tooMany = false;

  for (var i = 0; i < data.length; i += 4) {
    var a = data[i + 3];
    if (a !== 255) opaque = false;
    if (a !== 0 && !(data[i] === data[i + 1] && data[i + 1] === data[i + 2])) {
      gray = false;
    }
    if (!tooMany) {
      // All fully transparent pixels count as one color.
      var key = a === 0 ? 0 :
        ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | a) >>> 0;
      if (!colors.has(key)) {
        colors.set(key, a === 0 ? [0, 0, 0, 0] : [data[i], data[i + 1], data[i + 2], a]);
        if (colors.size > 256) tooMany = true;
      }
    }
  }

  var BLACK = 0x000000ff;
  var WHITE = 0xffffffff;
  var bitmap = opaque && !tooMany && Array.from(colors.keys()).every(function (k) {
    return k === BLACK || k === WHITE;
  });

  if (bitmap) return { colorType: 0, bitDepth: 1, name: "1-bit black and white" };
  if (!tooMany && colors.size <= 16) return paletteFormat(colors);
  if (gray && opaque) return { colorType: 0, bitDepth: 8, name: "8-bit grayscale" };
  if (!tooMany) return paletteFormat(colors);
  if (gray) return { colorType: 4, bitDepth: 8, name: "8-bit grayscale with transparency" };
  if (opaque) return { colorType: 2, bitDepth: 8, name: "24-bit color" };
  return { colorType: 6, bitDepth: 8, name: "32-bit color with transparency" };
}

function paletteFormat(colors) {
  var size = colors.size;
  var bitDepth = size <= 2 ? 1 : size <= 4 ? 2 : size <= 16 ? 4 : 8;
  // Translucent entries first, so the tRNS chunk can stop early.
  var keys = Array.from(colors.keys()).sort(function (x, y) {
    return (colors.get(x)[3] === 255) - (colors.get(y)[3] === 255);
  });
  var index = new Map();
  keys.forEach(function (k, i) { index.set(k, i); });
  return {
    colorType: 3,
    bitDepth: bitDepth,
    name: bitDepth + "-bit indexed (" + size + " colors)",
    palette: keys.map(function (k) { return colors.get(k); }),
    index: index,
  };
}

// Channels per pixel for each color type.
var PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// Builds the unfiltered bytes of one row in the chosen format.
function packRow(data, width, y, format, out) {
  var bits = format.bitDepth;
  var start = y * width * 4;
  out.fill(0);

  if (bits < 8) {
    for (var x = 0; x < width; x++) {
      var i = start + x * 4;
      var value;
      if (format.colorType === 0) {
        value = data[i] >= 128 ? 1 : 0;
      } else {
        var a = data[i + 3];
        var key = a === 0 ? 0 :
          ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | a) >>> 0;
        value = format.index.get(key);
      }
      var bitPos = x * bits;
      out[bitPos >> 3] |= value << (8 - bits - (bitPos & 7));
    }
    return;
  }

  var o = 0;
  for (var px = 0; px < width; px++) {
    var j = start + px * 4;
    var alpha = data[j + 3];
    switch (format.colorType) {
      case 0: out[o++] = data[j]; break;
      case 3:
        out[o++] = format.index.get(alpha === 0 ? 0 :
          ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | alpha) >>> 0);
        break;
      case 4: out[o++] = alpha === 0 ? 0 : data[j]; out[o++] = alpha; break;
      case 2: out[o++] = data[j]; out[o++] = data[j + 1]; out[o++] = data[j + 2]; break;
      case 6:
        if (alpha === 0) { out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; }
        else { out[o++] = data[j]; out[o++] = data[j + 1]; out[o++] = data[j + 2]; out[o++] = alpha; }
        break;
    }
  }
}

function paeth(a, b, c) {
  var p = a + b - c;
  var pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Applies PNG filter `type` to a row, writing into out.
function filterRow(type, row, prev, bpp, out) {
  for (var i = 0; i < row.length; i++) {
    var left = i >= bpp ? row[i - bpp] : 0;
    var up = prev[i];
    var upLeft = i >= bpp ? prev[i - bpp] : 0;
    var predictor =
      type === 0 ? 0 :
      type === 1 ? left :
      type === 2 ? up :
      type === 3 ? (left + up) >> 1 :
      paeth(left, up, upLeft);
    out[i] = (row[i] - predictor) & 0xff;
  }
}

// Returns the filtered image data (one filter byte per row).
function filterImage(data, width, height, format) {
  var channels = PNG_CHANNELS[format.colorType];
  var rowBytes = Math.ceil((width * channels * format.bitDepth) / 8);
  var bpp = Math.max(1, (channels * format.bitDepth) >> 3);
  // Filters rarely help indexed or sub-byte images; try all five otherwise.
  var adaptive = format.colorType !== 3 && format.bitDepth === 8;

  var result = new Uint8Array(height * (rowBytes + 1));
  var row = new Uint8Array(rowBytes);
  var prev = new Uint8Array(rowBytes);
  var candidate = new Uint8Array(rowBytes);
  var best = new Uint8Array(rowBytes);

  for (var y = 0; y < height; y++) {
    packRow(data, width, y, format, row);
    var bestType = 0;
    if (adaptive) {
      var bestScore = Infinity;
      for (var type = 0; type < 5; type++) {
        filterRow(type, row, prev, bpp, candidate);
        var score = 0;
        for (var i = 0; i < rowBytes; i++) {
          score += candidate[i] < 128 ? candidate[i] : 256 - candidate[i];
        }
        if (score < bestScore) {
          bestScore = score;
          bestType = type;
          best.set(candidate);
        }
      }
    } else {
      best.set(row);
    }
    var offset = y * (rowBytes + 1);
    result[offset] = bestType;
    result.set(best, offset + 1);
    var swap = prev; prev = row; row = swap;
  }
  return result;
}

// zlib-compresses bytes with the browser's built-in CompressionStream.
function zlibCompress(bytes) {
  var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Response(stream).arrayBuffer().then(function (buffer) {
    return new Uint8Array(buffer);
  });
}

// The browser's own PNG export with metadata inserted after IHDR.
function browserPng(canvas, metadata) {
  var binary = atob(canvas.toDataURL("image/png").split(",")[1]);
  var png = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) png[i] = binary.charCodeAt(i);
  var afterHeader = 8 + 25; // signature + IHDR chunk
  var parts = [png.subarray(0, afterHeader)]
    .concat(textChunks(metadata))
    .concat([png.subarray(afterHeader)]);
  return {
    blob: new Blob(parts, { type: "image/png" }),
    format: "32-bit color with transparency",
  };
}

// Encodes a canvas as a PNG Blob with tEXt metadata. Resolves to
// { blob, format } where format describes the chosen PNG type.
function encodePng(canvas, metadata) {
  if (typeof CompressionStream === "undefined") {
    return Promise.resolve(browserPng(canvas, metadata));
  }

  var width = canvas.width;
  var height = canvas.height;
  var data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  var format = choosePngFormat(data);

  var header = new Uint8Array(13);
  var view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = format.bitDepth;
  header[9] = format.colorType;
  // Bytes 10-12: compression, filter and interlace methods, all 0.

  var chunks = [new Uint8Array(PNG_SIGNATURE), pngChunk("IHDR", header)]
    .concat(textChunks(metadata));

  if (format.palette) {
    var plte = new Uint8Array(format.palette.length * 3);
    var translucent = 0;
    format.palette.forEach(function (c, i) {
      plte.set([c[0], c[1], c[2]], i * 3);
      if (c[3] !== 255) translucent = i + 1;
    });
    chunks.push(pngChunk("PLTE", plte));
    if (translucent) {
      var trns = new Uint8Array(translucent);
      for (var t = 0; t < translucent; t++) trns[t] = format.palette[t][3];
      chunks.push(pngChunk("tRNS", trns));
    }
  }

  return zlibCompress(filterImage(data, width, height, format))
    .then(function (compressed) {
      chunks.push(pngChunk("IDAT", compressed));
      chunks.push(pngChunk("IEND", new Uint8Array(0)));
      return {
        blob: new Blob(chunks, { type: "image/png" }),
        format: format.name,
      };
    })
    .catch(function () {
      return browserPng(canvas, metadata);
    });
}

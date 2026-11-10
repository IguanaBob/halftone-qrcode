// Scan check: estimates whether a phone could read the finished code.
//
// A general QR reader has to find the code in a photo first. Here the
// layout is already known, so the check only has to answer: would a scanner
// read enough modules correctly for error correction to recover the data?
//
//   1. Simulate a camera: shrink the image to a few pixels per module and
//      blur it slightly, so tiny dots fade into what surrounds them.
//   2. Binarize with a local threshold, as phone scanners do.
//   3. Read each data module at its center (shifting the whole grid a
//      little, since a scanner's grid estimate is never exact).
//   4. Count wrong bytes in each error-correction block. Reed-Solomon can
//      fix up to half its correction bytes per block, so that limit is exact.
//
// Step 1 is a model, not a real camera, so the verdict is an estimate.

// Camera pixels per module. Phones typically see 5-15 per module.
var SCAN_PIXELS_PER_MODULE = 8;
// Blur radius (Gaussian sigma) in camera pixels, about a tenth of a module:
// focus and lens softness of a phone held steady and in focus.
var SCAN_BLUR = 0.7;
// How far the sampling grid is shifted, as a fraction of a module.
var SCAN_GRID_SHIFT = 0.1;
// Half-width of the local threshold window, in modules.
var SCAN_WINDOW = 3.5;

// For each module, the index of the codeword (byte) its bit belongs to, or
// -1 for function patterns and leftover bits. Follows the standard zigzag
// placement (the same order as mapData in qrcode.js). `control` has null
// for data modules.
function codewordMap(control, codewordCount) {
  var n = control.length;
  var map = control.map(function (row) {
    return row.map(function () {
      return -1;
    });
  });
  var bit = 0;
  var row = n - 1;
  var step = -1;
  for (var col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1; // skip the vertical timing pattern
    for (;;) {
      for (var c = 0; c < 2; c++) {
        if (control[row][col - c] === null) {
          var byte = bit >> 3;
          map[row][col - c] = byte < codewordCount ? byte : -1;
          bit++;
        }
      }
      row += step;
      if (row < 0 || row >= n) {
        row -= step;
        step = -step;
        break;
      }
    }
  }
  return map;
}

// Which block each codeword belongs to. Codewords are interleaved: the
// first data byte of every block, then the second, and so on, then the
// correction bytes the same way (as createBytes in qrcode.js).
function codewordBlocks(blocks) {
  var owner = [];
  var maxData = 0;
  var maxEc = 0;
  blocks.forEach(function (b) {
    maxData = Math.max(maxData, b.dataCount);
    maxEc = Math.max(maxEc, b.totalCount - b.dataCount);
  });
  for (var i = 0; i < maxData; i++) {
    blocks.forEach(function (b, r) {
      if (i < b.dataCount) owner.push(r);
    });
  }
  for (var j = 0; j < maxEc; j++) {
    blocks.forEach(function (b, r) {
      if (j < b.totalCount - b.dataCount) owner.push(r);
    });
  }
  return owner;
}

// In-place separable Gaussian blur of a size x size luminance array.
function gaussianBlur(lum, size, sigma) {
  var radius = Math.ceil(sigma * 3);
  var kernel = [];
  var sum = 0;
  for (var k = -radius; k <= radius; k++) {
    var w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    sum += w;
  }
  kernel = kernel.map(function (w) {
    return w / sum;
  });
  var tmp = new Float32Array(lum.length);
  var pass = function (src, dst, dx, dy) {
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var acc = 0;
        for (var k = -radius; k <= radius; k++) {
          // Clamp at the edges.
          var sx = Math.min(size - 1, Math.max(0, x + k * dx));
          var sy = Math.min(size - 1, Math.max(0, y + k * dy));
          acc += src[sy * size + sx] * kernel[k + radius];
        }
        dst[y * size + x] = acc;
      }
    }
  };
  pass(lum, tmp, 1, 0);
  pass(tmp, lum, 0, 1);
}

// Summed-area table, so the local mean of any square is four lookups.
function integralImage(lum, size) {
  var s = size + 1;
  var table = new Float64Array(s * s);
  for (var y = 0; y < size; y++) {
    var rowSum = 0;
    for (var x = 0; x < size; x++) {
      rowSum += lum[y * size + x];
      table[(y + 1) * s + x + 1] = table[y * s + x + 1] + rowSum;
    }
  }
  return function (x0, y0, x1, y1) {
    // Mean over [x0, x1) x [y0, y1), clipped to the image.
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(size, x1);
    y1 = Math.min(size, y1);
    var total =
      table[y1 * s + x1] - table[y0 * s + x1] - table[y1 * s + x0] + table[y0 * s + x0];
    return total / ((x1 - x0) * (y1 - y0));
  };
}

// Checks the output canvas. `code` describes what was drawn:
//   matrix   module values (true = dark), as drawn
//   map      codeword index per module (from codewordMap), as drawn
//   blocks   Reed-Solomon blocks: [{ dataCount, totalCount }]
//   margin   quiet zone width in modules (0 if off)
// Returns { ok, worst, failed, blockCount }, where worst is the largest
// share of any block's correction capacity used (1 = at the limit).
function scanCheck(canvas, code) {
  var modules = code.matrix.length;
  var ppm = SCAN_PIXELS_PER_MODULE;
  var size = Math.round((modules + 2 * code.margin) * ppm);

  // 1. Camera view: the code on white paper, at camera resolution.
  var cam = document.createElement("canvas");
  cam.width = cam.height = size;
  var ctx = cam.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, size, size);
  var d = ctx.getImageData(0, 0, size, size).data;
  var lum = new Float32Array(size * size);
  for (var i = 0; i < lum.length; i++) {
    lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }
  gaussianBlur(lum, size, SCAN_BLUR);

  // 2. Local threshold.
  var mean = integralImage(lum, size);
  var half = Math.round(SCAN_WINDOW * ppm);
  var isDark = function (x, y) {
    x = Math.min(size - 1, Math.max(0, Math.floor(x)));
    y = Math.min(size - 1, Math.max(0, Math.floor(y)));
    return lum[y * size + x] < mean(x - half, y - half, x + half + 1, y + half + 1);
  };

  var owner = codewordBlocks(code.blocks);
  var shifts = [
    [0, 0],
    [SCAN_GRID_SHIFT, 0],
    [-SCAN_GRID_SHIFT, 0],
    [0, SCAN_GRID_SHIFT],
    [0, -SCAN_GRID_SHIFT],
  ];
  var result = { ok: true, worst: 0, failed: 0, blockCount: code.blocks.length };

  shifts.forEach(function (shift) {
    // 3. Read every data module and note which codewords have a wrong bit.
    var wrong = new Uint8Array(owner.length);
    for (var r = 0; r < modules; r++) {
      for (var c = 0; c < modules; c++) {
        var cw = code.map[r][c];
        if (cw < 0) continue;
        var x = (code.margin + c + 0.5 + shift[0]) * ppm;
        var y = (code.margin + r + 0.5 + shift[1]) * ppm;
        if (isDark(x, y) !== code.matrix[r][c]) wrong[cw] = 1;
      }
    }
    // 4. Compare each block's errors with what it can correct.
    var errors = code.blocks.map(function () {
      return 0;
    });
    for (var w = 0; w < wrong.length; w++) {
      if (wrong[w]) errors[owner[w]]++;
    }
    var failed = 0;
    code.blocks.forEach(function (b, k) {
      var capacity = Math.floor((b.totalCount - b.dataCount) / 2);
      var used = capacity > 0 ? errors[k] / capacity : errors[k] ? Infinity : 0;
      result.worst = Math.max(result.worst, used);
      if (errors[k] > capacity) failed++;
    });
    if (failed > result.failed) result.failed = failed;
    if (failed) result.ok = false;
  });

  return result;
}

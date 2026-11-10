// Blank border around the code, in modules. The QR spec requires 4.
var QUIET_ZONE_MODULES = 4;
// Largest output canvas side, in pixels. Browsers fail on much bigger canvases.
var MAX_OUTPUT_SIZE = 8000;

// Text fields written into every downloaded PNG.
var PNG_METADATA = {
  Software:
    "Halftone QR Code Generator (https://github.com/IguanaBob/halftone-qrcode)",
  Comment: "Made with https://github.com/IguanaBob/halftone-qrcode",
};

function byId(id) {
  return document.getElementById(id);
}

var downloadUrl = null;
var downloadJob = 0;

// Encodes the output canvas (see png-encoder.js) and points the download
// link at it. Encoding is asynchronous; only the newest result is used.
function updateDownload(canvas) {
  var job = ++downloadJob;
  encodePng(canvas, PNG_METADATA).then(function (result) {
    if (job !== downloadJob) return;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(result.blob);
    byId("download").href = downloadUrl;
    var kb = (result.blob.size / 1024).toFixed(1);
    byId("png-info").textContent = " (" + result.format + ", " + kb + " KB)";
  });
}

// Reads and validates every option. Throws an Error with a user-facing
// message if a field is invalid.
function readSettings() {
  function wholeNumber(id, label, min, max) {
    var raw = byId(id).value.trim();
    var value = Number(raw);
    if (raw === "" || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(
        label + " must be a whole number from " + min + " to " + max + "."
      );
    }
    return value;
  }
  // Slider value if its checkbox is checked, otherwise null (effect off).
  function optional(checkbox, slider) {
    return byId(checkbox).checked ? parseFloat(byId(slider).value) : null;
  }

  var pixelSize = wholeNumber("quality", "Quality", 1, 20);
  var subCells = wholeNumber("block-size", "Block size", 1, 9);

  return {
    text: byId("input").value,
    errorLevel: byId("error_level").value,
    qrSize: wholeNumber("size", "QR size", 0, 40),
    pixelSize: pixelSize, // pixels per sub-cell
    subCells: subCells, // sub-cells per module side
    blockSize: subCells * pixelSize, // pixels per module side
    dotSize: wholeNumber("dot-size", "Dot size", 10, 100), // % of module side
    background: byId("background").value,
    quietZone: byId("quiet-zone").checked,
    pixelation: optional("pixelate", "pixelation"),
    grayscale: optional("should-grayscale", "grayscale"),
    dither: optional("should-dither", "dither"),
    contrast: optional("blacknwhite", "contrast"),
    rotation: Number(byId("rotation").value), // degrees clockwise
  };
}

// Returns a copy of a square module matrix turned clockwise by 0, 90, 180
// or 270 degrees. Matrices are indexed [row][column].
function rotateMatrix(matrix, degrees) {
  var n = matrix.length;
  var turns = ((degrees / 90) % 4 + 4) % 4;
  var result = matrix;
  for (var t = 0; t < turns; t++) {
    var next = [];
    for (var r = 0; r < n; r++) {
      next.push([]);
      for (var c = 0; c < n; c++) next[r].push(result[n - 1 - c][r]);
    }
    result = next;
  }
  return result;
}

// Returns the module matrix. With onlyControl, only the function patterns
// (finders, timing, alignment, format info) are set; data modules are null.
function makeQR(settings, onlyControl) {
  var qr = qrcode2(settings.qrSize, settings.errorLevel);
  qr.addData(settings.text);
  try {
    qr.make(onlyControl);
  } catch (e) {
    if (String(e).indexOf("code length overflow") === 0) {
      throw new Error(
        settings.qrSize
          ? "The text is too long for QR size " + settings.qrSize +
            " at this redundancy level. Use a larger QR size, a lower " +
            "redundancy level, or 0 for automatic."
          : "The text is too long to fit in any QR code at this redundancy level."
      );
    }
    throw e;
  }
  return qr.returnByteArray();
}

function halftoneQR(imageCanvas, settings) {
  var QRBytes = rotateMatrix(makeQR(settings, false), settings.rotation);
  var controlBytes = rotateMatrix(makeQR(settings, true), settings.rotation);

  var codeSize = QRBytes.length * settings.blockSize;
  var margin = settings.quietZone ? QUIET_ZONE_MODULES * settings.blockSize : 0;
  var outputSize = codeSize + 2 * margin;
  if (outputSize > MAX_OUTPUT_SIZE) {
    throw new Error(
      "The output would be " + outputSize + " pixels wide, which is too " +
      "large. Lower the Quality, Block size or QR size."
    );
  }

  // Draw the code itself on its own canvas, then add the quiet zone.
  var codeCanvas = document.createElement("canvas");
  codeCanvas.width = codeCanvas.height = codeSize;
  var codeCtx = codeCanvas.getContext("2d");

  if (settings.background === "noise") {
    drawRandomBytes(codeCanvas, QRBytes, settings, false);
  } else if (settings.background === "large") {
    drawRandomBytes(codeCanvas, QRBytes, settings, true);
  }

  var tempCanvas = document.createElement("canvas");
  tempCanvas.width = tempCanvas.height = codeSize;
  tempCanvas.getContext("2d").drawImage(imageCanvas, 0, 0, codeSize, codeSize);

  if (settings.pixelation !== null) pixelate(tempCanvas, settings.pixelation);
  if (settings.grayscale !== null) grayscale(tempCanvas, settings.grayscale);
  if (settings.dither !== null) dither(tempCanvas, settings.dither, settings.pixelSize);
  if (settings.contrast !== null) contrast(tempCanvas, settings.contrast);

  codeCtx.drawImage(tempCanvas, 0, 0);
  drawTransparent(codeCanvas, QRBytes, controlBytes, settings);

  var outputCanvas = byId("output");
  outputCanvas.width = outputCanvas.height = outputSize;
  var outputCtx = outputCanvas.getContext("2d");
  if (margin) {
    outputCtx.fillStyle = "white";
    outputCtx.fillRect(0, 0, outputSize, outputSize);
    outputCtx.clearRect(margin, margin, codeSize, codeSize);
  }
  outputCtx.drawImage(codeCanvas, margin, margin);

  updateDownload(outputCanvas);
}

function drawTransparent(canvas, QRBytes, controlBytes, settings) {
  var ctx = canvas.getContext("2d");
  var blockSize = settings.blockSize;
  // Side of the data dot in pixels, and its offset to sit centered in the
  // module. 33% at block size 3 is exactly the middle sub-cell.
  var dot = Math.max(1, Math.round((blockSize * settings.dotSize) / 100));
  var offset = Math.floor((blockSize - dot) / 2);

  // Matrices are [row][column]: rows go down (y), columns across (x).

  // Data modules: only the center dot carries the bit.
  for (var row = 0; row < QRBytes.length; row++) {
    for (var col = 0; col < QRBytes[row].length; col++) {
      ctx.fillStyle = QRBytes[row][col] ? "black" : "white";
      ctx.fillRect(
        col * blockSize + offset,
        row * blockSize + offset,
        dot,
        dot
      );
    }
  }

  // Function patterns are drawn solid so scanners can lock on.
  for (var r = 0; r < controlBytes.length; r++) {
    for (var c = 0; c < controlBytes[r].length; c++) {
      if (controlBytes[r][c] !== null) {
        ctx.fillStyle = controlBytes[r][c] === true ? "black" : "white";
        ctx.fillRect(c * blockSize, r * blockSize, blockSize, blockSize);
      }
    }
  }
}

function drawRandomBytes(canvas, QRBytes, settings, big) {
  var ctx = canvas.getContext("2d");
  var pixelSize = settings.pixelSize;
  var blockSize = settings.blockSize;

  for (var row = 0; row < QRBytes.length; row++) {
    for (var col = 0; col < QRBytes[row].length; col++) {
      if (big) {
        if (QRBytes[row][col] !== null) {
          ctx.fillStyle = QRBytes[row][col] === true ? "black" : "white";
          ctx.fillRect(col * blockSize, row * blockSize, blockSize, blockSize);
        }
        continue;
      }
      for (var subRow = 0; subRow < settings.subCells; subRow++) {
        for (var subCol = 0; subCol < settings.subCells; subCol++) {
          ctx.fillStyle = Math.random() < 0.5 ? "white" : "black";
          ctx.fillRect(
            col * blockSize + subCol * pixelSize,
            row * blockSize + subRow * pixelSize,
            pixelSize,
            pixelSize
          );
        }
      }
    }
  }
}

function luminance(d, i) {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

// Atkinson dithering on the sub-cell grid, so each dot is one sub-cell.
function dither(canvas, threshold, cellSize) {
  var ctx = canvas.getContext("2d");
  var width = canvas.width;
  var height = canvas.height;
  var cols = Math.ceil(width / cellSize);
  var rows = Math.ceil(height / cellSize);
  var pixels = ctx.getImageData(0, 0, width, height);
  var d = pixels.data;

  // Average luminance of each cell.
  var gray = new Float32Array(cols * rows);
  var count = new Uint32Array(cols * rows);
  for (var y = 0; y < height; y++) {
    var rowBase = Math.floor(y / cellSize) * cols;
    for (var x = 0; x < width; x++) {
      var cellIndex = rowBase + Math.floor(x / cellSize);
      gray[cellIndex] += luminance(d, (y * width + x) * 4);
      count[cellIndex]++;
    }
  }
  for (var i = 0; i < gray.length; i++) gray[i] /= count[i];

  var spread = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var idx = r * cols + c;
      var value = gray[idx] >= threshold ? 255 : 0;
      var error = (gray[idx] - value) / 8;
      gray[idx] = value;
      for (var s = 0; s < spread.length; s++) {
        var nc = c + spread[s][0];
        var nr = r + spread[s][1];
        if (nc >= 0 && nc < cols && nr < rows) gray[nr * cols + nc] += error;
      }
    }
  }

  // Paint each cell with its result. Alpha is snapped too, so pixels are
  // fully opaque or fully clear.
  for (var py = 0; py < height; py++) {
    var base = Math.floor(py / cellSize) * cols;
    for (var px = 0; px < width; px++) {
      var p = (py * width + px) * 4;
      d[p] = d[p + 1] = d[p + 2] = gray[base + Math.floor(px / cellSize)];
      d[p + 3] = d[p + 3] >= 128 ? 255 : 0;
    }
  }
  ctx.putImageData(pixels, 0, 0);
}

function pixelate(canvas, pixelation) {
  var ctx = canvas.getContext("2d");
  var width = canvas.width;
  var height = canvas.height;
  var scale = 1 - pixelation / 100;

  var tempCanvas = document.createElement("canvas");
  // At least 1px: a 0-sized canvas makes drawImage throw.
  tempCanvas.width = Math.max(1, Math.round(width * scale));
  tempCanvas.height = Math.max(1, Math.round(height * scale));
  var tempCtx = tempCanvas.getContext("2d");

  tempCtx.imageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;

  tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(tempCanvas, 0, 0, width, height);
}

// Black and white: each pixel becomes black or white around a threshold,
// and fully opaque or fully clear, so the result is truly two-tone.
function contrast(canvas, threshold) {
  var ctx = canvas.getContext("2d");
  var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  var d = pixels.data;
  for (var i = 0; i < d.length; i += 4) {
    d[i] = d[i + 1] = d[i + 2] =
      (d[i] + d[i + 1] + d[i + 2]) / 3 > threshold ? 255 : 0;
    d[i + 3] = d[i + 3] >= 128 ? 255 : 0;
  }
  ctx.putImageData(pixels, 0, 0);
}

// Blends each pixel toward its gray value; amount is 0-100.
function grayscale(canvas, amount) {
  var ctx = canvas.getContext("2d");
  var mix = amount / 100;
  var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  var d = pixels.data;
  for (var i = 0; i < d.length; i += 4) {
    var gray = luminance(d, i);
    d[i] += (gray - d[i]) * mix;
    d[i + 1] += (gray - d[i + 1]) * mix;
    d[i + 2] += (gray - d[i + 2]) * mix;
  }
  ctx.putImageData(pixels, 0, 0);
}

document.addEventListener("DOMContentLoaded", function () {
  var crop = byId("crop");
  var croppie = null;
  var renderTimer = null;
  var renderId = 0;

  function showError(message) {
    var error = byId("error");
    error.textContent = message || "";
    error.hidden = !message;
  }

  // Render shortly after the last change, so dragging a slider stays smooth.
  function scheduleRerender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(rerender, 150);
  }

  function rerender() {
    if (!croppie) return;
    var settings;
    try {
      settings = readSettings();
    } catch (e) {
      showError(e.message);
      return;
    }
    var id = ++renderId;
    croppie.result({ type: "rawcanvas" }).then(function (canvas) {
      if (id !== renderId) return; // a newer render has started
      try {
        halftoneQR(canvas, settings);
        showError("");
      } catch (e) {
        showError(e && e.message ? e.message : String(e));
      }
    });
  }

  function updateCroppie(image) {
    if (croppie) {
      croppie.destroy();
    }
    var smallestSize = Math.min(image.width, image.height);
    // Keep the 1.2x boundary inside the column.
    smallestSize = Math.min(smallestSize, crop.offsetWidth * 0.8);
    croppie = new Croppie(crop, {
      url: image.src,
      enforceBoundary: false,
      viewport: { width: smallestSize, height: smallestSize },
      boundary: { width: smallestSize * 1.2, height: smallestSize * 1.2 },
    });
    setTimeout(function () {
      croppie.setZoom(1);
      scheduleRerender();
    }, 10);
  }

  function loadImage(src) {
    var img = new Image();
    img.onload = function () {
      showError("");
      updateCroppie(img);
    };
    img.onerror = function () {
      showError(
        "Couldn't open that image. It may be damaged or in a format this " +
        "browser doesn't support."
      );
    };
    img.src = src;
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      showError("That isn't an image file. Use a PNG, JPEG, WebP or GIF image.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (event) {
      loadImage(event.target.result);
    };
    reader.onerror = function () {
      showError("Couldn't read that file.");
    };
    reader.readAsDataURL(file);
  }

  crop.addEventListener("update", scheduleRerender);

  document
    .querySelectorAll("input:not(#file), select, textarea")
    .forEach(function (el) {
      el.addEventListener("input", scheduleRerender);
      el.addEventListener("change", scheduleRerender);
    });

  // Show the dot size percentage beside its slider.
  byId("dot-size").addEventListener("input", function () {
    byId("dot-size-label").textContent = this.value + "%";
  });

  // Rotation buttons turn the code 90 degrees at a time.
  function rotateBy(degrees) {
    var input = byId("rotation");
    var value = (((Number(input.value) + degrees) % 360) + 360) % 360;
    input.value = value;
    byId("rotation-label").textContent = value + "°";
    scheduleRerender();
  }
  byId("rotate-left").addEventListener("click", function () {
    rotateBy(-90);
  });
  byId("rotate-right").addEventListener("click", function () {
    rotateBy(90);
  });

  // Reset puts every option back to the default written in the HTML,
  // leaving the text to encode and the image alone.
  byId("reset").addEventListener("click", function () {
    document
      .querySelectorAll(".options input:not(#file), .options select")
      .forEach(function (el) {
        if (el.closest("#crop")) return; // leave the crop and zoom alone
        if (el.type === "checkbox") {
          el.checked = el.defaultChecked;
        } else if (el.tagName === "SELECT") {
          el.querySelectorAll("option").forEach(function (option) {
            option.selected = option.defaultSelected;
          });
        } else {
          el.value = el.defaultValue;
        }
      });
    // A hidden input's default follows its value, so set rotation directly.
    byId("rotation").value = "0";
    byId("rotation-label").textContent = "0°";
    byId("dot-size-label").textContent = byId("dot-size").value + "%";
    scheduleRerender();
  });

  byId("file").addEventListener("change", function () {
    loadFile(this.files[0]);
    this.value = ""; // allow choosing the same file again
  });

  var overlay = byId("overlay");

  document.body.addEventListener("dragover", function (e) {
    e.preventDefault();
    document.body.classList.add("hover");
  });

  ["dragend", "dragleave"].forEach(function (type) {
    overlay.addEventListener(type, function (e) {
      e.preventDefault();
      document.body.classList.remove("hover");
    });
  });

  overlay.addEventListener("drop", function (e) {
    e.preventDefault();
    document.body.classList.remove("hover");
    var files = e.dataTransfer && e.dataTransfer.files;
    loadFile(files && files[0]);
  });

  // First load: the sample image from sample-image.js.
  loadImage(SAMPLE_IMAGE_URL);
});

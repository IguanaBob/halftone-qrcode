// A small square image cropper: drag to move, and zoom with the slider,
// mouse wheel, pinch, or the keyboard. The image may be zoomed out past its
// edges; uncovered areas stay transparent.
//
// createCropper(container, onChange) builds the cropper inside container
// and calls onChange whenever the crop changes. It returns:
//   load(image)  show a loaded <img> or canvas, centered, short side filling
//                the box
//   result()     a canvas of the cropped square, or null before load
//   reset()      return to the starting position and zoom

// Zoom limits, relative to the short side exactly filling the box.
var CROP_MIN_ZOOM = 0.2;
var CROP_MAX_ZOOM = 10;
// Largest side of the result canvas. The QR code is usually far smaller.
var CROP_MAX_RESULT = 2048;
// Largest side of the crop box, in CSS pixels.
var CROP_MAX_BOX = 400;

function createCropper(container, onChange) {
  var canvas = document.createElement("canvas");
  canvas.className = "crop-box";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Crop area. Drag to move the image, or use the arrow keys; " +
      "+ and - zoom."
  );

  var slider = document.createElement("input");
  slider.type = "range";
  slider.className = "crop-zoom";
  slider.min = String(Math.log(CROP_MIN_ZOOM));
  slider.max = String(Math.log(CROP_MAX_ZOOM));
  slider.step = "any";
  slider.value = "0";
  slider.setAttribute("aria-label", "Zoom");

  container.appendChild(canvas);
  container.appendChild(slider);

  var image = null;
  var box = 0; // crop box side in CSS pixels
  var zoom = 1; // 1 = the short side fills the box
  var cx = 0; // image point (in image pixels) shown at the box center
  var cy = 0;

  // Screen pixels per image pixel.
  function scale() {
    return (zoom * box) / Math.min(image.width, image.height);
  }

  function clampCenter() {
    cx = Math.min(Math.max(cx, 0), image.width);
    cy = Math.min(Math.max(cy, 0), image.height);
  }

  function setZoom(next, px, py) {
    next = Math.min(Math.max(next, CROP_MIN_ZOOM), CROP_MAX_ZOOM);
    if (px === undefined) px = py = box / 2;
    // Keep the image point under (px, py) in place.
    var before = scale();
    var ix = cx + (px - box / 2) / before;
    var iy = cy + (py - box / 2) / before;
    zoom = next;
    var after = scale();
    cx = ix - (px - box / 2) / after;
    cy = iy - (py - box / 2) / after;
    clampCenter();
    slider.value = String(Math.log(zoom));
    changed();
  }

  function moveBy(dx, dy) {
    var s = scale();
    cx -= dx / s;
    cy -= dy / s;
    clampCenter();
    changed();
  }

  // Draws the crop of the image into ctx, which covers a size x size square.
  function drawCrop(ctx, size) {
    var k = (size / box) * scale();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.setTransform(k, 0, 0, k, size / 2 - k * cx, size / 2 - k * cy);
    ctx.drawImage(image, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function draw() {
    if (!image) return;
    var ratio = window.devicePixelRatio || 1;
    var size = Math.round(box * ratio);
    if (canvas.width !== size) canvas.width = canvas.height = size;
    canvas.style.width = canvas.style.height = box + "px";
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    drawCrop(ctx, size);
  }

  function changed() {
    draw();
    onChange();
  }

  function fitBox() {
    box = Math.max(1, Math.floor(Math.min(container.clientWidth, CROP_MAX_BOX)));
  }

  function reset() {
    if (!image) return;
    zoom = 1;
    cx = image.width / 2;
    cy = image.height / 2;
    slider.value = "0";
    changed();
  }

  // Pointer input: one pointer drags, two pointers pinch to zoom.
  var pointers = new Map();
  var pinchDistance = 0;

  function localPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pinchInfo() {
    var p = Array.from(pointers.values());
    return {
      distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
      x: (p[0].x + p[1].x) / 2,
      y: (p[0].y + p[1].y) / 2,
    };
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (!image) return;
    try {
      canvas.setPointerCapture(e.pointerId); // keep dragging outside the box
    } catch (err) {
      // Not capturable (e.g. already released); dragging still works.
    }
    pointers.set(e.pointerId, localPoint(e));
    if (pointers.size === 2) pinchDistance = pinchInfo().distance;
  });

  canvas.addEventListener("pointermove", function (e) {
    var last = pointers.get(e.pointerId);
    if (!last) return;
    var point = localPoint(e);
    if (pointers.size === 1) {
      pointers.set(e.pointerId, point);
      moveBy(point.x - last.x, point.y - last.y);
    } else if (pointers.size === 2) {
      var before = pinchInfo();
      pointers.set(e.pointerId, point);
      var after = pinchInfo();
      moveBy(after.x - before.x, after.y - before.y);
      if (pinchDistance > 0) {
        setZoom((zoom * after.distance) / pinchDistance, after.x, after.y);
      }
      pinchDistance = after.distance;
    }
  });

  function pointerEnd(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) pinchDistance = pinchInfo().distance;
  }
  canvas.addEventListener("pointerup", pointerEnd);
  canvas.addEventListener("pointercancel", pointerEnd);

  canvas.addEventListener(
    "wheel",
    function (e) {
      if (!image) return;
      e.preventDefault();
      var point = localPoint(e);
      setZoom(zoom * Math.exp(-e.deltaY * 0.002), point.x, point.y);
    },
    { passive: false }
  );

  canvas.addEventListener("keydown", function (e) {
    if (!image) return;
    var step = e.shiftKey ? 50 : 10;
    var moves = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[e.key]) {
      moveBy(moves[e.key][0], moves[e.key][1]);
    } else if (e.key === "+" || e.key === "=") {
      setZoom(zoom * 1.1);
    } else if (e.key === "-") {
      setZoom(zoom / 1.1);
    } else if (e.key === "0") {
      reset();
    } else {
      return;
    }
    e.preventDefault();
  });

  slider.addEventListener("input", function () {
    if (image) setZoom(Math.exp(Number(slider.value)));
  });

  window.addEventListener("resize", function () {
    if (!image) return;
    var old = box;
    fitBox();
    if (box !== old) draw(); // same crop, just drawn at the new size
  });

  return {
    load: function (img) {
      image = img;
      fitBox();
      reset();
    },
    result: function () {
      if (!image) return null;
      // Match the image's own resolution over the cropped area.
      var size = Math.round(box / scale());
      size = Math.min(Math.max(size, 1), CROP_MAX_RESULT);
      var out = document.createElement("canvas");
      out.width = out.height = size;
      drawCrop(out.getContext("2d"), size);
      return out;
    },
    reset: reset,
  };
}

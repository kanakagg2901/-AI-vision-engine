export function redactRegions(imageSrc, regions, mode = "blackout") {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      regions.forEach(region => {
        const { x, y, width, height } = region;

        if (mode === "blackout") {
          ctx.fillStyle = "black";
          ctx.fillRect(x, y, width, height);
        }

        if (mode === "blur") {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, width, height);
          ctx.clip();
          ctx.filter = "blur(12px)";
          ctx.drawImage(img, 0, 0);
          ctx.restore();
        }
      });

      resolve(canvas.toDataURL("image/png"));
    };

    img.src = imageSrc;
  });
}

// Backward-compat: redaction-test.html loads this as a classic (non-module)
// script and calls redactRegions() as a global. Now that this file is an
// ES module (needed so popup.js can `import` it for the live redaction
// HUD), that test page's <script> tag was updated to type="module", but it
// still calls the bare global name from its inline classic script block.
if (typeof window !== "undefined") {
  window.redactRegions = redactRegions;
}

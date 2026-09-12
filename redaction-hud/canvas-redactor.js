function redactRegions(imageSrc, regions, mode = "blackout") {
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

                }
            });

            resolve(canvas.toDataURL("image/png"));
        };

        img.src = imageSrc;
    });
}

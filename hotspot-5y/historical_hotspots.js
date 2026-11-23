function setupHistoricalHotspots({ baseUrl, project, getBounds, format }) {
  const byId = id => document.getElementById(id);
  const canvas = byId("historyPointsCanvas");
  const context = canvas.getContext("2d");
  const filters = byId("historyFilters");
  const fitRegion = byId("historyFitRegion");
  const colorMode = byId("historyThaiColors");
  const years = [
    ["2022", "#38bdf8"], ["2023", "#22c55e"], ["2024", "#eab308"], ["2025", "#f97316"], ["2026", "#ef4444"],
  ];
  const landTypes = [
    ["ป่าไม้", "#dc2626"], ["นาข้าว", "#facc15"], ["อ้อย", "#ec4899"],
    ["ข้าวโพด/ไร่หมุนเวียน", "#f97316"], ["เกษตร/ส.ป.ก. อื่น", "#a855f7"], ["ชุมชน/พื้นที่อื่น", "#38bdf8"],
  ];
  const countries = [
    ["เมียนมา", "#ef4444"], ["สปป.ลาว", "#f59e0b"], ["กัมพูชา", "#a855f7"],
    ["เวียดนาม", "#06b6d4"], ["มาเลเซีย", "#10b981"],
  ];

  function checkboxGroup(id, options, colorsVisible = true) {
    const group = byId(id);
    return options.map(([name, color]) => {
      const label = document.createElement("label");
      label.className = "pill-check";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = true;
      const swatch = document.createElement("span");
      swatch.className = "history-swatch";
      swatch.style.backgroundColor = color;
      swatch.hidden = !colorsVisible;
      swatch.setAttribute("aria-hidden", "true");
      label.append(check, swatch, name);
      group.append(label);
      return check;
    });
  }

  const thai = {
    toggle: byId("historyThai"), options: byId("historyThaiOptions"), status: byId("historyThaiStatus"),
    retry: byId("historyThaiRetry"), file: "th_points_exact.bin.gz", precision: 10000,
    years: checkboxGroup("historyThaiYears", years, false),
    categories: checkboxGroup("historyThaiTypes", landTypes),
  };
  const neighbors = {
    toggle: byId("historyNeighbors"), options: byId("historyNeighborOptions"), status: byId("historyNeighborStatus"),
    retry: byId("historyNeighborRetry"), file: "gms_points_exact.bin.gz", precision: 1000,
    years: checkboxGroup("historyNeighborYears", years.slice(0, 4), false),
    categories: checkboxGroup("historyCountries", countries),
  };
  const layers = [neighbors, thai];

  // Match the Atlas coordinate archives: two little-endian integers per record.
  // Both store latitude above bit 10; Thai flags describe year/crop/land use,
  // while the neighboring-country archive stores country/year and a pixel count.
  async function load(layer) {
    if (layer.points || layer.loading) return;
    layer.loading = true;
    layer.retry.hidden = true;
    layer.status.textContent = "กำลังโหลดพิกัดจุดความร้อน…";
    try {
      const response = await fetch(new URL(layer.file, baseUrl), { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error("Hotspot data unavailable");
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      const buffer = await new Response(stream).arrayBuffer();
      if (!buffer.byteLength || buffer.byteLength % 8) throw new Error("Invalid hotspot data");
      const points = new Int32Array(buffer);
      let firstLat = Infinity, lastLat = -Infinity;
      for (let i = 0; i < points.length; i += 2) {
        const lat = points[i] >> 11;
        if (lat < firstLat) firstLat = lat;
        if (lat > lastLat) lastLat = lat;
      }
      if (firstLat < -85 * layer.precision || lastLat > 85 * layer.precision) throw new Error("Invalid hotspot latitudes");
      const projected = new Float32Array(lastLat - firstLat + 1);
      for (let i = 0; i < projected.length; i++) {
        projected[i] = project(0, (firstLat + i) / layer.precision)[1];
      }
      layer.points = points;
      layer.projected = projected;
      layer.firstLat = firstLat;
      redraw();
    } catch (_) {
      layer.status.textContent = "โหลดพิกัดไม่สำเร็จ ลองโหลดชั้นข้อมูลนี้อีกครั้ง";
      layer.retry.hidden = false;
    } finally {
      layer.loading = false;
    }
  }

  function activeMask(inputs) {
    return inputs.reduce((mask, input, index) => input.checked ? mask | (1 << index) : mask, 0);
  }

  // Canvas pixels are RGBA bytes. Pack each color once for the raster pass.
  const toPixel = ([, color]) => {
    const rgb = Number.parseInt(color.slice(1), 16);
    return (218 << 24) | ((rgb & 255) << 16) | (rgb & 0xff00) | (rgb >> 16);
  };
  const yearPixels = years.map(toPixel);
  const landPixels = landTypes.map(toPixel);
  const countryPixels = countries.map(toPixel);
  let redrawFrame = null;

  function redraw() {
    if (canvas.hidden || redrawFrame !== null) return;
    redrawFrame = requestAnimationFrame(draw);
  }

  function draw() {
    redrawFrame = null;
    if (canvas.hidden || !context) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const raster = context.createImageData(width, height);
    const pixels = new Uint32Array(raster.data.buffer);
    const bounds = getBounds();
    const scaleX = width / bounds.width, scaleY = height / bounds.height;
    const widen = bounds.height < 11;
    const byYear = colorMode.value === "year";

    for (const layer of layers) {
      if (!layer.toggle.checked || !layer.points) continue;
      const yearMask = activeMask(layer.years);
      const categoryMask = activeMask(layer.categories);
      const left = bounds.left * layer.precision;
      const right = (bounds.left + bounds.width) * layer.precision;
      const isThai = layer === thai;
      let visible = 0;
      if (yearMask && categoryMask) {
        for (let i = 0; i < layer.points.length; i += 2) {
          const lon = layer.points[i + 1];
          if (lon < left || lon >= right) continue;
          const packed = layer.points[i];
          const yearIndex = isThai ? (packed >> 1) & 7 : (packed >> 6) & 3;
          if (!(yearMask & (1 << yearIndex))) continue;
          const y = Math.floor((layer.projected[(packed >> 11) - layer.firstLat] - bounds.top) * scaleY);
          if (y < 0 || y >= height) continue;
          const landUse = (packed >> 6) & 3;
          const crop = (packed >> 8) & 3;
          const category = isThai
            ? (crop || (landUse === 1 ? 0 : landUse === 0 ? 4 : 5))
            : ((packed >> 8) & 7) - 1;
          if (category < 0 || !(categoryMask & (1 << category))) continue;
          const x = Math.floor((lon - left) / layer.precision * scaleX);
          if (x < 0 || x >= width) continue;
          const pixel = isThai ? (byYear ? yearPixels[yearIndex] : landPixels[category]) : countryPixels[category];
          const offset = y * width + x;
          pixels[offset] = pixel;
          if (widen && x + 1 < width) pixels[offset + 1] = pixel;
          visible++;
        }
      }
      const message = visible ? `${format.format(visible)} รายการในมุมมองนี้` : "ไม่พบจุดตามตัวกรองในมุมมองนี้";
      if (layer.status.textContent !== message) layer.status.textContent = message;
    }
    context.putImageData(raster, 0, 0);
  }

  function syncLayers() {
    const enabled = layers.filter(layer => layer.toggle.checked);
    canvas.hidden = !enabled.length;
    filters.hidden = !enabled.length;
    fitRegion.hidden = !neighbors.toggle.checked;
    for (const layer of layers) layer.options.hidden = !layer.toggle.checked;
    for (const layer of enabled) {
      if (context) load(layer);
      else layer.status.textContent = "เบราว์เซอร์นี้วาดจุดความร้อนไม่ได้";
    }
    redraw();
  }

  for (const layer of layers) {
    layer.toggle.addEventListener("change", syncLayers);
    layer.options.addEventListener("change", redraw);
    layer.retry.addEventListener("click", () => load(layer));
  }
  colorMode.addEventListener("change", () => {
    const byYear = colorMode.value === "year";
    for (const id of ["historyThaiYears", "historyThaiTypes"]) {
      for (const swatch of byId(id).querySelectorAll(".history-swatch")) {
        swatch.hidden = id === "historyThaiYears" ? !byYear : byYear;
      }
    }
  });
  syncLayers();
  return { redraw };
}

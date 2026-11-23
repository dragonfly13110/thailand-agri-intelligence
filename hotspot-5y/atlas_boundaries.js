const ATLAS_ADMIN_LEVELS = [
  { key: 'province', name: 'จังหวัด', prefix: 'จ.', weight: 1.65 },
  { key: 'amphoe', name: 'อำเภอ', prefix: 'อ.', weight: 1.1 },
  { key: 'tambon', name: 'ตำบล', prefix: 'ต.', weight: 0.75 },
];

function atlasBoundaryLevel(zoom) {
  return zoom >= 10.3 ? 2 : zoom >= 8.2 ? 1 : 0;
}

function atlasBoundaryLabel(status, text) {
  if (status.textContent !== text) status.textContent = text;
}

function atlasAreaName(name, level, provinceCode) {
  const prefix = provinceCode === '10' && level > 0
    ? (level === 1 ? 'เขต' : 'แขวง')
    : ATLAS_ADMIN_LEVELS[level].prefix;
  return prefix + name;
}

function atlasLabelSpacing() {
  const points = [];
  return (x, y, width, height) => {
    if (x < 52 || x > width - 52 || y < 86 || y > height - 65 || points.length >= 24) return false;
    if (points.some(([px, py]) => Math.abs(x - px) < 92 && Math.abs(y - py) < 23)) return false;
    points.push([x, y]);
    return true;
  };
}

async function fetchAtlasAdminData() {
  const response = await fetch('./admin-boundaries.json.gz');
  if (!response.ok) throw new Error('Boundary file unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = bytes[0] === 31 && bytes[1] === 139
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

const ATLAS_TAMBON_QUERY = 'https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/3/query';

function atlasDetailedEdges(features) {
  const areas = [];
  const shared = new Map();
  for (const feature of features) {
    const props = feature.properties;
    const geom = feature.geometry;
    if (!props?.TAM_CODE || !geom || !['Polygon', 'MultiPolygon'].includes(geom.type)) continue;
    const province = props.PROV_CODE;
    const district = props.AMP_CODE;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
    const centroid = [props.Centroid_x, props.Centroid_y].map(value =>
      value == null || String(value).trim() === '' ? NaN : Number(value));
    areas.push({ name_th: props.TAM_NAM_T, prov_code: province, centroid });
    for (const ring of rings) {
      if (ring.length < 2) continue;
      let from = ring[ring.length - 1];
      for (const to of ring) {
        const a = from[0] + ',' + from[1], b = to[0] + ',' + to[1];
        if (a !== b) {
          const id = a < b ? a + ':' + b : b + ':' + a;
          const edge = shared.get(id);
          if (!edge) shared.set(id, { from, to, province, district, level: 2 });
          else if (edge.province !== province) edge.level = 0;
          else if (edge.district !== district) edge.level = Math.min(edge.level, 1);
        }
        from = to;
      }
    }
  }
  const segments = [[], [], []];
  for (const { from, to, level } of shared.values()) segments[level].push([from, to]);
  return { areas, segments };
}

function createAtlasDetailLoader(redraw) {
  const cache = [];
  let scheduled = null;
  let pending = null;
  let failed = null;
  const covers = (box, view) => box[0] <= view[0] && box[1] <= view[1] && box[2] >= view[2] && box[3] >= view[3];

  async function load(box) {
    scheduled = null;
    pending?.controller.abort();
    const controller = new AbortController();
    const request = { box, controller };
    pending = request;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams({
        where: '1=1', geometry: box.join(','), geometryType: 'esriGeometryEnvelope',
        inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outSR: '4326',
        outFields: 'TAM_CODE,TAM_NAM_T,AMP_CODE,PROV_CODE,Centroid_x,Centroid_y',
        returnGeometry: 'true', geometryPrecision: '6', f: 'geojson',
      });
      const response = await fetch(ATLAS_TAMBON_QUERY + '?' + params, { signal: controller.signal });
      if (!response.ok) throw new Error('Detailed boundaries unavailable');
      const body = await response.json();
      if (!Array.isArray(body.features) || body.exceededTransferLimit || body.properties?.exceededTransferLimit) {
        throw new Error('Incomplete detailed boundary response');
      }
      cache.unshift({ box, detail: atlasDetailedEdges(body.features) });
      if (cache.length > 5) cache.pop();
      failed = null;
    } catch (_) {
      if (pending === request) failed = box;
    } finally {
      clearTimeout(timeout);
      if (pending === request) {
        pending = null;
        redraw();
      }
    }
  }

  return function getDetail(zoom, view) {
    if (zoom < 10.3 || view[2] < 97 || view[0] > 107 || view[3] < 5 || view[1] > 21) {
      if (scheduled) clearTimeout(scheduled.timer);
      scheduled = null;
      failed = null;
      return null;
    }
    const cached = cache.find(entry => covers(entry.box, view));
    if (cached || (failed && covers(failed, view)) || (pending && covers(pending.box, view))) {
      if (scheduled) clearTimeout(scheduled.timer);
      scheduled = null;
      return cached?.detail ?? null;
    }
    if (scheduled && covers(scheduled.box, view)) return null;
    if (scheduled) clearTimeout(scheduled.timer);
    const padX = (view[2] - view[0]) * 0.22;
    const padY = (view[3] - view[1]) * 0.22;
    const box = [view[0] - padX, view[1] - padY, view[2] + padX, view[3] + padY];
    scheduled = { box, timer: setTimeout(() => load(box), 180) };
    return null;
  };
}

function createAtlasSvgBoundaries(map, project, status, redraw) {
  const group = document.createElementNS(map.namespaceURI, 'g');
  group.setAttribute('pointer-events', 'none');
  group.setAttribute('aria-hidden', 'true');
  const lines = ATLAS_ADMIN_LEVELS.map(() =>
    ['#18212d', '#edf4fc'].map((color) => {
      const line = document.createElementNS(map.namespaceURI, 'path');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      return line;
    }));
  const labels = document.createElementNS(map.namespaceURI, 'g');
  labels.setAttribute('text-anchor', 'middle');
  labels.setAttribute('dominant-baseline', 'central');
  labels.setAttribute('fill', '#f8fafc');
  labels.setAttribute('stroke', '#17212b');
  labels.setAttribute('paint-order', 'stroke');
  labels.setAttribute('font-weight', '650');
  group.append(...lines[2], ...lines[1], ...lines[0], labels);
  map.append(group);

  let loadStarted = false;
  let loadFailed = false;
  let data;
  const paths = new WeakMap();
  const exactPaths = new WeakMap();
  const getDetail = createAtlasDetailLoader(redraw);
  const previous = [];
  async function load() {
    loadStarted = true;
    try {
      const source = await fetchAtlasAdminData();
      data = ATLAS_ADMIN_LEVELS.slice(1).map(({ key }, i) => source[key].map(([name, point, box, rings, provinceCode]) => {
        const [x0, y0] = project(box[0], box[3]);
        const [x1, y1] = project(box[2], box[1]);
        return { name: name ? atlasAreaName(name, i + 1, provinceCode) : "", point: project(...point), box: [x0, y0, x1, y1], rings };
      }));
    } catch (_) {
      loadFailed = true;
    }
    redraw();
  }

  function pathFor(area) {
    if (!paths.has(area)) {
      paths.set(area, area.rings.map(ring => 'M' + ring.map(point =>
        project(...point).map(n => n.toFixed(5)).join(',')
      ).join('L') + 'Z').join(''));
    }
    return paths.get(area);
  }

  return function draw(zoom, { left, top, width, height }) {
    const level = atlasBoundaryLevel(zoom);
    const right = left + width, bottom = top + height;
    const latitudeAt = y => Math.atan(Math.sinh(-y * Math.PI / 180)) * 180 / Math.PI;
    const precise = getDetail(zoom, [left, latitudeAt(bottom), right, latitudeAt(top)]);
    const hasPrecise = Boolean(precise?.areas.length);
    group.style.display = level ? '' : 'none';
    if (!level) {
      atlasBoundaryLabel(status, 'เส้นเขตจังหวัด');
      return;
    }
    if (!data && !loadStarted) void load();
    if (!data && !hasPrecise) {
      atlasBoundaryLabel(status, loadFailed ? 'เส้นเขตจังหวัด · โหลดเส้นเขตย่อยไม่ได้' : 'กำลังโหลดเส้นเขตอำเภอและตำบล…');
      return;
    }
    const keepLabel = atlasLabelSpacing();
    const scale = map.clientHeight / height;
    const visible = (data ?? [[], []]).map((areas, i) => i < level ? areas.filter(area => {
      const [x0, y0, x1, y1] = area.box;
      return x0 <= right && x1 >= left && y0 <= bottom && y1 >= top;
    }) : []);
    const activeLevel = hasPrecise || visible[level - 1].length ? level : visible[0].length ? 1 : 0;
    atlasBoundaryLabel(status, 'เส้นเขต' + ATLAS_ADMIN_LEVELS[activeLevel].name +
      (level === 2 ? (hasPrecise ? ' · แบบละเอียด' : ' · แบบย่อ') : ''));
    if (hasPrecise && !exactPaths.has(precise)) {
      exactPaths.set(precise, precise.segments.map(segments => segments.map(([a, b]) =>
        'M' + project(...a).join(',') + 'L' + project(...b).join(',')
      ).join('')));
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      const rows = visible[i - 1] ?? [];
      const source = hasPrecise ? precise : rows;
      if (previous[i] === source || (Array.isArray(previous[i]) && Array.isArray(source) &&
        previous[i].length === source.length && source.every((area, j) => area === previous[i][j]))) continue;
      previous[i] = source;
      const d = hasPrecise ? exactPaths.get(precise)[i] : rows.map(pathFor).join('');
      const weight = ATLAS_ADMIN_LEVELS[i].weight;
      const [shadow, line] = lines[i];
      shadow.setAttribute('d', d);
      shadow.setAttribute('stroke-width', weight + 1.05);
      shadow.setAttribute('stroke-opacity', '0.64');
      line.setAttribute('d', d);
      line.setAttribute('stroke-width', weight);
      line.setAttribute('stroke-opacity', '0.79');
    }
    const frag = document.createDocumentFragment();
    labels.setAttribute('font-size', 12 / scale);
    labels.setAttribute('stroke-width', 2.7 / scale);
    const labelAreas = hasPrecise
      ? precise.areas.filter(area => area.name_th && area.centroid.every(Number.isFinite)).map(area => ({
        name: atlasAreaName(area.name_th, 2, area.prov_code), point: project(...area.centroid),
      }))
      : visible[activeLevel - 1] ?? [];
    for (const { name, point: [x, y] } of labelAreas) {
      if (!name || !keepLabel((x - left) * scale, (y - top) * scale, map.clientWidth, map.clientHeight)) continue;
      const label = document.createElementNS(map.namespaceURI, 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', y);
      label.textContent = name;
      frag.append(label);
    }
    labels.replaceChildren(frag);
  };
}

export interface MeshStats {
  triangles: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  area: number;
  volume: number;
  /** null when the mesh was too large to check */
  watertight: boolean | null;
}

const WATERTIGHT_CHECK_MAX_TRIS = 600_000;

/**
 * Parse an STL file (binary or ASCII) into flat triangle soup:
 * 9 floats per triangle (v0.xyz, v1.xyz, v2.xyz).
 * File normals are ignored; we always recompute from winding.
 */
export function parseSTL(buffer: ArrayBuffer): Float32Array {
  if (buffer.byteLength < 15) {
    throw new Error("File is too small to be an STL");
  }
  // Binary detection: exact byte-length match beats the unreliable "solid" prefix.
  if (buffer.byteLength >= 84) {
    const declared = new DataView(buffer).getUint32(80, true);
    if (buffer.byteLength === 84 + declared * 50) {
      return parseBinary(buffer, declared);
    }
  }
  const head = new TextDecoder().decode(buffer.slice(0, 512)).toLowerCase();
  if (head.trimStart().startsWith("solid") && head.includes("facet")) {
    return parseASCII(new TextDecoder().decode(buffer));
  }
  // Lenient binary fallback (some exporters append trailing bytes).
  if (buffer.byteLength >= 84) {
    const declared = new DataView(buffer).getUint32(80, true);
    if (declared > 0 && buffer.byteLength >= 84 + declared * 50) {
      return parseBinary(buffer, declared);
    }
  }
  throw new Error("Not a valid STL file (neither binary nor ASCII format detected)");
}

function parseBinary(buffer: ArrayBuffer, triangles: number): Float32Array {
  if (triangles === 0) throw new Error("STL contains no triangles");
  const dv = new DataView(buffer);
  const positions = new Float32Array(triangles * 9);
  let offset = 84;
  let p = 0;
  for (let i = 0; i < triangles; i++) {
    offset += 12; // skip stored normal
    for (let j = 0; j < 9; j++) {
      positions[p++] = dv.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2; // attribute byte count
  }
  return positions;
}

function parseASCII(text: string): Float32Array {
  const values: number[] = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    values.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  if (values.length === 0 || values.length % 9 !== 0) {
    throw new Error("ASCII STL is malformed (vertex count is not a multiple of 3)");
  }
  return Float32Array.from(values);
}

/** Serialize triangle soup to binary STL. */
export function serializeSTL(positions: Float32Array): ArrayBuffer {
  const triangles = positions.length / 9;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const dv = new DataView(buffer);
  const header = "Exported by STL Studio";
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, triangles, true);
  let offset = 84;
  const n = new Float64Array(3);
  for (let t = 0; t < triangles; t++) {
    const i = t * 9;
    triangleNormal(positions, i, n);
    dv.setFloat32(offset, n[0], true);
    dv.setFloat32(offset + 4, n[1], true);
    dv.setFloat32(offset + 8, n[2], true);
    offset += 12;
    for (let j = 0; j < 9; j++) {
      dv.setFloat32(offset, positions[i + j], true);
      offset += 4;
    }
    dv.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}

function triangleNormal(positions: Float32Array, i: number, out: Float64Array): void {
  const ax = positions[i + 3] - positions[i];
  const ay = positions[i + 4] - positions[i + 1];
  const az = positions[i + 5] - positions[i + 2];
  const bx = positions[i + 6] - positions[i];
  const by = positions[i + 7] - positions[i + 1];
  const bz = positions[i + 8] - positions[i + 2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz);
  if (len > 0) {
    nx /= len;
    ny /= len;
    nz /= len;
  }
  out[0] = nx;
  out[1] = ny;
  out[2] = nz;
}

/** Flat (per-face) normals, replicated for each of the 3 vertices. */
export function computeFlatNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  const n = new Float64Array(3);
  for (let i = 0; i < positions.length; i += 9) {
    triangleNormal(positions, i, n);
    for (let v = 0; v < 3; v++) {
      normals[i + v * 3] = n[0];
      normals[i + v * 3 + 1] = n[1];
      normals[i + v * 3 + 2] = n[2];
    }
  }
  return normals;
}

/**
 * Apply a 4x4 column-major matrix (three.js Matrix4.elements layout) to
 * every vertex, returning a new array. If the matrix mirrors (negative
 * determinant), triangle winding is flipped so faces keep pointing outward.
 */
export function applyMatrix(positions: Float32Array, e: ArrayLike<number>): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  const det =
    e[0] * (e[5] * e[10] - e[6] * e[9]) -
    e[4] * (e[1] * e[10] - e[2] * e[9]) +
    e[8] * (e[1] * e[6] - e[2] * e[5]);
  if (det < 0) flipWindingInPlace(out);
  return out;
}

/** Swap v1/v2 of every triangle, reversing orientation. Mutates the array. */
export function flipWindingInPlace(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 9) {
    for (let c = 0; c < 3; c++) {
      const tmp = positions[i + 3 + c];
      positions[i + 3 + c] = positions[i + 6 + c];
      positions[i + 6 + c] = tmp;
    }
  }
}

export function computeStats(positions: Float32Array): MeshStats {
  const triangles = positions.length / 9;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  let area = 0;
  let volume = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const x0 = positions[i], y0 = positions[i + 1], z0 = positions[i + 2];
    const x1 = positions[i + 3], y1 = positions[i + 4], z1 = positions[i + 5];
    const x2 = positions[i + 6], y2 = positions[i + 7], z2 = positions[i + 8];
    const ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
    const bx = x2 - x0, by = y2 - y0, bz = z2 - z0;
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    area += Math.hypot(cx, cy, cz) / 2;
    // Signed volume of tetrahedron (origin, v0, v1, v2)
    volume += (x0 * (y1 * z2 - z1 * y2) - y0 * (x1 * z2 - z1 * x2) + z0 * (x1 * y2 - y1 * x2)) / 6;
  }
  return {
    triangles,
    bboxMin: min,
    bboxMax: max,
    area,
    volume: Math.abs(volume),
    watertight: triangles <= WATERTIGHT_CHECK_MAX_TRIS ? checkWatertight(positions) : null,
  };
}

/**
 * Watertight check on triangle soup: weld vertices by exact position,
 * then verify every undirected edge is shared by exactly two triangles.
 */
function checkWatertight(positions: Float32Array): boolean {
  const vertexIds = new Map<string, number>();
  const triangles = positions.length / 9;
  const ids = new Uint32Array(triangles * 3);
  for (let v = 0; v < triangles * 3; v++) {
    const i = v * 3;
    const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
    let id = vertexIds.get(key);
    if (id === undefined) {
      id = vertexIds.size;
      vertexIds.set(key, id);
    }
    ids[v] = id;
  }
  const edgeCounts = new Map<number, number>();
  const nVerts = vertexIds.size;
  for (let t = 0; t < triangles; t++) {
    for (let e = 0; e < 3; e++) {
      const a = ids[t * 3 + e];
      const b = ids[t * 3 + ((e + 1) % 3)];
      if (a === b) return false; // degenerate edge
      const key = a < b ? a * nVerts + b : b * nVerts + a;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  for (const count of edgeCounts.values()) {
    if (count !== 2) return false;
  }
  return true;
}

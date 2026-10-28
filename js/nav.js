// 봇 길찾기: 맵을 격자로 나눠 A* 탐색 후 직선으로 갈 수 있는 구간은 건너뛴다.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class NavGrid {
  constructor(map, cell = 0.5) {
    this.map = map;
    this.cell = cell;
    this.half = map.half;
    this.n = Math.ceil((this.half * 2) / cell);
    this.blocked = new Uint8Array(this.n * this.n);
    const margin = CONFIG.character.radius + 0.08;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const p = this.cellCenter(i, j);
        this.blocked[j * this.n + i] = map.isBlocked(p.x, p.z, margin) ? 1 : 0;
      }
    }
    this.free = [];
    for (let k = 0; k < this.blocked.length; k++) if (!this.blocked[k]) this.free.push(k);
  }

  cellCenter(i, j) {
    return { x: -this.half + (i + 0.5) * this.cell, z: -this.half + (j + 0.5) * this.cell };
  }

  toCell(x, z) {
    const i = Math.max(0, Math.min(this.n - 1, Math.floor((x + this.half) / this.cell)));
    const j = Math.max(0, Math.min(this.n - 1, Math.floor((z + this.half) / this.cell)));
    return [i, j];
  }

  isFree(x, z) {
    const [i, j] = this.toCell(x, z);
    return !this.blocked[j * this.n + i];
  }

  // 가장 가까운 빈 칸
  nearestFree(i, j) {
    if (!this.blocked[j * this.n + i]) return [i, j];
    for (let r = 1; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= this.n || b >= this.n) continue;
          if (!this.blocked[b * this.n + a]) return [a, b];
        }
      }
    }
    return [i, j];
  }

  randomFreePoint() {
    const k = this.free[Math.floor(Math.random() * this.free.length)];
    const p = this.cellCenter(k % this.n, Math.floor(k / this.n));
    return new THREE.Vector3(p.x, 0, p.z);
  }

  // a→b 직선이 막힘 없이 지나가는지
  lineWalkable(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // 경로: Vector3 배열 (시작점 제외). 실패 시 null
  findPath(from, to) {
    const n = this.n;
    const [si, sj] = this.nearestFree(...this.toCell(from.x, from.z));
    const [gi, gj] = this.nearestFree(...this.toCell(to.x, to.z));
    const start = sj * n + si, goal = gj * n + gi;
    if (start === goal) return [to.clone()];
    if (this.lineWalkable(from.x, from.z, to.x, to.z)) return [to.clone()];

    const g = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    const h = (k) => {
      const dx = Math.abs((k % n) - gi), dz = Math.abs(Math.floor(k / n) - gj);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    g[start] = 0;
    heap.push(start, h(start));
    let found = false;
    let iter = 0;
    while (heap.size && iter++ < 6000) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % n, cj = Math.floor(cur / n);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const a = ci + di, b = cj + dj;
          if (a < 0 || b < 0 || a >= n || b >= n) continue;
          const k = b * n + a;
          if (this.blocked[k] || closed[k]) continue;
          // 대각선은 양옆이 모두 비어 있을 때만
          if (di && dj && (this.blocked[cj * n + a] || this.blocked[b * n + ci])) continue;
          const ng = g[cur] + (di && dj ? Math.SQRT2 : 1);
          if (ng < g[k]) {
            g[k] = ng;
            came[k] = cur;
            heap.push(k, ng + h(k));
          }
        }
      }
    }
    if (!found) return null;

    const cells = [];
    for (let k = goal; k !== -1 && k !== start; k = came[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => {
      const p = this.cellCenter(k % n, Math.floor(k / n));
      return new THREE.Vector3(p.x, 0, p.z);
    });
    pts[pts.length - 1] = to.clone();
    // 직선으로 이어지는 점 생략
    const out = [];
    let ax = from.x, az = from.z;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineWalkable(ax, az, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      ax = pts[j].x; az = pts[j].z;
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[par], k[i]] = [k[i], k[par]];
      [p[par], p[i]] = [p[i], p[par]];
      i = par;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}

// 놀이터 맵: 기본 도형으로 구성하고, 충돌체(colliders)와 레이캐스트 대상(occluders)을 함께 만든다.
// 나중에 모델로 교체할 때는 시각 메쉬만 바꾸고 colliders/occluders 정의는 그대로 두면 된다.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const MAT = {
  grass: new THREE.MeshLambertMaterial({ color: 0x7fb069 }),
  sand: new THREE.MeshLambertMaterial({ color: 0xe8d39a }),
  wall: new THREE.MeshLambertMaterial({ color: 0xc9b8a8 }),
  wallTop: new THREE.MeshLambertMaterial({ color: 0xa89580 }),
  red: new THREE.MeshLambertMaterial({ color: 0xd9534f }),
  blue: new THREE.MeshLambertMaterial({ color: 0x3f7fbf }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xf0c419 }),
  green: new THREE.MeshLambertMaterial({ color: 0x4caf50 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x9aa5b1 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4423 }),
  leaves: new THREE.MeshLambertMaterial({ color: 0x3d8b3d }),
  concrete: new THREE.MeshLambertMaterial({ color: 0x9e9e9e }),
  roof: new THREE.MeshLambertMaterial({ color: 0xb5452f }),
};

export class PlaygroundMap {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'playground';
    scene.add(this.group);

    this.colliders = []; // {type:'box', minX,maxX,minZ,maxZ} | {type:'circle', x,z,r}
    this.occluders = []; // 레이캐스트(시야/숨음 판정)에 쓰이는 메쉬
    this.hideSurfaces = []; // 봇이 얼굴을 묻을 수 있는 벽면 후보 {x,z,nx,nz,len}
    this.spawnPoints = [];
    this.itemSpawns = [];
    this.half = CONFIG.map.halfSize;

    this._build();
  }

  // ---------- 헬퍼 ----------
  _mesh(geo, mat, x, y, z, { occlude = true, shadow = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.group.add(m);
    if (occlude) this.occluders.push(m);
    return m;
  }

  box(w, h, d, x, y, z, mat, { collide = true, occlude = true, hide = false, shadow = true } = {}) {
    const m = this._mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, { occlude, shadow });
    if (collide) {
      this.colliders.push({ type: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
    if (hide && h >= 1.6) {
      // 네 면 모두 얼굴을 박을 수 있는 면으로 등록
      this.hideSurfaces.push({ x: x + w / 2, z, nx: 1, nz: 0, len: d });
      this.hideSurfaces.push({ x: x - w / 2, z, nx: -1, nz: 0, len: d });
      this.hideSurfaces.push({ x, z: z + d / 2, nx: 0, nz: 1, len: w });
      this.hideSurfaces.push({ x, z: z - d / 2, nx: 0, nz: -1, len: w });
    }
    return m;
  }

  cylinder(r, h, x, y, z, mat, { collide = true, occlude = true, radial = 10 } = {}) {
    const m = this._mesh(new THREE.CylinderGeometry(r, r, h, radial), mat, x, y + h / 2, z, { occlude });
    if (collide) this.colliders.push({ type: 'circle', x, z, r });
    return m;
  }

  // 두 점 사이를 잇는 막대 (정글짐/그네 프레임용)
  bar(a, b, r, mat, { occlude = true } = {}) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = this._mesh(new THREE.CylinderGeometry(r, r, len, 6), mat, 0, 0, 0, { occlude, shadow: true });
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  }

  // ---------- 맵 구성 ----------
  _build() {
    const H = this.half;

    // 바닥
    const ground = this._mesh(new THREE.PlaneGeometry(H * 2 + 20, H * 2 + 20), MAT.grass, 0, 0, 0, { shadow: false });
    ground.rotation.x = -Math.PI / 2;
    ground.name = 'ground';
    this.ground = ground;

    // 외곽 담장 (높이 2.4m, 얼굴 숨기기 가능)
    const T = 0.4, WH = 2.4;
    this.box(H * 2 + T * 2, WH, T, 0, 0, -H - T / 2, MAT.wall);
    this.box(H * 2 + T * 2, WH, T, 0, 0, H + T / 2, MAT.wall);
    this.box(T, WH, H * 2, -H - T / 2, 0, 0, MAT.wall);
    this.box(T, WH, H * 2, H + T / 2, 0, 0, MAT.wall);
    // 외곽 담장 안쪽 면도 숨을 수 있는 면
    for (let s = -H + 3; s <= H - 3; s += 6) {
      this.hideSurfaces.push({ x: s, z: -H, nx: 0, nz: 1, len: 5 });
      this.hideSurfaces.push({ x: s, z: H, nx: 0, nz: -1, len: 5 });
      this.hideSurfaces.push({ x: -H, z: s, nx: 1, nz: 0, len: 5 });
      this.hideSurfaces.push({ x: H, z: s, nx: -1, nz: 0, len: 5 });
    }

    // 내부 벽 (숨기 좋은 곳)
    this.box(6, 2.2, 0.4, -8, 0, 6, MAT.wall, { hide: true });
    this.box(0.4, 2.2, 4, -5.2, 0, 8.2, MAT.wall, { hide: true }); // ㄱ자 코너
    this.box(0.4, 2.2, 5, 9, 0, -9, MAT.wall, { hide: true });
    this.box(4, 2.2, 0.4, 11.2, 0, -6.7, MAT.wall, { hide: true });
    this.box(3.5, 2.0, 0.4, 2, 0, 11, MAT.wall, { hide: true });
    this.box(0.4, 2.0, 3, -1, 0, -3.5, MAT.wall, { hide: true });

    this._sandbox(-3, 2.5);
    this._slide(-8, -6);
    this._jungleGym(4, 3);
    this._swings(9, 3);
    this._playhouse(-11, -11);
    this._tunnel(10, 10.5);

    // 나무
    [[-12, 1], [-2, -11], [12.5, -1], [6, -12], [-12.5, 11.5], [6.5, 9]].forEach(([x, z], i) => this._tree(x, z, i));

    // 벤치
    this.box(1.8, 0.45, 0.5, 0, 0, -13.8, MAT.wood);
    this.box(0.5, 0.45, 1.8, 13.8, 0, 6, MAT.wood);

    // 스폰 지점
    this.spawnPoints = [
      [0, 0], [-10, -2], [10, -4], [-4, 11.5], [12, 12.5], [-12, -7], [5, -13], [-6, -13],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));

    // 아이템 상자 위치
    this.itemSpawns = [
      [-3, 2.5], [-13, -3], [13, -12], [0, 7.5], [7, -5], [-7, 12.5], [-9, -1.5],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }

  _sandbox(x, z) {
    const s = 4.4;
    const sand = this._mesh(new THREE.PlaneGeometry(s, s), MAT.sand, x, 0.02, z, { shadow: false });
    sand.rotation.x = -Math.PI / 2;
    const b = 0.18;
    // 낮은 테두리는 걸어 넘을 수 있다고 보고 충돌 없음
    this.box(s + b * 2, 0.2, b, x, 0, z - s / 2 - b / 2, MAT.wood, { collide: false });
    this.box(s + b * 2, 0.2, b, x, 0, z + s / 2 + b / 2, MAT.wood, { collide: false });
    this.box(b, 0.2, s, x - s / 2 - b / 2, 0, z, MAT.wood, { collide: false });
    this.box(b, 0.2, s, x + s / 2 + b / 2, 0, z, MAT.wood, { collide: false });
  }

  _slide(x, z) {
    // 탑 (기둥 + 발판 + 지붕) — 아래 공간은 막힌 박스로 단순화
    this.box(1.8, 1.5, 1.8, x, 0, z, MAT.blue, { hide: true });
    this.box(1.9, 0.1, 1.9, x, 2.5, z, MAT.roof, { collide: false });
    [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].forEach(([dx, dz]) => {
      this.cylinder(0.06, 1.0, x + dx, 1.5, z + dz, MAT.metal, { collide: false });
    });
    // 미끄럼 경사면 (+X 방향으로 내려감)
    const len = 3.2;
    const ramp = this._mesh(new THREE.BoxGeometry(len, 0.08, 0.9), MAT.yellow, x + 0.9 + len / 2 * Math.cos(0.45), 0.75, z);
    ramp.rotation.z = -0.45;
    this.colliders.push({ type: 'box', minX: x + 0.9, maxX: x + 0.9 + len * Math.cos(0.45), minZ: z - 0.5, maxZ: z + 0.5 });
    // 사다리 (-X 방향)
    for (let i = 0; i < 5; i++) {
      this.box(0.1, 0.06, 0.8, x - 1.2, 0.25 + i * 0.3, z, MAT.metal, { collide: false });
    }
    this.colliders.push({ type: 'box', minX: x - 1.3, maxX: x - 0.9, minZ: z - 0.45, maxZ: z + 0.45 });
  }

  _jungleGym(x, z) {
    const s = 3, h = 2.2, n = 3;
    const step = s / n;
    const ox = x - s / 2, oz = z - s / 2;
    const V = (a, b, c) => new THREE.Vector3(a, b, c);
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        this.bar(V(ox + i * step, 0, oz + j * step), V(ox + i * step, h, oz + j * step), 0.04, MAT.red);
      }
    }
    for (let k = 1; k <= 3; k++) {
      const y = (h / 3) * k;
      for (let i = 0; i <= n; i++) {
        this.bar(V(ox + i * step, y, oz), V(ox + i * step, y, oz + s), 0.035, MAT.red);
        this.bar(V(ox, y, oz + i * step), V(ox + s, y, oz + i * step), 0.035, MAT.red);
      }
    }
    this.colliders.push({ type: 'box', minX: ox, maxX: ox + s, minZ: oz, maxZ: oz + s });
  }

  _swings(x, z) {
    const w = 4, h = 2.4, d = 1.6;
    const V = (a, b, c) => new THREE.Vector3(a, b, c);
    for (const sx of [-w / 2, w / 2]) {
      this.bar(V(x + sx, 0, z - d / 2), V(x + sx, h, z), 0.07, MAT.metal);
      this.bar(V(x + sx, 0, z + d / 2), V(x + sx, h, z), 0.07, MAT.metal);
      this.colliders.push({ type: 'circle', x: x + sx, z: z - d / 2 + 0.1, r: 0.15 });
      this.colliders.push({ type: 'circle', x: x + sx, z: z + d / 2 - 0.1, r: 0.15 });
    }
    this.bar(V(x - w / 2, h, z), V(x + w / 2, h, z), 0.06, MAT.metal);
    this.swingSeats = [];
    for (const sx of [-0.9, 0.9]) {
      const seatGroup = new THREE.Group();
      seatGroup.position.set(x + sx, h, z);
      const chainMat = MAT.metal;
      for (const cx of [-0.22, 0.22]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 4), chainMat);
        c.position.set(cx, -0.95, 0);
        seatGroup.add(c);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.25), MAT.red);
      seat.position.y = -1.9;
      seat.castShadow = true;
      seatGroup.add(seat);
      this.group.add(seatGroup);
      this.swingSeats.push(seatGroup);
    }
  }

  _playhouse(x, z) {
    const s = 2.6, h = 2.0;
    // 뒤쪽 벽과 양옆 벽, 앞쪽은 문(빈 공간)
    this.box(s, h, 0.2, x, 0, z - s / 2, MAT.yellow, { hide: true });
    this.box(0.2, h, s, x - s / 2, 0, z, MAT.yellow, { hide: true });
    this.box(0.2, h, s, x + s / 2, 0, z, MAT.yellow, { hide: true });
    this.box(0.8, h, 0.2, x - 0.9, 0, z + s / 2, MAT.yellow);
    this.box(0.8, h, 0.2, x + 0.9, 0, z + s / 2, MAT.yellow);
    const roof = this._mesh(new THREE.ConeGeometry(s * 0.85, 1.2, 4), MAT.roof, x, h + 0.6, z);
    roof.rotation.y = Math.PI / 4;
  }

  _tunnel(x, z) {
    const r = 0.75, len = 3.2;
    const m = this._mesh(new THREE.CylinderGeometry(r, r, len, 14, 1, true), MAT.concrete, x, r, z);
    m.material = MAT.concrete.clone();
    m.material.side = THREE.DoubleSide;
    m.rotation.z = Math.PI / 2;
    this.colliders.push({ type: 'box', minX: x - len / 2, maxX: x + len / 2, minZ: z - r, maxZ: z + r });
  }

  _tree(x, z, i) {
    const h = 2.2 + (i % 3) * 0.4;
    this.cylinder(0.22, h, x, 0, z, MAT.trunk, { radial: 8 });
    this.colliders[this.colliders.length - 1].r = 0.3;
    const canopy = this._mesh(new THREE.IcosahedronGeometry(1.4 + (i % 2) * 0.3, 0), MAT.leaves, x, h + 0.8, z);
    canopy.rotation.y = i;
  }

  update(t) {
    // 그네 흔들림
    if (this.swingSeats) {
      this.swingSeats.forEach((s, i) => { s.rotation.x = Math.sin(t * 1.4 + i * 1.7) * 0.25; });
    }
  }

  // ---------- 충돌 ----------
  // 원(캐릭터)을 충돌체 밖으로 밀어낸다. pos는 Vector3 (x,z 사용)
  resolveCollision(pos, radius) {
    const H = this.half - radius;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        if (c.type === 'box') {
          const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
          const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
          let dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < radius * radius) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              pos.x = cx + (dx / d) * radius;
              pos.z = cz + (dz / d) * radius;
            } else {
              // 중심이 박스 안: 가장 가까운 면으로 밀어냄
              const pushes = [
                [c.minX - radius - pos.x, 0], [c.maxX + radius - pos.x, 0],
                [0, c.minZ - radius - pos.z], [0, c.maxZ + radius - pos.z],
              ];
              pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
              pos.x += pushes[0][0];
              pos.z += pushes[0][1];
            }
          }
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const r = c.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = c.x + (dx / d) * r;
            pos.z = c.z + (dz / d) * r;
          }
        }
      }
    }
    pos.x = Math.max(-H, Math.min(H, pos.x));
    pos.z = Math.max(-H, Math.min(H, pos.z));
  }

  // 점이 충돌체와 겹치는지 (내비게이션 격자용)
  isBlocked(x, z, margin) {
    if (Math.abs(x) > this.half - margin || Math.abs(z) > this.half - margin) return true;
    for (const c of this.colliders) {
      if (c.type === 'box') {
        if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return true;
      } else {
        const dx = x - c.x, dz = z - c.z, r = c.r + margin;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }
}

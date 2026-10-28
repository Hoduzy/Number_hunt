// 숨음 게이지: 얼굴 앞으로 부채꼴 레이캐스트를 쏴서 대부분이 바로 막히면 '숨은 상태'.
// 다른 캐릭터가 실제로 보고 있는지는 상관없다. (얼굴 숫자가 누구에게도 보일 수 없는 상태만 판정)
import * as THREE from 'three';
import { CONFIG } from './config.js';

const DEG = Math.PI / 180;
const YAW_OFFSETS = [-40, -20, 0, 20, 40].map((d) => Math.tan(d * DEG));
const PITCH_OFFSETS = [-18, 0, 18].map((d) => Math.tan(d * DEG));

const _o = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _d = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class GaugeSystem {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CONFIG.gauge.rayLength;
    this.timers = new Map();
  }

  // 얼굴 위치/방향에서 막힌 광선 비율 (0~1)
  blockedRatio(origin, faceDir, yaw) {
    _f.copy(faceDir).normalize();
    _r.crossVectors(_f, WORLD_UP);
    if (_r.lengthSq() < 1e-4) _r.set(-Math.cos(yaw), 0, Math.sin(yaw)); // 얼굴이 바로 아래를 볼 때
    _r.normalize();
    _u.crossVectors(_r, _f).normalize();
    let blocked = 0, total = 0;
    this.raycaster.far = CONFIG.gauge.rayLength;
    for (const ty of YAW_OFFSETS) {
      for (const tp of PITCH_OFFSETS) {
        _d.copy(_f).addScaledVector(_r, ty).addScaledVector(_u, tp).normalize();
        this.raycaster.set(origin, _d);
        if (this.raycaster.intersectObjects(this.map.occluders, false).length) blocked++;
        total++;
      }
    }
    return blocked / total;
  }

  isHidden(c) {
    c.getEyePosition(_o);
    const f = c.getFaceDirection(new THREE.Vector3());
    return this.blockedRatio(_o, f, c.yaw) >= CONFIG.gauge.hiddenRatio;
  }

  update(dt) {
    const G = CONFIG.gauge;
    for (const c of this.game.characters) {
      if (!c.alive) continue;
      // 판정은 checkInterval마다(캐릭터별로 엇갈리게), 게이지는 매 프레임 변화
      let t = (this.timers.get(c) ?? c.id * (G.checkInterval / 5)) - dt;
      if (t <= 0) {
        t += G.checkInterval;
        c.hidden = this.isHidden(c);
      }
      this.timers.set(c, t);
      const prev = c.gauge;
      if (c.hidden) c.gauge = Math.min(1, c.gauge + dt / G.fillSeconds);
      else c.gauge = Math.max(0, c.gauge - dt / G.drainSeconds);
      if (prev < G.warnRatio && c.gauge >= G.warnRatio) this.game.emit('gaugeWarn', { character: c });
      if (c.gauge >= 1) this.game.eliminate(c, { reason: 'gauge' });
    }
  }

  // 봇이 얼굴을 묻을 수 있는 지점 목록 {pos, yaw}
  computeHideSpots() {
    const R = CONFIG.character.radius;
    const spots = [];
    const eye = CONFIG.character.eyeHeight;
    for (const s of this.map.hideSurfaces) {
      const tx = -s.nz, tz = s.nx; // 면을 따라가는 방향
      const n = Math.max(1, Math.floor(s.len / 1.2));
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n - 0.5;
        const x = s.x + tx * k * s.len + s.nx * (R + 0.12);
        const z = s.z + tz * k * s.len + s.nz * (R + 0.12);
        if (this.map.isBlocked(x, z, R - 0.02)) continue;
        const yaw = Math.atan2(-s.nx, -s.nz);
        _o.set(x, eye, z);
        _d.set(-s.nx, 0, -s.nz);
        if (this.blockedRatio(_o, _d.clone(), yaw) >= 0.9) spots.push({ pos: new THREE.Vector3(x, 0, z), yaw });
      }
    }
    return spots;
  }
}

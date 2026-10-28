// AI 봇 컨트롤러. 플레이어와 같은 규칙(근시, 숨음 게이지, 아이템, 숫자 입력)을 따른다.
// Controller 규약: update(dt, now)에서 character.input을 채운다.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const DEG = Math.PI / 180;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = new THREE.Vector3();
const _d = new THREE.Vector3();

// ---------- 시야 판정 (봇 공용) ----------
export class Perception {
  constructor(game) {
    this.game = game;
    this.raycaster = new THREE.Raycaster();
  }

  lineOfSight(from, to) {
    _d.subVectors(to, from);
    const dist = _d.length();
    if (dist < 0.05) return true;
    this.raycaster.set(from, _d.multiplyScalar(1 / dist));
    this.raycaster.far = dist - 0.15;
    return this.raycaster.intersectObjects(this.game.map.occluders, false).length === 0;
  }

  // observer가 target의 이마 숫자를 '읽을 수 있는' 상태인지
  //  - 거리: 선명 거리 이내 (망원경이면 멀리, 섬광탄으로 빛나면 흐린 거리에서도)
  //  - target의 얼굴이 observer 쪽을 향하고, observer도 target을 보고 있으며, 가리는 것이 없음
  canReadFace(observer, target, now) {
    if (!target.alive || target === observer) return false;
    const eo = observer.getEyePosition(_a);
    const et = target.getEyePosition(_b);
    const dist = eo.distanceTo(et);
    const tele = observer.isTelescoping(now);
    let range = CONFIG.vision.sharpDistance + 0.4;
    let fov = 50;
    if (tele) { range = CONFIG.vision.telescopeSharp; fov = 14; }
    if (now < target.glowUntil) range = Math.max(range, 16);
    if (dist > range) return false;
    // 상대 얼굴이 나를 향하는지
    target.getFaceDirection(_f);
    _d.subVectors(eo, et).normalize();
    if (_f.dot(_d) < Math.cos(65 * DEG)) return false;
    // 내가 상대를 보고 있는지
    observer.getFaceDirection(_f);
    if (_f.dot(_d.negate()) < Math.cos(fov * DEG)) return false;
    return this.lineOfSight(eo, et);
  }

  // 흐릿하게라도 '형체'가 보이는지 (위치 파악용)
  canSeeBody(observer, target) {
    if (!target.alive || target === observer) return false;
    const eo = observer.getEyePosition(_a);
    const et = target.getEyePosition(_b);
    const dist = eo.distanceTo(et);
    if (dist > 20) return false;
    if (dist > 2.5) {
      observer.getFaceDirection(_f);
      _d.subVectors(et, eo).normalize();
      if (_f.dot(_d) < Math.cos(75 * DEG)) return false;
    }
    return this.lineOfSight(eo, et);
  }

  // target이 나를 향해 얼굴을 들이밀고 있는지 (위협 판정)
  isThreat(me, other) {
    if (!other.alive || other === me) return false;
    const d = other.position.distanceTo(me.position);
    if (d > 5) return false;
    other.getFaceDirection(_f);
    _d.subVectors(me.position, other.position).setY(0).normalize();
    return _f.dot(_d) > Math.cos(45 * DEG);
  }
}

// ---------- 봇 ----------
export class BotController {
  constructor(character, game, perception, diff) {
    this.c = character;
    this.game = game;
    this.per = perception;
    this.diff = diff;
    this.state = 'wander';
    this.path = null;
    this.goal = null;
    this.faceYaw = null; // 특정 방향을 보고 싶을 때
    this.thinkTimer = Math.random() * diff.reaction;
    this.readTimers = new Map();
    this.memory = new Map(); // id -> {pos, time}
    this.hideCooldown = 8 + Math.random() * 10;
    this.leaveAt = 0.6;
    this.stateUntil = 0;
    this.pendingPhotoGuesses = [];
    this.lastPos = character.position.clone();
    this.stuckTime = 0;
    this.repathTimer = 0;
    this.proneUntil = 0;
    this.itemCooldownUntil = 0;
  }

  enemies() { return this.game.characters.filter((o) => o.alive && o !== this.c); }

  update(dt, now) {
    const c = this.c;
    this.hideCooldown -= dt;
    this._perceive(now);
    this._read(dt, now);
    this._photoGuesses(now);

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = this.diff.reaction * (0.7 + Math.random() * 0.6);
      this._think(now);
    }
    this._steer(dt, now);

    // 엎드림 해제
    if (c.prone && now > this.proneUntil) c.input.toggleProne = true;
  }

  // 보이는 상대 위치 기억
  _perceive(now) {
    for (const o of this.enemies()) {
      if (this.per.canSeeBody(this.c, o)) this.memory.set(o.id, { pos: o.position.clone(), time: now, ch: o });
    }
    for (const [id, m] of this.memory) {
      if (!m.ch.alive || now - m.time > 6) this.memory.delete(id);
    }
  }

  // 선명하게 보이는 숫자를 일정 시간 보면 확률적으로 입력
  _read(dt, now) {
    const c = this.c;
    let readingAny = false;
    for (const o of this.enemies()) {
      let t = this.readTimers.get(o.id) || 0;
      if (this.per.canReadFace(c, o, now)) {
        t += dt;
        readingAny = true;
        // 빛나는 숫자는 더 빨리 읽힌다
        if (now < o.glowUntil) t += dt;
        if (t >= this.diff.readTime && now >= c.penaltyUntil) {
          if (Math.random() < this.diff.guessChance) {
            this._guess(o);
            t = 0;
          } else {
            t = this.diff.readTime * 0.5;
          }
        }
      } else {
        t = Math.max(0, t - dt * 0.5);
      }
      this.readTimers.set(o.id, t);
    }
    this.reading = readingAny;
  }

  _guess(target) {
    const c = this.c;
    let num = target.number;
    if (Math.random() > this.diff.accuracy) {
      // 잘못 읽음: 한 자리를 다르게
      const i = Math.floor(Math.random() * 3);
      let d;
      do { d = String(Math.floor(Math.random() * 10)); } while (d === num[i] || (i === 0 && d === '0'));
      num = num.slice(0, i) + d + num.slice(i + 1);
    }
    this.game.submitGuess(c, num);
  }

  _photoGuesses(now) {
    for (let i = this.pendingPhotoGuesses.length - 1; i >= 0; i--) {
      const p = this.pendingPhotoGuesses[i];
      if (now < p.at || now < this.c.penaltyUntil) continue;
      this.pendingPhotoGuesses.splice(i, 1);
      if (p.target.alive) this._guess(p.target);
    }
  }

  // 카메라 촬영: 블러 없는 사진이므로 얼굴이 이쪽을 향한 상대는 먼 거리도 나중에 읽을 수 있다
  onCameraShot(now) {
    const c = this.c;
    for (const o of this.enemies()) {
      const eo = c.getEyePosition(new THREE.Vector3());
      const et = o.getEyePosition(new THREE.Vector3());
      const dist = eo.distanceTo(et);
      if (dist > 14) continue;
      o.getFaceDirection(_f);
      _d.subVectors(eo, et).normalize();
      if (_f.dot(_d) < Math.cos(60 * DEG)) continue;
      c.getFaceDirection(_f);
      if (_f.dot(_d.negate()) < Math.cos(35 * DEG)) continue;
      if (!this.per.lineOfSight(eo, et)) continue;
      this.pendingPhotoGuesses.push({ target: o, at: now + this.diff.readTime * (1 + dist / 10) });
    }
  }

  // ---------- 의사결정 ----------
  _think(now) {
    const c = this.c;
    const d = this.diff;
    if (c.isStunned(now)) return;

    // 1) 숨는 중: 게이지가 차면 나온다
    if (this.state === 'hide') {
      if (c.gauge >= this.leaveAt || now > this.stateUntil) {
        this.hideCooldown = 12 + Math.random() * 15;
        this._setState('wander', now);
      } else {
        return;
      }
    }

    // 2) 위협: 누군가 가까이에서 내 얼굴을 보고 있다
    const threat = this.enemies().find((o) => this.per.isThreat(c, o));
    if (threat && Math.random() < d.evade) {
      if (c.gauge < 0.3 && this.hideCooldown <= 0 && Math.random() < 0.4 && this._goHide(now, 8)) return;
      if (Math.random() < 0.25 && !c.prone && c.gauge < 0.5) {
        // 그 자리에 엎드려 얼굴 숨기기
        c.input.toggleProne = true;
        this.proneUntil = now + 2 + Math.random() * 2;
        this._setState('prone', now, 3);
        return;
      }
      this._evade(threat, now);
      return;
    }
    if (c.prone) return;

    // 3) 아이템 사용
    if (c.item && now >= this.itemCooldownUntil && Math.random() < d.itemUse && this._tryUseItem(now)) return;

    // 4) 사냥: 기억하는 가장 가까운 상대
    const target = this._pickTarget();
    if (target && Math.random() < d.aggression + 0.2) {
      this._hunt(target, now);
      return;
    }

    // 5) 아이템 줍기
    if (!c.item) {
      const box = this._nearestBox(14);
      if (box) {
        this._setState('getItem', now, 10);
        this._goTo(box.pos);
        return;
      }
    }

    // 6) 가끔 숨기
    if (this.hideCooldown <= 0 && c.gauge < 0.2 && Math.random() < 0.25 * (1.2 - d.aggression)) {
      if (this._goHide(now, 14)) return;
    }

    // 7) 돌아다니기
    if (this.state !== 'wander' || !this.path || !this.path.length || now > this.stateUntil) {
      this._setState('wander', now, 6 + Math.random() * 5);
      this._goTo(this.game.nav.randomFreePoint());
    }
  }

  _setState(s, now, dur = 999) {
    this.state = s;
    this.stateUntil = now + dur;
    this.faceYaw = null;
  }

  _pickTarget() {
    let best = null, bd = Infinity;
    for (const m of this.memory.values()) {
      if (!m.ch.alive) continue;
      const dd = m.pos.distanceTo(this.c.position);
      if (dd < bd) { bd = dd; best = m; }
    }
    return best;
  }

  _hunt(m, now) {
    const t = m.ch;
    this._setState('hunt', now, 4);
    this.huntTarget = t;
    // 상대 얼굴 정면 약 2m 지점으로 이동
    t.getFaceDirection(_f);
    _f.y = 0;
    if (_f.lengthSq() < 0.01) _f.set(Math.sin(t.yaw), 0, Math.cos(t.yaw));
    _f.normalize();
    const goal = m.pos.clone().addScaledVector(_f, 2.0);
    if (!this.game.nav.isFree(goal.x, goal.z)) goal.copy(m.pos).addScaledVector(_f, 1.2);
    this._goTo(goal);
  }

  _evade(threat, now) {
    const c = this.c;
    this._setState('evade', now, 1.5 + Math.random() * 1.5);
    _d.subVectors(c.position, threat.position).setY(0).normalize();
    // 상대 반대쪽으로 이동하며 얼굴도 돌린다
    const side = Math.random() < 0.5 ? 1 : -1;
    const dir = new THREE.Vector3(_d.x - _d.z * 0.6 * side, 0, _d.z + _d.x * 0.6 * side).normalize();
    const goal = c.position.clone().addScaledVector(dir, 4);
    goal.x = THREE.MathUtils.clamp(goal.x, -14, 14);
    goal.z = THREE.MathUtils.clamp(goal.z, -14, 14);
    this._goTo(goal);
    this.faceYaw = Math.atan2(_d.x, _d.z);
  }

  _goHide(now, maxDist) {
    const spots = this.game.hideSpots;
    if (!spots || !spots.length) return false;
    const c = this.c;
    let best = null, bd = Infinity;
    for (const s of spots) {
      const dd = s.pos.distanceTo(c.position);
      const taken = this.game.characters.some((o) => o !== c && o.alive && o.position.distanceTo(s.pos) < 1.2);
      if (!taken && dd < bd && dd < maxDist) { bd = dd; best = s; }
    }
    if (!best) return false;
    this._setState('hide', now, 50);
    this.hideSpot = best;
    this.leaveAt = 0.3 + Math.random() * 0.35;
    this._goTo(best.pos);
    return true;
  }

  _nearestBox(maxDist) {
    let best = null, bd = Infinity;
    for (const b of this.game.items.activeBoxes()) {
      const dd = b.pos.distanceTo(this.c.position);
      if (dd < bd && dd < maxDist) { bd = dd; best = b; }
    }
    return best;
  }

  _tryUseItem(now) {
    const c = this.c;
    const type = c.item.type;
    const target = this._pickTarget();
    if (!target) return false;
    const dist = target.pos.distanceTo(c.position);
    const yawTo = Math.atan2(target.pos.x - c.position.x, target.pos.z - c.position.z);
    const facing = Math.abs(angleDiff(c.yaw, yawTo)) < 12 * DEG;
    let want = false;
    if (type === 'telescope') want = dist > 5 && dist < 20;
    else if (type === 'flash') want = dist > 2.5 && dist < 7.5;
    else if (type === 'camera') want = dist > 3.5 && dist < 13;
    if (!want) return false;
    this._setState('aim', now, 1.2);
    this.huntTarget = target.ch;
    this.path = null;
    this.faceYaw = yawTo;
    if (!facing) return true; // 이번엔 조준만, 다음 판단에서 사용
    const used = this.game.useItem(c);
    if (used && type === 'camera') this.onCameraShot(now);
    if (used) this.itemCooldownUntil = now + 4 + Math.random() * 4;
    if (used && type === 'telescope') this._setState('scope', now, CONFIG.items.telescopeSeconds);
    return used;
  }

  _goTo(p) {
    this.goal = p.clone();
    this.path = this.game.nav.findPath(this.c.position, p) || [p.clone()];
  }

  // ---------- 이동 ----------
  _steer(dt, now) {
    const c = this.c;
    const inp = c.input;
    inp.moveX = 0; inp.moveZ = 0;
    let moveYaw = null;

    if (!c.prone && this.path && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - c.position.x, dz = wp.z - c.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        this.path.shift();
      } else {
        let speed = 1;
        if (this.state === 'scope') speed = 0.5;
        if (this.state === 'hunt' && this.reading) speed = 0.15; // 읽는 중엔 멈춰서 본다
        inp.moveX = (dx / dist) * speed;
        inp.moveZ = (dz / dist) * speed;
        moveYaw = Math.atan2(dx, dz);
      }
    }

    // 막힘 감지 → 경로 재탐색
    if (Math.hypot(inp.moveX, inp.moveZ) > 0.3 && !c.isStunned(now)) {
      const moved = c.position.distanceTo(this.lastPos);
      if (moved < 0.02) this.stuckTime += dt; else this.stuckTime = 0;
      if (this.stuckTime > 0.8) {
        this.stuckTime = 0;
        if (this.goal) this._goTo(this.goal);
        if (this.path && this.path.length < 2) this.path = [this.game.nav.randomFreePoint()];
      }
    }
    this.lastPos.copy(c.position);

    // 바라볼 방향
    let yaw = c.yaw;
    if (this.state === 'hide' && this.hideSpot && (!this.path || !this.path.length)) {
      yaw = this.hideSpot.yaw;
    } else if (this.faceYaw !== null) {
      yaw = this.faceYaw;
    } else if ((this.state === 'hunt' || this.state === 'scope') && this.huntTarget && this.huntTarget.alive &&
      this.huntTarget.position.distanceTo(c.position) < (this.state === 'scope' ? 25 : 7)) {
      const t = this.huntTarget.position;
      yaw = Math.atan2(t.x - c.position.x, t.z - c.position.z);
    } else if (moveYaw !== null) {
      yaw = moveYaw;
    }
    inp.yaw = yaw;
  }
}

function angleDiff(a, b) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

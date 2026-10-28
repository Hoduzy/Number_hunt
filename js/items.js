// 아이템 상자와 아이템 효과 (망원경 / 섬광탄 / 카메라)
import * as THREE from 'three';
import { CONFIG } from './config.js';

export const ITEM_TYPES = ['telescope', 'flash', 'camera'];
export const ITEM_INFO = {
  telescope: { name: '망원경', icon: '🔭' },
  flash: { name: '섬광탄', icon: '💥' },
  camera: { name: '카메라', icon: '📷' },
};

function makeBoxTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffb703';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fb8500';
  g.lineWidth = 12;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#fff';
  g.font = 'bold 90px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class ItemSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.map = game.map;
    this.boxes = [];
    this.projectiles = [];
    this.effects = [];
    this.onCameraShot = null; // (character) => void  플레이어 사진 저장 등

    const geo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const mat = new THREE.MeshLambertMaterial({ map: makeBoxTexture(), emissive: 0x553300 });
    for (const p of this.map.itemSpawns) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, 0.6, p.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.boxes.push({ mesh, pos: p.clone(), active: true, respawnAt: 0, phase: Math.random() * 6 });
    }
    this.flashGeo = new THREE.SphereGeometry(0.12, 10, 8);
    this.flashMat = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x444444 });
    // 조명 개수가 바뀌면 모든 머티리얼이 재컴파일되므로(아이패드에서 끊김) 조명 하나를 미리 두고 재사용
    this.flashLight = new THREE.PointLight(0xffffff, 0, CONFIG.items.flashRadius * 3);
    this.scene.add(this.flashLight);
  }

  activeBoxes() { return this.boxes.filter((b) => b.active); }

  update(dt, now) {
    for (const b of this.boxes) {
      if (!b.active && now >= b.respawnAt) { b.active = true; b.mesh.visible = true; }
      if (!b.active) continue;
      b.mesh.rotation.y += dt * 1.2;
      b.mesh.position.y = 0.6 + Math.sin(now * 2 + b.phase) * 0.12;
      for (const c of this.game.characters) {
        if (!c.alive || c.item) continue;
        const dx = c.position.x - b.pos.x, dz = c.position.z - b.pos.z;
        if (dx * dx + dz * dz < CONFIG.items.pickupRadius ** 2) {
          this._pickup(c, b, now);
          break;
        }
      }
    }
    this._updateProjectiles(dt, now);
    this._updateEffects(dt);
  }

  _pickup(c, box, now) {
    box.active = false;
    box.mesh.visible = false;
    box.respawnAt = now + CONFIG.items.respawnSeconds;
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    c.item = { type, shots: type === 'camera' ? CONFIG.items.cameraShots : 0 };
    this.game.emit('pickup', { character: c, item: c.item });
  }

  // 아이템 사용. 성공 시 true
  use(c) {
    const now = this.game.time;
    if (!c.alive || !c.item) return false;
    if (c.isStunned(now) && c.item.type !== 'camera') return false;
    const type = c.item.type;
    if (type === 'telescope') {
      if (c.isTelescoping(now)) return false;
      c.telescopeUntil = now + CONFIG.items.telescopeSeconds;
      c.item = null;
    } else if (type === 'flash') {
      this._throwFlash(c);
      c.item = null;
    } else if (type === 'camera') {
      c.item.shots--;
      if (this.onCameraShot) this.onCameraShot(c);
      if (c.item.shots <= 0) c.item = null;
    }
    this.game.emit('itemUsed', { character: c, type });
    return true;
  }

  // ---------- 섬광탄 ----------
  _throwFlash(c) {
    const mesh = new THREE.Mesh(this.flashGeo, this.flashMat);
    c.getEyePosition(_v);
    const dir = c.getFaceDirection(_d);
    // 수평 방향으로 던지고 위로 살짝 띄운다
    const h = Math.hypot(dir.x, dir.z) || 1;
    const vx = (dir.x / h) * CONFIG.items.flashThrowDistance;
    const vz = (dir.z / h) * CONFIG.items.flashThrowDistance;
    mesh.position.copy(_v).addScaledVector(new THREE.Vector3(dir.x / h, 0, dir.z / h), 0.4);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vel: new THREE.Vector3(vx, 3.6, vz), age: 0, owner: c });
  }

  _updateProjectiles(dt, now) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.vel.y -= 9.8 * dt;
      const pos = p.mesh.position;
      const prevX = pos.x, prevZ = pos.z;
      pos.addScaledVector(p.vel, dt);
      // 벽에 부딪히면 수평 속도를 죽인다
      _v.set(pos.x, 0, pos.z);
      this.map.resolveCollision(_v, 0.12);
      if (Math.abs(_v.x - pos.x) > 1e-4 || Math.abs(_v.z - pos.z) > 1e-4) {
        pos.x = prevX; pos.z = prevZ;
        p.vel.x *= -0.2; p.vel.z *= -0.2;
      }
      if (pos.y < 0.12) {
        pos.y = 0.12;
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.vel.x *= 0.5; p.vel.z *= 0.5;
      }
      if (p.age >= CONFIG.items.flashFuseSeconds + 0.3) {
        this._explode(pos.clone(), p.owner, now);
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _explode(pos, owner, now) {
    const R = CONFIG.items.flashRadius;
    const affected = [];
    for (const c of this.game.characters) {
      if (!c.alive) continue;
      c.getEyePosition(_v);
      if (_v.distanceTo(pos) <= R) {
        c.stunUntil = Math.max(c.stunUntil, now + CONFIG.items.flashStunSeconds);
        c.glowUntil = Math.max(c.glowUntil, now + CONFIG.items.flashGlowSeconds);
        affected.push(c);
      }
    }
    // 시각 효과: 커지며 사라지는 빛 구 + 순간 조명
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    sphere.position.copy(pos);
    const light = this.flashLight;
    light.position.copy(pos).y += 0.5;
    this.scene.add(sphere);
    this.effects.push({ t: 0, life: 0.6, update: (e) => {
      const k = e.t / e.life;
      sphere.scale.setScalar(0.3 + k * R);
      sphere.material.opacity = 0.85 * (1 - k);
      light.intensity = 60 * (1 - k);
    }, dispose: () => { this.scene.remove(sphere); light.intensity = 0; sphere.geometry.dispose(); sphere.material.dispose(); } });
    this.game.emit('flash', { pos, owner, affected });
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      e.update(e);
      if (e.t >= e.life) { e.dispose(); this.effects.splice(i, 1); }
    }
  }

  dispose() {
    for (const b of this.boxes) this.scene.remove(b.mesh);
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const e of this.effects) e.dispose();
    this.scene.remove(this.flashLight);
    this.boxes = []; this.projectiles = []; this.effects = [];
  }
}

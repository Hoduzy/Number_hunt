// 캐릭터(플레이어/봇 공통) 상태와 이동.
// 캐릭터는 스스로 판단하지 않고 controller가 채워주는 input만 따른다.
// → 로컬 플레이어, AI 봇, (나중에) 네트워크 원격 플레이어가 같은 Character를 공유한다.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCharacterModel } from './models.js';

const _v = new THREE.Vector3();

export class Character {
  constructor({ id, number, color, isPlayer = false }) {
    this.id = id;
    this.number = number;
    this.color = color;
    this.isPlayer = isPlayer;
    this.alive = true;
    this.controller = null;

    this.position = new THREE.Vector3();
    this.yaw = 0; // 얼굴이 향하는 방향 (0 = +Z)
    this.prone = false;
    this.proneBlend = 0; // 0 서기 ~ 1 엎드림 (애니메이션)
    this.walkPhase = 0;
    this.speedNow = 0;

    // controller가 매 프레임 채우는 입력
    this.input = { moveX: 0, moveZ: 0, yaw: 0, toggleProne: false };

    // 상태
    this.stunUntil = 0;
    this.glowUntil = 0;
    this.penaltyUntil = 0;
    this.item = null; // {type, ...}
    this.telescopeUntil = 0;
    this.gauge = 0; // 0~1 숨음 게이지
    this.hidden = false;
    this.eliminatedAt = 0;

    this.model = createCharacterModel({ color, number });
    this.model.root.userData.character = this;
    this._glowing = false;
  }

  get forward() {
    return _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  isStunned(now) { return now < this.stunUntil; }
  isTelescoping(now) { return now < this.telescopeUntil; }

  placeAt(p, yaw = 0) {
    this.position.set(p.x, 0, p.z);
    this.yaw = yaw;
    this.input.yaw = yaw;
    this.syncModel();
  }

  update(dt, now, map) {
    if (!this.alive) {
      this._updateDead(dt, now);
      return;
    }
    const stunned = this.isStunned(now);
    const inp = this.input;

    if (inp.toggleProne && !stunned) this.prone = !this.prone;
    inp.toggleProne = false;

    if (!stunned) {
      // 회전 (봇은 부드럽게, 플레이어는 즉시)
      if (this.isPlayer) this.yaw = inp.yaw;
      else this.yaw = lerpAngle(this.yaw, inp.yaw, Math.min(1, dt * CONFIG.character.turnSpeed));

      let speed = this.prone ? CONFIG.character.proneSpeed : CONFIG.character.walkSpeed;
      if (this.isTelescoping(now)) speed *= CONFIG.items.telescopeSpeedMul;
      const len = Math.hypot(inp.moveX, inp.moveZ);
      const k = len > 1 ? 1 / len : 1;
      this.position.x += inp.moveX * k * speed * dt;
      this.position.z += inp.moveZ * k * speed * dt;
      this.speedNow = Math.min(1, len) * speed;
    } else {
      this.speedNow = 0;
    }
    map.resolveCollision(this.position, CONFIG.character.radius);

    this.walkPhase += this.speedNow * dt * 3.2;
    this.proneBlend += ((this.prone ? 1 : 0) - this.proneBlend) * Math.min(1, dt * 8);
    this._updateGlow(now);
    this.syncModel();
  }

  syncModel() {
    const { root, body, limbs } = this.model;
    root.position.copy(this.position);
    root.rotation.y = this.yaw;
    // 엎드리기: 발을 축으로 앞으로 눕고, 몸을 뒤로 당겨 중심 유지
    const p = this.proneBlend;
    body.rotation.x = p * (Math.PI / 2);
    body.position.set(0, p * 0.25, -p * 0.75);
    const swing = Math.sin(this.walkPhase) * Math.min(1, this.speedNow / 2) * 0.7;
    limbs.legL.rotation.x = swing;
    limbs.legR.rotation.x = -swing;
    limbs.armL.rotation.x = -swing * 0.8;
    limbs.armR.rotation.x = swing * 0.8;
  }

  // 눈(이마) 위치 — 월드 좌표
  getEyePosition(out = new THREE.Vector3()) {
    this.model.root.updateMatrixWorld();
    return this.model.head.getWorldPosition(out);
  }

  // 얼굴 정면 방향 (엎드리면 아래를 향함)
  getFaceDirection(out = new THREE.Vector3()) {
    const pitch = -this.proneBlend * (Math.PI / 2);
    const c = Math.cos(pitch);
    return out.set(Math.sin(this.yaw) * c, Math.sin(pitch), Math.cos(this.yaw) * c);
  }

  setGlow(on) {
    if (on === this._glowing) return;
    this._glowing = on;
    const m = this.model.plate.material;
    // 알파 0.5 = vision.js에서 '블러 제외' 마스크로 읽는다
    m.opacity = on ? 0.5 : 1;
    m.color.setRGB(on ? 2.2 : 1, on ? 2.2 : 1, on ? 1.6 : 1);
    this.model.plate.scale.setScalar(on ? 1.35 : 1);
  }

  _updateGlow(now) {
    this.setGlow(now < this.glowUntil);
  }

  eliminate(now) {
    this.alive = false;
    this.eliminatedAt = now;
    this.prone = false;
    this.setGlow(false);
    this.model.root.traverse((o) => {
      if (o.isMesh && o.material && o !== this.model.plate) {
        o.material = o.material.clone();
        if (o.material.color) o.material.color.lerp(new THREE.Color(0x777777), 0.7);
      }
    });
  }

  _updateDead(dt, now) {
    const t = now - this.eliminatedAt;
    const { body, root } = this.model;
    body.rotation.z = Math.min(1, t * 2.5) * (Math.PI / 2) * 0.95;
    body.position.y = 0.15 * Math.min(1, t * 2.5);
    if (t > 4) root.position.y = -(t - 4) * 0.5;
    if (t > 7) root.visible = false;
  }
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}


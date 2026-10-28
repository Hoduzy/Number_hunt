// 로컬 플레이어 컨트롤러 + 3인칭 카메라.
// Controller 규약: update(dt, now)에서 character.input을 채운다. (bot.js와 동일한 규약)
import * as THREE from 'three';
import { CONFIG } from './config.js';

const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _want = new THREE.Vector3();

export class LocalPlayerController {
  constructor(character, input) {
    this.character = character;
    this.input = input;
    this.camYaw = character.yaw;
    this.camPitch = -0.15;
    this.locked = false; // UI가 열려 있을 때 등
  }

  update(dt, now) {
    const c = this.character;
    const inp = c.input;
    const look = this.input.consumeLook();
    const stunned = c.isStunned(now);
    if (!stunned && !this.locked) {
      const zoom = c.isTelescoping(now) ? 0.35 : 1; // 망원경 중에는 시점 이동을 느리게
      this.camYaw -= look.dx * zoom;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - look.dy * zoom, CONFIG.camera.minPitch, CONFIG.camera.maxPitch);
    }
    const mv = this.locked ? { x: 0, y: 0 } : this.input.getMove();
    const s = Math.sin(this.camYaw), co = Math.cos(this.camYaw);
    // forward = (sin, 0, cos), right = (-cos, 0, sin)
    inp.moveX = s * mv.y - co * mv.x;
    inp.moveZ = co * mv.y + s * mv.x;
    if (stunned) this.camYaw = c.yaw; // 경직 중에는 회전 불가
    inp.yaw = this.camYaw;
  }
}

export class CameraRig {
  constructor(camera, map) {
    this.camera = camera;
    this.map = map;
    this.raycaster = new THREE.Raycaster();
    this.currentDist = CONFIG.camera.distance;
    this.fov = CONFIG.camera.fov;
  }

  update(dt, character, controller, now) {
    const cam = this.camera;
    const tele = character.alive && character.isTelescoping(now);
    const yaw = controller.camYaw, pitch = controller.camPitch;
    _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    character.getEyePosition(_target);
    if (tele) {
      // 망원경: 1인칭 확대
      cam.position.copy(_target).addScaledVector(_dir, 0.25);
      character.model.root.visible = false;
    } else {
      if (character.alive) character.model.root.visible = true;
      _target.y += CONFIG.camera.height;
      // 어깨 너머 오프셋 (오른쪽 = (-cos, 0, sin)), 벽에 막히면 줄인다
      _want.set(-Math.cos(yaw), 0, Math.sin(yaw));
      this.raycaster.set(_target, _want);
      this.raycaster.far = CONFIG.camera.shoulder + 0.2;
      const sh = this.raycaster.intersectObjects(this.map.occluders, false);
      const shoulder = sh.length ? Math.max(0, sh[0].distance - 0.2) : CONFIG.camera.shoulder;
      _target.addScaledVector(_want, shoulder);
      // 카메라가 벽 뒤로 들어가지 않게 레이캐스트로 당긴다
      const back = _want.copy(_dir).negate();
      this.raycaster.set(_target, back);
      this.raycaster.far = CONFIG.camera.distance + 0.3;
      const hits = this.raycaster.intersectObjects(this.map.occluders, false);
      let dist = CONFIG.camera.distance;
      if (hits.length) dist = Math.max(0.3, Math.min(dist, hits[0].distance - 0.25));
      // 줄어들 때는 즉시, 늘어날 때는 천천히
      this.currentDist = dist < this.currentDist ? dist : this.currentDist + (dist - this.currentDist) * Math.min(1, dt * 4);
      cam.position.copy(_target).addScaledVector(back, this.currentDist);
      if (cam.position.y < 0.15) cam.position.y = 0.15;
    }
    cam.lookAt(_want.copy(cam.position).add(_dir));

    const wantFov = tele ? CONFIG.camera.telescopeFov : CONFIG.camera.fov;
    this.fov += (wantFov - this.fov) * Math.min(1, dt * 8);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}

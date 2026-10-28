// 게임 규칙과 상태. 렌더링/입력과 분리되어 있어서
// 나중에 멀티플레이를 붙일 때 이 클래스의 규칙 함수(submitGuess, eliminate 등)를
// 서버(혹은 호스트)에서 실행하고 결과만 동기화하면 된다.
import { CONFIG, DIFFICULTY } from './config.js';
import { Character } from './character.js';
import { generateUniqueNumbers } from './numbers.js';
import { LocalPlayerController } from './player.js';

const COLORS = [0x3a86ff, 0xff006e, 0x8338ec, 0xfb5607, 0x06d6a0, 0xffbe0b];

// 1단계용 임시 컨트롤러: 제자리에서 천천히 두리번거린다.
class IdleController {
  constructor(character) { this.character = character; this.t = Math.random() * 10; }
  update(dt) {
    this.t += dt;
    const c = this.character;
    c.input.moveX = 0; c.input.moveZ = 0;
    c.input.yaw = c.yaw + Math.sin(this.t * 0.5) * 0.02;
  }
}

export class Game {
  constructor({ scene, map, input, difficulty = 'normal' }) {
    this.scene = scene;
    this.map = map;
    this.input = input;
    this.difficulty = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.characters = [];
    this.time = 0;
    this.over = false;
    this.handlers = {};
    this._setup();
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, data) { (this.handlers[name] || []).forEach((fn) => fn(data)); }

  get alive() { return this.characters.filter((c) => c.alive); }

  _setup() {
    const total = 1 + CONFIG.bots.count;
    const numbers = generateUniqueNumbers(total);
    const spawns = [...this.map.spawnPoints].sort(() => Math.random() - 0.5);
    for (let i = 0; i < total; i++) {
      const c = new Character({ id: i, number: numbers[i], color: COLORS[i % COLORS.length], isPlayer: i === 0 });
      const sp = spawns[i % spawns.length];
      c.placeAt(sp, Math.atan2(-sp.x, -sp.z)); // 중앙을 바라보며 시작
      this.scene.add(c.model.root);
      this.characters.push(c);
    }
    this.player = this.characters[0];
    this.player.controller = new LocalPlayerController(this.player, this.input);
    for (const c of this.characters) {
      if (!c.isPlayer) c.controller = new IdleController(c);
    }
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    const now = this.time;
    for (const c of this.characters) {
      if (c.alive && c.controller) c.controller.update(dt, now);
    }
    for (const c of this.characters) c.update(dt, now, this.map);
    this._separateCharacters();
  }

  // 캐릭터끼리 겹치지 않게 밀어낸다
  _separateCharacters() {
    const r2 = CONFIG.character.radius * 2;
    const list = this.alive;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].position, b = list[j].position;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < r2 && d > 1e-4) {
          const push = (r2 - d) / 2;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          b.x += (dx / d) * push; b.z += (dz / d) * push;
        }
      }
    }
  }

  dispose() {
    for (const c of this.characters) this.scene.remove(c.model.root);
    this.characters = [];
  }
}

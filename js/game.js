// 게임 규칙과 상태. 렌더링/입력과 분리되어 있어서
// 나중에 멀티플레이를 붙일 때 이 클래스의 규칙 함수(submitGuess, eliminate 등)를
// 서버(혹은 호스트)에서 실행하고 결과만 동기화하면 된다.
import { CONFIG, DIFFICULTY } from './config.js';
import { Character } from './character.js';
import { generateUniqueNumbers } from './numbers.js';
import { LocalPlayerController } from './player.js';
import { ItemSystem } from './items.js';
import { GaugeSystem } from './gauge.js';

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
    this.items = new ItemSystem(this);
    this.gauge = new GaugeSystem(this);
  }

  useItem(c) { return this.items.use(c); }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    const now = this.time;
    for (const c of this.characters) {
      if (c.alive && c.controller) c.controller.update(dt, now);
    }
    for (const c of this.characters) c.update(dt, now, this.map);
    this._separateCharacters();
    this.items.update(dt, now);
    this.gauge.update(dt);
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

  // ---------- 규칙: 숫자 입력 ----------
  // 결과: {ok:true, target} | {ok:false, reason:'penalty'|'invalid'|'self'|'dead', until}
  submitGuess(guesser, numberStr) {
    const now = this.time;
    if (this.over || !guesser.alive) return { ok: false, reason: 'over' };
    if (now < guesser.penaltyUntil) return { ok: false, reason: 'penalty', until: guesser.penaltyUntil };
    const num = String(numberStr).trim();
    const owner = this.characters.find((c) => c.number === num);
    let reason = null;
    if (!owner) reason = 'invalid';
    else if (owner === guesser) reason = 'self';
    else if (!owner.alive) reason = 'dead';
    if (reason) {
      guesser.penaltyUntil = now + CONFIG.guess.penaltySeconds;
      this.emit('penalty', { character: guesser, reason, number: num });
      return { ok: false, reason, until: guesser.penaltyUntil };
    }
    this.eliminate(owner, { by: guesser, reason: 'guess' });
    return { ok: true, target: owner };
  }

  eliminate(victim, { by = null, reason = 'guess' } = {}) {
    if (!victim.alive || this.over) return;
    victim.eliminate(this.time);
    this._lastCause = { by, reason };
    this.emit('eliminated', { victim, by, reason });
    this._checkEnd(victim);
  }

  _checkEnd(lastVictim) {
    const alive = this.alive;
    const player = this.player;
    if (!player.alive) {
      this.over = true;
      this.emit('end', { win: false, winner: null, rank: alive.length + 1, cause: lastVictim === player ? this._lastCause : null });
    } else if (alive.length <= 1) {
      this.over = true;
      this.emit('end', { win: true, winner: player, rank: 1 });
    }
  }

  dispose() {
    this.items.dispose();
    for (const c of this.characters) this.scene.remove(c.model.root);
    this.characters = [];
  }
}

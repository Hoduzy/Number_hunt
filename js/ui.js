// HUD, 알림, 시작/종료 화면.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      myNumber: $('my-number-value'),
      aliveCount: $('alive-count'),
      perf: $('perf'),
      feed: $('feed'),
      centerMsg: $('center-msg'),
      start: $('start'),
      end: $('end'),
      pause: $('pause'),
    };
    this.keypad = new Keypad(this);
  }

  // 키패드/사진 등 마우스가 필요한 창이 열려 있는지 (PC 포인터 락 해제 시 일시정지 여부 판단)
  get overlayOpen() {
    return this.keypad.isOpen || !!(this.photos && this.photos.isOpen);
  }

  bindPerf(vision) {
    this.vision = vision;
  }

  showStart() {
    this.el.start.classList.remove('hidden');
    this.el.end.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.add('hidden');
  }

  showGame(game) {
    this.game = game;
    this.el.start.classList.add('hidden');
    this.el.end.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.myNumber.textContent = game.player.number;
    this.el.feed.innerHTML = '';
    this.el.centerMsg.textContent = '';
  }

  showPause(on) { this.el.pause.classList.toggle('hidden', !on); }

  showEnd({ win, detail }) {
    $('end-title').textContent = win ? '승리!' : '탈락...';
    $('end-detail').textContent = detail;
    this.el.end.classList.remove('hidden');
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `feed-item ${kind}`;
    d.textContent = text;
    this.el.feed.appendChild(d);
    setTimeout(() => d.remove(), 3200);
    while (this.el.feed.children.length > 4) this.el.feed.firstChild.remove();
  }

  centerMessage(text, ms = 1500) {
    this.el.centerMsg.textContent = text;
    clearTimeout(this._cmTimer);
    this._cmTimer = setTimeout(() => { this.el.centerMsg.textContent = ''; }, ms);
  }

  update(game) {
    this.el.aliveCount.textContent = game.alive.length;
    const p = game.player;
    const pen = Math.max(0, p.penaltyUntil - game.time);
    $('penalty').classList.toggle('hidden', pen <= 0);
    if (pen > 0) $('penalty-sec').textContent = pen.toFixed(1);
    this.keypad.setLocked(pen > 0, pen);
    if (this.vision) {
      this.el.perf.textContent = `${Math.round(this.vision.fps)} fps · 블러 ${this.vision.levelName}`;
    }
  }
}

// 숫자 키패드 (터치 버튼 + PC 키보드 입력)
class Keypad {
  constructor(ui) {
    this.ui = ui;
    this.root = $('keypad');
    this.box = this.root.querySelector('.keypad-box');
    this.cells = [...$('keypad-display').children];
    this.msg = $('keypad-msg');
    this.value = '';
    this.isOpen = false;
    this.locked = false;
    this.onSubmit = null; // (numStr) => result
    this.onOpenChange = null;
    this.root.querySelectorAll('.keypad-grid button').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (k === 'back') this.backspace();
        else if (k === 'ok') this.submit();
        else this.digit(k);
      });
    });
    $('keypad-close').addEventListener('click', () => this.cancel());
  }

  open(firstDigit) {
    this.value = '';
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this._msg('');
    if (firstDigit) this.digit(firstDigit);
    this._render();
    if (this.onOpenChange) this.onOpenChange(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    if (this.onOpenChange) this.onOpenChange(false);
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  digit(d) {
    if (this.locked) return;
    if (this.value.length >= 3) this.value = '';
    this.value += d;
    this._msg('');
    this._render();
  }

  backspace() { this.value = this.value.slice(0, -1); this._render(); }
  cancel() { this.close(); }

  submit() {
    if (this.locked) return;
    if (this.value.length < 3) { this._msg('3자리를 입력하세요'); return; }
    const res = this.onSubmit ? this.onSubmit(this.value) : null;
    if (!res) return;
    if (res.ok) {
      this._msg(`${res.target.number}번 탈락!`, true);
      this.value = '';
      this._render();
      setTimeout(() => this.close(), 700);
    } else {
      this._reason = { invalid: '없는 번호!', dead: '이미 탈락한 번호!', self: '내 번호예요!' }[res.reason] || '';
      this._msg(this._reason);
      this.value = '';
      this._render();
    }
  }

  setLocked(on, remain) {
    this.locked = on;
    this.box.classList.toggle('locked', on);
    if (on && this.isOpen) this.msg.textContent = `${this._reason ? `${this._reason} · ` : ''}입력 불가 ${remain.toFixed(1)}초`;
    else if (!on && this._wasLocked) { this._reason = ''; if (this.isOpen) this._msg(''); }
    this._wasLocked = on;
  }

  _msg(t, ok = false) {
    this.msg.textContent = t;
    this.msg.classList.toggle('ok', ok);
  }

  _render() {
    this.cells.forEach((c, i) => { c.textContent = this.value[i] || ''; });
  }
}

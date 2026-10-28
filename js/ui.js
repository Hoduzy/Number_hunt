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
    this.overlayOpen = false;
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
    if (this.vision) {
      this.el.perf.textContent = `${Math.round(this.vision.fps)} fps · 블러 ${this.vision.levelName}`;
    }
  }
}

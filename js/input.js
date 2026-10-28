// 키보드·마우스·터치 입력을 하나로 모은다.
//  - 이동: getMove() → {x: 오른쪽, y: 앞쪽} (-1~1)
//  - 시점: consumeLook() → {dx, dy} 라디안
//  - 동작: on('item' | 'keypad' | 'prone' | 'photos' | 'escape', fn)
//  - 숫자 입력: setTextSink(sink) 로 지정하면 숫자/백스페이스/엔터 키가 sink로 간다.
export class InputManager {
  constructor(surface) {
    this.surface = surface; // 캔버스를 감싼 요소 (터치/마우스 이벤트 수신)
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.handlers = {};
    this.textSink = null;
    this.enabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    this.mouseSens = 0.0024;
    this.touchSens = 0.0065;

    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, el: null, knob: null };
    this.lookPtr = { id: null, x: 0, y: 0 };
    this._mouseDrag = null;

    this._createJoystick();
    this._bind();
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, ...a) { (this.handlers[name] || []).forEach((fn) => fn(...a)); }
  setTextSink(sink) { this.textSink = sink; }

  getMove() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.joy.id !== null) { x += this.joy.x; y += this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook() {
    const r = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return r;
  }

  reset() {
    this.keys.clear();
    this.look.dx = this.look.dy = 0;
    this._endJoy();
    this.lookPtr.id = null;
  }

  requestPointerLock() {
    if (this.isTouch) return;
    const el = this.surface;
    if (document.pointerLockElement !== el && el.requestPointerLock) {
      try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 무시 */ }
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _createJoystick() {
    const base = document.createElement('div');
    base.className = 'joy-base hidden';
    const knob = document.createElement('div');
    knob.className = 'joy-knob';
    base.appendChild(knob);
    document.body.appendChild(base);
    this.joy.el = base;
    this.joy.knob = knob;
  }

  _endJoy() {
    this.joy.id = null; this.joy.x = this.joy.y = 0;
    this.joy.el.classList.add('hidden');
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (this.textSink) {
        if (/^Digit\d$|^Numpad\d$/.test(e.code)) { this.textSink.digit(e.code.slice(-1)); e.preventDefault(); return; }
        if (e.code === 'Backspace') { this.textSink.backspace(); e.preventDefault(); return; }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { this.textSink.submit(); e.preventDefault(); return; }
        if (e.code === 'Escape') { this.textSink.cancel(); e.preventDefault(); return; }
      }
      if (e.repeat) { this.keys.add(e.code); return; }
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyE': this.emit('item'); break;
        case 'Enter': case 'NumpadEnter': this.emit('keypad'); e.preventDefault(); break;
        case 'KeyC': case 'ControlLeft': this.emit('prone'); break;
        case 'KeyG': case 'Tab': this.emit('photos'); e.preventDefault(); break;
        case 'Escape': this.emit('escape'); break;
        default:
          // 숫자키를 바로 누르면 입력창을 열고 그 숫자부터 입력
          if (/^Digit\d$|^Numpad\d$/.test(e.code)) this.emit('keypad', e.code.slice(-1));
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === this.surface) {
        this.look.dx += e.movementX * this.mouseSens;
        this.look.dy += e.movementY * this.mouseSens;
      }
    });

    const s = this.surface;
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement !== s) {
          this.requestPointerLock();
          this._mouseDrag = { x: e.clientX, y: e.clientY }; // 포인터 락 실패 시 드래그로 회전
        }
        return;
      }
      e.preventDefault();
      const leftSide = e.clientX < window.innerWidth * 0.45;
      if (leftSide && this.joy.id === null) {
        this.joy.id = e.pointerId;
        this.joy.ox = e.clientX; this.joy.oy = e.clientY;
        this.joy.x = this.joy.y = 0;
        this.joy.el.style.left = `${e.clientX}px`;
        this.joy.el.style.top = `${e.clientY}px`;
        this.joy.knob.style.transform = 'translate(-50%, -50%)';
        this.joy.el.classList.remove('hidden');
      } else if (this.lookPtr.id === null) {
        this.lookPtr.id = e.pointerId;
        this.lookPtr.x = e.clientX; this.lookPtr.y = e.clientY;
      }
      try { s.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    s.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        if (this._mouseDrag && document.pointerLockElement !== s && e.buttons) {
          this.look.dx += (e.clientX - this._mouseDrag.x) * this.mouseSens * 1.5;
          this.look.dy += (e.clientY - this._mouseDrag.y) * this.mouseSens * 1.5;
          this._mouseDrag = { x: e.clientX, y: e.clientY };
        }
        return;
      }
      if (e.pointerId === this.joy.id) {
        const R = 55;
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.joy.x = dx / R;
        this.joy.y = -dy / R;
        this.joy.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (e.pointerId === this.lookPtr.id) {
        this.look.dx += (e.clientX - this.lookPtr.x) * this.touchSens;
        this.look.dy += (e.clientY - this.lookPtr.y) * this.touchSens;
        this.lookPtr.x = e.clientX; this.lookPtr.y = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerType === 'mouse') { this._mouseDrag = null; return; }
      if (e.pointerId === this.joy.id) this._endJoy();
      if (e.pointerId === this.lookPtr.id) this.lookPtr.id = null;
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
  }
}

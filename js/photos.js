// 카메라 아이템으로 찍은 사진 갤러리와 확대/축소 뷰어
const $ = (id) => document.getElementById(id);

export class PhotoAlbum {
  constructor() {
    this.photos = [];
    this.panel = $('photos');
    this.list = $('photo-list');
    this.empty = $('photo-empty');
    this.viewer = $('photo-viewer');
    this.img = $('photo-img');
    this.count = $('photo-count');
    this.isOpen = false;
    this.onOpenChange = null;
    this.onKeypad = null;

    this.zoom = 1; this.panX = 0; this.panY = 0; this.fitZoom = 1;
    this.pointers = new Map();

    $('photos-close').addEventListener('click', () => this.close());
    $('viewer-close').addEventListener('click', () => this.closeViewer());
    $('zoom-in').addEventListener('click', () => this._zoomAt(1.4));
    $('zoom-out').addEventListener('click', () => this._zoomAt(1 / 1.4));
    $('zoom-reset').addEventListener('click', () => this._fit());
    $('viewer-keypad').addEventListener('click', () => this.onKeypad && this.onKeypad());
    this.img.addEventListener('load', () => this._fit());
    this._bindGestures();
  }

  add(url) {
    this.photos.push({ url, time: Date.now() });
    this.count.textContent = this.photos.length;
  }

  clear() {
    this.photos = [];
    this.count.textContent = '0';
    this.close();
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  open() {
    this.isOpen = true;
    this.list.innerHTML = '';
    this.photos.slice().reverse().forEach((p) => {
      const im = document.createElement('img');
      im.src = p.url;
      im.addEventListener('click', () => this.openViewer(p.url));
      this.list.appendChild(im);
    });
    this.empty.classList.toggle('hidden', this.photos.length > 0);
    this.panel.classList.remove('hidden');
    if (this.onOpenChange) this.onOpenChange(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.classList.add('hidden');
    this.viewer.classList.add('hidden');
    if (this.onOpenChange) this.onOpenChange(false);
  }

  openViewer(url) {
    this.viewer.classList.remove('hidden');
    this.img.src = url;
    if (this.img.complete) this._fit();
  }

  closeViewer() { this.viewer.classList.add('hidden'); }

  _fit() {
    const W = innerWidth, H = innerHeight;
    const w = this.img.naturalWidth || W, h = this.img.naturalHeight || H;
    this.fitZoom = Math.min(W / w, H / h);
    this.zoom = this.fitZoom;
    this.panX = (W - w * this.zoom) / 2;
    this.panY = (H - h * this.zoom) / 2;
    this._apply();
  }

  _zoomAt(factor, cx = innerWidth / 2, cy = innerHeight / 2) {
    const nz = Math.max(this.fitZoom * 0.5, Math.min(this.fitZoom * 12, this.zoom * factor));
    const f = nz / this.zoom;
    this.panX = cx - (cx - this.panX) * f;
    this.panY = cy - (cy - this.panY) * f;
    this.zoom = nz;
    this._apply();
  }

  _apply() {
    this.img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  // 마우스 휠/드래그, 터치 핀치/드래그
  _bindGestures() {
    const v = this.viewer;
    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    }, { passive: false });
    v.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.viewer-bar')) return;
      v.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._pinch = null;
    });
    v.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (this.pointers.size === 1) {
        this.panX += cur.x - prev.x;
        this.panY += cur.y - prev.y;
        this._apply();
      } else if (this.pointers.size === 2) {
        const pts = [...this.pointers.entries()].map(([id, p]) => (id === e.pointerId ? cur : p));
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
        if (this._pinch) {
          this.panX += mx - this._pinch.mx;
          this.panY += my - this._pinch.my;
          this._zoomAt(d / this._pinch.d, mx, my);
        }
        this._pinch = { d, mx, my };
      }
      this.pointers.set(e.pointerId, cur);
    });
    const up = (e) => { this.pointers.delete(e.pointerId); this._pinch = null; };
    v.addEventListener('pointerup', up);
    v.addEventListener('pointercancel', up);
    v.addEventListener('dblclick', (e) => this._zoomAt(2, e.clientX, e.clientY));
  }
}

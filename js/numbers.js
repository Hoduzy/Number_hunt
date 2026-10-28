// 3자리 숫자 생성과 이마 숫자판 텍스처
import * as THREE from 'three';

// 서로 다른 3자리 숫자 n개 (100~999)
export function generateUniqueNumbers(n) {
  const set = new Set();
  while (set.size < n) set.add(String(100 + Math.floor(Math.random() * 900)));
  return [...set];
}

export function createNumberTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 4, 4, 248, 120, 22);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#222';
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 96px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(number, 128, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

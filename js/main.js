// 진입점: 씬/렌더러/입력/UI를 만들고 게임 루프를 돌린다.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PlaygroundMap } from './map.js';
import { Vision } from './vision.js';
import { InputManager } from './input.js';
import { CameraRig } from './player.js';
import { Game } from './game.js';
import { ITEM_INFO } from './items.js';
import { UI } from './ui.js';
import { PhotoAlbum } from './photos.js';

const container = document.getElementById('game');

// ---------- 씬 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3ff);
scene.fog = new THREE.Fog(0xd6ecff, 18, 48);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.08, 120);

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f5a, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(10, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 50;
sun.shadow.bias = -0.0008;
scene.add(sun);

const map = new PlaygroundMap(scene);
const vision = new Vision(container, scene, camera);
vision.shadowLight = sun;
vision.applyQuality(vision.level);

const input = new InputManager(container);
if (input.isTouch) document.body.classList.add('touch');
const ui = new UI();
ui.bindPerf(vision);
const rig = new CameraRig(camera, map);
const photos = new PhotoAlbum();
ui.photos = photos;

let game = null;
let paused = false;
let lastSettings = null;

function startGame(settings) {
  lastSettings = settings;
  ui.keypad.close();
  if (game) game.dispose();
  vision.setQualityMode(settings.quality === 'auto' ? 'auto' : Number(settings.quality));
  game = new Game({ scene, map, input, difficulty: settings.difficulty });
  game.on('end', (e) => {
    ui.keypad.close();
    photos.close();
    input.enabled = false;
    input.exitPointerLock();
    setTimeout(() => ui.showEnd({ win: e.win, detail: endDetail(e) }), 1400);
  });
  game.on('eliminated', ({ victim, by, reason }) => {
    if (victim.isPlayer) return;
    let text = `${victim.number}번 탈락!`;
    if (reason === 'gauge') text += ' (숨음 게이지)';
    else if (by && by.isPlayer) text += ' (내가 찾음)';
    ui.toast(text);
  });
  game.items.onCameraShot = (c) => {
    if (!c.isPlayer) return;
    // 셔터 순간 화면을 블러 없이 저장
    rig.update(0, game.player, game.player.controller, game.time);
    photos.add(vision.captureSharp());
    ui.shutter();
    ui.toast('찰칵! 사진 저장됨 (G / 사진 버튼)', 'info');
  };
  game.on('pickup', ({ character, item }) => {
    if (character.isPlayer) ui.toast(`${ITEM_INFO[item.type].icon} ${ITEM_INFO[item.type].name} 획득!`, 'info');
  });
  game.on('flash', ({ pos, affected }) => {
    const p = game.player;
    if (affected.includes(p)) ui.flash(1);
    else if (p.getEyePosition(eye).distanceTo(pos) < 12) ui.flash(0.45);
  });
  photos.clear();
  ui.showGame(game);
  input.reset();
  input.enabled = true;
  paused = false;
  input.requestPointerLock();
}

function endDetail(e) {
  if (e.win) return '모든 상대의 번호를 찾아냈어요!';
  const lines = [`순위: ${e.rank}위`];
  if (e.cause && e.cause.reason === 'gauge') lines.unshift('숨음 게이지가 가득 찼어요.');
  else if (e.cause && e.cause.by) lines.unshift(`${e.cause.by.number}번에게 번호를 들켰어요.`);
  return lines.join('\n');
}

// ---------- 숫자 입력 ----------
ui.keypad.onSubmit = (num) => (game ? game.submitGuess(game.player, num) : null);
ui.keypad.onOpenChange = (open) => input.setTextSink(open ? ui.keypad : null);
input.on('keypad', (first) => { if (game && !game.over) ui.keypad.open(first); });
document.getElementById('btn-keypad').addEventListener('click', () => { if (game && !game.over) ui.keypad.toggle(); });

// ---------- 아이템 / 자세 / 사진 ----------
const playing = () => game && !game.over && !paused && game.player.alive;
input.on('item', () => { if (playing()) game.useItem(game.player); });
document.getElementById('btn-item').addEventListener('click', () => { if (playing()) game.useItem(game.player); });
input.on('prone', () => { if (playing()) game.player.input.toggleProne = true; });
document.getElementById('btn-prone').addEventListener('click', () => { if (playing()) game.player.input.toggleProne = true; });
const togglePhotos = () => {
  if (!game || game.over) return;
  photos.toggle();
};
input.on('photos', togglePhotos);
document.getElementById('btn-photos').addEventListener('click', togglePhotos);
photos.onOpenChange = (open) => {
  if (open) input.exitPointerLock();
  else if (!paused) input.requestPointerLock();
};
photos.onKeypad = () => { if (game && !game.over) ui.keypad.open(); };
input.on('escape', () => {
  if (ui.keypad.isOpen) ui.keypad.close();
  else if (photos.isOpen) photos.close();
  else setPaused(true);
});

function readSettings() {
  return {
    difficulty: document.getElementById('opt-difficulty').value,
    quality: document.getElementById('opt-quality').value,
  };
}

document.getElementById('btn-start').addEventListener('click', () => startGame(readSettings()));
document.getElementById('btn-retry').addEventListener('click', () => startGame(lastSettings || readSettings()));
document.getElementById('btn-home').addEventListener('click', goHome);
document.getElementById('btn-quit').addEventListener('click', goHome);
document.getElementById('btn-resume').addEventListener('click', () => setPaused(false));

function goHome() {
  ui.keypad.close();
  photos.clear();
  if (game) { game.dispose(); game = null; }
  input.enabled = false;
  ui.showStart();
}

function setPaused(on) {
  if (!game || game.over) return;
  paused = on;
  ui.showPause(on);
  input.enabled = !on;
  if (on) { input.reset(); input.exitPointerLock(); } else input.requestPointerLock();
}

// PC: 브라우저가 Esc로 포인터 락을 풀면 일시정지
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game && !game.over && !paused && !ui.overlayOpen && !input.isTouch) setPaused(true);
});

// ---------- 루프 ----------
const clock = new THREE.Clock();
const eye = new THREE.Vector3();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  map.update(elapsed);

  if (game) {
    if (!paused) game.update(dt);
    const p = game.player;
    rig.update(dt, p, p.controller, game.time);
    p.getEyePosition(eye);
    vision.setEye(eye);
    if (p.alive && p.isTelescoping(game.time)) vision.setFocus(CONFIG.vision.telescopeSharp, CONFIG.vision.telescopeBlur);
    else vision.setFocus(CONFIG.vision.sharpDistance, CONFIG.vision.blurDistance);
    ui.update(game);
  } else {
    // 시작 화면 배경: 천천히 도는 카메라
    camera.position.set(Math.sin(elapsed * 0.1) * 14, 7, Math.cos(elapsed * 0.1) * 14);
    camera.lookAt(0, 0, 0);
    vision.setEye(camera.position);
    vision.setFocus(CONFIG.vision.sharpDistance, CONFIG.vision.blurDistance);
  }
  vision.render(dt);
}

ui.showStart();
frame();

// 디버그/테스트용 핸들
window.__nh = {
  get game() { return game; }, vision, scene, camera, map, startGame,
  // 렌더링 없이 게임 시간을 빠르게 진행 (자동 테스트용)
  step(seconds, dt = 1 / 30) { for (let t = 0; t < seconds && game; t += dt) game.update(dt); },
};

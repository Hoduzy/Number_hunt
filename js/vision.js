// 근시 연출: EffectComposer + 깊이 기반 블러.
//  1) 씬을 깊이 텍스처와 함께 렌더링
//  2) 저해상도 가우시안 블러 두 단계(중간/강함)를 만든다
//  3) 픽셀마다 '내 캐릭터 눈'으로부터의 월드 거리를 복원해
//     sharpDistance 이내는 원본, blurDistance 이상은 강한 블러, 그 사이는 보간
// 알파 채널 < 0.75 인 픽셀(섬광탄으로 빛나는 숫자판)은 블러에서 제외한다.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from '../vendor/three/addons/postprocessing/Pass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { CONFIG, QUALITY_LEVELS } from './config.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BlurShader = {
  uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
uniform sampler2D tInput;
uniform vec2 uDir; // 텍셀 단위 방향 * 간격
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tInput, vUv) * 0.2270270270;
  c += texture2D(tInput, vUv + uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tInput, vUv - uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tInput, vUv + uDir * 3.2307692308) * 0.0702702703;
  c += texture2D(tInput, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`,
};

const CompositeShader = {
  uniforms: {
    tSharp: { value: null },
    tDepth: { value: null },
    tMid: { value: null },
    tHeavy: { value: null },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uEye: { value: new THREE.Vector3() },
    uNear: { value: 3 },
    uFar: { value: 8 },
    uSharpAll: { value: 0 },
    uHaze: { value: new THREE.Color(0xdfe9f2) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
uniform sampler2D tSharp;
uniform sampler2D tDepth;
uniform sampler2D tMid;
uniform sampler2D tHeavy;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uEye;
uniform float uNear;
uniform float uFar;
uniform float uSharpAll;
uniform vec3 uHaze;
varying vec2 vUv;
void main() {
  vec4 sharp = texture2D(tSharp, vUv);
  float depth = texture2D(tDepth, vUv).x;
  vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uProjInv * clip;
  view /= view.w;
  vec3 world = (uCamWorld * vec4(view.xyz, 1.0)).xyz;
  float dist = depth >= 0.99999 ? 1000.0 : distance(world, uEye);
  float coc = pow(smoothstep(uNear, uFar, dist), 0.7) * (1.0 - uSharpAll);
  if (sharp.a < 0.75) coc = 0.0;
  vec3 mid = texture2D(tMid, vUv).rgb;
  vec3 heavy = texture2D(tHeavy, vUv).rgb;
  vec3 col = coc < 0.5 ? mix(sharp.rgb, mid, coc * 2.0) : mix(mid, heavy, coc * 2.0 - 1.0);
  col = mix(col, uHaze, coc * 0.18);
  gl_FragColor = vec4(col, 1.0);
}`,
};

class NearsightPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;
    this.blurScale = 0.5;
    this.heavyPasses = 2;
    this.eye = new THREE.Vector3();
    this.focusNear = CONFIG.vision.sharpDistance;
    this.focusFar = CONFIG.vision.blurDistance;
    this.sharpAll = 0;

    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.midA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.midB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.heavyA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.heavyB = new THREE.WebGLRenderTarget(1, 1, opts);

    this.blurMat = new THREE.ShaderMaterial({ ...BlurShader, uniforms: THREE.UniformsUtils.clone(BlurShader.uniforms), depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({ ...CompositeShader, uniforms: THREE.UniformsUtils.clone(CompositeShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(null);
  }

  setSize(w, h) {
    this.width = w; this.height = h;
    this.sceneRT.setSize(w, h);
    this.sceneRT.depthTexture.image.width = w;
    this.sceneRT.depthTexture.image.height = h;
    const mw = Math.max(1, Math.round(w * this.blurScale)), mh = Math.max(1, Math.round(h * this.blurScale));
    this.midA.setSize(mw, mh); this.midB.setSize(mw, mh);
    const hw = Math.max(1, Math.round(mw / 2)), hh = Math.max(1, Math.round(mh / 2));
    this.heavyA.setSize(hw, hh); this.heavyB.setSize(hw, hh);
  }

  _blur(renderer, src, dst, dx, dy) {
    this.blurMat.uniforms.tInput.value = src.texture;
    this.blurMat.uniforms.uDir.value.set(dx / dst.width, dy / dst.height);
    this.quad.material = this.blurMat;
    renderer.setRenderTarget(dst);
    this.quad.render(renderer);
  }

  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    if (this.sharpAll < 1) {
      // 중간 블러 (해상도 blurScale)
      this._blur(renderer, this.sceneRT, this.midA, 1.8, 0);
      this._blur(renderer, this.midA, this.midB, 0, 1.8);
      // 강한 블러 (해상도 blurScale/2)
      this._blur(renderer, this.midB, this.heavyA, 1.5, 0);
      this._blur(renderer, this.heavyA, this.heavyB, 0, 1.5);
      for (let i = 1; i < this.heavyPasses; i++) {
        this._blur(renderer, this.heavyB, this.heavyA, 2.5, 0);
        this._blur(renderer, this.heavyA, this.heavyB, 0, 2.5);
      }
    }

    const u = this.compMat.uniforms;
    u.tSharp.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.tMid.value = this.midB.texture;
    u.tHeavy.value = this.heavyB.texture;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(this.camera.matrixWorld);
    u.uEye.value.copy(this.eye);
    u.uNear.value = this.focusNear;
    u.uFar.value = this.focusFar;
    u.uSharpAll.value = this.sharpAll;
    this.quad.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export class Vision {
  constructor(container, scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.pass = new NearsightPass(scene, camera);
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());

    this.qualityMode = 'auto'; // 'auto' | 0..n
    this.level = 1;
    this.shadowLight = null;
    this.onQualityChange = null;
    this._fpsAcc = 0; this._fpsFrames = 0; this._goodWindows = 0; this._cooldown = 2;
    this.fps = 60;

    this.applyQuality(this.level);
    window.addEventListener('resize', () => this.resize());
  }

  setQualityMode(mode) {
    this.qualityMode = mode;
    this._downgraded = false;
    this.applyQuality(mode === 'auto' ? 1 : mode);
  }

  applyQuality(level) {
    this.level = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level));
    const q = QUALITY_LEVELS[this.level];
    this.pass.blurScale = q.blurScale;
    this.pass.heavyPasses = q.heavyPasses;
    if (this.shadowLight) this.shadowLight.castShadow = q.shadows;
    this.resize();
    if (this.onQualityChange) this.onQualityChange(this.level, q);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY_LEVELS[this.level].pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get levelName() {
    return (this.qualityMode === 'auto' ? '자동·' : '') + QUALITY_LEVELS[this.level].name;
  }

  // 초점 거리 (망원경 사용 시 넓힘)
  setFocus(near, far) {
    this.pass.focusNear = near;
    this.pass.focusFar = far;
  }

  setEye(v) { this.pass.eye.copy(v); }

  render(dt) {
    this.composer.render(dt);
    this._trackFps(dt);
  }

  // 블러 없이 지금 화면을 찍어 dataURL로 반환 (카메라 아이템)
  captureSharp() {
    this.pass.sharpAll = 1;
    this.composer.render(0);
    const url = this.renderer.domElement.toDataURL('image/jpeg', 0.92);
    this.pass.sharpAll = 0;
    return url;
  }

  // 자동 품질: 2초마다 평균 FPS를 보고 목표 미만이면 한 단계 낮춘다.
  _trackFps(dt) {
    if (dt <= 0 || dt > 0.5) return;
    this._fpsAcc += dt; this._fpsFrames++;
    this._cooldown -= dt;
    if (this._fpsAcc < 2) return;
    this.fps = this._fpsFrames / this._fpsAcc;
    this._fpsAcc = 0; this._fpsFrames = 0;
    if (this.qualityMode !== 'auto' || this._cooldown > 0) return;
    if (this.fps < CONFIG.vision.targetFps + 2 && this.level < QUALITY_LEVELS.length - 1) {
      this.applyQuality(this.level + 1);
      this._cooldown = 3;
      this._goodWindows = 0;
      this._downgraded = true;
    } else if (this.fps > 57 && this.level > 0 && !this._downgraded) {
      // 한 번도 낮춘 적이 없고 여유가 오래 지속될 때만 올린다 (단계가 오락가락하지 않게)
      if (++this._goodWindows >= 4) {
        this.applyQuality(this.level - 1);
        this._goodWindows = 0;
        this._cooldown = 3;
      }
    } else {
      this._goodWindows = 0;
    }
  }
}

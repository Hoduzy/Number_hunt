// 캐릭터 시각 모델 팩토리.
// 지금은 캡슐/구 기본 도형이지만, GLTF 모델로 교체하려면 createCharacterModel만 바꾸면 된다.
// 반환 규약:
//   root  : 발 위치 기준 그룹 (캐릭터 위치/회전은 여기에 적용)
//   body  : 엎드리기 등 자세 변화를 위해 기울이는 그룹
//   head  : 머리 (눈 위치 계산 기준)
//   plate : 이마 숫자판 메쉬 (+Z 방향, 즉 얼굴 앞에서만 보인다)
//   limbs : 걷기 애니메이션용 {legL, legR, armL, armR} (없어도 됨)
import * as THREE from 'three';
import { createNumberTexture } from './numbers.js';

const SKIN = new THREE.MeshLambertMaterial({ color: 0xf1c27d });
const DARK = new THREE.MeshBasicMaterial({ color: 0x222222 });

export function createCharacterModel({ color, number }) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const clothes = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.45) });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.45, 4, 10), clothes);
  torso.position.y = 1.0;
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = 1.5;
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), SKIN);
  head.add(skull);
  // 머리카락 (뒤통수를 덮어 앞뒤 구분을 쉽게)
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshLambertMaterial({ color: 0x3b2a1a }),
  );
  hair.rotation.x = -0.75;
  head.add(hair);
  for (const ex of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), DARK);
    eye.position.set(ex, -0.03, 0.195);
    head.add(eye);
  }

  // 이마 숫자판: 앞면만 렌더링되므로 뒤에서는 보이지 않는다.
  const plateMat = new THREE.MeshBasicMaterial({
    map: createNumberTexture(number),
    blending: THREE.NoBlending, // 알파 채널을 '선명 마스크'로 쓰기 위해 블렌딩 끔 (vision.js 참고)
    toneMapped: false,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), plateMat);
  plate.position.set(0, 0.08, 0.225);
  plate.rotation.x = -0.25; // 이마 곡면을 따라 살짝 위로
  head.add(plate);

  const limb = (mat, r, len, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 6), mat);
    m.position.y = -len / 2 - r;
    pivot.add(m);
    body.add(pivot);
    return pivot;
  };
  const legL = limb(pants, 0.09, 0.45, -0.11, 0.66);
  const legR = limb(pants, 0.09, 0.45, 0.11, 0.66);
  const armL = limb(clothes, 0.07, 0.4, -0.32, 1.28);
  const armR = limb(clothes, 0.07, 0.4, 0.32, 1.28);

  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  plate.castShadow = false;

  return { root, body, head, plate, limbs: { legL, legR, armL, armR } };
}

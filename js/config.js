// 게임 전역 설정값. 밸런스 조정은 이 파일에서 한다.

export const CONFIG = {
  map: {
    halfSize: 15, // 놀이터는 30m x 30m
  },

  character: {
    radius: 0.35,
    height: 1.7,
    eyeHeight: 1.55,
    proneEyeHeight: 0.35,
    walkSpeed: 3.2,
    proneSpeed: 0, // 엎드리면 이동 불가
    turnSpeed: 10, // 봇 회전 보간 속도 (rad/s 근사)
  },

  vision: {
    sharpDistance: 3, // 이 거리까지 선명
    blurDistance: 8, // 이 거리부터 형태만 보일 정도로 흐림
    telescopeSharp: 22,
    telescopeBlur: 40,
    targetFps: 30,
  },

  camera: {
    distance: 2.6,
    height: 0.4, // 머리 위로 올리는 높이
    shoulder: 0.55, // 오른쪽 어깨 너머 시점 (정면 시야 확보)
    fov: 62,
    telescopeFov: 20,
    minPitch: -1.1,
    maxPitch: 0.9,
  },

  guess: {
    penaltySeconds: 5,
  },

  items: {
    respawnSeconds: 30,
    pickupRadius: 1.0,
    telescopeSeconds: 8,
    telescopeSpeedMul: 0.5,
    flashRadius: 4,
    flashStunSeconds: 3,
    flashGlowSeconds: 5,
    flashThrowDistance: 6,
    flashFuseSeconds: 0.9,
    cameraShots: 3,
  },

  gauge: {
    fillSeconds: 30, // 가득 차는 데 걸리는 시간 (숨은 상태 유지 시)
    drainSeconds: 60, // 트인 상태에서 가득 찬 게이지가 비는 시간
    rayLength: 2.5,
    hiddenRatio: 0.75, // 이 비율 이상의 광선이 막히면 숨은 상태
    checkInterval: 0.15,
    warnRatio: 0.7,
  },

  bots: {
    count: 4,
  },
};

// 봇 난이도. readTime: 선명 거리에서 숫자를 읽는 데 필요한 시간(초)
// accuracy: 입력 시 정답 확률(틀리면 페널티), reaction: 판단 주기
export const DIFFICULTY = {
  easy: {
    label: '쉬움', readTime: 3.0, accuracy: 0.6, reaction: 0.9, guessChance: 0.5,
    itemUse: 0.4, evade: 0.2, aggression: 0.5,
  },
  normal: {
    label: '보통', readTime: 1.8, accuracy: 0.8, reaction: 0.5, guessChance: 0.75,
    itemUse: 0.7, evade: 0.5, aggression: 0.7,
  },
  hard: {
    label: '어려움', readTime: 1.0, accuracy: 0.95, reaction: 0.25, guessChance: 0.95,
    itemUse: 1.0, evade: 0.8, aggression: 0.9,
  },
};

// 블러 품질 단계. 자동 모드에서는 FPS에 따라 단계를 내린다.
export const QUALITY_LEVELS = [
  { name: '높음', pixelRatio: 1.5, blurScale: 0.5, heavyPasses: 2, shadows: true },
  { name: '중간', pixelRatio: 1.0, blurScale: 0.5, heavyPasses: 2, shadows: true },
  { name: '낮음', pixelRatio: 0.8, blurScale: 0.35, heavyPasses: 1, shadows: false },
  { name: '최저', pixelRatio: 0.6, blurScale: 0.3, heavyPasses: 1, shadows: false },
];

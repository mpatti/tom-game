export const PLAYER_SPEED = 200;
export const PLAYER_ACCEL = 1600;
export const PLAYER_DECEL = 1200;
export const PLAYER_RADIUS = 12;

export const DASH_SPEED = 500;
export const DASH_DURATION = 0.18;
export const DASH_COOLDOWN = 3.0;

export const FLAG_PICKUP_RADIUS = 20;
export const FLAG_SCORE_RADIUS = 24;
export const TAG_RADIUS = 18;
export const FLAG_RETURN_TIME = 30;
export const FLAG_TOUCH_RETURN_RADIUS = 24;

// Shooting
export const BULLET_SPEED = 600;
export const BULLET_RADIUS = 3;
export const BULLET_LIFETIME = 1.5;
export const SHOOT_COOLDOWN = 0.4;
export const BULLET_SIZE = 4;

export const RESPAWN_TIME = 2.0;

export const POWERUP_SPAWN_INTERVAL = 15;
export const SPEED_BOOST_MULTIPLIER = 1.5;
export const SPEED_BOOST_DURATION = 5;
export const SHIELD_DURATION = 8;

export const SCREEN_SHAKE_CAPTURE = 12;
export const SCREEN_SHAKE_TAG = 5;
export const SCREEN_SHAKE_DECAY = 0.9;

export const SCORE_TO_WIN = 3;

export const NETWORK_UPDATE_RATE = 100; // ms (10Hz)
export const INTERPOLATION_DELAY = 100; // ms

export const COUNTDOWN_TIME = 3;

export const TILE_SIZE = 32;
export const MAP_COLS = 40;
export const MAP_ROWS = 25;

// 3D constants
export const WALL_HEIGHT = 3;
export const PLAYER_EYE_HEIGHT = 1.5;
export const PLAYER_BODY_RADIUS = 0.375; // PLAYER_RADIUS / TILE_SIZE
export const BULLET_BODY_RADIUS = 0.1;
export const FOV = 80;
export const MOUSE_SENSITIVITY = 0.002;

// World-unit conversions (1 tile = 1 world unit)
export const PLAYER_SPEED_3D = PLAYER_SPEED / TILE_SIZE;     // 6.25 units/s
export const PLAYER_ACCEL_3D = PLAYER_ACCEL / TILE_SIZE;     // 50 units/s²
export const PLAYER_DECEL_3D = PLAYER_DECEL / TILE_SIZE;     // 37.5 units/s²
export const DASH_SPEED_3D = DASH_SPEED / TILE_SIZE;         // 15.625 units/s
export const BULLET_SPEED_3D = BULLET_SPEED / TILE_SIZE;     // 18.75 units/s
export const PLAYER_RADIUS_3D = PLAYER_RADIUS / TILE_SIZE;   // 0.375
export const FLAG_PICKUP_RADIUS_3D = FLAG_PICKUP_RADIUS / TILE_SIZE;     // 0.625
export const FLAG_SCORE_RADIUS_3D = FLAG_SCORE_RADIUS / TILE_SIZE;       // 0.75
export const FLAG_TOUCH_RETURN_RADIUS_3D = FLAG_TOUCH_RETURN_RADIUS / TILE_SIZE; // 0.75
export const TAG_RADIUS_3D = TAG_RADIUS / TILE_SIZE;         // 0.5625

export const COLORS = {
  blue: {
    primary: '#4488ff',
    light: '#88bbff',
    dark: '#2255cc',
    base: 'rgba(68, 136, 255, 0.15)',
    flag: '#4488ff',
  },
  red: {
    primary: '#ff4444',
    light: '#ff8888',
    dark: '#cc2222',
    base: 'rgba(255, 68, 68, 0.15)',
    flag: '#ff4444',
  },
  wall: '#666677',
  wallLight: '#8888aa',
  wallDark: '#444455',
  floor: '#2a3a2a',
  floorLight: '#303f30',
  floorAlt: '#263326',
  grass1: '#2a3a2a',
  grass2: '#2e3e2e',
  grass3: '#263626',
  bg: '#1a1a2e',
  hud: '#ffffff',
  hudBg: 'rgba(0, 0, 0, 0.6)',
  particle: '#ffffff',
  shield: '#44ffff',
  speed: '#ffff44',
  dashReset: '#ff44ff',
};

export const PLAYER_NAMES = [
  'Shadow', 'Blaze', 'Frost', 'Storm', 'Viper',
  'Ghost', 'Phoenix', 'Raven', 'Wolf', 'Hawk',
  'Cobra', 'Tiger', 'Eagle', 'Jaguar', 'Falcon',
  'Nova', 'Bolt', 'Flare', 'Drift', 'Spark',
];

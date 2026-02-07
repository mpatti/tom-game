import { TILE_SIZE, MAP_COLS, MAP_ROWS } from './constants';

// Tile types: 0 = floor, 1 = wall, 2 = blue base, 3 = red base
// Map: 40 cols x 25 rows
const MAP_STRING = `
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
W.....BB.........WW.........RR.....W
W.....BB..........  ..........RR.....W
W.....B...........  ...........R.....W
W.................  .................W
W.................  .................W
W...WWWW......          ......WWWW...W
W.................  .................W
W.......WW........  ........WW.......W
W.................  .................W
W..........            ..........W
W..........            ..........W
W.................  .................W
W.......WW........  ........WW.......W
W.................  .................W
W...WWWW......          ......WWWW...W
W.................  .................W
W.................  .................W
W.....B...........  ...........R.....W
W.....BB..........  ..........RR.....W
W.....BB.........WW.........RR.....W
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
`.trim();

function parseMap(): number[][] {
  const grid: number[][] = [];
  const lines = MAP_STRING.split('\n');

  for (let row = 0; row < MAP_ROWS; row++) {
    grid[row] = [];
    const line = row < lines.length ? lines[row] : '';
    for (let col = 0; col < MAP_COLS; col++) {
      const ch = col < line.length ? line[col] : '.';
      switch (ch) {
        case 'W': grid[row][col] = 1; break;
        case 'B': grid[row][col] = 2; break;
        case 'R': grid[row][col] = 3; break;
        default: grid[row][col] = 0; break;
      }
    }
  }

  // Fill remaining rows if map string is shorter
  while (grid.length < MAP_ROWS) {
    grid.push(new Array(MAP_COLS).fill(0));
  }

  return grid;
}

export const MAP_DATA = parseMap();

export function isWall(col: number, row: number): boolean {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return true;
  return MAP_DATA[row][col] === 1;
}

export function getTile(col: number, row: number): number {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return 1;
  return MAP_DATA[row][col];
}

export function worldToTile(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor(x / TILE_SIZE),
    row: Math.floor(y / TILE_SIZE),
  };
}

export function tileToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

// Flag positions (center of base areas)
export const BLUE_FLAG_POS = { x: 6 * TILE_SIZE + TILE_SIZE / 2, y: 12 * TILE_SIZE + TILE_SIZE / 2 };
export const RED_FLAG_POS = { x: 33 * TILE_SIZE + TILE_SIZE / 2, y: 12 * TILE_SIZE + TILE_SIZE / 2 };

// Spawn positions for each team
export const BLUE_SPAWNS = [
  { x: 4 * TILE_SIZE + TILE_SIZE / 2, y: 10 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 4 * TILE_SIZE + TILE_SIZE / 2, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 4 * TILE_SIZE + TILE_SIZE / 2, y: 14 * TILE_SIZE + TILE_SIZE / 2 },
];
export const RED_SPAWNS = [
  { x: 35 * TILE_SIZE + TILE_SIZE / 2, y: 10 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 35 * TILE_SIZE + TILE_SIZE / 2, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 35 * TILE_SIZE + TILE_SIZE / 2, y: 14 * TILE_SIZE + TILE_SIZE / 2 },
];

// Power-up spawn locations (neutral areas of map)
export const POWERUP_LOCATIONS = [
  { x: 20 * TILE_SIZE + TILE_SIZE / 2, y: 5 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 20 * TILE_SIZE + TILE_SIZE / 2, y: 19 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 13 * TILE_SIZE + TILE_SIZE / 2, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 27 * TILE_SIZE + TILE_SIZE / 2, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
  { x: 20 * TILE_SIZE + TILE_SIZE / 2, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
];

export function collideWithWalls(x: number, y: number, radius: number): { x: number; y: number } {
  let newX = x;
  let newY = y;

  // Check surrounding tiles
  const minCol = Math.floor((x - radius) / TILE_SIZE);
  const maxCol = Math.floor((x + radius) / TILE_SIZE);
  const minRow = Math.floor((y - radius) / TILE_SIZE);
  const maxRow = Math.floor((y + radius) / TILE_SIZE);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (!isWall(col, row)) continue;

      const tileLeft = col * TILE_SIZE;
      const tileRight = tileLeft + TILE_SIZE;
      const tileTop = row * TILE_SIZE;
      const tileBottom = tileTop + TILE_SIZE;

      // Find closest point on tile to player
      const closestX = Math.max(tileLeft, Math.min(newX, tileRight));
      const closestY = Math.max(tileTop, Math.min(newY, tileBottom));

      const dx = newX - closestX;
      const dy = newY - closestY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius && dist > 0) {
        const overlap = radius - dist;
        newX += (dx / dist) * overlap;
        newY += (dy / dist) * overlap;
      } else if (dist === 0) {
        // Player center is inside tile, push out
        const centerX = tileLeft + TILE_SIZE / 2;
        const centerY = tileTop + TILE_SIZE / 2;
        const pushDx = newX - centerX;
        const pushDy = newY - centerY;
        const pushDist = Math.sqrt(pushDx * pushDx + pushDy * pushDy);
        if (pushDist > 0) {
          newX = centerX + (pushDx / pushDist) * (TILE_SIZE / 2 + radius);
          newY = centerY + (pushDy / pushDist) * (TILE_SIZE / 2 + radius);
        }
      }
    }
  }

  return { x: newX, y: newY };
}

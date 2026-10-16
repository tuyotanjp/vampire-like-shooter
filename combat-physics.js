(function () {
const GRID_SIZE = 64;
const SEPARATION_STRENGTH = 0.85;
const PASSES = 10;

/**
 * Nudge nearby enemies apart to prevent them from occupying the same space.
 * A rebuilt spatial grid keeps the work close to linear for large crowds.
 */
function separateOverlappingEnemies(enemies) {
  const passes = enemies.length > 150 ? 2 : enemies.length > 90 ? 3 : enemies.length > 45 ? 5 : PASSES;
  for (let pass = 0; pass < passes; pass++) {
    const grid = new Map();

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.dead) continue;

      const cellX = Math.floor(enemy.x / GRID_SIZE);
      const cellY = Math.floor(enemy.y / GRID_SIZE);
      const key = `${cellX},${cellY}`;
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push(i);
    }

    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.dead) continue;

      const cellX = Math.floor(a.x / GRID_SIZE);
      const cellY = Math.floor(a.y / GRID_SIZE);
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          const cell = grid.get(`${cellX + offsetX},${cellY + offsetY}`);
          if (!cell) continue;

          for (const j of cell) {
            if (j <= i) continue;
            const b = enemies[j];
            if (b.dead) continue;

            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let distance = Math.hypot(dx, dy);
            const minDistance = a.r + b.r + 3;
            if (distance >= minDistance) continue;

            if (distance < 0.001) {
              const angle = ((i + 1) * 2.399963229728653 + (j + 1) * 0.7548776662466927) % (Math.PI * 2);
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              distance = 1;
            } else {
              dx /= distance;
              dy /= distance;
            }

            const push = (minDistance - distance) * SEPARATION_STRENGTH;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
          }
        }
      }
    }
  }
}

window.ForestCombat = { separateOverlappingEnemies };
})();
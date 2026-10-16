(function () {
function getLevelUpIntensity(level) {
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));

  return {
    power: Math.min(3.2, 1 + (currentLevel - 1) * 0.115),
    hue: (0.12 + (currentLevel - 1) * 0.052) % 1,
    ringRadius: Math.min(19, 8 + currentLevel * 0.44),
    outerCount: Math.min(230, Math.round(68 + currentLevel * 9)),
    innerCount: Math.min(82, Math.round(18 + currentLevel * 3)),
    flashStrength: Math.min(0.62, 0.31 + currentLevel * 0.012),
    flashDuration: 360 + Math.min(260, currentLevel * 10),
    shake: Math.min(1.15, 0.2 + currentLevel * 0.035),
    ringLife: Math.min(1.55, 0.78 + currentLevel * 0.025),
    secondaryRingLife: Math.min(1.25, 0.55 + currentLevel * 0.022),
    outerLife: Math.min(1.65, 0.9 + currentLevel * 0.028),
    innerLife: 0.7 + Math.min(0.5, currentLevel * 0.018),
    sparkCount: Math.min(75, 20 + currentLevel * 4),
    sparkRadius: Math.min(19, 8 + currentLevel * 0.44) * 0.85,
    sparkLife: 0.25 + Math.min(0.35, currentLevel * 0.018),
    beam: currentLevel >= 5,
    beamHeight: Math.min(16, 4.5 + currentLevel * 0.34),
    beamLife: Math.min(1.6, 0.72 + currentLevel * 0.03),
    mastery: currentLevel >= 10,
    masteryRingScale: Math.min(19, 8 + currentLevel * 0.44) * 1.2,
    masteryCount: Math.min(100, 20 + currentLevel * 5),
    masteryLife: Math.min(1.45, 0.85 + currentLevel * 0.02),
    ultimate: currentLevel >= 20,
    ultimateBeamHeight: Math.min(20, 9 + currentLevel * 0.28),
    ultimateFlashStrength: 0.34,
  };
}

window.ForestEffects = { getLevelUpIntensity };
})();
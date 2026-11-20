import type { PlayerProfile } from '@habit/core/gamification';

export function PlayerHud({ player }: { player: PlayerProfile }) {
  return (
    <section className="card player-hud" aria-label="Player status">
      <div className="player-hud-heading"><strong>Lv. {player.level} Adventurer</strong><span>🪙 {player.gold}</span></div>
      <label className="hud-meter hp-meter">❤️ HP <progress value={player.hp} max={player.maxHp} /> <span>{player.hp}/{player.maxHp}</span></label>
      <label className="hud-meter xp-meter">✨ XP <progress value={player.currentXp} max={player.nextLevelXp} /> <span>{player.currentXp}/{player.nextLevelXp}</span></label>
      <span className="shield-count" title="Streak shields protect your streak when you miss a day">🛡️ ×{player.streakShields}</span>
    </section>
  );
}

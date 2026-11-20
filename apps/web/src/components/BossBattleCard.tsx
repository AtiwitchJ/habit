import type { BossRecord } from '@habit/core/gamification';

export function BossBattleCard({ boss, damage = 0, portrait = '👾' }: { boss: BossRecord; damage?: number; portrait?: string }) {
  return (
    <section className="card boss-card" aria-label={`${boss.name} battle`}>
      <div className="boss-heading"><span aria-hidden="true">{portrait}</span><div><h2>{boss.name}</h2><small>{boss.description}</small></div></div>
      <label className="hud-meter boss-meter">Boss HP <progress value={boss.currentHp} max={boss.maxHp} /><span>{boss.currentHp}/{boss.maxHp}</span></label>
      <p>💥 Damage dealt today: {damage}</p>
    </section>
  );
}

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCATIONS = [
  ['The threshold', 'The guardian rises where cold water covers the entry stones. Its cracked shield bears the same crest as your map.', 'I stay beside the doorway, keep my torch high, and test the guardian before committing.'],
  ['The flooded gallery', 'Beyond the arch, stone faces weep into a narrow channel. A second sentinel guards the sluice wheel.', 'I follow the dry edge of the gallery and look for a way to lower the water.'],
  ['The silent archive', 'Waterlogged ledgers line the walls. An oath-bound warden mistakes every visitor for the thief who broke the seal.', 'I show the recovered crest and ask the warden who opened the reliquary.'],
  ['The reliquary', 'The drowned regent waits beneath the broken vault. Three empty settings surround the last blue crystal.', 'I will end the curse rather than carry it out. I approach the crystal with my shield ready.'],
];

/** A paced game, driven through the real UI and resolved from the server's actual dice. */
export async function playLongSession({ gm, player, state, synced, chat, chapter, minutes, out, expect, paceMs = 6500 }) {
  const began = Date.now(), deadline = began + minutes * 60000;
  const transcript = [], rolls = [];
  let rounds = 0, location = 0, moveIndex = 0;
  const arenas = [[21, 11], [24, 11], [27, 11], [29, 15]];
  const token = async name => Object.values((await state(gm)).tokens).find(t => t.name === name);
  const beat = async (seat, text) => {
    await chat(seat === 'GM' ? gm : player, text);
    transcript.push({ seconds: (Date.now() - began) / 1000, seat, text });
    await writeFile(path.join(out, 'session-progress.json'), JSON.stringify({ requestedMinutes: minutes, elapsedSeconds: (Date.now() - began) / 1000, rounds, location: LOCATIONS[location][0], transcript, rolls }, null, 2));
    console.log(`[${Math.floor((Date.now() - began) / 1000)}s] ${seat}: ${text}`);
    await new Promise(r => setTimeout(r, paceMs));
  };
  const tab = async (page, name) => {
    const control = page.getByRole('tab', {name, exact:true});
    if(await control.getAttribute('aria-selected') !== 'true' || await page.getByRole('button', {name:'Show sidebar',exact:true}).isVisible()) await control.click();
  };
  const edit = async (name, hp, maxHp, position, ac) => {
    const current = await token(name);
    if (current.stats.hp === hp && (maxHp === undefined || current.stats.maxHp === maxHp) && !position && ac === undefined) return;
    await tab(gm, 'Tokens');
    await gm.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    const modal = gm.getByRole('dialog', { name: `Edit ${name}`, exact: true });
    await modal.getByLabel('HP', { exact: true }).fill(String(hp));
    if (maxHp !== undefined) await modal.getByLabel('Max', { exact: true }).fill(String(maxHp));
    if (ac !== undefined) await modal.getByLabel('AC', { exact: true }).fill(String(ac));
    if (position) {
      await modal.locator('summary').filter({hasText:/^Advanced/}).click();
      await modal.getByLabel('Board X', {exact:true}).fill(String(position.x));
      await modal.getByLabel('Board Y', {exact:true}).fill(String(position.y));
    }
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await modal.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await token(name)).stats.hp).toBe(hp);
    await synced(gm, player, 'HP update reached both seats');
  };
  const roll = async (page, seat, expression, purpose) => {
    const previous = (await state(gm)).rolls.at(-1)?.id;
    await tab(page, 'Dice');
    await page.getByPlaceholder('1d20+5', { exact: true }).fill(expression);
    await page.locator('form').filter({has:page.getByPlaceholder('1d20+5',{exact:true})}).getByRole('button', { name: 'Roll', exact: true }).click();
    await expect.poll(async () => (await state(gm)).rolls.at(-1)?.id).not.toBe(previous);
    const result = (await state(gm)).rolls.at(-1);
    rolls.push({ seat, purpose, expression, total: result.total, id: result.id });
    await synced(gm, player, 'Public roll reached both seats');
    await new Promise(r => setTimeout(r, paceMs));
    return result.total;
  };
  const step = async (direction) => {
    await tab(player, 'Tokens');
    await player.getByRole('button', { name: 'Edit Mara', exact: true }).click();
    const modal = player.getByRole('dialog', { name: 'Edit Mara', exact: true });
    const before = (await token('Mara')).position;
    const way = direction ?? ['right', 'down', 'left', 'up'][moveIndex++ % 4];
    await modal.getByRole('button', { name: `Move Mara ${way} one square`, exact: true }).click();
    await expect.poll(async () => JSON.stringify((await token('Mara')).position)).not.toBe(JSON.stringify(before));
    await modal.getByRole('button', { name: /Close/ }).click();
    await synced(gm, player, 'Player movement reached GM');
  };
  const nextTurn = async () => {
    await tab(gm, 'Play');
    const before = (await state(gm)).initiative;
    await gm.getByRole('button', { name: 'Next turn', exact: true }).click();
    await expect.poll(async () => JSON.stringify((await state(gm)).initiative)).not.toBe(JSON.stringify(before));
  };
  await edit('Mara', 48, 48, {x: 1505, y: 805}, 16);
  await edit('Crypt Guardian', 32, 32, {x: 1645, y: 805}, 13);
  await chapter('03 / The threshold — the expedition begins');
  await beat('GM', 'Mara, you have come to recover the Lantern Seal before the tide reaches the upper chamber. We will play the journey, not skip to its ending.');
  await beat('PLAYER', 'I am ready. I have a shield, a short sword, and two healing draughts. I will listen before opening the inner door.');
  await roll(player, 'PLAYER', '1d20+3', 'Listen at the threshold');
  await beat('GM', LOCATIONS[0][1]);
  await beat('PLAYER', LOCATIONS[0][2]);
  await tab(gm, 'Play');
  await gm.getByRole('button', { name: 'Start encounter', exact: true }).click();
  const setup = gm.getByRole('dialog', { name: 'Start encounter', exact: true });
  await setup.getByLabel('Initiative for Mara', { exact: true }).fill('17');
  await setup.getByLabel('Initiative for Crypt Guardian', { exact: true }).fill('11');
  await setup.getByRole('button', { name: 'Start encounter', exact: true }).click();
  await expect.poll(async () => Boolean((await state(player)).initiative)).toBe(true);
  let draughts = 2, guardianDefeated = false;
  while (Date.now() < deadline - Math.min(30000, minutes * 6000)) {
    rounds++;
    let hero = await token('Mara');
    const foe = await token('Crypt Guardian');
    if (hero.stats.hp <= 0) {
      await beat('GM', 'Your shield falls. The wardens halt at the crest on your cloak: they bind your wounds and demand the seal be restored, not stolen.');
      await edit('Mara', 18);
      hero = await token('Mara');
      await beat('PLAYER', 'I accept their terms. I will return the seal and finish this without another needless death.');
    }
    if (foe.stats.hp <= 0) {
      guardianDefeated = true;
      await beat('GM', `The guardian yields in ${LOCATIONS[location][0].toLowerCase()}. Its weapon sinks into the water and a passage opens.`);
      const search = await roll(player, 'PLAYER', '1d20+3', 'Search the opened passage');
      await beat('PLAYER', search >= 13 ? 'I find a matching crest among the broken stones. I keep it and inspect the next passage.' : 'I find no hidden mechanism, so I mark the safe route and continue carefully.');
      location = (location + 1) % LOCATIONS.length;
      await chapter(`${String(location + 4).padStart(2, '0')} / ${LOCATIONS[location][0]}`);
      await beat('GM', LOCATIONS[location][1]);
      await beat('PLAYER', LOCATIONS[location][2]);
      const [col, row] = arenas[location];
      const destination = {x: col * 70 + 35, y: row * 70 + 35};
      // Find a route across actual open chapel squares, avoiding the six stone pillars.
      const start = (await token('Mara')).position;
      const queue = [{x:Math.floor(start.x/70), y:Math.floor(start.y/70), path:[]}];
      const seen = new Set();
      let route = [];
      for(let i=0;i<queue.length;i++) {
        const at = queue[i], key = `${at.x},${at.y}`;
        if(seen.has(key)) continue; seen.add(key);
        if(at.x===col && at.y===row) {route=at.path;break;}
        for(const [dx,dy,direction] of [[1,0,'right'],[-1,0,'left'],[0,1,'down'],[0,-1,'up']]) {
          const x=at.x+dx,y=at.y+dy;
          if(x>=21 && x<=31 && y>=6 && y<=17 && !([23,26,29].includes(x) && [9,14].includes(y))) queue.push({x,y,path:[...at.path,direction]});
        }
      }
      for(const direction of route) await step(direction);
      moveIndex = 0;
      await edit('Crypt Guardian', 28 + location * 6, 28 + location * 6, {x: destination.x + 140, y: destination.y});
      guardianDefeated = false;
      continue;
    }
    await beat('GM', `Round ${rounds}. ${LOCATIONS[location][0]}: Mara has ${hero.stats.hp}/48 HP; the guardian has ${foe.stats.hp}/${foe.stats.maxHp}. The tide presses against the broken stonework.`);
    if (hero.stats.hp < 18 && draughts > 0) {
      await beat('PLAYER', 'I withdraw behind my shield and drink one healing draught. I will not risk the seal on a reckless charge.');
      const healing = await roll(player, 'PLAYER', '2d4+2', 'Healing draught');
      await edit('Mara', Math.min(48, hero.stats.hp + healing)); draughts--;
      await beat('GM', `The draught restores ${healing} HP. You have ${draughts} remaining.`);
    } else {
      await beat('PLAYER', rounds % 3 === 0 ? 'I shift toward the dry stones and strike at the gap beneath its shield.' : rounds % 3 === 1 ? 'I keep the doorway at my back, take a measured step, and strike.' : 'I circle back out of the water, watch its sword arm, and counterattack.');
      await step();
      const attack = await roll(player, 'PLAYER', '1d20+5', 'Mara attacks AC 13');
      await beat('GM', attack >= 13 ? `A ${attack} hits AC 13. Roll your sword damage.` : `A ${attack} misses AC 13. Its shield catches the blade; the water hides your next step.`);
      if (attack >= 13) {
        const damage = await roll(player, 'PLAYER', '1d8+3', 'Sword damage');
        await edit('Crypt Guardian', Math.max(0, foe.stats.hp - damage));
        await beat('PLAYER', `${damage} damage. I keep my shield forward and watch whether the guardian yields.`);
      }
    }
    await nextTurn();
    if ((await token('Crypt Guardian')).stats.hp > 0) {
      await beat('GM', 'The guardian answers with a slow sweep at your shield side. Its attack is against AC 16.');
      const attack = await roll(gm, 'GM', '1d20+4', 'Guardian attacks AC 16');
      if (attack >= 16) {
        const damage = await roll(gm, 'GM', '1d6+1', 'Guardian damage');
        const hp = (await token('Mara')).stats.hp;
        await edit('Mara', Math.max(0, hp - damage));
        await beat('GM', `${attack} hits; ${damage} damage. The blow drives you back, but the passage remains open.`);
        await beat('PLAYER', 'I catch my balance, keep the seal above the water, and prepare my next move.');
      } else {
        await beat('GM', `${attack} misses. Your shield turns the blade into the flooded stones.`);
        await beat('PLAYER', 'I use the opening to study the crest on its shield. There must be a reason these guardians still stand watch.');
      }
    }
    await nextTurn();
    await synced(gm, player, `Round ${rounds} completed on both seats`);
    if (rounds % 3 === 0) {
      const insight = await roll(player, 'PLAYER', '1d20+3', 'Read the guardian oath');
      await beat('GM', insight >= 12 ? 'The inscription is clear: return what the tide took. You realize the seal belongs in the reliquary, not in a treasure chest.' : 'The inscription is damaged, but the same lantern symbol points deeper into the crypt.');
      await beat('PLAYER', 'Then that is our goal. I will restore the seal and leave the crypt at peace.');
    }
  }
  await chapter('09 / The Lantern Seal — the expedition closes');
  await beat('GM', guardianDefeated ? 'With the final guardian quiet, the lantern socket opens. The tide begins to recede.' : 'At the final bell, the lantern crest on your cloak answers the seal. The guardian lowers its weapon and lets you approach the socket.');
  await beat('PLAYER', 'I place the Lantern Seal back in its setting, step away, and wait for the water to settle. I take no treasure from the crypt.');
  await roll(player, 'PLAYER', '1d20+3', 'Restore the lantern seal');
  await beat('GM', 'Blue light returns to the reliquary. The wardens kneel, the flooded passage drains, and the way home is open. The expedition is complete.');
  await beat('PLAYER', 'I leave the crest at the threshold for the next traveler. Mara returns to the surface with the story, and the crypt keeps its peace.');
  await tab(gm, 'Play'); await gm.getByRole('button', { name: 'End encounter', exact: true }).click();
  await expect.poll(async () => (await state(player)).initiative).toBeNull();
  await synced(gm, player, 'The complete long game converged');
  const final = await state(gm);
  const report = { requestedMinutes: minutes, durationSeconds: (Date.now() - began) / 1000, rounds, completed: true, transcript, rolls, checks: ['real independent GM/player browsers', 'UI movement, dice, HP and initiative', 'results resolved from server dice', 'final shared state converged'], tokens: Object.values(final.tokens).map(({name,position,stats})=>({name,position,stats})) };
  await writeFile(path.join(out, 'long-session.json'), JSON.stringify(report, null, 2));
  return report;
}

/** Original top-down demo maps. Art, exact square grid and stored sight walls share one layout.
 * Run: npm run render:compact -w @vtt/web. No network or browser required.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const CELL = 70, COLS = 28, ROWS = 20;
const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const layouts = [
  {
    slug: 'emberwatch-archive', title: 'Emberwatch Archive', symbol: 'EMBERWATCH_ARCHIVE_WALLS',
    floor: '#b7a38b', grout: '#756551', wall: '#514637', trim: '#d3b98c', ground: '#252a26', accent: '#cc8545',
    rooms: [[2,3,10,15], [12,3,24,9], [12,11,24,15], [11,6,11,6], [17,10,17,10], [6,16,6,17], [5,18,21,18], [21,16,21,17]],
    pillars: [[15,5],[21,5],[15,13],[21,13]], doors: [[11,6,'closed'],[17,10,'locked'],[6,16,'closed'],[21,16,'closed']],
    windows: [[4,3,'H'],[7,3,'H'],[25,7,'V'],[25,13,'V']],
    shelves: [[3,4],[3,7],[3,10],[9,4],[9,7],[9,10],[13,3],[17,3],[21,3]],
    lamps: [[4,14],[9,14],[13,8],[23,8],[13,14],[23,14]], pools: [], rug: [5,5,3,8],
  },
  {
    slug: 'moonwater-baths', title: 'Moonwater Baths', symbol: 'MOONWATER_BATHS_WALLS',
    floor: '#a6bcb5', grout: '#607d7b', wall: '#344f58', trim: '#b6d5ce', ground: '#182d35', accent: '#64b6ba',
    rooms: [[2,3,9,14],[11,3,24,14],[10,6,10,6],[10,12,10,12],[4,16,22,18],[6,15,6,15],[20,15,20,15]],
    pillars: [[13,5],[22,5],[13,12],[22,12]], doors: [[10,6,'closed'],[10,12,'locked'],[6,15,'closed'],[20,15,'closed']],
    windows: [[5,3,'H'],[8,3,'H'],[17,3,'H'],[25,8,'V']],
    shelves: [], lamps: [[3,4],[8,4],[3,13],[8,13],[12,4],[23,4],[12,13],[23,13]],
    pools: [[15,6,6,6],[4,6,3,5]], rug: null,
  },
];
const walk = (ch) => ch && ch !== '#';
function geometry(layout) {
  const grid = Array.from({length: ROWS}, () => Array(COLS).fill('#'));
  for (const [x0,y0,x1,y1] of layout.rooms) for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) grid[y][x]='.';
  for(const [x,y] of layout.pillars) grid[y][x]='#';
  const at=(x,y)=>grid[y]?.[x] ?? '#';
  const windows = new Set(layout.windows.map(([x,y,o]) => `${o}:${x}:${y}`));
  const runs = new Map();
  const edge=(o,x,y)=>{
    const kind=windows.has(`${o}:${x}:${y}`)?'window':'wall';
    const key=`${o}:${o==='H'?y:x}:${kind}`;
    if(!runs.has(key)) runs.set(key,[]);
    runs.get(key).push(o==='H'?x:y);
  };
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(walk(at(x,y))) {
    if(!walk(at(x,y-1)))edge('H',x,y);
    if(!walk(at(x,y+1)))edge('H',x,y+1);
    if(!walk(at(x-1,y)))edge('V',x,y);
    if(!walk(at(x+1,y)))edge('V',x+1,y);
  }
  const walls=[];
  for(const [key,starts] of runs) {
    const [o,line,kind]=key.split(':');starts.sort((a,b)=>a-b);
    let start=starts[0],end=start+1;
    const flush=()=>walls.push({a:{x:(o==='H'?start:+line)*CELL,y:(o==='H'?+line:start)*CELL},b:{x:(o==='H'?end:+line)*CELL,y:(o==='H'?+line:end)*CELL},...(kind==='window'?{portal:{kind:'window',state:'closed'}}:{})});
    for(const s of starts.slice(1)) {if(s===end)end++;else{flush();start=s;end=s+1;}}flush();
  }
  for(const [x,y,state] of layout.doors) {
    const horizontal = walk(at(x,y-1)) && walk(at(x,y+1));
    walls.push({a:{x:(horizontal?x:x+.5)*CELL,y:(horizontal?y+.5:y)*CELL},b:{x:(horizontal?x+1:x+.5)*CELL,y:(horizontal?y+.5:y+1)*CELL},portal:{kind:'door',state}});
  }
  return {grid,walls};
}
const rect=(x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
function artwork(l,grid,walls) {
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${COLS*CELL}" height="${ROWS*CELL}" viewBox="0 0 ${COLS*CELL} ${ROWS*CELL}"><defs><radialGradient id="lamp"><stop stop-color="#ffd78a" stop-opacity=".42"/><stop offset="1" stop-color="#ffb455" stop-opacity="0"/></radialGradient><pattern id="water" width="35" height="35" patternUnits="userSpaceOnUse"><rect width="35" height="35" fill="#245f6a"/><path d="M0 13 Q9 7 18 13 T36 13 M0 29 Q9 23 18 29 T36 29" fill="none" stroke="#96d8d0" stroke-opacity=".28"/></pattern></defs>`,rect(0,0,COLS*CELL,ROWS*CELL,l.ground)];
  let seed=82719;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++) {
    if(!walk(grid[y][x])) {parts.push(rect(x*CELL+3,y*CELL+3,64,64,l.wall,'opacity=".22"'));continue;}
    parts.push(rect(x*CELL,y*CELL,CELL,CELL,l.grout),rect(x*CELL+1.5,y*CELL+1.5,CELL-3,CELL-3,l.floor),rect(x*CELL+3,y*CELL+3,CELL-6,CELL-6,rnd()>.5?'#fff':'#000',`opacity="${.02+rnd()*.035}"`));
    if(rnd()<.2)parts.push(`<path d="M${x*CELL+8} ${y*CELL+12} l18 9 -5 12 19 10" fill="none" stroke="${l.grout}" opacity=".27"/>`);
  }
  if(l.rug){const [x,y,w,h]=l.rug;parts.push(rect(x*CELL+9,y*CELL+9,w*CELL-18,h*CELL-18,'#793d35',`stroke="${l.accent}" stroke-width="5"`),rect(x*CELL+21,y*CELL+21,w*CELL-42,h*CELL-42,'none',`stroke="${l.accent}" stroke-width="2"`));}
  for(const [x,y,w,h] of l.pools)parts.push(rect(x*CELL+7,y*CELL+7,w*CELL-14,h*CELL-14,'url(#water)',`stroke="${l.trim}" stroke-width="14"`),rect(x*CELL+20,y*CELL+20,w*CELL-40,h*CELL-40,'none','stroke="#85d0c9" stroke-opacity=".55" stroke-width="2"'));
  for(const [x,y] of l.shelves) {
    parts.push(rect(x*CELL+5,y*CELL+5,53,123,'#3c3028',`stroke="${l.trim}" stroke-width="3"`));
    for(let j=0;j<3;j++)for(let k=0;k<5;k++)parts.push(rect(x*CELL+10+k*9,y*CELL+11+j*38,7,29,['#82613f','#6b7d6e','#a36b4c','#c3a66c'][Math.floor(rnd()*4)],'rx="1"'));
  }
  for(const [x,y] of l.pillars)parts.push(rect(x*CELL,y*CELL,CELL,CELL,l.wall,`stroke="${l.trim}" stroke-width="3"`),rect(x*CELL+10,y*CELL+10,50,50,l.wall,`stroke="${l.trim}" stroke-width="2"`));
  // The visible wall and portal strokes use exactly the sight segment coordinates.
  for(const w of walls) {
    const door=w.portal?.kind==='door',window=w.portal?.kind==='window';
    parts.push(`<path d="M${w.a.x} ${w.a.y} L${w.b.x} ${w.b.y}" stroke="#090e11" stroke-width="${door?19:22}" fill="none"/>`, `<path d="M${w.a.x} ${w.a.y} L${w.b.x} ${w.b.y}" stroke="${door?(w.portal.state==='locked'?'#8c6542':'#b18a52'):window?'#a0e2e1':l.wall}" stroke-width="${door?12:window?8:16}" fill="none"/>`);
    if(!w.portal)parts.push(`<path d="M${w.a.x} ${w.a.y} L${w.b.x} ${w.b.y}" stroke="${l.trim}" stroke-opacity=".6" stroke-width="2" fill="none"/>`);
    if(door) {const cx=(w.a.x+w.b.x)/2,cy=(w.a.y+w.b.y)/2;parts.push(rect(cx-4,cy-4,8,8,'#dfc88a'));}
  }
  for(const [x,y] of l.lamps) {const cx=x*CELL+35,cy=y*CELL+35;parts.push(`<circle cx="${cx}" cy="${cy}" r="115" fill="url(#lamp)"/>`,rect(cx-12,cy-12,24,24,'#3f3528',`stroke="${l.accent}" stroke-width="3"`),`<circle cx="${cx}" cy="${cy}" r="7" fill="#ffe5a2"/>`);}
  parts.push('</svg>');return parts.join('');
}
await mkdir(root('scripts/out'),{recursive:true});
for(const layout of layouts) {
  const {grid,walls}=geometry(layout),svg=artwork(layout,grid,walls),buffer=Buffer.from(svg);
  await sharp(buffer).webp({quality:90}).toFile(root(`public/img/map-${layout.slug}.webp`));
  await sharp(buffer).resize(640).webp({quality:85}).toFile(root(`public/img/home/${layout.slug}-thumb.webp`));
  const overlay=svg.replace('</svg>',walls.map(w=>`<path d="M${w.a.x} ${w.a.y} L${w.b.x} ${w.b.y}" stroke="${w.portal?'#00ffff':'#ff3060'}" stroke-width="3"/>`).join('')+'</svg>');
  await sharp(Buffer.from(overlay)).png().toFile(root(`scripts/out/${layout.slug}-walls.png`));
  const body="[\n"+walls.map(w=>`  { a: { x: ${w.a.x}, y: ${w.a.y} }, b: { x: ${w.b.x}, y: ${w.b.y} }${w.portal ? `, portal: { kind: "${w.portal.kind}", state: "${w.portal.state}" }` : ""} },`).join("\n")+"\n]";
  await writeFile(fileURLToPath(new URL(`../../../packages/shared/src/shippedWalls/${layout.slug}.ts`,import.meta.url)),`import type { StoredWall } from "../shippedMaps";\n\n/** Generated alongside the art by renderCompactMaps.mjs; do not edit by hand. */\nexport const ${layout.symbol}: readonly StoredWall[] = ${body};\n`);
  console.log(`${layout.title}: ${COLS*CELL}x${ROWS*CELL}, ${walls.length} sight walls`);
}

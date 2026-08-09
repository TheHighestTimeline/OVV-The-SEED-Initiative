import { SITE } from '../src/00-config.js';
import { siteH, groundH, waterY, slopeAt, CREEK, OXBOWS, riverCentre, riverSurface } from '../src/01-terrain.js';
const R = SITE.river;
const row = (a, b) => console.log(String(a).padEnd(30), b);

console.log('\n=== WEST-TO-EAST SECTION at z = 200 (through the campus latitude) ===');
console.log('x        ground   water    feature');
for (const [x, note] of [[0,'campus pad'],[385,'perimeter ring'],[469,'berm crest'],
  [514,'berm outer toe'],[560,'site boundary'],[620,'bluff top'],[700,'bluff face'],
  [815,'bluff toe'],[900,'floodplain / backswamp'],[1010,'natural levee'],
  [1070,'channel west bank'],[1130,'channel centre'],[1190,'channel east bank'],
  [1300,'floodplain east'],[1540,'flood edge'],[1750,'east upland']]) {
  const w = waterY(x, 200);
  console.log(String(x).padEnd(9), siteH(x,200).toFixed(2).padEnd(9),
    (w? w.y.toFixed(2)+' '+w.kind : '-').padEnd(16), note);
}

console.log('\n=== CHANNEL: is there water down the whole length? ===');
let dry = 0, samples = 0;
for (let z = -1300; z <= 1300; z += 50) {
  const cx = riverCentre(z);
  const w = waterY(cx, z); samples++;
  const g = siteH(cx, z);
  if (!w || w.kind !== 'river' || g > w.y) dry++;
}
row('channel samples', samples);
row('samples with no water / dry bed', dry === 0 ? 'PASS (0)' : 'FAIL ('+dry+')');

console.log('\n=== BED BELOW SURFACE along the channel ===');
let minDepth = 1e9, maxDepth = -1e9;
for (let z = -1300; z <= 1300; z += 25) {
  const cx = riverCentre(z);
  const d = riverSurface(z) - siteH(cx, z);
  minDepth = Math.min(minDepth, d); maxDepth = Math.max(maxDepth, d);
}
row('depth at centreline min/max', minDepth.toFixed(2)+' .. '+maxDepth.toFixed(2)+' m');
row('always submerged', minDepth > 0.4 ? 'PASS' : 'FAIL');

console.log('\n=== SURFACE FALL (should drop north to south) ===');
row('surface at z=-1400 / +1400', riverSurface(-1400).toFixed(2)+' -> '+riverSurface(1400).toFixed(2));

console.log('\n=== CAMPUS PAD STILL FLAT ===');
let mn=1e9,mx=-1e9;
for(let i=0;i<3000;i++){const x=(Math.random()*2-1)*360,z=(Math.random()*2-1)*360;const y=siteH(x,z);mn=Math.min(mn,y);mx=Math.max(mx,y);}
row('pad range', mn.toFixed(3)+' .. '+mx.toFixed(3));
row('flat at '+SITE.padY, (mx-mn)<0.001?'PASS':'FAIL');

console.log('\n=== CREEK: campus outfall to the river ===');
row('nodes', CREEK.length);
row('head x/z/bed', CREEK[0].x.toFixed(0)+' / '+CREEK[0].z.toFixed(0)+' / '+CREEK[0].bed.toFixed(2));
const m = CREEK[CREEK.length-1];
row('mouth x/z/bed', m.x.toFixed(0)+' / '+m.z.toFixed(0)+' / '+m.bed.toFixed(2));
row('river surface at mouth', riverSurface(m.z).toFixed(2));
let mono=true; for(let i=1;i<CREEK.length;i++) if(CREEK[i].bed>CREEK[i-1].bed+1e-6) mono=false;
row('bed falls monotonically', mono?'PASS':'FAIL');
row('mouth reaches the river', (m.x > riverCentre(m.z)-R.halfWidth-40)?'PASS':'FAIL');

console.log('\n=== OXBOWS hold water ===');
for (const o of OXBOWS) {
  const px = o.x + Math.cos(o.rot)*o.rx*0.72, pz = o.z + Math.sin(o.rot)*o.rx*0.72;
  const w = waterY(px, pz);
  console.log('  oxbow at', o.x, o.z, '->', w? w.y.toFixed(2)+' '+w.kind : 'NO WATER');
}

console.log('\n=== SLOPES (40k samples) ===');
const b={}; let over45=0, worst=0, wp=null;
for(let i=0;i<40000;i++){
  const x=-1400+Math.random()*3000, z=-1300+Math.random()*2800;
  const s=slopeAt(x,z,1.5)*180/Math.PI;
  const k=Math.floor(s/10)*10; b[k]=(b[k]||0)+1;
  if(s>45)over45++; if(s>worst){worst=s;wp=[x.toFixed(0),z.toFixed(0)];}
}
Object.keys(b).sort((a,c)=>a-c).forEach(k=>console.log('  '+k+'-'+(+k+10)+' deg', b[k]));
row('over 45 deg', over45+'  worst '+worst.toFixed(1)+' at '+wp);
console.log('');

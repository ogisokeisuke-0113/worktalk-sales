import fs from 'fs'; import http from 'http'; import path from 'path';
import { chromium } from 'playwright';
const DIST=process.argv[2];
const mk=(i)=>({id:'t'+i,companyName:'株式会社テスト'+i,phone:'03-0000-'+String(i).padStart(4,'0'),recruitmentPhone:'',
  contactName:'',contactPosition:'',industry:'メーカー',employeeScale:'101〜300名',salesRep:'未確定',status:'未架電',
  isKept:false,keptBy:'',keptAt:'',memo:'',callHistory:[],keepHistory:[],prefecture:'東京都',listSource:'テスト',
  nextCallDate:'',emailStatus:'未送信',appoDate:null});
const ITEMS=Array.from({length:300},(_,i)=>mk(i));
const root=fs.mkdtempSync('/tmp/sc-'); fs.mkdirSync(path.join(root,'worktalk-sales'),{recursive:true});
fs.cpSync(DIST,path.join(root,'worktalk-sales'),{recursive:true});
const srv=http.createServer((q,s)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  if(!fs.existsSync(f)){s.writeHead(404);return s.end()}
  s.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});s.end(fs.readFileSync(f))});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch({args:['--host-resolver-rules=MAP *.supabase.co 127.0.0.1:1']});
const ctx=await b.newContext({viewport:{width:1280,height:800}});
await ctx.route('**supabase.co/**',r=>{const u=r.request().url(),m=r.request().method();
  const json=x=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x),headers:{'content-range':'0-0/*'}});
  if(u.includes('/auth/v1/'))return json({id:'a1',email:'t@e.com',user_metadata:{}});
  if(m==='GET'&&u.includes('/teleapo_items')){ if(u.includes('id=in.'))return json(ITEMS.slice(0,200).map(i=>({id:i.id,data:i})));
    const q2=new URL(u).searchParams,off=Number(q2.get('offset')||0),lim=Number(q2.get('limit')||1000);
    return json(ITEMS.slice(off,off+lim).map(i=>({data:i}))) }
  return json([])});
const page=await ctx.newPage();
await page.addInitScript(()=>{const b64=o=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const exp=Math.floor(Date.now()/1000)+86400;
  localStorage.setItem('sb-antqewvlzfonsakgndxt-auth-token',JSON.stringify({access_token:[b64({alg:'HS256',typ:'JWT'}),b64({sub:'a1',exp,role:'authenticated'}),'s'].join('.'),
    token_type:'bearer',expires_in:86400,expires_at:exp,refresh_token:'r',
    user:{id:'a1',aud:'authenticated',role:'authenticated',email:'t@e.com',app_metadata:{},user_metadata:{name:'テスト太郎',users_id:'u1'}}}))});
await page.goto(`http://127.0.0.1:${srv.address().port}/worktalk-sales/`,{waitUntil:'domcontentloaded'});
await page.waitForTimeout(3000);
await page.getByRole('button',{name:'テレアポ',exact:true}).first().click();
await page.waitForTimeout(700);
const Y=()=>page.evaluate(()=>Math.round(window.scrollY));
const R=[]; const chk=(n,ok,d)=>R.push([ok?'✓':'✗',n,d]);

// ① 検索パネルで下までスクロール → 検索する
await page.evaluate(()=>window.scrollTo(0,900)); await page.waitForTimeout(300);
const before=await Y();
await page.getByRole('button',{name:'検索する'}).first().click();
await page.waitForTimeout(900);
const after=await Y();
chk('検索する → 一番上へ戻る', after===0, `${before} → ${after}`);

// ② 一覧を下までスクロール → 詳細を開いて閉じる
await page.evaluate(()=>window.scrollTo(0,1500)); await page.waitForTimeout(400);
const card=page.locator('div.bg-white.rounded-xl').filter({has:page.locator('a[href*="google.com/search"]')}).nth(3);
await card.getByRole('button',{name:'詳細',exact:true}).click();
await page.waitForTimeout(600);
// Playwright がクリック前に自動スクロールするので、開いた直後の位置を基準にする
const y2=await Y();
await page.locator('div.fixed.inset-0').getByText('×',{exact:true}).last().click();
await page.waitForTimeout(600);
const y3=await Y();
chk('詳細を閉じても位置が変わらない', Math.abs(y3-y2)<50, `${y2} → ${y3}`);

// ③ 下まで行って続きを読み込む
await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await page.waitForTimeout(1500);
const y4=await Y();
chk('続きを読み込んでも一番上へ飛ばない', y4>200, `scrollY=${y4}`);
const n=await page.locator('div.bg-white.rounded-xl').filter({has:page.locator('a[href*="google.com/search"]')}).count();
chk('続きが実際に増えている', n>50, `${n}件表示`);

// ④ 検索に戻る
await page.getByText('検索に戻る').first().click(); await page.waitForTimeout(700);
chk('検索に戻る → 一番上へ戻る', (await Y())===0, `scrollY=${await Y()}`);

console.log('\n=== スクロール挙動 ===');
for(const [a,n2,d] of R) console.log(`  ${a} ${n2.padEnd(30)} ${d}`);
await b.close(); srv.close();

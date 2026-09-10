#!/usr/bin/env node
/**
 * worktalk-sales 架電記録消失バグ 緊急パッチ
 *
 * 配信中のビルド成果物 (gh-pages/assets/index-*.js) に対して外科的に当てる。
 * 稼働中コードのソースが GitHub に存在しないため、暫定的にバンドルを直接パッチする。
 * 同じ内容のソース版パッチは SOURCE-PATCH.md を参照。
 *
 * 使い方: node patch-bundle.js <入力js> <出力js>
 *
 * 直す不具合:
 *  P1 デバウンスの取りこぼし  … 1.5秒以内の連続操作で先の変更が送信されず消える
 *  P2 起動時の全件upsert      … localStorage容量超過により毎起動で9,647行を丸ごと上書き
 *  P3 マージ処理の無効化       … .in() が600件超で400、かつ error 未確認で素の上書きに戻る
 *  P4 無言の失敗             … upsert失敗が console.warn のみ。再試行も通知も無い
 *  P5 離脱時の消失            … 記録後1.5秒以内にタブを閉じると送信されない
 */
const fs = require('fs');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node patch-bundle.js <in.js> <out.js>');
  process.exit(1);
}

let src = fs.readFileSync(inPath, 'utf8');
const applied = [];

function replaceOnce(label, find, replace) {
  const idx = src.indexOf(find);
  if (idx === -1) throw new Error(`[${label}] 対象が見つかりません。バンドルが想定と異なります。`);
  if (src.indexOf(find, idx + 1) !== -1) throw new Error(`[${label}] 対象が複数見つかりました。中止します。`);
  src = src.slice(0, idx) + replace + src.slice(idx + find.length);
  applied.push(label);
}

/* ─────────────────────────────────────────────────────────────
 * P3 / P4: teleapo_items の upsert
 *   - .in() を200件ずつに分割（600件超で 400 Bad Request になるため）
 *   - select の error を確認し、失敗したら throw（空マージでの上書きを防ぐ）
 *   - upsert も200件ずつ分割し、error を throw（呼び出し側が再送できるように）
 *   - 履歴の重複判定を「date|caller」から「エントリのid優先」に変更
 *     （同一人物が同じ日に同じ会社へ2回架電したとき2件目が消えるのを防ぐ）
 * ───────────────────────────────────────────────────────────── */
replaceOnce(
  'P3/P4 teleapo upsert (merge + chunk + throw)',
  'async function $a(e){if(!Xa||!e.length)return;let t=e.map(e=>e.id),{data:n}=await Xa.from(`teleapo_items`).select(`id, data`).in(`id`,t),r={};if(n)for(let e of n)r[e.id]=e.data;let i=e.map(e=>{let t=r[e.id],n=e.callHistory||[];if(t?.callHistory?.length){let e=new Set(n.map(e=>`${e.date}|${e.caller}`));for(let r of t.callHistory)e.has(`${r.date}|${r.caller}`)||(n=[...n,r],e.add(`${r.date}|${r.caller}`))}return{id:e.id,data:{...e,callHistory:n},updated_at:new Date().toISOString()}}),{error:a}=await Xa.from(`teleapo_items`).upsert(i);a&&console.warn(`[db:teleapo_items] upsert error:`,a.message)}',
  'async function $a(e){if(!Xa||!e.length)return;' +
    'let CK=200,ids=e.map(e=>e.id),r={};' +
    'for(let k=0;k<ids.length;k+=CK){' +
      'let{data:n,error:m}=await Xa.from(`teleapo_items`).select(`id, data`).in(`id`,ids.slice(k,k+CK));' +
      'if(m)throw Error("既存データの取得に失敗したため保存を中止しました: "+m.message);' +
      'if(n)for(let e of n)r[e.id]=e.data}' +
    'let hk=x=>x&&x.id?"#"+x.id:`${x&&x.date}|${x&&x.caller}`,LOGS=[],' +
    'i=e.map(e=>{let t=r[e.id],n=e.callHistory||[];' +
      /* サーバーにまだ無い履歴＝今回増えた架電記録。call_logs へ退避する */
      'let rk=new Set(((t&&t.callHistory)||[]).map(hk));' +
      '(e.callHistory||[]).forEach((c,ci)=>{rk.has(hk(c))||LOGS.push(__wtLogRow(e,c,ci))});' +
      'if(t?.callHistory?.length){let s=new Set(n.map(hk));' +
        'for(let v of t.callHistory)s.has(hk(v))||(n=[...n,v],s.add(hk(v)));' +
        'n=n.slice().sort((a,b)=>String(a&&a.date).localeCompare(String(b&&b.date)))}' +
      'return{id:e.id,data:{...e,callHistory:n},updated_at:new Date().toISOString()}});' +
    /* 本体より先に追記専用テーブルへ入れる。本体の保存が失敗しても記録は残る。
       ここが失敗しても本体の保存は止めない（call_logs は保険であって主ではない） */
    'for(let k=0;k<LOGS.length;k+=CK){' +
      'try{let{error:le}=await Xa.from(`call_logs`).upsert(LOGS.slice(k,k+CK),{onConflict:"dedup_key",ignoreDuplicates:!0});' +
        'le&&console.warn("[db:call_logs] 架電履歴の追記に失敗:",le.message)}' +
      'catch(le){console.warn("[db:call_logs] 架電履歴の追記に失敗:",le&&le.message)}}' +
    'for(let k=0;k<i.length;k+=CK){' +
      'let{error:a}=await Xa.from(`teleapo_items`).upsert(i.slice(k,k+CK));' +
      'if(a)throw Error("保存に失敗しました: "+a.message)}}'
);

/* ─────────────────────────────────────────────────────────────
 * P4: delete も同様に分割 + throw
 * ───────────────────────────────────────────────────────────── */
replaceOnce(
  'P4 delete (chunk + throw)',
  'async function eo(e,t){if(!Xa||!t.length)return;let{error:n}=await Xa.from(e).delete().in(`id`,t);n&&console.warn(`[db:${e}] delete error:`,n.message)}',
  'async function eo(e,t){if(!Xa||!t.length)return;' +
    'for(let k=0;k<t.length;k+=200){' +
      'let{error:n}=await Xa.from(e).delete().in(`id`,t.slice(k,k+200));' +
      'if(n)throw Error("削除に失敗しました: "+n.message)}}'
);

/* ─────────────────────────────────────────────────────────────
 * P1 / P4 / P5: 送信キュー本体を注入
 *   タイマーが clearTimeout されてもキューは消えない。
 *   送信に成功して初めてキューから外れる。失敗したら戻して指数バックオフで再試行。
 *   離脱時は fetch(keepalive) で最後の一押しを送る。
 * ───────────────────────────────────────────────────────────── */
const QUEUE = `
function __wtQ(name,api,table,url,key){
  var G=globalThis.__wtq||(globalThis.__wtq={});
  if(G[name])return G[name];
  var Q=G[name]={
    name:name,baseline:null,latest:null,hot:new Set(),flushing:!1,timer:null,dueAt:0,fail:0,
    emit:function(st,d){try{window.dispatchEvent(new CustomEvent("wt-save",{detail:Object.assign({state:st,queue:name},d||{})}))}catch(e){}},
    schedule:function(ms,force){
      var s=this;ms=ms==null?1500:ms;var due=Date.now()+ms;
      if(s.timer){if(!force||due>=s.dueAt)return;clearTimeout(s.timer)}
      s.dueAt=due;s.timer=setTimeout(function(){s.timer=null;s.flush()},ms)
    },
    diff:function(){
      var base=this.baseline||[],cur=this.latest||[],bm=new Map(),i,ch=[];
      for(i=0;i<base.length;i++)bm.set(base[i].id,base[i]);
      for(i=0;i<cur.length;i++){var it=cur[i],bf=bm.get(it.id);
        if(!bf||JSON.stringify(bf)!==JSON.stringify(it))ch.push(it)}
      var ids=new Set();for(i=0;i<cur.length;i++)ids.add(cur[i].id);
      var dl=[];for(i=0;i<base.length;i++)ids.has(base[i].id)||dl.push(base[i].id);
      return{changed:ch,dels:dl,snapshot:cur}
    },
    flush:async function(){
      var s=this;
      if(s.flushing){s.schedule(400,!0);return}
      if(!s.latest)return;
      var d=s.diff();
      if(!d.changed.length&&!d.dels.length){s.baseline=d.snapshot;s.hot.clear();return}
      s.flushing=!0;
      s.emit("saving",{n:d.changed.length});
      try{
        if(d.changed.length)await api.upsert(d.changed);
        if(d.dels.length)await api.delete(d.dels);
        /* 送信に成功して初めて基準を進める。ここが元の不具合の核心だった */
        s.baseline=d.snapshot;s.hot.clear();s.fail=0;
        s.emit("saved",{n:d.changed.length});
        if(s.latest!==d.snapshot)s.schedule(400,!0)
      }catch(err){
        /* 基準を進めない = 次のフラッシュでも同じ差分が再送される */
        s.fail++;
        console.warn("[wt-save:"+name+"] 保存に失敗、再試行します:",err&&err.message);
        s.emit("error",{msg:err&&err.message,n:d.changed.length,fail:s.fail});
        s.schedule(Math.min(3e4,1500*Math.pow(2,Math.min(s.fail,4))),!0)
      }finally{s.flushing=!1}
    },
    pendingCount:function(){
      if(!this.latest)return 0;
      if(this.hot.size)return this.hot.size;
      return this.baseline===this.latest?0:this.diff().changed.length
    },
    flushSync:function(){
      /* 離脱時の最後の一押し。架電記録など「増えた履歴」だけを keepalive で送る */
      var s=this;
      if(!s.hot.size||!s.latest)return;
      try{
        var byId=new Map();s.latest.forEach(function(x){byId.set(x.id,x)});
        var rows=[];s.hot.forEach(function(id){var x=byId.get(id);x&&rows.push({id:x.id,data:x,updated_at:new Date().toISOString()})});
        if(!rows.length)return;
        var body=JSON.stringify(rows);
        if(body.length>6e4)return;
        fetch(url+"/rest/v1/"+table+"?on_conflict=id",{method:"POST",keepalive:!0,
          headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
          body:body});
      }catch(e){}
    }
  };
  try{
    document.addEventListener("visibilitychange",function(){
      document.visibilityState==="hidden"&&(Q.flush(),Q.flushSync())});
    window.addEventListener("pagehide",function(){Q.flushSync()});
    window.addEventListener("beforeunload",function(ev){
      if(Q.baseline===Q.latest)return;
      Q.flushSync();
      if(Q.fail>0){ev.preventDefault();ev.returnValue=""}
    });
  }catch(e){}
  return Q
}
function __wtDirty(q,id){
  /* その行に未送信の変更を持っているか。持っていれば他人の更新で上書きしない */
  if(!q.baseline||!q.latest||q.baseline===q.latest)return !1;
  var a=null,b=null,i;
  for(i=0;i<q.latest.length;i++)if(q.latest[i].id===id){a=q.latest[i];break}
  if(!a)return !1;
  for(i=0;i<q.baseline.length;i++)if(q.baseline[i].id===id){b=q.baseline[i];break}
  return !b||JSON.stringify(a)!==JSON.stringify(b)
}
function __wtRemote(q,setItems,row){
  if(!row||!row.id||!row.data)return;
  /* 自分が編集中（未送信）の行は触らない */
  if(q.hot.has(row.id)||__wtDirty(q,row.id))return;
  var d=row.data;
  setItems(function(list){
    var idx=-1,i;
    for(i=0;i<list.length;i++)if(list[i].id===row.id){idx=i;break}
    if(idx>=0&&JSON.stringify(list[idx])===JSON.stringify(d))return list;
    /* 比較基準にも同じものを入れる。入れないと「自分が変更した」と誤判定して送り返してしまう */
    if(q.baseline){
      var b=q.baseline,bi=-1;
      for(i=0;i<b.length;i++)if(b[i].id===row.id){bi=i;break}
      q.baseline=bi>=0?b.slice(0,bi).concat([d],b.slice(bi+1)):b.concat([d])
    }
    return idx>=0?list.slice(0,idx).concat([d],list.slice(idx+1)):list.concat([d])
  })
}
function __wtSub(sb,table,q,setItems){
  try{
    var G=globalThis.__wtsub||(globalThis.__wtsub={});
    if(G[table])return G[table];
    G[table]=sb.channel("wt-"+table)
      .on("postgres_changes",{event:"*",schema:"public",table:table},function(p){
        /* 削除は反映しない。誤爆したときの被害が大きすぎるため、リロードまで待つ */
        if(p&&(p.eventType==="DELETE"||p.event==="DELETE"))return;
        p&&p.new&&__wtRemote(q,setItems,p.new)
      })
      .subscribe(function(st){
        st==="SUBSCRIBED"&&console.info("[realtime] "+table+" の購読を開始しました")
      });
    return G[table]
  }catch(e){console.warn("[realtime] 購読に失敗:",e&&e.message)}
}
function __wtLogRow(it,c,ix){
  /* call_logs の1行を組み立てる。
     dedup_key は 001_call_logs.sql のバックフィルと同じ規則にすること。
     「teleapo_item_id|エントリid」、idが無い場合は「teleapo_item_id|pos:配列位置(1始まり)」 */
  var d=(c&&(c.date||c.calledAt))||"";
  return{
    teleapo_item_id:it.id,
    company_name:it.companyName||null,
    entry_id:(c&&c.id)||null,
    dedup_key:it.id+"|"+((c&&c.id)||("pos:"+(ix+1))),
    caller:(c&&(c.caller||c.calledBy))||"",
    /* 日時が読めないものは捏造せず null。集計から外れるほうが誤った数字より良い */
    called_at:/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(d)?d:null,
    result:(c&&c.result)||null,
    call_type:(c&&c.callType)||null,
    call_content:(c&&c.callContent)||null,
    memo:(c&&c.note)||null,
    rejection_reason:(c&&c.rejectionReason)||null,
    raw:c,
    source:"app"
  }
}
function __wtEnq(q,prev,next){
  if(!q.baseline)q.baseline=prev;
  q.latest=next;
  /* 重い JSON.stringify 比較はフラッシュ時に1回だけ。ここでは件数比較しかしない */
  var m=new Map(),i,urgent=next.length<prev.length;
  for(i=0;i<prev.length;i++)m.set(prev[i].id,prev[i]);
  for(i=0;i<next.length;i++){
    var it=next[i],bf=m.get(it.id),
        a=(it&&it.callHistory||[]).length,
        b=(bf&&bf.callHistory||[]).length;
    /* 架電履歴が増えた＝「架電を記録」。人が押した一点物なので待たずに送る */
    if(a>b||(!bf&&a>0)){q.hot.add(it.id);urgent=!0}
  }
  urgent?q.schedule(0,!0):q.schedule(1500)
}
`.replace(/\n\s*/g, '');

replaceOnce(
  'P1/P5 送信キューを注入',
  'var Ja=`https://antqewvlzfonsakgndxt.supabase.co`,Ya=`sb_publishable__37RI5zv54AI023pjvFdbA_AUkoAme2`,Xa=Ka(Ja,Ya),Za=!!Ya;',
  'var Ja=`https://antqewvlzfonsakgndxt.supabase.co`,Ya=`sb_publishable__37RI5zv54AI023pjvFdbA_AUkoAme2`,Xa=Ka(Ja,Ya),Za=!!Ya;' + QUEUE
);

/* ─────────────────────────────────────────────────────────────
 * P1: テレアポの保存 effect をキュー方式へ
 * ───────────────────────────────────────────────────────────── */
replaceOnce(
  'P1 teleapo 保存effect',
  '(0,v.useEffect)(()=>{if(!Za)return;let e=S.current;if(S.current=ue,!e)return;let t=setTimeout(async()=>{let t=new Map(e.map(e=>[e.id,e])),n=ue.filter(e=>{let n=t.get(e.id);return!n||JSON.stringify(n)!==JSON.stringify(e)});n.length>0&&await no.teleapoItems.upsert(n);let r=new Set(ue.map(e=>e.id)),i=e.filter(e=>!r.has(e.id)).map(e=>e.id);i.length&&await no.teleapoItems.delete(i)},1500);return()=>clearTimeout(t)},[ue])',
  '(0,v.useEffect)(()=>{if(!Za)return;let e=S.current;if(S.current=ue,!e)return;__wtEnq(__wtQ("teleapo",no.teleapoItems,"teleapo_items",Ja,Ya),e,ue)},[ue])'
);

/* ─────────────────────────────────────────────────────────────
 * P1: 提案リストも同じ欠陥を持つため同様に
 * ───────────────────────────────────────────────────────────── */
replaceOnce(
  'P1 proposals 保存effect',
  '(0,v.useEffect)(()=>{if(!Za)return;let e=x.current;if(x.current=ce,!e)return;let t=setTimeout(async()=>{let t=new Map(e.map(e=>[e.id,e])),n=ce.filter(e=>{let n=t.get(e.id);return!n||JSON.stringify(n)!==JSON.stringify(e)});n.length>0&&await no.proposals.upsert(n);let r=new Set(ce.map(e=>e.id)),i=e.filter(e=>!r.has(e.id)).map(e=>e.id);i.length&&await no.proposals.delete(i)},1500);return()=>clearTimeout(t)},[ce])',
  '(0,v.useEffect)(()=>{if(!Za)return;let e=x.current;if(x.current=ce,!e)return;__wtEnq(__wtQ("proposals",no.proposals,"proposals",Ja,Ya),e,ce)},[ce])'
);

/* ─────────────────────────────────────────────────────────────
 * P2: 起動時にサーバーデータを state に入れる際、比較基準も同時に更新する。
 *     これで「取得直後に全件が変更扱いになって丸ごと上書きされる」のを止める。
 *     o(prev,remote) は remote||prev なので、この分岐では remote と等価。
 * ───────────────────────────────────────────────────────────── */
replaceOnce(
  'P2 起動時の全件upsertを停止 + Realtime購読',
  'function o(e,t){return t||e}e&&le(t=>o(t,e)),n&&de(e=>o(e,n)),',
  'function o(e,t){return t||e}e&&(x.current=e,le(e)),n&&(S.current=n,de(n)),' +
    '__wtSub(Xa,"teleapo_items",__wtQ("teleapo",no.teleapoItems,"teleapo_items",Ja,Ya),de),' +
    '__wtSub(Xa,"proposals",__wtQ("proposals",no.proposals,"proposals",Ja,Ya),le),'
);

/* ─────────────────────────────────────────────────────────────
 * P4: 保存状態インジケータ。成功も失敗も見た目が同じ状態を解消する。
 * ───────────────────────────────────────────────────────────── */
const INDICATOR = `
;(function(){
  if(typeof window==="undefined"||window.__wtIndicator)return;
  window.__wtIndicator=!0;
  var el=null,hideT=null;
  function box(){
    if(el)return el;
    el=document.createElement("div");
    el.setAttribute("role","status");
    el.style.cssText="position:fixed;right:14px;bottom:14px;z-index:99999;display:none;align-items:center;gap:8px;padding:9px 14px;border-radius:8px;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;box-shadow:0 4px 16px rgba(15,23,42,.18);cursor:default;max-width:82vw";
    document.body.appendChild(el);
    return el
  }
  function show(bg,fg,txt,persist,onClick){
    var b=box();
    b.style.background=bg;b.style.color=fg;b.textContent=txt;b.style.display="flex";
    b.onclick=onClick||null;b.style.cursor=onClick?"pointer":"default";
    clearTimeout(hideT);
    if(!persist)hideT=setTimeout(function(){b.style.display="none"},2200)
  }
  window.addEventListener("wt-save",function(ev){
    var d=ev.detail||{};
    if(d.state==="saving")show("#eef2f7","#334155","保存中… "+(d.n||0)+"件",!0);
    else if(d.state==="saved"){if(d.n)show("#e7f4ee","#166534","保存しました "+d.n+"件",!1)}
    else if(d.state==="error")show("#fdecea","#9f2f22","⚠ 保存できていません（未送信 "+(d.n||0)+"件・再試行中）タップで即時再送",!0,function(){
      var G=globalThis.__wtq||{};Object.keys(G).forEach(function(k){G[k].flush&&G[k].flush()})
    })
  })
})();
`.replace(/\n\s*/g, '');

src += INDICATOR;
applied.push('P4 保存状態インジケータ');

fs.writeFileSync(outPath, src);
console.log('適用したパッチ:');
applied.forEach((a) => console.log('  ✓ ' + a));
console.log('\n出力: ' + outPath + ' (' + src.length + ' bytes)');

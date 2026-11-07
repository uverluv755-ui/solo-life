(function(root,factory) {
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./habits.js'));
  else root.SoloDifficulty=factory(root.SoloHabits);
})(globalThis,function(H) {
  'use strict';
  const ranks=['E','D','C','B','A'];
  const labels=['入門','初級','中級','上級','高難度'];
  const categories={strength:'筋トレ',walk:'歩行',study:'勉強',work:'仕事',tidy:'生活'};
  const catalog=[];
  function add(category,stat,rows) {
    rows.forEach((choices,i)=>choices.forEach(([name,minutes,reps],j)=>catalog.push({
      key:`challenge-${category}-${ranks[i]}-${j+1}`,category,stat,rank:ranks[i],name,minutes,...(reps?{reps}:{}),xp:20
    })));
  }
  add('strength','strength',[
    [['支えを使ってもよいスクワット10回',3,10],['フォームを確認し壁腕立て10回',3,10],['自分に合う筋トレを休憩込みで5分',5]],
    [['無理のないスクワット10回を2セット',8,20],['合う角度の腕立て8回を2セット',8,16],['自分に合う筋トレを休憩込みで10分',10]],
    [['余裕を残すスクワット10回を3セット',15,30],['自分に合う全身筋トレを20分',20],['慣れた種目を組み合わせ筋トレ25分',25]],
    [['計画した全身筋トレを休憩込みで30分',30],['自分に合う負荷で筋トレ35分',35],['慣れた種目で筋トレ40分と記録',40]],
    [['回復を確認し計画した筋トレ45分',45],['自分に合う全身筋トレ50分と記録',50],['準備・休憩を含む筋トレ60分',60]]
  ]);
  const timed=(category,stat,times,templates)=>add(category,stat,times.map(n=>templates.map(t=>[t.replace('{n}',n),n])));
  timed('walk','health',[10,15,25,30,45],['話せる自分のペースで{n}分歩く','屋内や平坦な道を合計{n}分歩く','休憩を挟んでもよい散歩{n}分']);
  timed('study','intellect',[15,30,45,60,90],['休憩を挟み学習{n}分と要点メモ','苦手な問題を{n}分練習して復習','読書・資料研究{n}分とまとめ']);
  timed('work','discipline',[15,25,45,60,90],['重要タスクを{n}分進め次の一手を記録','成果物に{n}分取り組み到達点を確認','休憩を挟む集中作業{n}分と振り返り']);
  timed('tidy','discipline',[10,15,20,30,45],['生活空間を{n}分整理して使いやすくする','献立・買い物・家事の計画を{n}分整える','家計や生活の記録を{n}分見直し改善']);
  const all=[...H.catalog,...catalog], byKey=new Map(all.map(q=>[q.key,q])), byName=new Map(all.map(q=>[q.name,q]));
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const valid=p=>object(p)&&p.version===1&&object(p.levels)&&Object.entries(p.levels).every(([c,r])=>Object.hasOwn(categories,c)&&ranks.includes(r));
  const validLog=log=>Array.isArray(log)&&log.every(x=>object(x)&&byKey.has(x.key)&&(x.effort===undefined||['easy','right','hard'].includes(x.effort)))&&new Set(log.map(x=>x.key)).size===log.length;
  const rank=(s,c)=>s.difficulty?.levels[c]||'E';
  const label=q=>q.rank?`${q.rank} · ${labels[ranks.indexOf(q.rank)]}`:H.levels[q.tier-1];
  function setRank(s,c,r) {
    if(!Object.hasOwn(categories,c)||!ranks.includes(r)) return false;
    s.difficulty||={version:1,levels:{}}; s.difficulty.levels[c]=r; return true;
  }
  const identify=q=>byKey.get(q.catalogKey||q.key)||byName.get(q.name);
  function claimed(s,q,today) {
    const target=identify(q); if(!target) return false;
    const d=s.daily[today];
    const previous=[...(d?.catalogLog||[]).map(x=>byKey.get(x.key)),...(d?.habitLog||[]).map(x=>byKey.get(x.key)),
      ...(d?.planLog||[]).map(identify),...s.quests.filter(x=>d?.questIds.includes(x.id)).map(identify),
      ...s.history.filter(h=>{const t=new Date(h.at);return localDay(t)===today&&h.type!=='focus';}).map(h=>byName.get(h.label))].filter(Boolean);
    return previous.some(x=>x.key===target.key||(target.rank&&x.rank&&x.category===target.category));
  }
  function record(s,q,today) {
    const item=identify(q); if(!item) return;
    (s.daily[today].catalogLog||=[]).push({key:item.key});
  }
  function feedback(s,key,effort,today) {
    if(!['easy','right','hard'].includes(effort)) return false;
    const item=s.daily[today]?.catalogLog?.find(x=>x.key===key);
    if(!item||!byKey.get(key)?.rank) return false;
    item.effort=effort;return true;
  }
  function localDay(t) {return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;}
  function trainedRecently(s,today) {
    const prior=new Date(today+'T12:00:00');prior.setDate(prior.getDate()-1);
    return [today,localDay(prior)].some(day=>{
      const d=s.daily[day];return d?.trained||d?.trainingOfferDone||d?.planLog?.some(p=>p.stat==='strength')||s.quests.some(q=>q.stat==='strength'&&d?.questIds.includes(q.id));
    });
  }
  function suggestion(s,c,today,mode='normal') {
    const current=rank(s,c),index=ranks.indexOf(current),from=new Date(today+'T12:00:00');from.setDate(from.getDate()-13);
    const evidence=Object.entries(s.daily).filter(([d])=>d>=localDay(from)&&d<=today).sort(([a],[b])=>b.localeCompare(a)).flatMap(([d,v])=>(v.catalogLog||[]).filter(x=>{const q=byKey.get(x.key);return q?.category===c&&q.rank===current;}).map(x=>({...x,day:d})));
    if(evidence[0]?.effort==='hard'&&index>0) return {rank:ranks[index-1],reason:'直近の「きつい」記録から、ひとつ軽い段階を提案します。'};
    const latest=evidence.slice(0,3);
    if(mode==='normal'&&index<4&&latest.length===3&&latest.every(x=>x.effort==='easy')&&new Set(latest.map(x=>x.day)).size===3&&!(c==='strength'&&trainedRecently(s,today)))
      return {rank:ranks[index+1],reason:'直近14日で別々の3日に「余裕」。ひとつ上を試せます。'};
    return {rank:current,reason:mode==='rest'?'今日は休養。段階はそのまま保ちます。':'今の段階を維持。実際の負荷と希望に合わせていつでも変更できます。'};
  }
  return {ranks,labels,categories,catalog,all,byKey,valid,validLog,rank,label,setRank,identify,claimed,record,feedback,trainedRecently,suggestion};
});

window.SoloDifficultyUI={
  init({C,$,el,updateSaved,refresh,toast}) {
    const D=C.difficulty, selects=new Map();
    for(const [category,name] of Object.entries(D.categories)) {
      const label=el('label','',name),select=el('select');select.id='difficulty-'+category;
      select.add(new Option('従来の候補（未設定）',''));
      D.ranks.forEach((r,i)=>select.add(new Option(r+' · '+D.labels[i],r)));
      select.onchange=async()=>{
        const value=select.value;select.disabled=true;
        const ok=await updateSaved(s=>D.setRank(s,category,value));
        refresh();if(ok)toast(name+'を'+value+'に設定しました。未達成の候補を更新しました');
      };
      label.append(select);$('difficultyChoices').append(label);selects.set(category,select);
    }
    return function render(s,today,locked) {
      for(const [category,select] of selects) {select.value=s.difficulty?D.rank(s,category):'';select.disabled=locked;select.options[0].disabled=!!s.difficulty;}
      const rows=[];
      if(!s.difficulty) {
        const button=el('button','secondary','実力に合わせて難易度を選ぶ');
        button.onclick=()=>{ $('difficultySettings').open=true;$('difficultySettings').scrollIntoView({block:'start'});$('difficulty-strength').focus({preventScroll:true}); };
        rows.push(button);
      }
      if(s.difficulty) rows.push(el('p','note','希望難易度：'+Object.entries(D.categories).map(([c,n])=>n+' '+D.rank(s,c)).join(' / ')+'。今の設定を基本に、感想に合わせて提案します。'));
      if(s.difficulty) for(const [category,name] of Object.entries(D.categories)) {
        const advice=D.suggestion(s,category,today,window.SoloJourney.fatigue(s,today));
        if(advice.rank===D.rank(s,category)) continue;
        const row=el('div','difficulty-advice');row.append(el('strong','',name+' · '+D.rank(s,category)),el('p','note',advice.reason));
        if(advice.rank!==D.rank(s,category)) {
          const button=el('button','secondary',advice.rank+'を試す');button.disabled=locked;
          button.onclick=async()=>{
            button.disabled=true;
            const ok=await updateSaved(data=>{
              const latest=D.suggestion(data,category,C.day(),window.SoloJourney.fatigue(data));
              return latest.rank===advice.rank&&D.setRank(data,category,advice.rank);
            });refresh();if(ok)toast('希望の段階に調整しました。いつでも戻せます');
          };row.append(button);
        }
        rows.push(row);
      }
      $('difficultyAdvice').replaceChildren(...rows);
      const entries=(s.daily[today]?.catalogLog||[]).filter(x=>D.byKey.get(x.key)?.rank);
      $('difficultyFeedback').replaceChildren(...(entries.length?[el('h3','','今日の難易度はどうでしたか？'),el('p','note','感想は任意です。別々の3日に余裕があれば1段階上を、きつければ軽い段階を提案。変更は自分で選び、XPは変わりません。')]:[]),...entries.map(entry=>{
        const q=D.byKey.get(entry.key),row=el('div','difficulty-feedback');row.append(el('strong','',q.name));
        const choices=el('div','effort-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label',q.name+'の難易度');
        for(const [value,name] of [['easy','余裕'],['right','ちょうどよい'],['hard','きつい']]) {
          const button=el('button','',name);button.disabled=locked;button.setAttribute('aria-pressed',String(entry.effort===value));
          button.onclick=async()=>{button.disabled=true;await updateSaved(data=>C.day()===today&&D.feedback(data,entry.key,value,today));refresh();};choices.append(button);
        }row.append(choices);return row;
      }));
    };
  }
};

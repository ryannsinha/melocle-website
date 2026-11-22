'use strict';
(() => {
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const labels={founders:'Founder',marketing:'Marketing',sales:'Sales & RevOps',experts:'Expert / consultant',agencies:'Agency'};
  const stages={requested:'Requested',qualified:'Qualified fit',invited:'Access agreed',onboarding:'Getting started',activated:'First value',engaged:'Repeated use',customer:'Paid customer',closed:'Closed'};
  const reached=(row,stage)=>!!row.milestones?.[stage]||row.status===stage;
  let snapshot=null;
  const status=document.querySelector('#ops-status');
  async function api(path,method='GET',body){const response=await fetch(path,{method,headers:{'Content-Type':'application/json','X-Melocle-Preview':'1'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'The local update failed.');return result;}
  const options=(values,selected)=>values.map(value=>`<option value="${escape(value)}" ${selected===value?'selected':''}>${escape(stages[value]||value.replaceAll('_',' '))}</option>`).join('');
  function requests(){
    const query=document.querySelector('#request-search').value.toLowerCase(),stage=document.querySelector('#stage-filter').value;
    const rows=snapshot.requests.filter(row=>(!stage||row.status===stage)&&[row.email,row.company,row.owner,labels[row.persona]].join(' ').toLowerCase().includes(query));
    document.querySelector('#requests-list').innerHTML=rows.length?rows.map(row=>{
      const first=row.first_context.firstTouch||{},last=row.last_context.lastTouch||{},cta=row.last_context.cta||{};
      return `<article class="request-card" data-request="${escape(row.id)}"><div class="request-card-top"><div><h3>${escape(row.email)}</h3><p>${escape(row.company||'Company not provided')} · ${escape(labels[row.persona]||row.persona)} · ${escape(row.id.slice(0,8).toUpperCase())}</p></div><span class="request-tag">${escape(stages[row.status]||row.status)}</span></div><div class="request-context"><div><span>First acquisition</span>${escape(first.source||'direct')} / ${escape(first.medium||'direct')}<br>${escape(first.campaign||'No campaign')}</div><div><span>Latest acquisition & CTA</span>${escape(last.source||'direct')} / ${escape(last.campaign||'No campaign')}<br>${escape(cta.placement||'Not recorded')} · ${escape(cta.persona||'No entry persona')}</div><div><span>Starting workflow & dates</span>${escape(row.workflow||'Not chosen')}<br>Created ${escape(new Date(row.created_at).toLocaleString())}<br>Updated ${escape(new Date(row.updated_at).toLocaleString())}</div></div><div class="request-edit"><label>Lifecycle stage<select name="status">${options(snapshot.stages,row.status)}</select></label><label>Follow-up owner<input name="owner" value="${escape(row.owner)}" placeholder="Unassigned" maxlength="100"></label><label>Local review notes<textarea name="notes" maxlength="2000" placeholder="Business need, fit, next action, first-value result and evidence dates">${escape(row.notes)}</textarea></label></div><div class="request-actions"><button data-save="${escape(row.id)}">Save local review</button><button data-delete="${escape(row.id)}">Delete local request</button></div></article>`;
    }).join(''):'<div class="empty-state">No matching requests yet. Save a request from the website to review its persona, source context and next step here.</div>';
  }
  function gates(){document.querySelector('#readiness-list').innerHTML=snapshot.readiness.map(gate=>`<article class="gate" data-gate="${escape(gate.id)}"><h3>${escape(gate.title)}</h3><p>${escape(gate.description)}</p><div class="gate-controls"><label>Verification state<select name="status">${options(['unverified','in_progress','verified'],gate.status)}</select></label><label>Owner<input name="owner" value="${escape(gate.owner)}" placeholder="Unassigned" maxlength="100"></label></div><label>Evidence / remaining work<textarea name="notes" maxlength="2000" placeholder="Business need, fit, next action, first-value result and evidence dates">${escape(gate.notes)}</textarea></label><div class="request-actions"><button data-save-gate="${escape(gate.id)}">Save readiness record</button></div></article>`).join('');}
  function sourceCohorts(){
    const groups=new Map();
    for(const row of snapshot.requests){
      const key=row.first_context.firstTouch?.source||'direct';
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
    }
    document.querySelector('#source-cohorts').innerHTML=groups.size?`<table><caption class="ops-table-caption">Recorded progress by first acquisition source</caption><thead><tr><th scope="col">Source</th><th scope="col">Requests</th><th scope="col">Qualified</th><th scope="col">First value</th><th scope="col">Repeated use</th><th scope="col">Paid</th></tr></thead><tbody>${[...groups].map(([source,rows])=>`<tr><th scope="row">${escape(source)}</th><td>${rows.length}</td>${['qualified','activated','engaged','customer'].map(stage=>`<td>${rows.filter(row=>reached(row,stage)).length}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="empty-state">Source cohorts appear as requests arrive and milestones are recorded.</p>';
  }
  async function refresh(){
    snapshot=await api('/api/local/review');
    const rows=snapshot.requests;
    const metrics=[[rows.length,'Local requests'],[rows.filter(row=>reached(row,'qualified')).length,'Qualified fit'],[rows.filter(row=>reached(row,'activated')).length,'First value'],[rows.filter(row=>reached(row,'engaged')).length,'Repeated use'],[rows.filter(row=>reached(row,'customer')).length,'Paid customers'],[snapshot.visitors,'Local visitor IDs']];
    document.querySelector('#ops-metrics').innerHTML=metrics.map(([n,label])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('');
    document.querySelector('#event-counts').innerHTML=Object.entries(snapshot.counts).map(([name,count])=>`<span>${escape(name.replaceAll('_',' '))}<strong>${count}</strong></span>`).join('')||'<p>No local events yet.</p>';
    const filter=document.querySelector('#stage-filter'),selected=filter.value;
    filter.innerHTML='<option value="">All stages</option>'+options(snapshot.stages,selected);requests();sourceCohorts();gates();
  }
  document.querySelector('#request-search').addEventListener('input',requests);document.querySelector('#stage-filter').addEventListener('change',requests);
  document.querySelector('#refresh-local').addEventListener('click',()=>refresh().catch(error=>status.textContent=error.message));
  document.querySelector('main').addEventListener('click',async event=>{
    const button=event.target.closest('[data-save],[data-delete],[data-save-gate]');if(!button)return;
    button.disabled=true;status.textContent='';
    try{
      if(button.dataset.delete){if(!confirm('Delete this local request and its linked lead events?'))return;await api('/api/local/request/'+button.dataset.delete,'DELETE');status.textContent='Local request deleted.';}
      else {const gate=button.dataset.saveGate,row=button.closest(gate?'.gate':'.request-card'),body=Object.fromEntries([...row.querySelectorAll('[name]')].map(input=>[input.name,input.value]));await api(gate?'/api/local/readiness/'+gate:'/api/local/request/'+button.dataset.save,'PATCH',body);status.textContent=gate?'Readiness record saved locally.':'Review saved locally. No message was sent and no access was granted.';}
      await refresh();
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  });
  document.querySelector('#export-local').addEventListener('click',()=>{if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='melocle-local-review.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  refresh().catch(error=>status.textContent='Start the local preview server to use this desk. '+error.message);
})();

'use strict';
(() => {
  const referenceKey='melocle-preview-request-v2';
  const dialog=document.querySelector('#access-dialog'),form=document.querySelector('#access-form'),result=document.querySelector('#access-result');
  const submit=form.querySelector('[type=submit]'),error=document.querySelector('#access-error');
  const names={founders:'Founder',marketing:'Marketing team',sales:'Sales & RevOps',experts:'Expert or consultant',agencies:'Agency'};
  let saved=null,reference=null,trigger=null,openingContext=null,started=false;
  const read=(storage,key)=>{try{return JSON.parse(storage.getItem(key));}catch{return null;}};
  const write=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value));}catch{/* The local server still retains accepted requests. */}};
  const identifier=()=>crypto.randomUUID();
  let visitor=read(localStorage,'melocle-preview-visitor'),session=read(sessionStorage,'melocle-preview-session');
  if(!visitor){visitor=identifier();write(localStorage,'melocle-preview-visitor',visitor);}
  if(!session){session=identifier();write(sessionStorage,'melocle-preview-session',session);}
  const params=new URLSearchParams(location.search);
  let referrer='';try{const url=new URL(document.referrer);referrer=url.origin+url.pathname;}catch{/* Direct visit. */}
  const touch={source:params.get('utm_source')||(referrer?new URL(referrer).hostname:'direct'),medium:params.get('utm_medium')||(referrer?'referral':'direct'),campaign:params.get('utm_campaign')||'',term:params.get('utm_term')||'',content:params.get('utm_content')||'',referrer,path:location.pathname,at:new Date().toISOString()};
  let first=read(localStorage,'melocle-preview-first-touch');if(!first){first=touch;write(localStorage,'melocle-preview-first-touch',first);}
  let last=read(sessionStorage,'melocle-preview-last-touch');
  if(!last||params.has('utm_source')||params.has('utm_campaign')){last=touch;write(sessionStorage,'melocle-preview-last-touch',last);}
  function context(cta={}){return{visitorId:visitor,sessionId:session,variant:params.get('preview')||'audit-implementation',firstTouch:first,lastTouch:last,cta};}
  async function api(path,{method='GET',body,token}={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch(path,{method,signal:controller.signal,headers:{'Content-Type':'application/json','X-Melocle-Preview':'1',...(token?{'X-Preview-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
      let data;try{data=await response.json();}catch{throw new Error('The local request service is unavailable. Keep this form open and retry after starting the preview server.');}
      if(!response.ok)throw new Error(data.error||'The request could not be saved. Please retry.');
      return data;
    }finally{clearTimeout(timeout);}
  }
  function track(name,cta={}){api('/api/events',{method:'POST',body:{name,context:context(cta)}}).catch(()=>{});}
  window.MeloclePreview={track};track('page_view');
  const sourceFor=button=>({placement:button.dataset.cta||(button.closest('[data-use-case]')?'use-case-'+button.closest('[data-use-case]').dataset.useCase:button.closest('.hero')?'hero':button.closest('.site-header')?'header':button.closest('.closing-section')?'closing':'page'),persona:button.dataset.personaAccess||'',product:document.querySelector('.platform-subnav [aria-current]')?.hash.slice(1)||'',workspace:document.querySelector('[data-view][aria-pressed=true]')?.dataset.view||'overview'});
  function showError(message){error.textContent=message;error.hidden=false;error.focus();}
  function clearError(){error.hidden=true;error.textContent='';}
  function render(){
    form.hidden=!!saved;result.hidden=!saved;
    if(!saved)return;
    document.querySelector('#saved-reference').textContent=saved.id.slice(0,8).toUpperCase();
    document.querySelector('#saved-persona').textContent=names[saved.persona]||'Your team';
    document.querySelector('#starting-workflow').value=saved.workflow||'';
    document.querySelector('#workflow-status').textContent=saved.workflow?'Your starting workflow is saved.':'';
  }
  reference=read(localStorage,referenceKey);saved=reference?.request||null;
  if(reference?.id&&reference?.token){
    api('/api/request/'+reference.id,{token:reference.token}).then(data=>{saved=data.request;reference.request=saved;write(localStorage,referenceKey,reference);if(dialog.open)render();}).catch(()=>{saved=null;reference=null;try{localStorage.removeItem(referenceKey);}catch{}if(dialog.open)render();});
  }else{
    const legacy=read(localStorage,'melocle-marketing-interest-v1');
    if(legacy){form.elements.email.value=legacy.email||'';form.elements.company.value=legacy.company||'';}
  }
  document.querySelectorAll('[data-access]').forEach(button=>button.addEventListener('click',()=>{
    trigger=button;openingContext=context(sourceFor(button));started=false;clearError();closeMenu();
    if(!saved)form.elements.role.value=button.dataset.personaAccess||'';
    render();dialog.showModal();track('cta_click',openingContext.cta);
  }));
  form.addEventListener('focusin',()=>{if(!started){started=true;track('form_started',openingContext?.cta||{});}});
  form.addEventListener('invalid',()=>track('validation_error',openingContext?.cta||{}),true);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;clearError();submit.disabled=true;submit.textContent='Saving request…';
    try{
      const data=await api('/api/early-access',{method:'POST',body:{email:form.elements.email.value.trim(),company:form.elements.company.value.trim(),persona:form.elements.role.value,context:openingContext||context()}});
      saved=data.request;reference={id:saved.id,token:data.token,request:saved};write(localStorage,referenceKey,reference);render();document.querySelector('#starting-workflow').focus();
    }catch(cause){track('request_failed',openingContext?.cta||{});showError(cause.name==='AbortError'?'The local service took too long to respond. Your details are still here; please retry.':cause.message);}
    finally{submit.disabled=false;submit.textContent='Request early access';}
  });
  document.querySelector('#save-workflow').addEventListener('click',async()=>{
    const workflow=document.querySelector('#starting-workflow').value;
    if(!workflow){document.querySelector('#starting-workflow').focus();return;}
    clearError();const button=document.querySelector('#save-workflow');button.disabled=true;
    try{const data=await api('/api/request/'+reference.id,{method:'PATCH',token:reference.token,body:{workflow}});saved=data.request;reference.request=saved;write(localStorage,referenceKey,reference);render();}
    catch(cause){showError(cause.message);}finally{button.disabled=false;}
  });
  document.querySelector('#clear-interest').addEventListener('click',()=>{
    if(!saved)return;form.elements.email.value=saved.email;form.elements.company.value=saved.company;form.elements.role.value=saved.persona;saved=null;render();clearError();form.elements.email.focus();
  });
  document.querySelector('#delete-interest').addEventListener('click',async()=>{
    if(!reference)return;clearError();
    try{await api('/api/request/'+reference.id,{method:'DELETE',token:reference.token});saved=reference=null;try{localStorage.removeItem(referenceKey);localStorage.removeItem('melocle-marketing-interest-v1');}catch{}form.reset();render();document.querySelector('#access-email').focus();document.querySelector('#access-local-note').textContent='Your saved request was removed.';}
    catch(cause){showError(cause.message);}
  });
  document.querySelector('#download-interest').addEventListener('click',()=>{
    if(!saved)return;const url=URL.createObjectURL(new Blob([JSON.stringify({...saved,localOnly:true},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='melocle-local-request.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{const b=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom))dialog.close();});
  dialog.addEventListener('close',()=>{if(trigger?.getClientRects().length)trigger.focus();else document.querySelector('.menu-toggle').focus();});
  document.querySelectorAll('[data-info]').forEach(button=>button.addEventListener('click',()=>{const info=document.getElementById(button.dataset.info);info.returnFocus=button;info.showModal();}));
  document.querySelectorAll('.info-dialog').forEach(info=>{info.querySelector('[data-close-info]').addEventListener('click',()=>info.close());info.addEventListener('close',()=>info.returnFocus?.focus());});
})();

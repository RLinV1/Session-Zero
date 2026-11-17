/** Browser source runs inside the static MCP resource; it never receives an OAuth token. */
export const VIEW_SCRIPT = String.raw`
const { App, PostMessageTransport } = globalThis.__studioApps;
const surface = globalThis.__sceneStudio;
const $ = (id) => document.getElementById(id);
const app = new App({name:'Session Zero Studio',version:'2.0.0'}, {});
let locale = navigator.language.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
let buildId = null, snapshot = null, timer = null, stopped = false, refreshing = false, refreshAgain = false, uploading = false, connected = false, generation = 0;
let statusKey = 'loading', uploadStatusKey = null, needsRetry = false, contextSignature = null, lastStarted = 0, rendered = '', refreshAbort = null;
const mediaCache = new Map();
const t = (key) => catalogs[locale][key] || catalogs.en[key] || catalogs.en['error.unknown'];
function translate() {
  document.documentElement.lang = locale; document.title = t('title');
  document.querySelectorAll('[data-t]').forEach((node) => node.textContent = t(node.dataset.t));
  $('language').value = locale; status(statusKey);
  if (uploadStatusKey !== null) uploadStatus(uploadStatusKey);
  renderSaved();
}
function status(key) { statusKey=key; const value=t(key); if ($('status').textContent !== value) $('status').textContent=value; }
function uploadStatus(key) { uploadStatusKey=key; const value=t(key); if ($('upload-status').textContent !== value) $('upload-status').textContent=value; }
function uploadControls() {
  const disabled = stopped || uploading || needsRetry || !connected || !buildId;
  $('pick').disabled = disabled || !window.openai?.selectFiles;
  $('device').disabled = disabled || !window.openai?.uploadFile;
}
function viewContext() { return {buildId,generation}; }
function isCurrent(context) { return !stopped && context.buildId === buildId && context.generation === generation; }
function intakeContext() { return {...viewContext(),kind:$('kind').value}; }
function clearIntake() { uploading=false; uploadStatusKey=null; $('upload-status').textContent=''; $('device').value=''; }
function clearPrivate() {
  generation++; snapshot=null; contextSignature=null; mediaCache.clear(); rendered=''; surface.clear();
  $('files').replaceChildren(); $('outcomes').replaceChildren(); $('files').dataset.signature=''; $('outcomes').dataset.signature='';
  $('build').textContent=''; $('owner').textContent=''; $('legacy').hidden=true; clearIntake(); uploadControls();
}
function pauseForRetry(error) {
  needsRetry=true;
  if (error.status === 404 || (error.status === 403 && error.code !== 'permission')) { clearPrivate(); status('denied'); }
  else status('stale');
  uploadControls(); renderSaved();
}
function resultData(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((c) => c.type === 'text')?.text; return text ? JSON.parse(text) : {};
}
async function call(name,args,signal) {
  const result = await app.callServerTool({name,arguments:{...args,locale}},{signal,timeout:35000});
  if (result.isError) { const problem=result._meta?.['sessionzero/error'] || {}; const e=new Error(problem.code || 'unknown'); e.status=problem.status; e.code=problem.code; throw e; }
  return result;
}
function cacheKey(file) { return [buildId,file.id,file.canonicalId || '',file.previewHash || 'legacy'].join(':'); }
function activeFiles(data) {
  const ids = new Set([data.scene.source?.id,...data.scene.tokens.map((token)=>token.imageFileId)].filter(Boolean));
  const source = data.scene.source;
  return [...(source ? [source] : []),...data.files.filter((file)=>ids.has(file.id) && file.id !== source?.id)];
}
function renderSaved() {
  if (!snapshot || stopped) return;
  const media={}; for (const file of activeFiles(snapshot)) { const image=mediaCache.get(cacheKey(file)); if (image) media[file.id]=image; }
  const signature=JSON.stringify([snapshot.fingerprint,locale,needsRetry,uploading,Object.keys(media)]);
  if (signature === rendered) return;
  rendered=signature;
  const website=snapshot.websitePath;
  surface.render({snapshot,media,locale,disabled:needsRetry || uploading,stale:needsRetry,onContext:setContext,
    onWebsiteOpen:()=>{void app.openLink({url:website}).catch(()=>status('websiteUnavailable'));}});
}
function renderLists() {
  if (!snapshot) return;
  const outcomes=document.createDocumentFragment();
  for (const item of snapshot.intakeOutcomes) {
    const li=document.createElement('li'), name=document.createElement('span'), outcome=document.createElement('small');
    name.className='filename'; name.textContent=item.name; outcome.textContent=t(item.status === 'saved' ? 'saved' : 'error.'+item.code); li.append(name,outcome); outcomes.append(li);
  }
  const outcomeSignature=JSON.stringify(snapshot.intakeOutcomes)+locale;
  if ($('outcomes').dataset.signature !== outcomeSignature) { $('outcomes').replaceChildren(outcomes); $('outcomes').dataset.signature=outcomeSignature; }
  const fragment=document.createDocumentFragment();
  for (const file of snapshot.files) {
    const li=document.createElement('li'), name=document.createElement('span'), details=document.createElement('small');
    name.className='filename'; name.textContent=file.name; details.textContent=t(file.kind)+' · '+file.width+' × '+file.height; li.append(name,details);
    if (file.kind === 'map') {
      const button=document.createElement('button'); button.type='button'; button.textContent=t('show'); button.disabled=file.id === snapshot.sourceFileId || needsRetry;
      button.onclick=async()=>{ const context=viewContext(); if (!isCurrent(context)) return; try { await call('studio_bind_file',{buildId:context.buildId,fileId:file.id}); if (!isCurrent(context)) return; generation++; clearIntake(); contextSignature=null; await refresh(true); } catch(error) { if (isCurrent(context)) pauseForRetry(error); } };
      li.append(button);
    }
    fragment.append(li);
  }
  if (!snapshot.files.length) { const li=document.createElement('li'); li.textContent=t('noFiles'); fragment.append(li); }
  const signature=JSON.stringify(snapshot.files.map((file)=>[file.id,file.name,file.width,file.height]))+snapshot.sourceFileId+locale+needsRetry;
  if ($('files').dataset.signature !== signature) { $('files').replaceChildren(fragment); $('files').dataset.signature=signature; }
}
function schedule() {
  clearTimeout(timer);
  if (!stopped && !needsRetry && !document.hidden) {
    const interval=snapshot?.refreshIntervalMs || 5000;
    timer=setTimeout(()=>void refresh(),uploading ? interval : Math.max(100,interval-(Date.now()-lastStarted)));
  }
}
async function refresh(force=false) {
  if (!connected || !buildId || stopped || needsRetry || document.hidden) return;
  if (uploading) { schedule(); return; }
  if (refreshing) { if (force) refreshAgain=true; return; }
  if (!force && Date.now()-lastStarted < 1000) { schedule(); return; }
  refreshing=true; lastStarted=Date.now(); const context=viewContext(); let activeContext=context;
  const controller=new AbortController(); refreshAbort=controller;
  try {
    const data=surface.validate(resultData(await call('studio_snapshot',{buildId:context.buildId},controller.signal)));
    if (!isCurrent(context)) return;
    const nextSignature=JSON.stringify(data.context);
    if (contextSignature !== null && contextSignature !== nextSignature) { generation++; clearIntake(); }
    activeContext=viewContext();
    contextSignature=nextSignature; snapshot=data;
    $('build').textContent=data.buildName; $('owner').textContent=data.ownerName || '';
    $('legacy').hidden=!data.scene.source || data.scene.source.privacy !== 'legacy-public';
    renderLists(); renderSaved();
    // Only active art is retained, reused across placements, with at most two media calls/tick.
    const active=activeFiles(data), keep=new Set(active.map(cacheKey));
    for (const key of mediaCache.keys()) if (!keep.has(key)) mediaCache.delete(key);
    const mediaContext=viewContext(); let fetched=0;
    for (const file of active) {
      if (stopped || document.hidden || !isCurrent(mediaContext) || fetched >= 2) break;
      const key=cacheKey(file); if (mediaCache.has(key)) continue;
      const result=await call('studio_get_media',{buildId:mediaContext.buildId,fileId:file.id,privacy:file.privacy},controller.signal); fetched++;
      const media=result._meta?.['sessionzero/media'];
      if (!isCurrent(mediaContext) || document.hidden) return;
      if (!media || media.fileId !== file.id || media.mimeType !== 'image/webp' || !/^[A-Za-z0-9+/]+={0,2}$/.test(media.data)) throw new Error('Invalid protected preview');
      mediaCache.set(key,'data:image/webp;base64,'+media.data); renderSaved();
    }
    status('ready'); uploadControls(); renderSaved();
  } catch(error) { if (!controller.signal.aborted && isCurrent(activeContext)) pauseForRetry(error); }
  finally { if (refreshAbort === controller) refreshAbort=null; refreshing=false; if (refreshAgain) { refreshAgain=false; void refresh(true); } else schedule(); }
}
async function setContext(value) {
  const context=viewContext(); if (!isCurrent(context) || needsRetry) return;
  try {
    await call('studio_set_context',{buildId:context.buildId,context:value});
    if (!isCurrent(context)) return;
    generation++; clearIntake(); contextSignature=null; await refresh(true);
  } catch(error) { if (isCurrent(context)) pauseForRetry(error); }
}
async function importSelected(selected,context=intakeContext()) {
  if (!context.buildId || !isCurrent(context) || uploading || needsRetry) return;
  if (selected.length > 5) { uploadStatus('limitFiles'); return; }
  uploading=true; uploadControls(); renderSaved(); uploadStatus('queued');
  const {kind}=context;
  try {
    for (const selectedFile of selected) {
      if (!isCurrent(context)) return;
      const descriptor=await window.openai.getFileDownloadUrl({fileId:selectedFile.fileId});
      if (!isCurrent(context)) return;
      const file={download_url:descriptor.downloadUrl,file_id:selectedFile.fileId,file_name:selectedFile.fileName,mime_type:selectedFile.mimeType};
      const data=resultData(await call('studio_import_files',{buildId:context.buildId,kind,files:[file]}));
      if (!isCurrent(context)) return;
      const outcome=data.outcomes[0]; uploadStatus(outcome.status === 'saved' ? 'saved' : 'error.'+outcome.code);
      if (outcome.status === 'saved' && kind === 'map') {
        await call('studio_bind_file',{buildId:context.buildId,fileId:outcome.fileId});
        // This operation deliberately changed the source. Its next snapshot must preserve
        // its Saved outcome instead of treating that known change as an external switch.
        if (isCurrent(context)) contextSignature=null;
      }
      if (!isCurrent(context)) return;
    }
  } catch(error) { if (isCurrent(context)) { if (!error.status || [401,403,404].includes(error.status)) pauseForRetry(error); uploadStatus('error.'+(error.code || 'unknown')); } }
  finally { if (isCurrent(context)) { uploading=false; uploadControls(); $('device').value=''; void refresh(true); renderSaved(); } }
}
$('pick').onclick=async()=>{const context=intakeContext();try {await importSelected(await window.openai.selectFiles(),context);}catch {if(isCurrent(context))uploadStatus('error.unknown');}};
$('device').onchange=async(event)=>{
  const context=intakeContext(), files=Array.from(event.target.files || []);
  if (files.length > 5) { uploadStatus('limitFiles'); return; }
  for (const file of files) {
    if (!isCurrent(context)) return;
    try { const uploaded=await window.openai.uploadFile(file); if (!isCurrent(context)) return; await importSelected([{fileId:uploaded.fileId,fileName:file.name,mimeType:file.type}],context); }
    catch { if(isCurrent(context))uploadStatus('error.unknown'); }
  }
};
$('refresh').onclick=()=>{needsRetry=false;rendered='';void refresh(true);};
$('fullscreen').onclick=async()=>{try {const modes=app.getHostContext()?.availableDisplayModes;if(modes && !modes.includes('fullscreen'))return;await app.requestDisplayMode({mode:'fullscreen'});}catch{/* Inline remains usable. */}};
$('language').onchange=()=>{locale=$('language').value;translate();renderLists();};
app.ontoolresult=(result)=>{try {const data=resultData(result);if(data.buildId){if(data.buildId !== buildId){clearPrivate();buildId=data.buildId;}needsRetry=false;}void refresh(true);}catch{status('stale');}};
app.onhostcontextchanged=()=>{void refresh();};
function stop(){stopped=true;clearTimeout(timer);refreshAbort?.abort();clearPrivate();removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);}
function onFocus(){void refresh();}
function onVisibility(){clearTimeout(timer);if(document.hidden)refreshAbort?.abort();else void refresh(true);}
app.onteardown=async()=>{stop();return {};};
addEventListener('pagehide',stop,{once:true});addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onVisibility);
translate();status('loading');
try {await app.connect(new PostMessageTransport(window.parent,window.parent));connected=true;uploadControls();if(!window.openai?.selectFiles && !window.openai?.uploadFile)uploadStatus('unsupported');void refresh(true);}catch{status('stale');}
`;

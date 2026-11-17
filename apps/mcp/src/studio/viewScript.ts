/** Browser source runs inside the static MCP resource; it never receives an OAuth token. */
export const VIEW_SCRIPT = String.raw`
const { App, PostMessageTransport } = globalThis.__studioApps;
const $ = (id) => document.getElementById(id);
const app = new App({name:'Session Zero Studio',version:'1.0.0'}, {});
let locale = navigator.language.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
let buildId = null, sourceId = null, shown = null, timer = null, stopped = false, refreshing = false, uploading = false, connected = false, generation = 0;
let statusKey = 'loading', uploadStatusKey = null;
let needsRetry = false;
const t = (key) => catalogs[locale][key] || catalogs.en[key] || catalogs.en['error.unknown'];
function translate() {
  document.documentElement.lang = locale;
  document.title = t('title');
  document.querySelectorAll('[data-t]').forEach((node) => node.textContent = t(node.dataset.t));
  $('source').alt = t('source'); $('language').value = locale;
  status(statusKey); if (uploadStatusKey !== null) uploadStatus(uploadStatusKey);
}
function status(key) { statusKey=key; const value=t(key); if ($('status').textContent !== value) $('status').textContent=value; }
function uploadStatus(key) { uploadStatusKey=key; const value=t(key); if ($('upload-status').textContent !== value) $('upload-status').textContent=value; }
function pauseForRetry(error) { needsRetry=true; if (error.status === 404 || error.status === 403) { clearPrivate(); status('denied'); } else status('stale'); }
function clearPrivate() { generation++; $('source').removeAttribute('src'); $('source').hidden = true; $('files').replaceChildren(); $('outcomes').replaceChildren(); $('files').dataset.signature=''; $('outcomes').dataset.signature=''; $('build').textContent = ''; $('owner').textContent = ''; shown = null; sourceId = null; }
function resultData(result) { if (result.structuredContent) return result.structuredContent; const text = result.content?.find((c) => c.type === 'text')?.text; return text ? JSON.parse(text) : {}; }
async function call(name, args) {
  const result = await app.callServerTool({name, arguments:{...args, locale}});
  if (result.isError) { const problem = result._meta?.['sessionzero/error'] || {}; const e = new Error(problem.code || 'unknown'); e.status = problem.status; e.code = problem.code; throw e; }
  return result;
}
function schedule() { clearTimeout(timer); if (!stopped && !needsRetry && !document.hidden) timer = setTimeout(() => void refresh(), 5000); }
async function refresh() {
  if (!connected || !buildId || stopped || needsRetry || document.hidden || refreshing) return;
  refreshing = true;
  const currentGeneration = generation;
  try {
    const data = resultData(await call('studio_snapshot', {buildId}));
    if (currentGeneration !== generation || stopped) return;
    $('build').textContent = data.buildName; $('owner').textContent = data.ownerName || '';
    const outcomes = document.createDocumentFragment();
    for (const item of data.intakeOutcomes || []) {
      const li = document.createElement('li'); const name = document.createElement('span'); name.className='filename'; name.textContent=item.name; li.append(name);
      const outcome = document.createElement('small'); outcome.textContent = t(item.status === 'saved' ? 'saved' : 'error.' + item.code); li.append(outcome); outcomes.append(li);
    }
    const outcomeSignature=JSON.stringify(data.intakeOutcomes)+locale;
    if ($('outcomes').dataset.signature !== outcomeSignature) { $('outcomes').replaceChildren(outcomes); $('outcomes').dataset.signature=outcomeSignature; }
    sourceId = data.sourceFileId;
    const source = data.files.find((f) => f.id === sourceId);
    $('empty').hidden = Boolean(source); $('legacy').hidden = !source || source.privacy !== 'legacy-public';
    const fragment = document.createDocumentFragment();
    for (const file of data.files) {
      const li = document.createElement('li'); const name = document.createElement('span'); name.className = 'filename'; name.textContent = file.name; li.append(name);
      const details = document.createElement('small'); details.textContent = t(file.kind) + ' · ' + file.width + ' × ' + file.height; li.append(details);
      if (file.kind === 'map') { const button = document.createElement('button'); button.type = 'button'; button.textContent = t('show'); button.disabled = file.id === sourceId;
        button.onclick = async () => { try { await call('studio_bind_file',{buildId,fileId:file.id}); needsRetry=false; shown=null; void refresh(); } catch (error) { pauseForRetry(error); } }; li.append(button); }
      fragment.append(li);
    }
    if (!data.files.length) { const li = document.createElement('li'); li.textContent = t('noFiles'); fragment.append(li); }
    // Preserve the focused action during polling; file content signatures change only after actual saved changes.
    const signature = JSON.stringify(data.files.map((f) => [f.id,f.name,f.width,f.height])) + sourceId + locale;
    if ($('files').dataset.signature !== signature) { $('files').replaceChildren(fragment); $('files').dataset.signature = signature; }
    if (source && shown !== source.id + ':' + source.previewHash) {
      const result = await call('studio_get_media', {buildId,fileId:source.id});
      const media = result._meta?.['sessionzero/media'];
      if (!media || currentGeneration !== generation || stopped) return;
      $('source').src = 'data:' + media.mimeType + ';base64,' + media.data; $('source').hidden = false;
      shown = source.id + ':' + source.previewHash;
    }
    status('ready');
  } catch (e) {
    if (currentGeneration === generation && !stopped) pauseForRetry(e);
  } finally { refreshing = false; schedule(); }
}
async function importSelected(selected) {
  if (!buildId || uploading) return;
  if (selected.length > 5) { uploadStatus('limitFiles'); return; }
  uploading = true; $('pick').disabled = true; $('device').disabled = true; uploadStatus('queued');
  const kind = $('kind').value;
  try {
    // Obtain and consume each short-lived descriptor immediately; never persist it in widget state.
    for (const selectedFile of selected) {
      const descriptor = await window.openai.getFileDownloadUrl({fileId:selectedFile.fileId});
      const file = {download_url:descriptor.downloadUrl,file_id:selectedFile.fileId,file_name:selectedFile.fileName,mime_type:selectedFile.mimeType};
      const data = resultData(await call('studio_import_files', {buildId,kind,files:[file]}));
      const outcome = data.outcomes[0];
      uploadStatus(outcome.status === 'saved' ? 'saved' : 'error.' + outcome.code);
      if (outcome.status === 'saved' && kind === 'map') await call('studio_bind_file',{buildId,fileId:outcome.fileId});
    }
    needsRetry=false; shown = null;
  } catch (e) { if (!e.status || [401,403,404].includes(e.status)) pauseForRetry(e); uploadStatus('error.' + (e.code || 'unknown')); }
  finally { uploading = false; $('pick').disabled = !window.openai?.selectFiles; $('device').disabled = !window.openai?.uploadFile; $('device').value = ''; void refresh(); }
}
$('pick').onclick = async () => { try { await importSelected(await window.openai.selectFiles()); } catch { uploadStatus('error.unknown'); } };
$('device').onchange = async (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length > 5) { uploadStatus('limitFiles'); return; }
  // Each upload is immediately resolved and imported, keeping descriptors out of queues.
  for (const file of files) {
    try { const uploaded = await window.openai.uploadFile(file); await importSelected([{fileId:uploaded.fileId,fileName:file.name,mimeType:file.type}]); }
    catch { uploadStatus('error.unknown'); }
  }
};
$('refresh').onclick = () => { needsRetry=false; shown=null; void refresh(); };
$('fullscreen').onclick = async () => { try { await app.requestDisplayMode({mode:'fullscreen'}); } catch { /* Inline remains usable. */ } };
$('language').onchange = () => { locale=$('language').value; translate(); $('files').dataset.signature=''; void refresh(); };
app.ontoolresult = (result) => { try { const data=resultData(result); if (data.buildId) { if (data.buildId !== buildId) { clearPrivate(); buildId=data.buildId; } needsRetry=false; } void refresh(); } catch { status('stale'); } };
app.onhostcontextchanged = () => { void refresh(); };
app.onteardown = async () => { stopped=true; clearTimeout(timer); clearPrivate(); return {}; };
addEventListener('pagehide', () => { stopped=true; clearTimeout(timer); clearPrivate(); });
addEventListener('focus', () => { void refresh(); });
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden) void refresh(); });
translate(); status('loading');
try {
  await app.connect(new PostMessageTransport(window.parent, window.parent)); connected=true;
  $('pick').disabled = !window.openai?.selectFiles; $('device').disabled = !window.openai?.uploadFile;
  if (!window.openai?.selectFiles && !window.openai?.uploadFile) uploadStatus('unsupported');
  void refresh();
} catch { status('stale'); }
`;

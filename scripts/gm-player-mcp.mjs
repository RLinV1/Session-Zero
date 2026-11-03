import { spawn } from 'node:child_process';


/** Screenshots are taken by the actual Playwright MCP server attached to the live browsers. */
export async function captureMcp(cli, out) {
  const child = spawn(process.execPath, [cli, '--cdp-endpoint', 'http://127.0.0.1:9242', '--output-dir', out], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let id = 0, buffer = '';
  const pending = new Map();
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) {
      let message; try { message = JSON.parse(line); } catch { continue; }
      const p = pending.get(message.id);
      if (p) { pending.delete(message.id); clearTimeout(p.timer); if (message.error) p.reject(new Error(JSON.stringify(message.error))); else p.resolve(message.result); }
    }
  });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 30000);
    pending.set(key, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n');
  });
  try {
    await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gm-player-video-qa', version: '1.0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const result = await rpc('tools/call', { name: 'browser_run_code_unsafe', arguments: { code: `async page => { const pages = page.context().browser().contexts().flatMap(c => c.pages()).filter(p => p.url().includes('/r/')); if(pages.length !== 2) throw new Error('Expected two live actor pages'); for (const actor of pages) await actor.screenshot({ path: ${JSON.stringify(out)} + '/' + (await actor.getByRole('button', {name:'Share',exact:true}).count() ? 'gm-mcp.png' : 'player-mcp.png') }); return pages.map(p=>p.url()); }` } });
    if (result.isError) throw new Error(JSON.stringify(result));
    console.log('Playwright MCP captured both live perspectives');
  } finally { for (const p of pending.values()) clearTimeout(p.timer); child.kill(); }
}

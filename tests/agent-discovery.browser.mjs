import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

test('published entry pages expose the default workflow without visible panels or automatic jobs',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage();
  for(const path of ['/','/agent.html']){
   await page.goto(`http://127.0.0.1:8793${path}`);
   const discovery=await page.evaluate(async()=>{
    const node=document.getElementById('agent-workflow'),workflow=JSON.parse(node.textContent),url=document.querySelector('link[rel=help]').href;
    const directions=await fetch(url),index=await fetch('/llms.txt'),api=await import('/agent-api.mjs');
    return {workflow,api:api.agentInstructions(),capabilities:api.capabilities().workflow,directions:await directions.text(),index:await index.text(),status:directions.status,display:getComputedStyle(node).display,visibleText:document.body.innerText,meta:document.querySelector('meta[name=agent-instructions]').content};
   });
   assert.equal(discovery.status,200);assert.equal(discovery.workflow.defaultTask,'generate-reference-package');
   assert.deepEqual(discovery.workflow,discovery.api);assert.deepEqual(discovery.workflow,discovery.capabilities);
   assert.match(discovery.meta,/MP4.*JSON/);assert.match(discovery.directions,/Specific user instructions take precedence/);
   assert.match(discovery.directions,/Google Drive/);assert.match(discovery.directions,/actual paths/);
   for(const step of discovery.workflow.steps){assert.ok(discovery.directions.includes(step.instructions));assert.ok(discovery.index.includes(step.instructions));assert.ok(!discovery.visibleText.includes(step.instructions),'directions should not expand the normal GUI');}
   assert.equal(discovery.display,'none');
  }
  await page.waitForFunction(()=>!!window.animationAgent);
  const result=await page.evaluate(async()=>{const a=window.animationAgent,before=a.exportJSON(),help=await a.command('help'),instructions=await a.command('instructions'),status=a.status();return {before,after:a.exportJSON(),help,instructions,status};});
  assert.deepEqual(result.help.workflow,result.instructions.workflow);assert.equal(result.status.instructions.url,'/AGENTS.md');
  assert.equal(result.status.busy,false);assert.deepEqual(result.status.artifacts,[]);assert.deepEqual(result.before,result.after);
 }finally{await browser.close();}
});

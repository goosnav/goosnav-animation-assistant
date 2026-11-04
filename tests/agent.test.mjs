import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilities,inspectDocument,editDocument,resetDocument,alignDocument,createAgentWorkspace,sampleDocument} from '../app/src/agent-api.mjs';
import {prepareSequence,sequenceJSON} from '../app/src/sequence.mjs';
import {parseSequenceDocument} from '../app/src/sequence-config.mjs';
import {parseConfigDocument} from '../app/src/config.mjs';

const scene=()=>JSON.stringify({format:'goosnav-animation-config',version:1,title:'Two speakers',scene:{format:'landscape',actors:[{model:'v12-fat',x:-.6},{model:'billy-v2',x:.6}]},timing:{mode:'silent',duration:2},dialogue:[{actor:1,text:'Still B.'}]});

test('agent starter and machine-readable defaults use Reels',()=>{
 assert.equal(JSON.parse(sampleDocument()).scene.format,'portrait');
 const catalog=capabilities();
 assert.equal(catalog.parameters.scene.format.default,'portrait');
 assert.equal(catalog.workflow.composition.format,'portrait');
 assert.deepEqual(catalog.workflow.composition.dimensions,[1080,1920]);
});

test('sequence inspection warns about tiny-zoom cuts while keeping deliberate edits usable',async()=>{
 const config=JSON.parse(scene());config.scene.camera={zoom:1};
 const film={format:'goosnav-animation-sequence',version:1,id:'coverage',title:'Coverage',shots:[{id:'wide',title:'Wide',config},{id:'almost-wide',title:'Almost wide',config:structuredClone(config)}]};
 film.shots[1].config.scene.camera.zoom=1.02;
 const text=JSON.stringify(film),info=inspectDocument(text);
 assert.equal(info.ok,true);assert.equal(info.coverage.cuts[0].similar,true);
 assert.ok(info.warnings.some(message=>/nearly identical.*2%/i.test(message)));
 const workspace=createAgentWorkspace({text});assert.equal((await workspace.command('validate')).coverage.cuts[0].similar,true);
 assert.equal(workspace.exportJSON().text,text,'review must not rewrite user coverage');workspace.dispose();
 film.shots[1].config.scene.camera.zoom=1.8;
 assert.equal(inspectDocument(JSON.stringify(film)).coverage.cuts[0].similar,false);
 film.shots[1].config.scene.camera={zoom:1,azimuth:40};
 assert.equal(inspectDocument(JSON.stringify(film)).coverage.cuts[0].similar,false,'a substantial reverse angle is a different view');
});

test('wide, A single, B single, return wide coverage distinguishes subject changes and allows the return',()=>{
 const wide=JSON.parse(scene()),single=index=>({...wide,scene:{...wide.scene,count:1,actors:[wide.scene.actors[index]]},dialogue:[{actor:0,text:'My turn.'}]});
 const film={format:'goosnav-animation-sequence',version:1,shots:[{id:'wide',title:'Wide',config:wide},{id:'a',title:'A close',config:single(0)},{id:'b',title:'B close',config:single(1)},{id:'return',title:'Return wide',config:wide}]};
 const result=inspectDocument(JSON.stringify(film));assert.equal(result.ok,true);
 assert.equal(result.coverage.cuts.length,3);assert.ok(result.coverage.cuts.every(cut=>!cut.similar));assert.deepEqual(result.warnings,[]);
});

test('agent catalog exposes accepted model, channel and action parameters usable by strict parsing',()=>{
 const catalog=capabilities();
 for(const model of catalog.models){const data=JSON.parse(scene());data.scene.actors[0].model=model.id;assert.equal(inspectDocument(JSON.stringify(data)).ok,true);}
 assert.equal(catalog.parameters.actor.headYaw.max,75);assert.equal(catalog.parameters.camera.zoom.max,3);
 assert.ok(catalog.actions.find(a=>a.id==='walk').parameters.options.steps);
 assert.ok(catalog.actions.find(a=>a.id==='handshake').parameters.options.partner);
 assert.equal(inspectDocument(sampleDocument()).ok,true);
});

test('precise edits are atomic, reject unknown, unsafe and out of range paths, and preserve speaker identity',()=>{
 const original=scene(),next=editDocument(original,[{op:'set',path:'/scene/actors/1/headYaw',value:25},{op:'set',path:'/scene/camera',value:{zoom:1.5}}]);
 assert.equal(next.ok,true);const data=JSON.parse(next.text);
 assert.equal(data.scene.actors[1].headYaw,25);assert.equal(data.scene.actors[0].model,'v12-fat');assert.equal(data.dialogue[0].actor,1);
 assert.equal(JSON.parse(original).scene.actors[1].headYaw,undefined);
 for(const operation of [
  {op:'set',path:'/scene/actors/1/headYaw',value:76},
  {op:'set',path:'/scene/actors/3/model',value:'blue'},
  {op:'set',path:'/scene/actors/01/model',value:'blue'},
  {op:'set',path:'/scene/actors/1/__proto__/polluted',value:true},
  {op:'set',path:'/scene/constructor',value:{}},
  {op:'set',path:'/scene/madeUp',value:0},
  {op:'remove',path:'/scene/actors/1'},
  {op:'set',path:'/scene/actors/1/headYaw',value:NaN},
  {op:'set',path:'/scene/actors/1/headYaw',value:10,extra:true},
 ]){const result=editDocument(original,[{op:'set',path:'/title',value:'Changed'},operation]);assert.equal(result.ok,false,JSON.stringify(operation));assert.equal(result.text,undefined);}
 assert.equal({}.polluted,undefined);
});

test('validation returns bounded structured errors and a concise normalized inspection',()=>{
 const info=inspectDocument(scene());assert.equal(info.ok,true);assert.equal(info.kind,'scene');assert.equal(info.shots[0].actors[1].model,'billy-v2');assert.equal(info.shots[0].duration,2);
 for(const value of ['{','null','[]',JSON.stringify({format:'other',version:1}),'x'.repeat(5_000_001)]){const result=inspectDocument(value);assert.equal(result.ok,false);assert.ok(result.errors[0].code);assert.ok(result.errors[0].message.length<600);}
});

test('sequence edits target an exact shot without changing another shot or its speaker',()=>{
 const input=JSON.stringify({format:'goosnav-animation-sequence',version:1,id:'film',title:'Film',shots:[{id:'a-close',title:'A',config:JSON.parse(scene())},{id:'b-close',title:'B',config:JSON.parse(scene())}]});
 const before=inspectDocument(input);assert.equal(before.ok,true);assert.deepEqual(before.shots.map(s=>s.id),['a-close','b-close']);
 const result=editDocument(input,[{op:'set',path:'/shots/1/config/scene/camera',value:{zoom:2,targetX:.6}}]);assert.equal(result.ok,true);
 const value=JSON.parse(result.text);assert.equal(value.shots[0].config.scene.camera,undefined);assert.equal(value.shots[1].config.scene.camera.zoom,2);assert.equal(value.shots[1].config.dialogue[0].actor,1);
 assert.equal(editDocument(input,[{op:'set',path:'/shots/1/id',value:'a-close'}]).ok,false);
});

test('editing exported shot membership keeps a valid recipe while warning that drawing references are stale',async()=>{
 const recipe=JSON.stringify({format:'goosnav-animation-sequence',version:1,id:'film',title:'Film',shots:[{id:'first',title:'First',config:JSON.parse(scene())},{id:'second',title:'Second',config:JSON.parse(scene())}]});
 const exported=sequenceJSON(await prepareSequence(recipe)),data=JSON.parse(exported);
 const edited=editDocument(exported,[{op:'set',path:'/shots',value:[data.shots[1]]}]);
 assert.equal(edited.ok,true);assert.ok(edited.warnings.some(message=>/new.*references/i.test(message)));assert.equal(inspectDocument(edited.text).ok,true);
 assert.throws(()=>parseSequenceDocument(edited.text),/drawing|shot/i,'strict artwork reconstruction must still refuse removed identities');
 const malicious=JSON.parse(edited.text);malicious.handoff.slots[0].id='malformed';assert.equal(inspectDocument(JSON.stringify(malicious)).ok,false,'stale drawing order does not excuse malformed metadata');
});

test('command controller provides allowlisted operations, revisions and keeps accepted state after invalid edits',async()=>{
 const workspace=createAgentWorkspace({text:scene()});
 const before=workspace.status();assert.equal(before.revision,1);assert.equal(before.busy,false);
 assert.equal((await workspace.command('patch [{"op":"set","path":"/title","value":"Revised"}]')).ok,true);
 assert.equal(workspace.status().revision,2);assert.equal(JSON.parse((await workspace.command('exportJSON')).text).title,'Revised');
 assert.equal((await workspace.command({command:'patch',operations:[{op:'set',path:'/scene/camera/zoom',value:90}]})).ok,false);
 assert.equal(workspace.status().revision,2);assert.equal(JSON.parse(workspace.exportJSON().text).title,'Revised');
 for(const command of ['eval alert(1)','rm -rf /','help extra','status {}','preview {"width":99999}','{"command":"validate","surprise":true}'])assert.equal((await workspace.command(command)).ok,false,command);
 assert.equal((await workspace.command('help')).ok,true);assert.equal((await workspace.command('validate')).ok,true);
 assert.deepEqual(workspace.status().artifacts,[]);assert.equal((await workspace.command('cancel')).ok,true);
 workspace.dispose();
});

test('agent help and instructions expose the reference-delivery default without changing the document or starting work',async()=>{
 const workspace=createAgentWorkspace({text:scene()}),before=workspace.exportJSON();
 const instructions=await workspace.command('instructions');assert.equal(instructions.ok,true);
 const workflow=instructions.workflow;
 assert.equal(workflow.defaultTask,'generate-reference-package');assert.equal(workflow.userInstructionsTakePrecedence,true);
 assert.equal(workflow.deliverables.defaultFormat,'mp4');assert.equal(workflow.deliverables.matchingExportedJSON,true);
 assert.equal(workflow.delivery.unspecifiedDestination,'local');
 assert.deepEqual((await workspace.command('help')).workflow,workflow);
 assert.deepEqual(capabilities().workflow,workflow);assert.deepEqual(workspace.instructions().workflow,workflow);
 assert.equal(workspace.status().instructions.url,'/AGENTS.md');assert.equal(workspace.status().busy,false);
 assert.deepEqual(workspace.exportJSON(),before);assert.deepEqual(workspace.status().artifacts,[]);
 workflow.steps[0].instructions='corrupted caller copy';assert.notDeepEqual(workspace.instructions().workflow,workflow);
 assert.equal((await workspace.command('instructions {}')).ok,false);workspace.dispose();
});

const poseRecipe=()=>({format:'goosnav-animation-config',version:1,title:'Pose isolation',scene:{actors:[{model:'v12-fat',pose:'point',emotion:'happy',headPitch:-35,armL:72,armR:55},{model:'billy-v2',headYaw:-12}],props:[{id:'book',kind:'book',x:2,rx:30,width:.9,height:1.2,depth:.1,open:.75}]},timing:{mode:'silent',duration:2},audio:{mode:'recording',offset:.25,trimStart:.5,trimEnd:1.5},dialogue:[{actor:0,text:'Look here.',headYaw:45,pose:'point',emotion:'happy'},{actor:1,text:'My turn.',headYaw:-30}],keys:[{id:'mixed',target:'actor:0',time:1,transition:'ease',values:{headPitch:-30,armL:80,armR:65}},{id:'partner',target:'actor:1',time:1.5,transition:'hold',values:{headYaw:22}},{id:'last-head',target:'actor:0',time:4,transition:'hold',values:{headYaw:60}},{id:'book-key',target:'prop:book',time:1,transition:'ease',values:{open:1}}]});

test('agent scene reset preserves raw audio, keys, held pose and unrelated actor/prop fields',()=>{
 const input=poseRecipe(),result=resetDocument(JSON.stringify(input),{target:'actor:0',section:'head'});
 assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(result.inspection.ok,true);
 const data=JSON.parse(result.text);
 assert.deepEqual(data,{...input,scene:{...input.scene,actors:[{...input.scene.actors[0],headYaw:0,headPitch:0,headTilt:0,headSpin:0,noseContact:0},input.scene.actors[1]]}});
 assert.ok(result.warnings.some(message=>/key/i.test(message)));assert.ok(result.warnings.some(message=>/dialogue/i.test(message)));
 const camera=resetDocument(JSON.stringify(input),{target:'camera'});assert.equal(camera.ok,true);assert.deepEqual(JSON.parse(camera.text).scene.actors,input.scene.actors);
 const prop=resetDocument(JSON.stringify(input),{target:'prop:book',section:'dimensions'});assert.equal(prop.ok,true);assert.deepEqual(JSON.parse(prop.text).scene.props,[{...input.scene.props[0],width:.3,height:.4,depth:.05}]);
});

test('agent key reset merges one section at the selected time without rewriting scene or other keys',()=>{
 const input=poseRecipe(),result=resetDocument(JSON.stringify(input),{target:'actor:0',section:'left-arm',scope:'key',time:1.001});
 assert.equal(result.ok,true,JSON.stringify(result.errors));const data=JSON.parse(result.text),key=data.keys.find(k=>k.id==='mixed');
 assert.equal(key.time,1);assert.equal(key.transition,'ease');assert.equal(key.values.headPitch,-30);assert.equal(key.values.armR,65);assert.equal(key.values.armL,0);assert.equal(key.values.contactLeft,0);
 assert.deepEqual(data.scene,input.scene);assert.deepEqual(data.audio,input.audio);assert.deepEqual(data.dialogue,input.dialogue);
 const byId=keys=>[...keys].sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(byId(data.keys.filter(k=>k.id!=='mixed')),byId(input.keys.filter(k=>k.id!=='mixed')));assert.deepEqual(data.timing,input.timing);
});

test('agent timeline reset clears only selected head contributions and preserves final exposure duration',()=>{
 const input=poseRecipe(),result=resetDocument(JSON.stringify(input),{target:'actor:0',section:'head',scope:'timeline'});
 assert.equal(result.ok,true,JSON.stringify(result.errors));const data=JSON.parse(result.text);
 assert.deepEqual(data.keys.find(k=>k.id==='mixed'),{...input.keys[0],values:{armL:80,armR:65}});assert.ok(!data.keys.some(k=>k.id==='last-head'));
 assert.deepEqual(data.keys.filter(k=>k.target!=='actor:0'),input.keys.filter(k=>k.target!=='actor:0'));
 assert.equal(data.dialogue[0].headYaw,0);assert.deepEqual(data.dialogue[1],input.dialogue[1]);assert.deepEqual(data.audio,input.audio);
 assert.equal(data.timing.duration,97/24);assert.equal(data.scene.actors[0].pose,'point');assert.equal(data.scene.actors[0].emotion,'happy');
});

test('pose key edits materialize actions once and retain unrelated actions and generated book props',()=>{
 const input=poseRecipe();delete input.keys;input.actions=[{actor:0,action:'read',time:0,duration:1},{actor:1,action:'wave',time:1,duration:1}];
 const before=parseConfigDocument(JSON.stringify(input)).project;
 const result=resetDocument(JSON.stringify(input),{target:'actor:0',section:'head',scope:'key',time:0});
 assert.equal(result.ok,true,JSON.stringify(result.errors));const data=JSON.parse(result.text),after=parseConfigDocument(result.text).project;
 assert.equal(data.actions,undefined);assert.ok(data.keys.length>8);assert.equal(after.animation.keys.length,data.keys.length,'expanded actions must not run a second time');
 const signature=keys=>keys.filter(k=>k.target==='actor:1').map(({id,...key})=>key);
 assert.deepEqual(signature(after.animation.keys),signature(before.animation.keys));
 const book=data.scene.props.find(prop=>prop.kind==='book');assert.ok(data.keys.some(key=>key.target===`prop:${book.id}`));assert.deepEqual(data.audio,input.audio);
 const generated={...input,scene:{...input.scene,props:[]}},created=resetDocument(JSON.stringify(generated),{target:'actor:0',section:'head',scope:'key',time:0});
 assert.equal(created.ok,true,JSON.stringify(created.errors));const createdData=JSON.parse(created.text);assert.equal(createdData.scene.props.length,1);assert.ok(createdData.keys.some(key=>key.target===`prop:${createdData.scene.props[0].id}`));
});

test('pose edits select the original nested sequence config and retain exported handoff metadata',async()=>{
 const input={format:'goosnav-animation-sequence',version:1,id:'film',title:'Pose film',shots:[{id:'a',title:'A',config:poseRecipe()},{id:'b',title:'B',config:poseRecipe()}]};
 const text=sequenceJSON(await prepareSequence(JSON.stringify(input))),before=JSON.parse(text);
 before.shots[1].config.audio={mode:'recording',offset:.25,trimStart:.5,trimEnd:1.5};
 const result=resetDocument(JSON.stringify(before),{shotId:'b',target:'actor:0',section:'head',scope:'timeline'});
 assert.equal(result.ok,true,JSON.stringify(result.errors));const after=JSON.parse(result.text);
 assert.deepEqual(after.shots[0],before.shots[0]);assert.equal(after.shots[1].config.scene.actors[0].headPitch,0);assert.equal(after.shots[1].config.dialogue[0].headYaw,0);
 assert.deepEqual(after.handoff,before.handoff);assert.deepEqual(after.shots[1].config.handoff,before.shots[1].config.handoff);assert.deepEqual(after.shots[1].config.audio,before.shots[1].config.audio);
 assert.ok(result.warnings.some(message=>/new.*references/i.test(message)));
 assert.equal(resetDocument(JSON.stringify(input),{target:'actor:0',section:'head'}).ok,false,'multiple shots require an exact selection');
});

test('pose commands are strictly bounded and invalid edits leave the accepted document and revision intact',async()=>{
 const text=JSON.stringify(poseRecipe()),workspace=createAgentWorkspace({text}),before=workspace.exportJSON();
 for(const options of [null,{target:'actor:0',section:'head',all:true},{target:'actor:2',section:'head'},{target:'prop:missing',section:'position'},{target:'actor:0',section:'unknown'},{target:'actor:0',section:'head',scope:'all'},{target:'actor:0',section:'head',time:NaN},{target:'camera',scope:'timeline'},{target:'actor:0',section:'head',shotId:9}])assert.equal(resetDocument(text,options).ok,false);
 for(const options of [null,{actors:[]},{actors:[0,0]},{actors:[2]},{turnBody:1},{target:{point:[1,2]}},{target:{point:[1,2,3],extra:true}},{scope:'timeline'},{time:Infinity},{surprise:true}])assert.equal((await alignDocument(text,options)).ok,false);
 for(const command of ['reset {"target":"actor:0","section":"all"}','align {"actors":[]}',{command:'reset',operations:[]},{command:'align',options:{eval:true}}])assert.equal((await workspace.command(command)).ok,false);
 assert.deepEqual(workspace.exportJSON(),before);
 assert.equal(workspace.reset({target:'actor:0',section:'head'}).ok,true);assert.equal(workspace.status().revision,before.revision+1);
 assert.equal((await workspace.command({command:'reset',options:{target:'actor:0',section:'left-arm',scope:'key',time:1}})).ok,true);
 assert.ok(capabilities().operations.includes('resetDocument'));assert.ok(capabilities().operations.includes('alignDocument'));
 assert.ok(capabilities().poseSections.actor.head.keys.includes('headPitch'));assert.ok(capabilities().commands.align);assert.ok(capabilities().commands.reset);
 workspace.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilities,inspectDocument,editDocument,createAgentWorkspace,sampleDocument} from '../app/src/agent-api.mjs';
import {prepareSequence,sequenceJSON} from '../app/src/sequence.mjs';
import {parseSequenceDocument} from '../app/src/sequence-config.mjs';

const scene=()=>JSON.stringify({format:'goosnav-animation-config',version:1,title:'Two speakers',scene:{format:'landscape',actors:[{model:'v12-fat',x:-.6},{model:'billy-v2',x:.6}]},timing:{mode:'silent',duration:2},dialogue:[{actor:1,text:'Still B.'}]});

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

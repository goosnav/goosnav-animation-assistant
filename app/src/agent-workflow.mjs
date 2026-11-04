/** Application-use guidance, shared by discovery files, HTML metadata and the agent API. */
const workflow={
 version:1,
 url:'/AGENTS.md',
 scope:'For agents using the animation application. Reading these directions does not start a job or change the editor.',
 defaultTask:'generate-reference-package',
 userInstructionsTakePrecedence:true,
 objective:'Bring the user’s script or idea to life as creative, well-composed, animation-friendly drawing references, then deliver the actual files. Follow any more specific user task; when no task is specified, use this reference-production workflow.',
 deliverables:{
  defaultFormat:'mp4',
  matchingExportedJSON:true,
  files:['references.mp4','scene.json (one scene) or sequence.json (multiple shots)'],
  imagesWhenRequested:'Numbered PNG references plus the matching exported JSON.',
  carrier:'The reference MP4 contains each required drawing once, not the finished playback timing. The emitted JSON restores holds, dialogue, cuts and drawing order when the artist returns their work.',
  limit:'MP4 carriers support 100 drawings. Plan an achievable drawing workload. If all required drawings exceed this limit, export PNGs plus JSON and explain the format change; never drop required poses or mouth frames.'
 },
 delivery:{
  unspecifiedDestination:'local',
  instructions:'Save the complete package in the Google Drive or other cloud folder specified by the user, using the agent’s available cloud tools, or in their chosen computer folder. If no destination is specified, use the task’s local output folder or Downloads. The app does not upload to cloud storage by itself.',
  verification:'Verify each saved file exists and has nonzero size. Reopen the JSON and inspect video/image metadata and reference count. For cloud delivery, verify the uploaded files in the intended folder and provide their links; for local delivery, provide the actual paths. An in-memory Blob or preview URL is not a delivered file.',
  unavailableDestination:'If the requested cloud folder is unavailable, keep a local copy, report the actual save location and the access problem, and request only the missing folder/access information. Never claim an upload succeeded without confirmation.'
 },
 steps:[
  {name:'Develop the script',instructions:'Use the supplied script, preserving its intent and required wording. Otherwise write a short original script from the user’s idea or available context. With no brief, choose a clear, self-contained visual premise and give it a beginning, a turn and a payoff. Make reasonable creative choices without requiring the user to direct every beat.'},
  {name:'Direct the scene or film',instructions:'Choose one scene or several ordered shots in a single sequence export to serve the story. Make the acting expressive, dynamic and interesting: purposeful gestures, reactions, eyelines, changes of emphasis and well-timed cuts. Vary wide and close compositions where motivated. Maintain character identity, screen direction and prop continuity across shots; avoid arbitrary motion and repetitive, static talking heads.'},
  {name:'Design for drawing',instructions:'Favor readable silhouettes, clear faces and mouth shapes, distinct key poses, anticipation, useful holds and a legible payoff. Reuse held drawings and backgrounds where appropriate; choose enough motion samples to explain the whole action without needless redraws. Use supported actions/keys to generate the complete movement, not one representative still. Keep one canvas orientation across the film and all required speaking-mouth states.'},
  {name:'Render, look and refine',instructions:'Read capabilities() for supported models, actions and ranges. Build and validate the scene/sequence JSON. Render actual PNG previews and contact sheets for every shot, important speaking turn, and motion beginning/peak/settle; sample additional groups if the preview limit is reached. VIEW the pixels. Check framing, facial readability, hands, props, overlap, silhouettes, shot continuity and action progression. Fix problems and render again; metadata alone is not visual review.'},
  {name:'Export the reference package',instructions:'By default generate the MP4 references AND the matching JSON through /pipeline.mjs: prepareDocument(text, {newReferences:true}), then renderDocumentReferences(document, {format:"mp4", emit}). Use format:"png" when images are requested. Keep the emitted scene.json or sequence.json, which contains the handoff mapping and timing; a recipe from exportJSON alone is not a substitute for this exported handoff. Preserve every numbered image or video frame in carrier order. Inspect the exported media and confirm its count matches the JSON.'},
  {name:'Save and hand off',instructions:'Persist both the JSON and all reference media to the destination described below, verify the saved artifacts, and return a concise file list with links/paths, shot count and drawing count. Explain briefly that the artist draws over these references, then re-uploads the matching JSON and their drawn video/images to rebuild the finished animation with its timing and audio. Default work ends after reference delivery; render a finished animation from returned artwork when the user asks for that instead.'}
 ],
 resources:{workspace:'/agent.html',api:'/agent-api.mjs',pipeline:'/pipeline.mjs',guide:'/docs/agents.md',sequences:'/docs/sequence.md',example:'/examples/three-shot-sequence.json'}
};

export function agentInstructions(){return structuredClone(workflow);}
export function agentInstructionsMarkdown(){
 const w=agentInstructions();
 return `# Default agent workflow — Animation Assistant\n\n${w.scope}\n\n${w.objective}\n\nSpecific user instructions take precedence over every default below.\n\n## Default deliverables\n\n- ${w.deliverables.files.join('\n- ')}\n- When images are requested: ${w.deliverables.imagesWhenRequested}\n\n${w.deliverables.carrier}\n\n${w.deliverables.limit}\n\n${w.steps.map((step,i)=>`## ${i+1}. ${step.name}\n\n${step.instructions}`).join('\n\n')}\n\n## Delivery destination and confirmation\n\n${w.delivery.instructions}\n\n${w.delivery.verification}\n\n${w.delivery.unavailableDestination}\n\n## Readable interfaces\n\nThe same instructions are embedded as application/json in #agent-workflow on both HTML entry pages and returned by capabilities().workflow, agentInstructions(), window.animationAgent.instructions(), and the instructions/help commands. status includes the instructions URL. The main GUI has no extra workflow panel.\n\n${Object.entries(w.resources).map(([name,url])=>`- ${name}: ${url}`).join('\n')}\n`;
}

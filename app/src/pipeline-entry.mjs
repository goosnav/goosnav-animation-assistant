import {setSpeechWorkerURL} from './speech/client.mjs';
setSpeechWorkerURL(new URL('./voice-worker.mjs',import.meta.url));
export {prepareScene,attachArtwork,sceneJSON,renderReferences,renderAnimation,processSceneJob} from './pipeline.mjs';
export {readDirectory,entriesFromFiles,discoverJobs,createOutputWriter} from './batch-files.mjs';

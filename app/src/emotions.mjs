// Expression presets add small offsets to existing rig channels; mouths remain speech driven.
const emotion=(label,headPitch,headTilt,bodyLean)=>Object.freeze({label,headPitch,headTilt,bodyLean});
export const EMOTIONS=Object.freeze({
 neutral:emotion('Neutral',0,0,0),
 happy:emotion('Happy',-4,4,-2),
 sad:emotion('Sad',10,-5,5),
 angry:emotion('Angry',6,-3,6),
 surprised:emotion('Surprised',-9,0,-5),
 skeptical:emotion('Skeptical',2,9,-2),
});

// Locally adapted from 3D-comic-engine gesture-performance.mjs, actor.mjs,
// book.mjs and stunts.mjs. Curated key poses replace continuous random motion.
// Fractions are normalized to the chosen duration. Values are rest offsets.
const preset=(label,group,duration,beats)=>Object.freeze({label,group,duration,beats:Object.freeze(beats)});
const gesture=(label,beats,duration=1.5)=>preset(label,'Gestures',duration,beats);
const stunt=(label,beats,duration=2.4)=>preset(label,'Stunts',duration,beats);
const pose=(p,anticipation={},duration=1.5)=>[[0,{}],[.15,anticipation],[.4,p],[.72,p],[1,{}]];
export const ACTION_BANK=Object.freeze({
 none:gesture('Still',[[0,{}],[1,{}]],1),
 nod:gesture('Nod',[[0,{}],[.2,{headPitch:-9}],[.45,{headPitch:26}],[.7,{headPitch:-6}],[1,{}]],.9),
 head_tilt:gesture('Head tilt',pose({headTilt:25,headYaw:-10},{headTilt:-5})),
 page_glance:gesture('Page glance',pose({headPitch:32,headYaw:-20},{headPitch:-5})),
 'look-book':gesture('Look at book',pose({headPitch:32,headYaw:-20},{headPitch:-5})),
 explain:gesture('Explain',[[0,{}],[.15,{armR:-15,bodyLean:-5}],[.4,{armR:60,elbowR:85,armSideR:-35,handR:65,bodyLean:6,headTilt:-8}],[.65,{armR:45,elbowR:60,armSideR:-50,handR:70,headTilt:8}],[1,{}]]),
 shrug:gesture('Shrug',pose({armL:10,armR:10,elbowL:95,elbowR:95,armSideL:65,armSideR:-65,handL:-75,handR:75,headTilt:14,bodyLean:-5},{bodyLean:7,headPitch:10}),1.3),
 point:gesture('Point',pose({armR:88,elbowR:0,armSideR:-18,fingerPointR:1,bodyTurn:12,headYaw:-12},{armR:-20,elbowR:45,bodyTurn:-10})),
 offer:gesture('Offer',pose({armR:65,elbowR:35,armSideR:-20,handR:80,bodyLean:8},{armR:-12})),
 wave:gesture('Wave',[[0,{}],[.25,{armR:120,elbowR:90,armSideR:-45,handR:-50}],[.45,{armR:120,elbowR:90,armSideR:-25,handR:50}],[.65,{armR:120,elbowR:90,armSideR:-45,handR:-50}],[.8,{armR:120,elbowR:90,armSideR:-25,handR:50}],[1,{}]],1.8),
 cry:gesture('Cry',[[0,{}],[.25,{armL:105,armR:105,elbowL:125,elbowR:125,headPitch:24}],[.45,{armL:100,armR:110,elbowL:125,elbowR:115,headPitch:30,bodyLean:12}],[.65,{armL:110,armR:100,elbowL:115,elbowR:125,headPitch:20,bodyLean:8}],[.8,{armL:100,armR:110,elbowL:125,elbowR:115,headPitch:30,bodyLean:12}],[1,{}]],2),
 arm_flail:gesture('Arm flail',[[0,{}],[.2,{armL:150,armR:-50,armSideL:70,armSideR:-35,elbowL:80,headTilt:20}],[.4,{armL:-55,armR:145,armSideL:30,armSideR:-75,elbowR:100,headTilt:-20}],[.6,{armL:120,armR:30,armSideL:100,armSideR:-65,elbowL:20,elbowR:120}],[.8,{armL:-40,armR:130,armSideL:45,armSideR:-100,bodyLean:-15}],[1,{}]],2),
 fist_shake:gesture('Shake fist',[[0,{}],[.25,{armR:100,elbowR:125,fingerCurlR:1,bodyLean:12}],[.4,{armR:120,elbowR:95,fingerCurlR:1,headTilt:-12}],[.55,{armR:95,elbowR:130,fingerCurlR:1,headTilt:12}],[.7,{armR:120,elbowR:95,fingerCurlR:1,bodyLean:12}],[1,{}]]),
 double_point:gesture('Double point',pose({armL:90,armR:90,elbowL:0,elbowR:0,fingerPointL:1,fingerPointR:1,armSideL:25,armSideR:-25,bodyLean:12},{armL:-15,armR:-15,elbowL:90,elbowR:90})),
 despair:gesture('Despair',pose({armL:130,armR:130,elbowL:120,elbowR:120,armSideL:35,armSideR:-35,headPitch:35,bodyLean:25},{headPitch:-15}),2),
 windmill:gesture('Windmill arms',[[0,{}],[.2,{armL:150,armR:-140,armSideL:60,armSideR:-50}],[.4,{armL:0,armR:0,armSideL:120,armSideR:-120}],[.6,{armL:-140,armR:150,armSideL:50,armSideR:-60}],[.8,{armL:130,armR:-130,armSideL:30,armSideR:-30}],[1,{}]],2),
 rubber_hose:gesture('Rubber hose',[[0,{}],[.2,{armL:30,armR:90,elbowL:125,elbowR:15,armSideL:60,armSideR:-60,bodyLean:12}],[.4,{armL:90,armR:30,elbowL:15,elbowR:125,armSideL:30,armSideR:-90,bodyTurn:25}],[.6,{armL:30,armR:90,elbowL:125,elbowR:15,armSideL:90,armSideR:-30,bodyLean:-12}],[.8,{armL:90,armR:30,elbowL:15,elbowR:125,armSideL:60,armSideR:-60,bodyTurn:-25}],[1,{}]],2),
 snap_pose:gesture('Snap poses',[[0,{}],[.2,{armL:135,armR:-40,elbowR:90,headTilt:25,bodyTurn:25},'hold'],[.4,{armL:-50,armR:145,elbowL:100,headTilt:-25,bodyLean:20},'hold'],[.6,{armL:80,armR:80,armSideL:80,armSideR:-80,headPitch:-30},'hold'],[.8,{armL:10,armR:140,elbowR:120,bodyTurn:-25},'hold'],[1,{}]],2),
 ...Object.fromEntries(['open','turn','hold','read','place','close','slam','throw'].map(id=>[id,preset(`${id[0].toUpperCase()+id.slice(1)} book`,'Book',id==='slam'?.8:1.6,[])])),
 ...Object.fromEntries([['punch','Punch'],['nose_touch','Touch noses'],['high_five','High five'],['handshake','Handshake'],['ascend','Ascend + partner reaction']].map(([id,label])=>[id,preset(label,'Partner',2.4,[])])),
 explode:stunt('Explode',[[0,{}],[.15,{headScale:.25,bodyLean:-12,armSideL:35,armSideR:-35}],[.25,{burst:.15}],[.5,{burst:.55}],[.8,{burst:1}],[1,{}]]),
 flatten:stunt('Flatten',[[0,{}],[.15,{y:.15,armL:100,armR:100}],[.3,{flatten:1,armSideL:80,armSideR:-80}],[.8,{flatten:1,armSideL:80,armSideR:-80}],[1,{}]]),
 nose_off:stunt('Take nose off',[[0,{}],[.2,{armR:95,elbowR:125}],[.4,{noseDetach:1,noseGrip:1,armR:60,elbowR:70,headYaw:-25}],[.7,{noseDetach:1,noseGrip:1,armR:65,elbowR:75,headTilt:15}],[.9,{armR:95,elbowR:125}],[1,{}]]),
 head_spin:stunt('Full head spin',[[0,{}],[.2,{headSpin:90}],[.4,{headSpin:180}],[.6,{headSpin:270}],[.8,{headSpin:360}],[1,{headSpin:360}]],1.6),
 head_jerk:stunt('Head jerk',[[0,{}],[.2,{headPitch:-35,headYaw:65,headTilt:25}],[.4,{headPitch:40,headYaw:-65,headTilt:-30}],[.6,{headPitch:-25,headYaw:55,headTilt:30}],[.8,{headPitch:30,headYaw:-45,headTilt:-20}],[1,{}]],1.2),
 walk_away:stunt('Walk away',[],2.3),
 dance:stunt('Dance',[[0,{}],[.2,{armL:130,armR:20,elbowR:110,thighL:35,kneeR:50,rootRoll:12,y:.04}],[.4,{armR:130,armL:20,elbowL:110,thighR:35,kneeL:50,rootRoll:-12,y:.04}],[.6,{armL:140,armR:140,armSideL:40,armSideR:-40,kneeL:35,kneeR:35,y:-.08}],[.8,{armL:60,armR:60,armSideL:85,armSideR:-85,y:.25,thighL:25,thighR:-25}],[1,{}]]),
 t_pose:stunt('T-pose glide',[[0,{}],[.15,{armSideL:80,armSideR:-80}],[.4,{armSideL:80,armSideR:-80,x:.5,y:.05}],[.65,{armSideL:80,armSideR:-80,x:.5,z:.3,yaw:90}],[.85,{armSideL:80,armSideR:-80,z:.3,yaw:180}],[1,{}]]),
 ragdoll:stunt('Ragdoll collapse',[[0,{}],[.2,{rootPitch:40,kneeL:60,kneeR:35,armL:80,armR:-50}],[.4,{rootPitch:90,y:.15,thighL:35,thighR:-25,kneeL:80,kneeR:30,armL:130,armR:-50}],[.55,{rootPitch:75,y:.25,thighL:20,kneeL:100,armR:-70}],[.8,{rootPitch:90,y:.15,thighL:35,thighR:-25,kneeL:80,kneeR:30,armL:130,armR:-50}],[1,{}]]),
 noclip:stunt('Noclip through floor',[[0,{}],[.25,{y:-1.4}],[.4,{y:-1.4}],[.65,{y:1,z:-.6}],[.85,{y:2,z:-1.5}],[1,{}]]),
 big_head:stunt('Big head',[[0,{}],[.25,{headScale:1,handScale:.4}],[.45,{headScale:2,handScale:.8}],[.65,{headScale:2,handScale:.8,headTilt:12}],[.8,{headScale:1,handScale:.4,headTilt:-10}],[1,{}]]),
 jitter:stunt('Physics jitter',[[0,{}],[.15,{x:.06,rootRoll:12,armL:70}],[.3,{x:-.06,rootRoll:-12,armR:70}],[.45,{x:.08,rootRoll:15,armL:90}],[.6,{x:-.08,rootRoll:-15,armR:90}],[.8,{x:.8,y:1.5,rootRoll:120,rootPitch:60,thighL:50,kneeR:80}],[1,{}]]),
 helicopter:stunt('Helicopter arms',[[0,{}],[.15,{armSideL:80,armSideR:-80}],[.35,{armSideL:80,armSideR:-80,yaw:90,y:.1}],[.5,{armSideL:80,armSideR:-80,yaw:180,y:.4}],[.65,{armSideL:80,armSideR:-80,yaw:-90,y:1}],[.8,{armSideL:80,armSideR:-80,yaw:0,y:2}],[1,{}]]),
 goose_chase:stunt('Goose chase',[[0,{}],[.2,{y:.25,armL:150,armR:150,headTilt:-20}],[.4,{x:.5,yaw:90,thighL:50,thighR:-40,kneeL:60,armR:120,armL:-60}],[.6,{x:1,yaw:90,thighR:50,thighL:-40,kneeR:60,armL:120,armR:-60}],[.8,{x:1.6,yaw:90,thighL:50,thighR:-40,kneeL:60,armR:120,armL:-60}],[1,{x:2,yaw:90}]],2.8),
});
